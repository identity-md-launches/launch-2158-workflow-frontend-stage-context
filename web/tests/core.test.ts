import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  decodeAbiParameters,
  parseAbiParameters,
  zeroAddress,
  ContractFunctionRevertedError,
  encodeErrorResult,
} from "viem";
import { amount, address, same, errorText } from "../src/format";
import { buildSwap, minimumOutput, routerAbi } from "../src/swap";
import { protocolErrors } from "../src/protocol-errors";
import { switchNetwork } from "../src/wallet";
import { canonical, type Deployment } from "../src/config";
const deployment = JSON.parse(
  readFileSync(
    new URL("../../dist/imd-deployment.json", import.meta.url),
    "utf8",
  ),
) as Deployment;

test("nested router slippage errors are decoded into an actionable reason", () => {
  const nested = encodeErrorResult({
    abi: protocolErrors,
    errorName: "V4TooLittleReceived",
    args: [100n, 90n],
  });
  const data = encodeErrorResult({
    abi: protocolErrors,
    errorName: "ExecutionFailed",
    args: [0n, nested],
  });
  const error = new ContractFunctionRevertedError({
    abi: routerAbi,
    data,
    functionName: "execute",
  });
  assert.match(errorText(error), /minimum output/);
});

test("amount parsing preserves precision and rejects rounding, exponents and overflow", () => {
  assert.equal(amount("1.000001", 6), 1000001n);
  assert.equal(amount("0.000000000000000001", 18), 1n);
  for (const input of ["1e18", "-1", "1.0000001", "NaN", "1,000", "", ".5"])
    assert.throws(() => amount(input, 6));
  assert.throws(() => amount("0", 18));
  assert.equal(amount("0", 18, true), 0n);
  assert.throws(() => amount((2n ** 256n).toString(), 0));
});
test("recipient validation refuses missing and zero values, permits explicit cancellation", () => {
  assert.throws(() => address(""));
  assert.throws(() => address(zeroAddress));
  assert.equal(address(zeroAddress, true), zeroAddress);
  assert(
    same(
      address(deployment.contracts[0].address),
      deployment.contracts[0].address,
    ),
  );
});
test("canonical ABI serialization sorts nested keys without reordering arrays", () => {
  assert.equal(
    canonical([
      {
        type: "tuple",
        components: [{ type: "address", name: "a" }],
        name: "z",
      },
    ]),
    '[{"components":[{"name":"a","type":"address"}],"name":"z","type":"tuple"}]',
  );
});
test("unknown chain invokes addChain with unchanged parameters and switches again", async () => {
  const calls: any[] = [];
  const provider = {
    request: async (args: any) => {
      calls.push(args);
      if (calls.length === 1) throw { code: 4902 };
    },
  };
  await switchNetwork(provider, deployment.chainId, deployment.walletAddChain);
  assert.deepEqual(
    calls.map((c) => c.method),
    [
      "wallet_switchEthereumChain",
      "wallet_addEthereumChain",
      "wallet_switchEthereumChain",
    ],
  );
  assert.deepEqual(calls[1].params, [deployment.walletAddChain]);
});
test("switch rejection is not treated as an unknown chain", async () => {
  const calls: any[] = [];
  await assert.rejects(() =>
    switchNetwork(
      {
        request: async (args) => {
          calls.push(args);
          throw { code: 4001 };
        },
      },
      deployment.chainId,
      deployment.walletAddChain,
    ),
  );
  assert.equal(calls.length, 1);
});
test("slippage floors output and enforces conservative bounds", () => {
  assert.equal(minimumOutput(10001n, 50), 9950n);
  for (const bps of [0, -1, 501, NaN, 1.1])
    assert.throws(() => minimumOutput(100n, bps));
});
test("native buy uses attested key, commands/actions, output floor and exact ETH value", () => {
  const p = buildSwap(deployment, true, 100n, 80n, 999n);
  assert.equal(p.address, deployment.network.uniswapV4.universalRouter);
  assert.equal(p.value, 100n);
  assert.equal(p.args[0], "0x10");
  const [actions, params] = decodeAbiParameters(
    parseAbiParameters("bytes,bytes[]"),
    p.args[1][0],
  );
  assert.equal(actions, "0x060c0f");
  const [swap] = decodeAbiParameters(
    parseAbiParameters(
      "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)",
    ),
    params[0],
  );
  for (const k of ["currency0", "currency1", "hooks"] as const)
    assert(same(swap.poolKey[k], deployment.poolKey![k]));
  assert.equal(swap.poolKey.fee, deployment.poolKey!.fee);
  assert.equal(swap.poolKey.tickSpacing, deployment.poolKey!.tickSpacing);
  assert.equal(swap.amountIn, 100n);
  assert.equal(swap.amountOutMinimum, 80n);
  assert.equal(swap.hookData, "0x");
  assert.deepEqual(
    decodeAbiParameters(parseAbiParameters("address,uint256"), params[1])
      .map(String)
      .map((x) => x.toLowerCase()),
    [deployment.poolKey!.currency0, "100"],
  );
  assert.deepEqual(
    decodeAbiParameters(parseAbiParameters("address,uint256"), params[2])
      .map(String)
      .map((x) => x.toLowerCase()),
    [deployment.poolKey!.currency1, "80"],
  );
});
test("token sells send no ETH; extended routers receive the sixth field", () => {
  const p = buildSwap(
    {
      ...deployment,
      network: {
        ...deployment.network,
        uniswapV4: {
          ...deployment.network.uniswapV4,
          extendedSwapParams: true,
        },
      },
    },
    false,
    90n,
    10n,
    999n,
  );
  assert.equal(p.value, 0n);
  const [, params] = decodeAbiParameters(
    parseAbiParameters("bytes,bytes[]"),
    p.args[1][0],
  );
  const [s] = decodeAbiParameters(
    parseAbiParameters(
      "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)",
    ),
    params[0],
  );
  assert.equal(s.minHopPriceX36, 0n);
  assert.equal(s.zeroForOne, false);
});
test("swap encoding rejects zero, negative and overflowing amounts", () => {
  for (const n of [0n, -1n, 2n ** 128n])
    assert.throws(() => buildSwap(deployment, true, n, 1n, 999n));
});
