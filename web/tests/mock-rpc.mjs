import { readFileSync } from "node:fs";
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeErrorResult,
  erc20Abi,
  parseAbi,
  toHex,
  zeroAddress,
} from "viem";
const manifest = JSON.parse(
  readFileSync(
    new URL("../../dist/imd-deployment.json", import.meta.url),
    "utf8",
  ),
);
const abi = Object.fromEntries(
  manifest.contracts.map((c) => [
    c.name,
    JSON.parse(
      readFileSync(new URL("../../dist/" + c.abiPath, import.meta.url), "utf8"),
    ),
  ]),
);
export const addresses = Object.fromEntries(
  manifest.contracts.map((c) => [c.name, c.address.toLowerCase()]),
);
export const owner = "0x1234567890123456789012345678901234567890"; // Test fixture only; never used by production.
export const visitor = "0x9876543210987654321098765432109876543210";
const permitAbi = parseAbi([
  "function allowance(address user,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
]);
const quoterAbi = parseAbi([
  "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",
]);
const routerAbi = parseAbi([
  "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
]);
const eth = 10n ** 18n,
  hash = "0x" + "ab".repeat(32),
  blockHash = "0x" + "cd".repeat(32),
  now = BigInt(Math.floor(Date.now() / 1000));
export function createMock(options = {}) {
  const state = {
    chain: "0xaa36a7",
    account: owner,
    connected: false,
    unknownChain: false,
    added: false,
    rejectConnect: false,
    rejectWrite: false,
    simulateRevert: false,
    noCode: false,
    rpcFail: false,
    registered: false,
    paused: false,
    manager: owner,
    guardian: owner,
    stake: 100n * eth,
    balance: 1000n * eth,
    fees: 5n * eth,
    earned: 20n * eth,
    reserve: 10000n * eth,
    rate: eth / 100n,
    period: now + 86400n * 20n,
    allowances: new Map(),
    permit: 0n,
    sent: [],
    calls: [],
    receiptDelay: 0,
    blockNumber: 256,
    receiptStatus: "0x1",
    ...options,
  };
  function contractAbi(to) {
    const n = Object.keys(addresses).find((n) => addresses[n] === to);
    if (n) return abi[n];
    if (to === manifest.network.uniswapV4.permit2) return permitAbi;
    if (to === manifest.network.uniswapV4.quoter) return quoterAbi;
    if (to === manifest.network.uniswapV4.universalRouter) return routerAbi;
    return erc20Abi;
  }
  function decode(tx) {
    const a = contractAbi(tx.to?.toLowerCase());
    return {
      ...decodeFunctionData({ abi: a, data: tx.data }),
      abi: a,
      to: tx.to?.toLowerCase(),
    };
  }
  function allowanceKey(to, spender) {
    return to.toLowerCase() + ":" + spender.toLowerCase();
  }
  function apply(tx) {
    const { functionName: fn, args = [], to } = decode(tx);
    state.sent.push({ fn, args, to, value: tx.value ?? "0x0" });
    if (state.receiptStatus === "0x0") return;
    if (fn === "approve" && to === manifest.network.uniswapV4.permit2) {
      state.permit = args[2];
      return;
    }
    if (fn === "approve")
      state.allowances.set(allowanceKey(to, args[0]), args[1]);
    if (fn === "deposit") {
      state.stake += args[0];
      state.balance -= args[0];
    }
    if (fn === "withdraw") {
      state.stake -= args[0];
      state.balance += (args[0] * 9n) / 10n;
    }
    if (fn === "claimFees") state.fees = 0n;
    if (fn === "claimRewards") state.earned = 0n;
    if (fn === "exit") {
      state.stake = 0n;
      state.fees = 0n;
      state.earned = 0n;
    }
    if (fn === "pauseDeposits") state.paused = true;
    if (fn === "unpauseDeposits") state.paused = false;
    if (fn === "registerFarm") state.registered = true;
    if (fn === "startEpoch") {
      state.reserve -= args[0];
      state.rate = args[0] / 2592000n;
    }
    if (fn === "fundRewards" || fn === "fundFarm")
      state.reserve += args[fn === "fundFarm" ? 1 : 0];
    if (fn === "renounceEmissionsManager") state.manager = zeroAddress;
    if (fn === "renounceGuardian") state.guardian = zeroAddress;
  }
  async function request({ method, params = [] }) {
    state.calls.push({ method, params });
    if (method === "eth_requestAccounts") {
      if (state.rejectConnect)
        throw { code: 4001, message: "User rejected connection" };
      state.connected = true;
      return [state.account];
    }
    if (method === "eth_accounts")
      return state.connected ? [state.account] : [];
    if (method === "wallet_switchEthereumChain") {
      if (state.unknownChain && !state.added)
        throw { code: 4902, message: "Unknown chain" };
      state.chain = params[0].chainId;
      return null;
    }
    if (method === "wallet_addEthereumChain") {
      state.added = true;
      return null;
    }
    if (method === "wallet_getCapabilities") return {};
    if (method === "eth_chainId") return state.chain;
    if (method === "eth_sendTransaction") {
      if (state.rejectWrite)
        throw { code: 4001, message: "User rejected transaction" };
      apply(params[0]);
      return hash;
    }
    if (method === "eth_getTransactionReceipt") {
      if (state.receiptDelay > 0) {
        state.receiptDelay--;
        return null;
      }
      return {
        transactionHash: hash,
        transactionIndex: "0x0",
        blockHash,
        blockNumber: "0x100",
        from: state.account,
        to: addresses.LockerFarm,
        cumulativeGasUsed: "0x5208",
        gasUsed: "0x5208",
        contractAddress: null,
        logs: [],
        logsBloom: "0x" + "00".repeat(256),
        status: state.receiptStatus,
        effectiveGasPrice: "0x1",
        type: "0x2",
      };
    }
    if (method === "eth_getTransactionByHash")
      return {
        hash,
        from: state.account,
        to: addresses.LockerFarm,
        nonce: "0x0",
        value: "0x0",
        gas: "0x100000",
        gasPrice: "0x1",
        input: "0x",
        blockNumber: "0x100",
        blockHash,
        transactionIndex: "0x0",
        type: "0x2",
        chainId: "0xaa36a7",
        v: "0x1",
        r: "0x1",
        s: "0x1",
      };
    if (method === "eth_getBlockByNumber")
      return {
        number: "0x100",
        hash: blockHash,
        parentHash: blockHash,
        nonce: "0x0000000000000000",
        sha3Uncles: hash,
        logsBloom: "0x" + "00".repeat(256),
        transactionsRoot: hash,
        stateRoot: hash,
        receiptsRoot: hash,
        miner: owner,
        difficulty: "0x0",
        totalDifficulty: "0x0",
        extraData: "0x",
        size: "0x100",
        gasLimit: "0x1c9c380",
        gasUsed: "0x5208",
        timestamp: toHex(now),
        transactions: [],
        uncles: [],
        baseFeePerGas: "0x1",
        mixHash: hash,
      };
    if (method === "eth_blockNumber") return toHex(++state.blockNumber);
    if (method === "eth_getCode") return state.noCode ? "0x" : "0x60006000";
    if (method === "eth_getBalance") return toHex(100n * eth);
    if (method === "eth_gasPrice" || method === "eth_maxPriorityFeePerGas")
      return "0x1";
    if (method === "eth_estimateGas") return "0x100000";
    if (method === "eth_getTransactionCount") return "0x0";
    if (method === "eth_call") {
      const tx = params[0],
        { functionName: fn, args = [], to, abi: a } = decode(tx);
      let result;
      const isToken = to === addresses.LaunchToken;
      const isWrite = a.find(
        (x) => x.type === "function" && x.name === fn,
      )?.stateMutability;
      if (isWrite === "nonpayable" || isWrite === "payable") {
        if (state.simulateRevert)
          throw {
            code: 3,
            message: "execution reverted",
            data: encodeErrorResult({
              abi: abi.LockerFarm,
              errorName: "DepositsArePaused",
            }),
          };
        result =
          fn === "approve" || fn === "transfer"
            ? true
            : fn === "createFarm"
              ? addresses.LockerFarm
              : undefined;
      } else
        switch (fn) {
          case "owner":
            result = owner;
            break;
          case "pendingOwner":
            result = zeroAddress;
            break;
          case "allFarms":
            result = state.registered ? [addresses.LockerFarm] : [];
            break;
          case "isFarm":
            result = state.registered;
            break;
          case "symbol":
            result = "LOCKER";
            break;
          case "name":
            result = "Locker";
            break;
          case "decimals":
            result = 18;
            break;
          case "totalSupply":
            result = 1000000000n * eth;
            break;
          case "stakingToken":
          case "rewardToken":
          case "lockerToken":
            result = addresses.LaunchToken;
            break;
          case "treasury":
            result = addresses.LockerTreasury;
            break;
          case "totalStaked":
            result = 10000n * eth;
            break;
          case "periodFinish":
            result = state.period;
            break;
          case "rewardRate":
            result = state.rate;
            break;
          case "rewardReserve":
            result = state.reserve;
            break;
          case "depositsPaused":
            result = state.paused;
            break;
          case "emissionsManager":
            result = state.manager;
            break;
          case "guardian":
            result = state.guardian;
            break;
          case "pendingEmissionsManager":
          case "pendingGuardian":
            result = zeroAddress;
            break;
          case "totalFeesRedistributed":
            result = 100n * eth;
            break;
          case "eligibleTotalStaked":
            result = 8000n * eth;
            break;
          case "feeEligibilityStart":
            result = now + 86400n;
            break;
          case "remainingEpochRewards":
            result = 17280n * eth;
            break;
          case "balanceOf":
            result = isToken
              ? args[0].toLowerCase() === addresses.LockerTreasury
                ? 500000000n * eth
                : state.balance
              : state.stake;
            break;
          case "earned":
            result = state.earned;
            break;
          case "pendingFees":
            result = state.fees;
            break;
          case "eligibleStakeOf":
            result = state.stake;
            break;
          case "pendingStakeOf":
            result = 0n;
            break;
          case "allowance":
            result =
              to === manifest.network.uniswapV4.permit2
                ? [state.permit, Number(now + 3600n), 0]
                : (state.allowances.get(allowanceKey(to, args[1])) ?? 0n);
            break;
          case "previewWithdraw": {
            const fee = (args[1] * 1000n + 9999n) / 10000n,
              redistributed = (args[1] * 900n) / 10000n;
            result = [args[1] - fee, redistributed, fee - redistributed];
            break;
          }
          case "untrackedBalance":
            result = 10n * eth;
            break;
          default:
            throw new Error("Unmocked contract read: " + fn);
        }
      if (fn === "quoteExactInputSingle") {
        if (state.simulateRevert)
          throw { code: 3, message: "execution reverted" };
        result = [
          args[0].exactAmount * (args[0].zeroForOne ? 100n : 1n),
          150000n,
        ];
      }
      return encodeFunctionResult({ abi: a, functionName: fn, result });
    }
    throw new Error("Unmocked RPC: " + method);
  }
  return { state, request, manifest };
}
export async function installMock(
  page,
  mock,
  { wallet = true, publicFailure = false } = {},
) {
  await page.route(
    /https:\/\/(ethereum-sepolia-rpc\.publicnode\.com|rpc\.sepolia\.ethpandaops\.io|sepolia\.rpc\.sentio\.xyz)/,
    async (route) => {
      if (publicFailure || mock.state.rpcFail) {
        await route.fulfill({ status: 403, body: "RPC unavailable" });
        return;
      }
      const data = route.request().postDataJSON();
      const handle = async (q) => {
        try {
          return {
            id: q.id,
            jsonrpc: "2.0",
            result:
              q.method === "eth_chainId" ? "0xaa36a7" : await mock.request(q),
          };
        } catch (e) {
          return {
            id: q.id,
            jsonrpc: "2.0",
            error: {
              code: e.code ?? -32603,
              message: e.message ?? "Mock failure",
              data: e.data,
            },
          };
        }
      };
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          Array.isArray(data)
            ? await Promise.all(data.map(handle))
            : await handle(data),
        ),
      });
    },
  );
  if (wallet) {
    await page.exposeFunction("__mockRequest", async (args) => {
      try {
        return { result: await mock.request(args) };
      } catch (e) {
        return {
          error: {
            code: e.code ?? -32603,
            message: e.message ?? "Mock failure",
            data: e.data,
          },
        };
      }
    });
    await page.addInitScript(() => {
      const listeners = {};
      const provider = {
        request: async (args) => {
          const response = await window.__mockRequest(args);
          if (response.error)
            throw Object.assign(
              new Error(response.error.message),
              response.error,
            );
          if (args.method === "wallet_switchEthereumChain")
            (listeners.chainChanged ?? []).forEach((f) =>
              f(args.params[0].chainId),
            );
          return response.result;
        },
        on: (name, fn) => {
          (listeners[name] ??= []).push(fn);
        },
        removeListener: (name, fn) => {
          listeners[name] = (listeners[name] ?? []).filter((f) => f !== fn);
        },
      };
      window.ethereum = provider;
      window.__emit = (name, value) =>
        (listeners[name] ?? []).forEach((f) => f(value));
      const info = {
        uuid: "0d86e58c-6c9f-4b1e-ae91-751776338c77",
        name: "Test wallet",
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><rect width="28" height="28" fill="gold"/></svg>',
        rdns: "test.locker.wallet",
      };
      const announce = () =>
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: { info, provider },
          }),
        );
      window.addEventListener("eip6963:requestProvider", announce);
      announce();
    });
  }
}
