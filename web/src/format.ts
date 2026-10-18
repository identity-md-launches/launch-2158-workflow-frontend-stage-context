import {
  formatUnits,
  parseUnits,
  getAddress,
  isAddress,
  zeroAddress,
  BaseError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  type Address,
} from "viem";
import { protocolErrors } from "./protocol-errors";
export const same = (a?: string, b?: string) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const full = (a: Address) => getAddress(a);
export function amount(value: string, decimals: number, allowZero = false) {
  const clean = value.trim();
  if (
    !/^\d+(\.\d+)?$/.test(clean) ||
    (clean.split(".")[1]?.length ?? 0) > decimals
  )
    throw new Error(
      `Enter a valid amount with at most ${decimals} decimal places.`,
    );
  const n = parseUnits(clean, decimals);
  if (n < 0n || (!allowZero && n === 0n))
    throw new Error("Enter an amount greater than zero.");
  if (n >= 2n ** 256n) throw new Error("This amount is too large.");
  return n;
}
export function address(value: string, allowZero = false): Address {
  const clean = value.trim();
  if (!isAddress(clean) || (!allowZero && same(clean, zeroAddress)))
    throw new Error("Enter a valid, nonzero Ethereum address.");
  return getAddress(clean);
}
export function fmt(value: bigint | undefined, decimals = 18, precision = 4) {
  if (value === undefined) return "–";
  const s = formatUnits(value, decimals),
    [whole, frac = ""] = s.split(".");
  if (
    value > 0n &&
    BigInt(whole) === 0n &&
    frac
      .slice(0, precision)
      .split("")
      .every((x) => x === "0")
  )
    return `<${"0." + "0".repeat(precision - 1) + "1"}`;
  return (
    whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
    (frac.slice(0, precision).replace(/0+$/, "")
      ? "." + frac.slice(0, precision).replace(/0+$/, "")
      : "")
  );
}
export const exact = (n: bigint, decimals = 18) => formatUnits(n, decimals);
export function duration(seconds: number) {
  if (seconds <= 0) return "No active epoch";
  const days = Math.floor(seconds / 86400),
    hours = Math.floor((seconds % 86400) / 3600),
    mins = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${mins}m left`;
}
const reasons: Record<string, string> = {
  ZeroAmount: "Enter an amount greater than zero.",
  InsufficientBalance:
    "Your available balance is too low. Refresh and enter a smaller amount.",
  DepositsArePaused:
    "Deposits are paused. Withdrawals and claims remain available.",
  InsufficientRewardReserve:
    "The farm does not have enough uncommitted LOCKER. Fund the reserve first.",
  NoActiveEpoch: "Start a new epoch before changing its emissions.",
  RewardRateTooLow:
    "The committed amount must fund at least one base unit per second for 30 days.",
  EmissionsRenounced:
    "Emission control has been permanently renounced. This farm cannot accept new reward funding.",
  NotEmissionsManager: "Only the current emissions manager can do this.",
  NotGuardian: "Only the current guardian can do this.",
  OwnableUnauthorizedAccount:
    "This wallet does not hold the required owner role.",
  OwnableInvalidOwner: "Use a valid nonzero owner address.",
  NotPendingEmissionsManager:
    "This wallet has no pending emissions role offer.",
  NotPendingGuardian: "This wallet has no pending guardian offer.",
  ProtectedToken:
    "This token is protected. Use the reserve or excess staking token controls instead.",
  AlreadyRegistered: "This farm is already registered.",
  FarmMismatch:
    "This farm does not match the deployed reward token and Treasury.",
  ERC20InsufficientAllowance: "Approve the required amount first, then retry.",
  ERC20InsufficientBalance:
    "The token balance is too low. Refresh the balances.",
  ZeroAddress: "Enter a valid nonzero Ethereum address.",
  NothingReceived: "No tokens were received. Check the token and amount.",
  OwnershipNotRenounceable: "Treasury ownership cannot be renounced.",
  FarmRewardTokenMismatch: "This farm does not reward LOCKER.",
  ETHTransferFailed: "The recipient could not receive ETH.",
  TransactionDeadlinePassed: "This swap expired. Get a fresh quote and retry.",
  V4TooLittleReceived:
    "The pool cannot meet your minimum output. Get a fresh quote and review your slippage.",
  V4TooMuchRequested:
    "The swap requires more input than allowed. Get a fresh quote.",
  ExecutionFailed:
    "The router rejected the swap. Refresh the quote and check both approvals before retrying.",
};
export function errorText(error: unknown): string {
  if (error instanceof BaseError) {
    const revert = error.walk(
      (e) => e instanceof ContractFunctionRevertedError,
    ) as ContractFunctionRevertedError;
    if (revert?.data?.errorName === "ExecutionFailed") {
      try {
        const nested = decodeErrorResult({
          abi: protocolErrors,
          data: revert.data.args?.[1] as `0x${string}`,
        });
        if (nested.errorName === "Error")
          return `The contract rejected the swap: ${String(nested.args?.[0]).slice(0, 180)}`;
        return reasons[nested.errorName] ?? reasons.ExecutionFailed;
      } catch {
        return reasons.ExecutionFailed;
      }
    }
    if (revert?.data?.errorName)
      return (
        reasons[revert.data.errorName] ??
        `The contract rejected the action (${revert.data.errorName}). Check the amounts and current state.`
      );
    if (revert instanceof ContractFunctionRevertedError && revert.reason)
      return `The contract rejected the action: ${revert.reason.slice(0, 180)}`;
  }
  const e = error as { message?: string; shortMessage?: string; code?: number };
  const message = e.shortMessage || e.message || "";
  if (e.code === 4001 || /rejected|denied by user/i.test(message))
    return "Request declined in your wallet. You can try again.";
  if (/insufficient funds/i.test(message))
    return "Your wallet needs more ETH for this action and network gas.";
  if (/timeout|timed out|HTTP|fetch|network|403|429/i.test(message))
    return "The network did not respond. Check your wallet connection and retry.";
  if (error instanceof Error && !(error instanceof BaseError))
    return message.slice(0, 250);
  return "The action could not be completed. Refresh the state and retry; your wallet may show more detail.";
}
