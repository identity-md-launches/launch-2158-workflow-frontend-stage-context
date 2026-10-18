import { useEffect, useState } from "react";
import { useProtocol, holdsRole } from "./protocol";
import { WalletControl } from "./wallet";
import { FarmCard } from "./components/FarmCard";
import { Chest } from "./components/Chest";
import { AddressView } from "./components/AddressView";
import { Admin } from "./components/Admin";
import { Swap } from "./components/Swap";
import { useActivity } from "./transactions";
import { errorText, fmt, same } from "./format";

function HowItWorks() {
  const { runtime } = useProtocol();
  return (
    <article className="reading">
      <h1>How the vault works</h1>
      <p className="intro">
        Independent farms. Two kinds of rewards. One clear set of rules.
      </p>
      <section>
        <h2>1. Choose a farm</h2>
        <p>
          Deposit IMD, sIMD or LOCKER in its own isolated farm once that farm is
          configured. Approve only the amount you want to deposit, then confirm
          the deposit. Depositing costs no protocol fee; every transaction still
          uses ETH for gas.
        </p>
      </section>
      <section>
        <h2>2. Earn LOCKER over time</h2>
        <p>
          Each farm has its own reward reserve and 30-day schedule. During an
          active epoch, your stake earns a proportional share of LOCKER
          emissions. Funding a reserve does not increase emissions until its
          manager schedules them.
        </p>
        <p>
          Principal, fee rewards and farming rewards are accounted for
          separately, including when you stake LOCKER itself. Claiming rewards
          does not withdraw your stake.
        </p>
      </section>
      <section>
        <h2>3. Share in withdrawal fees</h2>
        <p>
          A withdrawal charges 10% of the withdrawn principal. Normally, 9% goes
          to the other eligible depositors in that same farm, and 1% goes to
          Treasury. The withdrawing wallet is excluded, even if it leaves some
          stake deposited. With no other eligible depositors, all 10% goes to
          Treasury.
        </p>
        <p>
          New deposits become eligible for fee rewards at the second daily
          boundary after deposit, a delay of 1–2 days. They can still earn
          LOCKER and be withdrawn during this delay. The fee is rounded up to
          the smallest token unit; the redistributed share is rounded down.
        </p>
        <p>
          Accrued fee rewards are immediately claimable in the deposited token,
          with no additional protocol fee. They remain claimable after you exit
          the farm.
        </p>
      </section>
      <section>
        <h2>4. Withdraw when you choose</h2>
        <p>
          Review your net payout before confirming. Withdrawals and claims
          cannot be paused. The guardian may pause only new deposits. “Exit &
          claim all” withdraws your entire principal and claims both reward
          balances in one transaction.
        </p>
      </section>
      <section>
        <h2>Read APRs carefully</h2>
        <p>
          Farming APR is an annualized snapshot of current emissions divided by
          current total stake, calculated only when stake and rewards are both
          LOCKER and an epoch is active. It assumes that rate and stake stay
          constant; the epoch is only 30 days and a manager can change future
          emissions.
        </p>
        <p>
          For different-token farms, a reliable exchange rate is required.
          Historical Withdrawal Fee APR needs time-weighted stake and fee
          history. Without reliable data, the interface says “APR unavailable.”
          No USD price feed is configured.
        </p>
      </section>
      <section>
        <h2>Owners, roles and Treasury</h2>
        <p>
          The factory owner may add farms. Each farm has an emissions manager
          and a deposit guardian. These roles and factory ownership can be
          permanently renounced separately. Two-step transfers require the new
          holder to accept. No hidden administrator can restore a renounced
          role.
        </p>
        <p>
          Renouncing emission control returns uncommitted reserve to Treasury
          and disables new reward funding; an existing epoch and accrued rewards
          remain intact. Renouncing the guardian unpauses deposits. Treasury
          ownership cannot be renounced and can never access user deposits or
          accrued farm rewards.
        </p>
      </section>
      <section>
        <h2>Manual buybacks and LP fees</h2>
        <p>
          The owner manually collects project-owned LP trading fees, converts
          them to IMD and allocates 80% to Treasury and 20% to Team. Neither the
          contracts nor this page trade automatically. A manual wallet buyback
          can be followed by a Treasury transfer and an individual farm refill.
        </p>
        <p>
          The handoff’s actual pool is LOCKER/native ETH, with its exact
          initialization hook. The original IMD pairing request is not the
          deployed configuration. The Trade page uses the attested pool.
        </p>
      </section>
      <section>
        <h2>Sepolia only</h2>
        <p>
          This interface uses {runtime.chain.name} testnet. It does not deploy
          contracts or move funds until you confirm a transaction in your
          wallet. Smart contracts and wallets carry risk; simulation is a check,
          not a guarantee.
        </p>
        <div className="link-row">
          {runtime.deployment.network.faucets.map((url, i) => (
            <a key={url} href={url} rel="noreferrer" target="_blank">
              Sepolia faucet {i + 1} ↗
            </a>
          ))}
        </div>
      </section>
    </article>
  );
}
export default function App() {
  const { runtime, data, account, isFetching, isError, error, refetch } =
    useProtocol();
  const { activity } = useActivity();
  const [page, setPage] = useState(location.hash.slice(1) || "farms"),
    [pausedArt, setPausedArt] = useState(false);
  useEffect(() => {
    const update = () => {
      setPage(location.hash.slice(1) || "farms");
      requestAnimationFrame(() => {
        document.getElementById("main")?.focus();
        window.scrollTo({ top: 0 });
      });
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const admin =
    !!data &&
    holdsRole(
      account,
      data.owner,
      data.factoryOwner,
      data.pendingOwner,
      data.pendingFactoryOwner,
      ...data.farms.flatMap((f) => [
        f.emissionsManager,
        f.guardian,
        f.pendingEmissionsManager,
        f.pendingGuardian,
      ]),
    );
  const farms = data?.farms ?? [];
  return (
    <div className={pausedArt ? "app art-paused" : "app"}>
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="header">
        <a className="brand" href="#farms" aria-label="Locker home">
          <svg
            viewBox="0 0 24 24"
            width="32"
            height="32"
            fill="none"
            shapeRendering="crispEdges"
            aria-hidden="true"
          >
            <path
              fill="currentColor"
              d="M6 2h12v3h3v16H3V5h3zm3 3v5H6v8h12v-8h-3V5zm0 8h6v3H9z"
            />
          </svg>
          <span>Locker</span>
        </a>
        <div className="header-utils">
          <span className="network">
            <span /> {runtime.chain.name}
          </span>
          <WalletControl />
        </div>
      </header>
      <nav className="navigation" aria-label="Main navigation">
        <div className="nav-links">
          <a href="#farms" aria-current={page === "farms" ? "page" : undefined}>
            Farms
          </a>
          <a href="#trade" aria-current={page === "trade" ? "page" : undefined}>
            Trade
          </a>
          <a href="#guide" aria-current={page === "guide" ? "page" : undefined}>
            How it works
          </a>
          {admin && (
            <a
              href="#admin"
              aria-current={page === "admin" ? "page" : undefined}
            >
              Admin
            </a>
          )}
        </div>
        <span className="nav-note">A vault worth opening.</span>
      </nav>
      <main id="main" tabIndex={-1}>
        {page === "farms" && (
          <>
            <section className="welcome">
              <div>
                <h1>The farming vault</h1>
                <p>Stake your tokens. Gather LOCKER rewards.</p>
                <div className="welcome-info">
                  <span>0% deposit fee</span>
                  <span>30-day epochs</span>
                  <a href="#guide">Explore the rules ↗</a>
                </div>
              </div>
              <div className="vault-scene" aria-hidden="true">
                <div className="arch">
                  <div className="arch-inner" />
                  <div className="scene-floor" />
                  <Chest />
                </div>
                <span className="torch left" />
                <span className="torch right" />
              </div>
            </section>
            <div className="farm-heading">
              <h2>Your next treasure</h2>
              <div className="read-status">
                <span
                  className={isError ? "error" : data ? "success" : "muted"}
                >
                  {isError
                    ? "Live reads unavailable"
                    : data
                      ? `Block ${data.block.toString()}`
                      : "Reading Sepolia…"}
                </span>
                <button
                  className="text-button"
                  disabled={isFetching}
                  onClick={() => void refetch()}
                  aria-label="Refresh contract state"
                >
                  {isFetching ? "Refreshing…" : "Refresh ↻"}
                </button>
              </div>
            </div>
            <div className="farm-grid">
              {farms.length ? (
                farms.map((f) => (
                  <FarmCard key={f.address} farm={f} symbol={f.token.symbol} />
                ))
              ) : (
                <FarmCard symbol="LOCKER" />
              )}
              {["IMD", "sIMD"]
                .filter(
                  (s) =>
                    !farms.some(
                      (f) => f.token.symbol.toLowerCase() === s.toLowerCase(),
                    ),
                )
                .map((s) => (
                  <FarmCard key={s} symbol={s} unconfigured />
                ))}
            </div>
            {isError && (
              <p className="read-error" role="status">
                {errorText(error)} Wallet reads are also tried when connected to
                Sepolia.
              </p>
            )}
            <section className="vault-ledger">
              <div>
                <h2>Kept in separate vaults</h2>
                <p>
                  Each farm protects its own principal, fees and LOCKER reward
                  reserve.
                </p>
              </div>
              <dl>
                <div>
                  <dt>In your wallet</dt>
                  <dd>
                    {data && account
                      ? `${fmt(data.locker.balance)} LOCKER`
                      : "Connect to view"}
                  </dd>
                </div>
                <div>
                  <dt>Treasury reserve</dt>
                  <dd>
                    {data
                      ? `${fmt(data.treasuryBalance)} LOCKER`
                      : "Read unavailable"}
                  </dd>
                </div>
              </dl>
              <a href="#guide">Understand the mechanics ↗</a>
            </section>
          </>
        )}
        {page === "trade" && <Swap />}
        {page === "guide" && <HowItWorks />}
        {page === "admin" && <Admin />}
        {!["farms", "trade", "guide", "admin"].includes(page) && (
          <section className="empty-page">
            <h1>Return to the vault</h1>
            <a href="#farms">Open farms</a>
          </section>
        )}
        {page !== "farms" && isError && (
          <div className="read-error" role="status">
            {errorText(error)}{" "}
            <button onClick={() => void refetch()} disabled={isFetching}>
              Retry reads
            </button>
          </div>
        )}
        {activity.length > 0 && (
          <section className="activity" aria-live="polite">
            <h2>Recent transactions</h2>
            <p className="small muted">
              This session only. The explorer is the full transaction record.
            </p>
            <ul>
              {activity.map((a) => (
                <li key={a.hash}>
                  <span>{a.title}</span>
                  <span>{a.status}</span>
                  <a
                    href={`${runtime.deployment.network.explorer}/tx/${a.hash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View transaction ↗
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
        <details className="deployment-details">
          <summary>Deployed contracts & verification</summary>
          <p>
            Contract interfaces are hash-checked against the handoff.
            Transactions require the configured chain, deployed code and fresh
            reads. This is deployment binding, not a contract audit.
          </p>
          <div className="contract-directory">
            {runtime.deployment.contracts.map((c) => (
              <div key={c.name}>
                <strong>{c.name}</strong>
                <AddressView address={c.address} />
              </div>
            ))}
          </div>
          <p className="small">
            Deployed source:{" "}
            <a
              href={`https://github.com/identity-md-launches/launch-2152-workflow-contract-stage-context/commit/${runtime.deployment.sourceCommit}`}
              target="_blank"
              rel="noreferrer"
            >
              {runtime.deployment.sourceCommit}
            </a>
          </p>
          <a href="./imd-deployment.json" target="_blank" rel="noreferrer">
            View deployment manifest ↗
          </a>
          {data?.farmErrors.map((e) => (
            <p className="error" key={e}>
              {e}
            </p>
          ))}
        </details>
      </main>
      <footer>
        <a className="brand" href="#farms">
          Locker
        </a>
        <span>Built for the patient adventurer.</span>
        <div>
          <button
            className="text-button"
            onClick={() => setPausedArt((p) => !p)}
          >
            {pausedArt ? "Play chest animation" : "Pause chest animation"}
          </button>
          {runtime.xUrl ? (
            <a href={runtime.xUrl} target="_blank" rel="noreferrer">
              Locker on X ↗
            </a>
          ) : (
            <span className="small muted">X link not configured</span>
          )}
        </div>
        <span className="small muted">
          Sepolia testnet · USD prices unavailable
        </span>
      </footer>
    </div>
  );
}
