import { parseAbi } from "viem";

// Public protocol interfaces, not deployment addresses. See documentation sources.
export const protocolErrors = parseAbi([
  "error ExecutionFailed(uint256 commandIndex, bytes message)",
  "error TransactionDeadlinePassed()",
  "error V4TooLittleReceived(uint256 minAmountOutReceived, uint256 amountReceived)",
  "error V4TooMuchRequested(uint256 maxAmountInRequested, uint256 amountRequested)",
  "error LengthMismatch()",
  "error Error(string reason)",
]);
