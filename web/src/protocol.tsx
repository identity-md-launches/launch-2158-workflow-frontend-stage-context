import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useConnection, useConnectorClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import {
  createPublicClient,
  custom,
  fallback,
  http,
  erc20Abi,
  zeroAddress,
  type Address,
  type Abi,
  type PublicClient,
} from "viem";
import type { Runtime } from "./config";
import { same } from "./format";

export const RuntimeContext = createContext<Runtime>(null!);
export const useRuntime = () => useContext(RuntimeContext);
export type Token = {
  address: Address;
  symbol: string;
  decimals: number;
  balance: bigint;
};
export type Farm = {
  address: Address;
  token: Token;
  totalStaked: bigint;
  periodFinish: bigint;
  rewardRate: bigint;
  rewardReserve: bigint;
  depositsPaused: boolean;
  emissionsManager: Address;
  guardian: Address;
  pendingEmissionsManager: Address;
  pendingGuardian: Address;
  totalFeesRedistributed: bigint;
  eligibleTotalStaked: bigint;
  feeEligibilityStart: bigint;
  remainingEpochRewards: bigint;
  stake: bigint;
  earned: bigint;
  fees: bigint;
  eligible: bigint;
  pending: bigint;
  allowance: bigint;
  registered: boolean;
};
export type ProtocolState = {
  verified: boolean;
  block: bigint;
  timestamp: bigint;
  fetchedAt: number;
  farms: Farm[];
  farmErrors: string[];
  owner: Address;
  pendingOwner: Address;
  factoryOwner: Address;
  pendingFactoryOwner: Address;
  treasuryBalance: bigint;
  treasuryETH: bigint;
  locker: Token;
  ethBalance: bigint;
  registered: Address[];
};
export async function tokenInfo(
  client: PublicClient,
  token: Address,
  account?: Address,
): Promise<Token> {
  const [symbol, decimals, balance] = await Promise.all([
    client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "symbol",
    }),
    client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "decimals",
    }),
    account
      ? client.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [account],
        })
      : Promise.resolve(0n),
  ]);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255)
    throw new Error("Unsupported token decimals.");
  return { address: token, symbol, decimals, balance };
}
export async function verifyDeployment(runtime: Runtime, client: PublicClient) {
  const chain = await client.getChainId();
  if (chain !== runtime.deployment.chainId)
    throw new Error(
      "RPC chain does not match the deployment. Transactions are disabled.",
    );
  await Promise.all(
    runtime.deployment.contracts.map(async (c) => {
      const code = await client.getCode({ address: c.address });
      if (!code || code === "0x")
        throw new Error(
          `No deployed code found for ${c.name}. Transactions are disabled.`,
        );
    }),
  );
}
export async function readProtocol(
  runtime: Runtime,
  client: PublicClient,
  account?: Address,
): Promise<ProtocolState> {
  await verifyDeployment(runtime, client);
  const {
    LockerFarmFactory: factory,
    LockerTreasury: treasury,
    LaunchToken: locker,
    LockerFarm: launchFarm,
  } = runtime.contracts;
  const read = (
    c: { address: Address; abi: Abi },
    fn: string,
    args: readonly unknown[] = [],
  ) => client.readContract({ ...c, functionName: fn, args });
  const [
    block,
    owner,
    pendingOwner,
    factoryOwner,
    pendingFactoryOwner,
    registered,
    lockerInfo,
    treasuryBalance,
    treasuryETH,
    ethBalance,
  ] = await Promise.all([
    client.getBlock(),
    read(treasury, "owner"),
    read(treasury, "pendingOwner"),
    read(factory, "owner"),
    read(factory, "pendingOwner"),
    read(factory, "allFarms"),
    tokenInfo(client, locker.address, account),
    client.readContract({
      address: locker.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [treasury.address],
    }),
    client.getBalance({ address: treasury.address }),
    account ? client.getBalance({ address: account }) : Promise.resolve(0n),
  ]);
  const registeredFarms = registered as Address[];
  const addresses = [
    ...new Set([
      launchFarm.address.toLowerCase(),
      ...registeredFarms.map((a) => a.toLowerCase()),
    ]),
  ] as Address[];
  const results = await Promise.allSettled(
    addresses.map(async (address) => {
      const farm = { address, abi: launchFarm.abi };
      const methods = [
        "stakingToken",
        "rewardToken",
        "treasury",
        "totalStaked",
        "periodFinish",
        "rewardRate",
        "rewardReserve",
        "depositsPaused",
        "emissionsManager",
        "guardian",
        "pendingEmissionsManager",
        "pendingGuardian",
        "totalFeesRedistributed",
        "eligibleTotalStaked",
        "feeEligibilityStart",
        "remainingEpochRewards",
      ];
      const values = await Promise.all(methods.map((fn) => read(farm, fn)));
      const data = Object.fromEntries(methods.map((fn, i) => [fn, values[i]]));
      if (
        !same(data.rewardToken as string, locker.address) ||
        !same(data.treasury as string, treasury.address)
      )
        throw new Error("Farm configuration does not match the deployment.");
      const token = await tokenInfo(
        client,
        data.stakingToken as Address,
        account,
      );
      const [stake, earned, fees, eligible, pending, allowance] = account
        ? await Promise.all([
            ...[
              "balanceOf",
              "earned",
              "pendingFees",
              "eligibleStakeOf",
              "pendingStakeOf",
            ].map((fn) => read(farm, fn, [account])),
            client.readContract({
              address: token.address,
              abi: erc20Abi,
              functionName: "allowance",
              args: [account, address],
            }),
          ])
        : [0n, 0n, 0n, 0n, 0n, 0n];
      return {
        ...data,
        address,
        token,
        stake,
        earned,
        fees,
        eligible,
        pending,
        allowance,
        registered: registeredFarms.some((a) => same(a, address)),
      } as Farm;
    }),
  );
  const farmErrors = results.flatMap((r, i) =>
    r.status === "rejected"
      ? [addresses[i] + ": " + (r.reason?.message || "Read unavailable")]
      : [],
  );
  if (results[0].status === "rejected")
    throw new Error(
      "The deployed LOCKER farm could not be read. Retry when the RPC is available.",
    );
  return {
    verified: true,
    block: block.number!,
    timestamp: block.timestamp,
    fetchedAt: Date.now(),
    farms: results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
    farmErrors,
    owner: owner as Address,
    pendingOwner: pendingOwner as Address,
    factoryOwner: factoryOwner as Address,
    pendingFactoryOwner: pendingFactoryOwner as Address,
    treasuryBalance,
    treasuryETH,
    locker: lockerInfo,
    ethBalance,
    registered: registeredFarms,
  };
}
function useProtocolValue() {
  const runtime = useRuntime();
  const { address, chainId } = useConnection();
  const { data: connectorClient } = useConnectorClient();
  const client = useMemo(() => {
    if (!connectorClient || chainId !== runtime.chain.id)
      return runtime.client as PublicClient;
    return createPublicClient({
      chain: runtime.chain,
      transport: fallback(
        [
          ...runtime.deployment.network.rpcUrls.map((url) =>
            http(url, { timeout: 4000, retryCount: 0, batch: { wait: 30 } }),
          ),
          custom(
            { request: (args) => connectorClient.request(args as never) },
            { retryCount: 0 },
          ),
        ],
        { retryCount: 0 },
      ),
    }) as PublicClient;
  }, [runtime, connectorClient, chainId]);
  const query = useQuery({
    queryKey: ["protocol", address, chainId, !!connectorClient],
    queryFn: () => readProtocol(runtime, client, address),
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
    staleTime: 10000,
    retry: false,
  });
  const connected = !!address && chainId === runtime.chain.id;
  const fresh =
    !!query.data && !query.isError && Date.now() - query.data.fetchedAt < 60000;
  return {
    ...query,
    client,
    account: address,
    connected,
    ready: connected && fresh && !!query.data?.verified,
    runtime,
  };
}
const ProtocolContext = createContext<ReturnType<typeof useProtocolValue>>(
  null!,
);
export function ProtocolProvider({ children }: { children: ReactNode }) {
  const value = useProtocolValue();
  return (
    <ProtocolContext.Provider value={value}>
      {children}
    </ProtocolContext.Provider>
  );
}
export const useProtocol = () => useContext(ProtocolContext);
export function holdsRole(
  account: Address | undefined,
  ...roles: (Address | undefined)[]
) {
  return (
    !!account &&
    !same(account, zeroAddress) &&
    roles.some((role) => same(account, role))
  );
}
