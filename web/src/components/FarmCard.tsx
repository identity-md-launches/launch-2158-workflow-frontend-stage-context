import { useState, useEffect } from "react";
import { erc20Abi } from "viem";
import { type Farm, useProtocol } from "../protocol";
import { amount, fmt, exact, duration, same } from "../format";
import { TxButton, type TxPlan } from "../transactions";
import { Chest } from "./Chest";
import { AddressView } from "./AddressView";
import { FarmTools } from "./FarmTools";

export function FarmCard({
  farm,
  symbol,
  unconfigured = false,
}: {
  farm?: Farm;
  symbol: string;
  unconfigured?: boolean;
}) {
  const { data, ready, account, client, runtime, isError } = useProtocol();
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit"),
    [input, setInput] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const decimals = farm?.token.decimals ?? 18;
  let value = 0n;
  try {
    value = amount(input, decimals);
  } catch {
    /* validated when reviewed */
  }
  const needsApproval = !!farm && tab === "deposit" && value > farm.allowance;
  const contract = {
    address: farm?.address ?? runtime.contracts.LockerFarm.address,
    abi: runtime.abis.LockerFarm,
  };
  const remaining =
    farm && data
      ? Number(farm.periodFinish - data.timestamp) -
        Math.floor((now - data.fetchedAt) / 1000)
      : 0;
  const active = remaining > 0;
  const emitting = active && !!farm && farm.rewardRate > 0n;
  const apr =
    farm &&
    same(farm.token.address, data?.locker.address) &&
    farm.totalStaked > 0n &&
    active
      ? `${fmt((farm.rewardRate * 31536000n * 10000n) / farm.totalStaked, 2, 2)}%`
      : "APR unavailable";
  const balance = tab === "deposit" ? farm?.token.balance : farm?.stake;
  async function action(): Promise<TxPlan> {
    if (!farm || !account)
      throw new Error("Connect your wallet and load this farm first.");
    const n = amount(input, decimals);
    if (n > (balance ?? 0n))
      throw new Error(
        `Amount exceeds your ${tab === "deposit" ? "wallet balance" : "deposited principal"}.`,
      );
    if (tab === "withdraw") {
      const [payout, redistributed, toTreasury] = (await client.readContract({
        ...contract,
        functionName: "previewWithdraw",
        args: [account, n],
      })) as [bigint, bigint, bigint];
      return {
        ...contract,
        functionName: "withdraw",
        args: [n],
        title: `Withdraw ${symbol}`,
        description:
          "Withdrawing principal incurs a 10% fee, rounded up. Your remaining stake never shares in your own fee.",
        details: [
          {
            label: "Principal withdrawn",
            value: `${exact(n, decimals)} ${symbol}`,
          },
          {
            label: "You receive",
            value: `${exact(payout, decimals)} ${symbol}`,
          },
          {
            label: "Other eligible depositors",
            value: `${exact(redistributed, decimals)} ${symbol}`,
          },
          {
            label: "Treasury",
            value: `${exact(toTreasury, decimals)} ${symbol}`,
          },
        ],
      };
    }
    const fresh = await client.readContract({
      address: farm.token.address,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account, farm.address],
    });
    if (fresh < n)
      return {
        address: farm.token.address,
        abi: erc20Abi,
        functionName: "approve",
        args: [farm.address, n],
        title: `Approve ${symbol}`,
        description:
          "Allow this farm to spend only the entered amount. This approval does not deposit tokens. Return here to deposit after confirmation.",
        details: [
          { label: "Allowance", value: `${exact(n, decimals)} ${symbol}` },
          { label: "Spender", value: farm.address },
        ],
      };
    return {
      ...contract,
      functionName: "deposit",
      args: [n],
      title: `Deposit ${symbol}`,
      description:
        "Stake tokens in this isolated farm. There is no deposit fee. A 10% fee applies when you withdraw principal. New stake becomes eligible for withdrawal fee rewards after 1–2 days." +
        (emitting ? "" : " No LOCKER is currently being emitted by this farm."),
      details: [
        { label: "Deposit", value: `${exact(n, decimals)} ${symbol}` },
        { label: "Deposit fee", value: "0%" },
      ],
    };
  }
  async function exit(): Promise<TxPlan> {
    if (!farm || !account) throw new Error("Load your position first.");
    const [payout] = (await client.readContract({
      ...contract,
      functionName: "previewWithdraw",
      args: [account, farm.stake],
    })) as [bigint, bigint, bigint];
    return {
      ...contract,
      functionName: "exit",
      title: "Exit farm",
      description:
        "Withdraw all principal with the 10% withdrawal fee and claim both reward balances. This does not charge another fee on claimed rewards.",
      details: [
        {
          label: "Principal",
          value: `${exact(farm.stake, decimals)} ${symbol}`,
        },
        {
          label: "Principal received after fee",
          value: `${exact(payout, decimals)} ${symbol}`,
        },
        {
          label: "Fee rewards",
          value: `${exact(farm.fees, decimals)} ${symbol}`,
        },
        { label: "Farming rewards", value: `${exact(farm.earned)} LOCKER` },
      ],
    };
  }
  return (
    <article
      className={`farm-card ${unconfigured ? "unconfigured" : ""}`}
      aria-label={`${symbol} farm`}
    >
      <div className="farm-title">
        <div>
          <h2>{symbol} vault</h2>
          <span
            className={`state ${farm && !farm.depositsPaused ? "success" : ""}`}
          >
            <span className="state-dot" />
            {unconfigured
              ? "Awaiting setup"
              : farm
                ? farm.depositsPaused
                  ? "Deposits paused"
                  : "Deposits open"
                : isError
                  ? "Read unavailable"
                  : "Loading farm"}
          </span>
        </div>
        <Chest muted={unconfigured} />
      </div>
      {unconfigured ? (
        <>
          <p className="empty-copy">
            The owner can create an isolated {symbol} farm from the Admin
            dashboard.
          </p>
          <div className="empty-stat">
            <span>Farming APR</span>
            <strong>APR unavailable</strong>
            <span>Withdrawal Fee APR</span>
            <strong>APR unavailable</strong>
          </div>
          <button disabled className="wide">
            Deposit {symbol}
          </button>
          <p className="small muted">No farm address is configured yet.</p>
        </>
      ) : (
        <>
          <div className="farm-tabs" aria-label={`${symbol} action`}>
            <button
              aria-pressed={tab === "deposit"}
              onClick={() => {
                setTab("deposit");
                setInput("");
              }}
            >
              Deposit
            </button>
            <button
              aria-pressed={tab === "withdraw"}
              onClick={() => {
                setTab("withdraw");
                setInput("");
              }}
            >
              Withdraw
            </button>
          </div>
          <div className="amount-label">
            <label htmlFor={`amount-${contract.address}`}>
              {tab === "deposit" ? "Deposit amount" : "Withdraw principal"}
            </label>
            <button
              className="text-button"
              disabled={!ready || balance === undefined}
              onClick={() => setInput(exact(balance ?? 0n, decimals))}
            >
              Max
            </button>
          </div>
          <div className="amount-input">
            <input
              id={`amount-${contract.address}`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              autoComplete="off"
            />
            <span>{symbol}</span>
          </div>
          <div className="balance-line">
            <span>{tab === "deposit" ? "Wallet balance" : "Deposited"}</span>
            <span
              title={
                balance !== undefined ? exact(balance, decimals) : undefined
              }
            >
              {account && farm
                ? `${fmt(balance, decimals)} ${symbol}`
                : "Connect to view"}
            </span>
          </div>
          <TxButton
            primary
            label={
              needsApproval
                ? `Approve ${symbol}`
                : tab === "deposit"
                  ? `Deposit ${symbol}`
                  : `Withdraw ${symbol}`
            }
            plan={action}
            disabled={!farm || (tab === "deposit" && farm.depositsPaused)}
            onDone={() => {
              if (!needsApproval) setInput("");
            }}
          />
          <p className="action-note">
            {!account
              ? "Connect your wallet to start."
              : !ready
                ? "Waiting for verified state on the correct network."
                : tab === "deposit"
                  ? !emitting
                    ? "No LOCKER emissions now. Withdrawals still cost 10%."
                    : needsApproval
                      ? "Step 1 of 2 · Approve, then deposit."
                      : "0% deposit fee · 10% withdrawal fee"
                  : "You receive 90% of withdrawn principal; fee rounding applies."}
          </p>
          <div className="farm-metrics">
            <div>
              <span>Farming APR</span>
              <strong>{apr}</strong>
            </div>
            <div>
              <span>Withdrawal Fee APR</span>
              <strong>APR unavailable</strong>
            </div>
            <div>
              <span>Total deposited</span>
              <strong>
                {farm
                  ? `${fmt(farm.totalStaked, decimals)} ${symbol}`
                  : "Loading"}
              </strong>
            </div>
            <div>
              <span>Epoch countdown</span>
              <strong>{farm ? duration(remaining) : "Loading"}</strong>
            </div>
          </div>
          <div className="rewards">
            <div>
              <span>Fee rewards</span>
              <strong>
                {account && farm
                  ? `${fmt(farm.fees, decimals)} ${symbol}`
                  : "Connect to view"}
              </strong>
              <TxButton
                label="Claim fees"
                disabled={!farm || farm.fees === 0n}
                plan={() => ({
                  ...contract,
                  functionName: "claimFees",
                  title: "Claim fees",
                  description: `Claim your accrued ${symbol} withdrawal fee rewards. No additional protocol fee applies, including after a full withdrawal.`,
                  details: [
                    {
                      label: "Claimable",
                      value: `${exact(farm?.fees ?? 0n, decimals)} ${symbol}`,
                    },
                  ],
                })}
              />
            </div>
            <div>
              <span>Farming rewards</span>
              <strong>
                {account && farm
                  ? `${fmt(farm.earned)} LOCKER`
                  : "Connect to view"}
              </strong>
              <TxButton
                label="Claim LOCKER"
                disabled={!farm || farm.earned === 0n}
                plan={() => ({
                  ...contract,
                  functionName: "claimRewards",
                  title: "Claim LOCKER",
                  description:
                    "Claim accrued LOCKER farming rewards. Your principal stays deposited and no additional protocol fee applies.",
                  details: [
                    {
                      label: "Claimable",
                      value: `${exact(farm?.earned ?? 0n)} LOCKER`,
                    },
                  ],
                })}
              />
            </div>
          </div>
          <details className="farm-details">
            <summary>Position & farm details</summary>
            <dl>
              <div>
                <dt>Your principal</dt>
                <dd>
                  {account && farm
                    ? `${exact(farm.stake, decimals)} ${symbol}`
                    : "Connect to view"}
                </dd>
              </div>
              <div>
                <dt>Fee-eligible principal</dt>
                <dd>
                  {account && farm
                    ? `${exact(farm.eligible, decimals)} ${symbol}`
                    : "Connect to view"}
                </dd>
              </div>
              <div>
                <dt>Pending eligibility</dt>
                <dd>
                  {account && farm
                    ? `${exact(farm.pending, decimals)} ${symbol}`
                    : "Connect to view"}
                </dd>
              </div>
              <div>
                <dt>Reserve</dt>
                <dd>
                  {farm ? `${exact(farm.rewardReserve)} LOCKER` : "Loading"}
                </dd>
              </div>
              <div>
                <dt>Emission rate</dt>
                <dd>
                  {farm
                    ? `${exact(farm.rewardRate)} LOCKER / second`
                    : "Loading"}
                </dd>
              </div>
              <div>
                <dt>Lifetime redistributed fees</dt>
                <dd>
                  {farm
                    ? `${exact(farm.totalFeesRedistributed, decimals)} ${symbol}`
                    : "Loading"}
                </dd>
              </div>
            </dl>
            <p className="small muted">
              New deposits become fee eligible at{" "}
              {farm
                ? new Date(
                    Number(farm.feeEligibilityStart) * 1000,
                  ).toLocaleString()
                : "the next eligibility boundary"}
              . LOCKER emissions begin immediately during an active epoch.
            </p>
            <p className="small muted">
              Farming APR annualizes the current rate and total stake for
              same-token farms only. Historical fee APR needs a reliable time
              series. USD prices are unavailable.
            </p>
            <AddressView address={contract.address} />
            {farm && (
              <>
                <p className="small">Staking token</p>
                <AddressView address={farm.token.address} />
              </>
            )}
            <TxButton
              label="Exit & claim all"
              disabled={
                !farm ||
                (farm.stake === 0n && farm.fees === 0n && farm.earned === 0n)
              }
              plan={exit}
            />
            {farm && <FarmTools farm={farm} maintenance />}
          </details>
        </>
      )}
    </article>
  );
}
