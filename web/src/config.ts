import { createConfig, http, fallback } from "wagmi";
import { injected, coinbaseWallet } from "wagmi/connectors";
import {
  createPublicClient,
  defineChain,
  keccak256,
  toHex,
  isAddress,
  type Abi,
  type Address,
} from "viem";

export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};
export type Deployment = {
  version: 1;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: {
    name: string;
    address: Address;
    abiHash: string;
    abiPath: string;
  }[];
  assets: { path: string; sha256: string }[];
  poolKey?: PoolKey;
  network: {
    chainId: number;
    name: string;
    testnet: boolean;
    rpcUrls: string[];
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    faucets: string[];
    uniswapV4: {
      poolManager: Address;
      universalRouter: Address;
      quoter: Address;
      stateView: Address;
      positionManager: Address;
      permit2: Address;
      extendedSwapParams?: boolean;
    };
  };
  walletAddChain?: {
    chainId: string;
    chainName: string;
    rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number };
    blockExplorerUrls: string[];
  };
};
function sorted(v: unknown): unknown {
  return Array.isArray(v)
    ? v.map(sorted)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([k, x]) => [k, sorted(x)]),
        )
      : v;
}
export const canonical = (v: unknown) => JSON.stringify(sorted(v));
const relative = (path: string) =>
  /^[\w./-]+$/.test(path) &&
  !path.startsWith("/") &&
  !path.split("/").includes("..");
export async function loadRuntime() {
  const response = await fetch("./imd-deployment.json", { cache: "no-cache" });
  if (!response.ok)
    throw new Error(
      "Deployment configuration could not be loaded. Reload to retry.",
    );
  const deployment = (await response.json()) as Deployment;
  if (
    deployment.version !== 1 ||
    deployment.chainId !== deployment.network?.chainId ||
    !deployment.contracts?.length ||
    !deployment.network.rpcUrls.length
  )
    throw new Error(
      "Invalid deployment configuration. Transactions are disabled.",
    );
  const abis: Record<string, Abi> = {};
  for (const c of deployment.contracts) {
    if (!isAddress(c.address) || !relative(c.abiPath))
      throw new Error("Invalid contract configuration: " + c.name);
    const res = await fetch("./" + c.abiPath);
    if (!res.ok)
      throw new Error("Contract interface is unavailable: " + c.name);
    const abi = (await res.json()) as Abi;
    if (
      !Array.isArray(abi) ||
      keccak256(toHex(canonical(abi))).slice(2) !== c.abiHash
    )
      throw new Error("Contract interface verification failed: " + c.name);
    abis[c.name] = abi;
  }
  for (const name of [
    "LaunchToken",
    "LockerFarm",
    "LockerFarmFactory",
    "LockerTreasury",
  ])
    if (!abis[name]) throw new Error("Missing contract: " + name);
  const chain = defineChain({
    id: deployment.chainId,
    name: deployment.network.name,
    nativeCurrency: deployment.network.nativeCurrency,
    rpcUrls: { default: { http: deployment.network.rpcUrls } },
    blockExplorers: {
      default: { name: "Explorer", url: deployment.network.explorer },
    },
    testnet: deployment.network.testnet,
  });
  const transport = fallback(
    deployment.network.rpcUrls.map((url) =>
      http(url, { timeout: 7000, retryCount: 0, batch: { wait: 30 } }),
    ),
    { retryCount: 0 },
  );
  const config = createConfig({
    chains: [chain],
    multiInjectedProviderDiscovery: true,
    connectors: [
      injected(),
      coinbaseWallet({
        appName: "Locker",
        preference: { options: "smartWalletOnly" },
      }),
    ],
    transports: { [chain.id]: transport },
  });
  const client = createPublicClient({
    chain,
    transport,
    batch: { multicall: false },
  });
  const contracts = Object.fromEntries(
    deployment.contracts.map((c) => [
      c.name,
      { address: c.address, abi: abis[c.name] },
    ]),
  );
  const settings = await fetch("./site-settings.json")
    .then((r) => r.json())
    .catch(() => ({ xUrl: "" }));
  const xUrl =
    typeof settings.xUrl === "string" &&
    /^https:\/\/(x\.com|twitter\.com)\/[\w]+\/?$/.test(settings.xUrl)
      ? settings.xUrl
      : "";
  return { deployment, abis, chain, config, client, contracts, xUrl };
}
export type Runtime = Awaited<ReturnType<typeof loadRuntime>>;
