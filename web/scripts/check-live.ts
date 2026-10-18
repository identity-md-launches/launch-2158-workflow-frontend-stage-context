import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  defineChain,
  fallback,
  http,
  parseEther,
} from "viem";
import { readProtocol } from "../src/protocol";
import { buildSwap, minimumOutput, quoterAbi, quoteArgs } from "../src/swap";
import type { Deployment, Runtime } from "../src/config";
const root = fileURLToPath(new URL("../..", import.meta.url));
const deployment = JSON.parse(
  await readFile(root + "/dist/imd-deployment.json", "utf8"),
) as Deployment;
const abis = Object.fromEntries(
  await Promise.all(
    deployment.contracts.map(async (c) => [
      c.name,
      JSON.parse(await readFile(root + "/dist/" + c.abiPath, "utf8")),
    ]),
  ),
);
const chain = defineChain({
  id: deployment.chainId,
  name: deployment.network.name,
  nativeCurrency: deployment.network.nativeCurrency,
  rpcUrls: { default: { http: deployment.network.rpcUrls } },
});
const client = createPublicClient({
  chain,
  transport: fallback(
    deployment.network.rpcUrls.map((url) =>
      http(url, { timeout: 10000, retryCount: 0, batch: { wait: 30 } }),
    ),
    { retryCount: 0 },
  ),
});
const runtime = {
  deployment,
  abis,
  chain,
  client,
  contracts: Object.fromEntries(
    deployment.contracts.map((c) => [
      c.name,
      { address: c.address, abi: abis[c.name] },
    ]),
  ),
} as unknown as Runtime;
const evidence: any = {
  at: new Date().toISOString(),
  chainId: deployment.chainId,
  broadcastTransactions: false,
  rpcs: [],
  code: [],
  readState: null,
  quote: null,
  swapSimulation: null,
  limitations: [
    "No live wallet connection, signature, approval or broadcast was performed. Browser transaction interactions are mocked.",
    "Read-only simulations describe the state at the recorded block and do not guarantee future execution.",
  ],
};
for (const rpc of deployment.network.rpcUrls) {
  try {
    const c = createPublicClient({
      transport: http(rpc, { timeout: 10000, retryCount: 0 }),
    });
    evidence.rpcs.push({ rpc, chainId: await c.getChainId() });
  } catch (e) {
    evidence.rpcs.push({ rpc, error: String(e).slice(0, 400) });
  }
}
for (const contract of deployment.contracts) {
  try {
    const code = await client.getCode({ address: contract.address });
    evidence.code.push({
      name: contract.name,
      address: contract.address,
      bytes: code ? (code.length - 2) / 2 : 0,
      nonempty: !!code && code !== "0x",
    });
  } catch (e) {
    evidence.code.push({ name: contract.name, error: String(e).slice(0, 400) });
  }
}
try {
  const state = await readProtocol(runtime, client);
  evidence.readState = {
    block: state.block,
    timestamp: state.timestamp,
    verified: state.verified,
    owner: state.owner,
    factoryOwner: state.factoryOwner,
    treasuryBalance: state.treasuryBalance,
    farms: state.farms.map((f) => ({
      address: f.address,
      token: f.token,
      totalStaked: f.totalStaked,
      rewardReserve: f.rewardReserve,
      rewardRate: f.rewardRate,
      periodFinish: f.periodFinish,
      registered: f.registered,
      depositsPaused: f.depositsPaused,
    })),
    farmErrors: state.farmErrors,
  };
  if (deployment.poolKey) {
    const input = parseEther("0.001");
    const q = await client.simulateContract({
      address: deployment.network.uniswapV4.quoter,
      abi: quoterAbi,
      functionName: "quoteExactInputSingle",
      args: quoteArgs(deployment.poolKey, true, input),
      account: state.owner,
    });
    evidence.quote = {
      inputCurrency: deployment.poolKey.currency0,
      input: input,
      output: q.result[0],
      gasEstimate: q.result[1],
      block: state.block,
    };
    try {
      await client.simulateContract({
        ...buildSwap(
          deployment,
          true,
          input,
          minimumOutput(q.result[0], 50),
          BigInt(Math.floor(Date.now() / 1000) + 300),
        ),
        account: state.owner,
      });
      evidence.swapSimulation = {
        passed: true,
        direction: "native ETH to LOCKER",
        input: "0.001 ETH",
        slippage: "0.5%",
        sent: false,
      };
    } catch (e) {
      evidence.swapSimulation = {
        passed: false,
        error: String(e).slice(0, 1800),
        sent: false,
      };
    }
  }
} catch (e) {
  evidence.readOrQuoteError = String(e).slice(0, 1800);
}
await writeFile(
  root + "/docs/frontend/evidence/live-chain.json",
  JSON.stringify(
    evidence,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  ) + "\n",
);
console.log(
  JSON.stringify(
    {
      rpcs: evidence.rpcs,
      code: evidence.code,
      readState: evidence.readState,
      quote: evidence.quote,
      swapSimulation: evidence.swapSimulation,
      error: evidence.readOrQuoteError,
    },
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  ),
);
