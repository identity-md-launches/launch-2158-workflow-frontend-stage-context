import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { erc20Abi, zeroAddress, type Address } from "viem";
import { useProtocol, tokenInfo, type Token } from "../protocol";
import { amount, exact, fmt, same, errorText } from "../format";
import { TxButton } from "../transactions";
import {
  buildSwap,
  minimumOutput,
  permit2Abi,
  quoterAbi,
  quoteArgs,
} from "../swap";
import { AddressView } from "./AddressView";
import { Chest } from "./Chest";

export function Swap() {
  const { runtime, data, client, account, ready } = useProtocol();
  const key = runtime.deployment.poolKey;
  const [buy, setBuy] = useState(true),
    [input, setInput] = useState(""),
    [slippage, setSlippage] = useState("0.5");
  const [quote, setQuote] = useState<{
      output: bigint;
      at: number;
      input: bigint;
      direction: boolean;
      account?: Address;
    }>(),
    [error, setError] = useState(""),
    [quoting, setQuoting] = useState(false),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setQuote(undefined);
    setError("");
  }, [buy, input, slippage, account]);
  const poolTokens = useQuery({
    queryKey: ["poolTokens", account, !!data],
    enabled: !!key && !!data,
    queryFn: async () =>
      Promise.all(
        [key!.currency0, key!.currency1].map((a) =>
          same(a, zeroAddress)
            ? Promise.resolve({
                address: a,
                symbol: runtime.chain.nativeCurrency.symbol,
                decimals: runtime.chain.nativeCurrency.decimals,
                balance: data!.ethBalance,
              } satisfies Token)
            : tokenInfo(client, a, account),
        ),
      ),
    staleTime: 10000,
    refetchInterval: 15000,
  });
  const lockerFirst =
      !!key && same(key.currency0, runtime.contracts.LaunchToken.address),
    zeroForOne = buy ? !lockerFirst : lockerFirst;
  const inToken = poolTokens.data?.[zeroForOne ? 0 : 1],
    outToken = poolTokens.data?.[zeroForOne ? 1 : 0];
  let n = 0n;
  try {
    n = amount(input, inToken?.decimals ?? 18);
  } catch {
    /* validated on quote */
  }
  const native = !!inToken && same(inToken.address, zeroAddress),
    v4 = runtime.deployment.network.uniswapV4;
  const allowances = useQuery({
    queryKey: ["swapAllowances", account, inToken?.address],
    enabled: !!account && !!inToken && !native && ready,
    queryFn: async () => {
      const [erc20, permit] = await Promise.all([
        client.readContract({
          address: inToken!.address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [account!, v4.permit2],
        }),
        client.readContract({
          address: v4.permit2,
          abi: permit2Abi,
          functionName: "allowance",
          args: [account!, inToken!.address, v4.universalRouter],
        }),
      ]);
      return { erc20, permit };
    },
    refetchInterval: 10000,
    retry: false,
  });
  const needERC = !native && (!allowances.data || allowances.data.erc20 < n);
  const needPermit =
    !native &&
    (!allowances.data ||
      allowances.data.permit[0] < n ||
      Number(allowances.data.permit[1]) <= Math.floor(now / 1000) + 60);
  const validQuote =
    !!quote &&
    now - quote.at < 30000 &&
    quote.input === n &&
    quote.direction === zeroForOne &&
    quote.account === account;
  const min = quote
    ? minimumOutput(
        quote.output,
        Math.max(1, Math.min(500, Math.round(Number(slippage) * 100) || 50)),
      )
    : 0n;
  async function getQuote() {
    setError("");
    setQuote(undefined);
    setQuoting(true);
    try {
      if (!key || !inToken) throw new Error("Wait for verified pool data.");
      const value = amount(input, inToken.decimals);
      if (value > 2n ** 128n - 1n) throw new Error("Swap amount is too large.");
      minimumOutput(1n, Math.round(Number(slippage) * 100));
      if (value > inToken.balance && account)
        throw new Error("Amount exceeds your wallet balance.");
      const result = await client.simulateContract({
        address: v4.quoter,
        abi: quoterAbi,
        functionName: "quoteExactInputSingle",
        args: quoteArgs(key, zeroForOne, value),
        account,
      });
      if (result.result[0] === 0n)
        throw new Error(
          "No output was quoted. Try another amount or check pool liquidity.",
        );
      setQuote({
        output: result.result[0],
        at: Date.now(),
        input: value,
        direction: zeroForOne,
        account,
      });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setQuoting(false);
    }
  }
  if (!key)
    return (
      <section className="empty-page">
        <h1>Trade LOCKER</h1>
        <p>Swaps are unavailable because no attested pool is configured.</p>
      </section>
    );
  return (
    <>
      <div className="page-heading">
        <h1>Trade LOCKER</h1>
        <p>Trade through the deployed Uniswap v4 pool.</p>
      </div>
      <div className="swap-layout">
        <section className="panel swap-panel">
          <div className="section-title">
            <h2>{buy ? "Buy LOCKER" : "Sell LOCKER"}</h2>
            <Chest small />
          </div>
          <div className="farm-tabs">
            <button aria-pressed={buy} onClick={() => setBuy(true)}>
              Buy
            </button>
            <button aria-pressed={!buy} onClick={() => setBuy(false)}>
              Sell
            </button>
          </div>
          <label>
            Pay amount{inToken ? ` (${inToken.symbol})` : ""}
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
            />
          </label>
          <p className="small muted">
            Balance:{" "}
            {inToken && account
              ? `${fmt(inToken.balance, inToken.decimals)} ${inToken.symbol}`
              : "Connect to view"}
          </p>
          <label>
            Slippage tolerance (%)
            <input
              inputMode="decimal"
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
            />
          </label>
          <p className="small muted">
            Allowed range: 0.01% to 5%. Quotes expire after 30 seconds.
          </p>
          <button
            className="wide"
            disabled={!ready || quoting || !inToken}
            onClick={() => void getQuote()}
          >
            {quoting ? "Getting quote…" : "Get quote"}
          </button>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {poolTokens.isError && (
            <p className="error">
              Pool token data is unavailable. Refresh the network state.
            </p>
          )}
          {quote && outToken && inToken && (
            <div className="quote" role="status">
              <dl>
                <div>
                  <dt>Expected output</dt>
                  <dd>
                    {exact(quote.output, outToken.decimals)} {outToken.symbol}
                  </dd>
                </div>
                <div>
                  <dt>Minimum received</dt>
                  <dd>
                    {exact(min, outToken.decimals)} {outToken.symbol}
                  </dd>
                </div>
                <div>
                  <dt>Exchange rate</dt>
                  <dd>
                    1 {inToken.symbol} ≈{" "}
                    {fmt(
                      (quote.output * 10n ** BigInt(inToken.decimals)) /
                        quote.input,
                      outToken.decimals,
                      6,
                    )}{" "}
                    {outToken.symbol}
                  </dd>
                </div>
                <div>
                  <dt>Quote</dt>
                  <dd>
                    {validQuote
                      ? `${Math.max(0, 30 - Math.floor((now - quote.at) / 1000))}s remaining`
                      : "Expired · Get a new quote"}
                  </dd>
                </div>
              </dl>
            </div>
          )}
          {!native && inToken && quote && (
            <p className="small muted">
              Approval steps: token → Permit2, then Permit2 → Universal Router,
              then swap. Each approval uses only the entered amount.
            </p>
          )}
          <TxButton
            primary
            label={
              needERC
                ? "Approve to Permit2"
                : needPermit
                  ? "Authorize router"
                  : "Swap tokens"
            }
            disabled={
              !validQuote || !inToken || (!native && allowances.isError)
            }
            plan={async () => {
              if (!quote || !inToken || !outToken || !account)
                throw new Error("Get a fresh quote first.");
              if (Date.now() - quote.at >= 30000)
                throw new Error("The quote expired. Get a new quote.");
              const amountIn = quote.input,
                bps = Math.round(Number(slippage) * 100),
                minimum = minimumOutput(quote.output, bps);
              if (!native) {
                const erc = await client.readContract({
                  address: inToken.address,
                  abi: erc20Abi,
                  functionName: "allowance",
                  args: [account, v4.permit2],
                });
                if (erc < amountIn)
                  return {
                    address: inToken.address,
                    abi: erc20Abi,
                    functionName: "approve",
                    args: [v4.permit2, amountIn],
                    title: "Approve to Permit2",
                    description: `Allow Permit2 to spend ${exact(amountIn, inToken.decimals)} ${inToken.symbol}. Router authorization and the swap are separate steps.`,
                    details: [{ label: "Spender", value: v4.permit2 }],
                  };
                const permit = await client.readContract({
                  address: v4.permit2,
                  abi: permit2Abi,
                  functionName: "allowance",
                  args: [account, inToken.address, v4.universalRouter],
                });
                if (
                  permit[0] < amountIn ||
                  Number(permit[1]) <= Math.floor(Date.now() / 1000) + 60
                )
                  return {
                    address: v4.permit2,
                    abi: permit2Abi,
                    functionName: "approve",
                    args: [
                      inToken.address,
                      v4.universalRouter,
                      amountIn,
                      Math.floor(Date.now() / 1000) + 1800,
                    ],
                    title: "Authorize router",
                    description:
                      "Authorize the configured Universal Router for this exact input amount for 30 minutes.",
                    details: [{ label: "Spender", value: v4.universalRouter }],
                  };
              }
              const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
              return {
                ...buildSwap(
                  runtime.deployment,
                  zeroForOne,
                  amountIn,
                  minimum,
                  deadline,
                ),
                title: "Swap tokens",
                description:
                  "Trade in the attested pool. The swap reverts if it cannot meet your minimum output. Network gas is paid in ETH.",
                details: [
                  {
                    label: "Pay",
                    value:
                      exact(amountIn, inToken.decimals) + " " + inToken.symbol,
                  },
                  {
                    label: "Minimum received",
                    value:
                      exact(minimum, outToken.decimals) + " " + outToken.symbol,
                  },
                  { label: "Slippage", value: slippage + "%" },
                  { label: "Deadline", value: "5 minutes" },
                ],
                validate: async () => {
                  if (Date.now() - quote.at >= 30000)
                    throw new Error(
                      "The quote expired. Close this review and get a new quote.",
                    );
                },
              };
            }}
            onDone={() => {
              void allowances.refetch();
              setQuote(undefined);
            }}
          />
          {!account && (
            <p className="action-note">
              Connect your wallet to quote and trade.
            </p>
          )}
          <p className="small muted">
            USD context unavailable. Sepolia tokens are for testing.
          </p>
        </section>
        <aside className="swap-info">
          <h2>The deployed pool</h2>
          <p>
            This launch is paired with{" "}
            {same(key.currency0, zeroAddress) ||
            same(key.currency1, zeroAddress)
              ? "native ETH"
              : "an ERC-20 token"}
            . The original request described an IMD pair; this interface follows
            the attested deployment.
          </p>
          <dl>
            <div>
              <dt>Pool fee</dt>
              <dd>{key.fee / 10000}%</dd>
            </div>
            <div>
              <dt>Tick spacing</dt>
              <dd>{key.tickSpacing}</dd>
            </div>
          </dl>
          <h3>Pool currencies</h3>
          <p>
            {same(key.currency0, zeroAddress) ? (
              "Native ETH"
            ) : (
              <AddressView address={key.currency0} />
            )}
          </p>
          <AddressView address={key.currency1} />
          <h3>Initialization hook</h3>
          <AddressView address={key.hooks} />
          <h3>Universal Router</h3>
          <AddressView address={v4.universalRouter} />
          <p className="small muted">
            Quotes are simulated through the network’s quoter. The complete swap
            is simulated again before signing. A successful simulation cannot
            guarantee inclusion or a fixed execution price.
          </p>
        </aside>
      </div>
    </>
  );
}
