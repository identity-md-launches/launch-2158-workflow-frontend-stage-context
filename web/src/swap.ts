import {
  encodeAbiParameters,
  parseAbi,
  parseAbiParameters,
  zeroAddress,
} from "viem";
import type { Deployment, PoolKey } from "./config";
import { protocolErrors } from "./protocol-errors";
export const quoterAbi = parseAbi([
  "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",
]);
export const routerAbi = [
  ...parseAbi([
    "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
  ]),
  ...protocolErrors,
];
export const permit2Abi = parseAbi([
  "function allowance(address user,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
]);
export function minimumOutput(quote: bigint, bps: number) {
  if (!Number.isInteger(bps) || bps < 1 || bps > 500)
    throw new Error("Set slippage between 0.01% and 5%.");
  return (quote * BigInt(10000 - bps)) / 10000n;
}
export function buildSwap(
  deployment: Deployment,
  zeroForOne: boolean,
  input: bigint,
  minimum: bigint,
  deadline: bigint,
) {
  const key = deployment.poolKey;
  if (!key) throw new Error("No attested pool is configured.");
  if (
    input <= 0n ||
    input > 2n ** 128n - 1n ||
    minimum <= 0n ||
    minimum > 2n ** 128n - 1n
  )
    throw new Error("Swap amount is outside the supported range.");
  const extended = deployment.network.uniswapV4.extendedSwapParams;
  const tuple = extended
    ? "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)"
    : "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)";
  const params0 = encodeAbiParameters(parseAbiParameters(tuple), [
    {
      poolKey: key,
      zeroForOne,
      amountIn: input,
      amountOutMinimum: minimum,
      ...(extended ? { minHopPriceX36: 0n } : {}),
      hookData: "0x",
    },
  ] as never);
  const inToken = zeroForOne ? key.currency0 : key.currency1,
    outToken = zeroForOne ? key.currency1 : key.currency0;
  const params = [
    params0,
    encodeAbiParameters(parseAbiParameters("address,uint256"), [
      inToken,
      input,
    ]),
    encodeAbiParameters(parseAbiParameters("address,uint256"), [
      outToken,
      minimum,
    ]),
  ];
  const encoded = encodeAbiParameters(parseAbiParameters("bytes,bytes[]"), [
    "0x060c0f",
    params,
  ]);
  return {
    address: deployment.network.uniswapV4.universalRouter,
    abi: routerAbi,
    functionName: "execute",
    args: ["0x10", [encoded], deadline] as const,
    value: inToken.toLowerCase() === zeroAddress ? input : 0n,
  };
}
export function quoteArgs(key: PoolKey, zeroForOne: boolean, input: bigint) {
  return [
    { poolKey: key, zeroForOne, exactAmount: input, hookData: "0x" },
  ] as const;
}
