import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useWalletClient } from "wagmi";
import { getConnection } from "wagmi/actions";
import type { Address, Abi, Hash } from "viem";
import { useProtocol } from "./protocol";
import { errorText, same } from "./format";
import { Modal } from "./components/Modal";
import { AddressView } from "./components/AddressView";

export type TxPlan = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
  title: string;
  description: string;
  details?: { label: string; value: string }[];
  irreversible?: boolean;
  validate?: () => Promise<void>;
};
type Activity = {
  title: string;
  hash: Hash;
  status: "pending" | "confirmed" | "reverted";
};
const ActivityContext = createContext<{
  activity: Activity[];
  update: (entry: Activity) => void;
}>(null!);
export function ActivityProvider({ children }: { children: ReactNode }) {
  const [activity, setActivity] = useState<Activity[]>([]);
  return (
    <ActivityContext.Provider
      value={{
        activity,
        update: (entry) =>
          setActivity((a) =>
            [entry, ...a.filter((x) => x.hash !== entry.hash)].slice(0, 12),
          ),
      }}
    >
      {children}
    </ActivityContext.Provider>
  );
}
export const useActivity = () => useContext(ActivityContext);
export function TxButton({
  label,
  plan,
  disabled = false,
  primary = false,
  onDone,
}: {
  label: string;
  plan: () => TxPlan | Promise<TxPlan>;
  disabled?: boolean;
  primary?: boolean;
  onDone?: () => void;
}) {
  const { client, account, ready, runtime, refetch } = useProtocol();
  const { data: wallet } = useWalletClient();
  const { update } = useActivity();
  const [review, setReview] = useState<TxPlan | null>(null),
    [phase, setPhase] = useState(""),
    [error, setError] = useState(""),
    [hash, setHash] = useState<Hash>(),
    [confirmed, setConfirmed] = useState(false),
    [typed, setTyped] = useState("");
  const busy = !!phase;
  const guard = useRef(false);
  const reviewAccount = useRef<Address | undefined>(undefined);
  async function prepare() {
    if (guard.current) return;
    guard.current = true;
    setError("");
    setPhase("Preparing");
    setConfirmed(false);
    setHash(undefined);
    const preparingAccount = account;
    try {
      const p = await plan();
      if (!same(getConnection(runtime.config).address, preparingAccount))
        throw new Error("Wallet changed. Review this action again.");
      reviewAccount.current = preparingAccount;
      setReview(p);
      setTyped("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      guard.current = false;
      setPhase("");
    }
  }
  async function receipt(h: Hash, title: string) {
    setPhase("Confirming");
    try {
      const r = await client.waitForTransactionReceipt({
        hash: h,
        timeout: 120000,
      });
      if (r.status === "reverted") {
        update({ title, hash: h, status: "reverted" });
        setHash(undefined);
        await refetch();
        throw new Error(
          "The transaction reverted. Check the explorer, refresh, and retry.",
        );
      }
      const refreshed = await refetch();
      setConfirmed(true);
      setHash(undefined);
      onDone?.();
      update({ title, hash: r.transactionHash, status: "confirmed" });
      if (refreshed.isError)
        setError(
          "Transaction confirmed, but balances could not refresh. Refresh the network state before your next action.",
        );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPhase("");
      guard.current = false;
    }
  }
  async function execute() {
    if (!review || !wallet || !account || !ready || guard.current) return;
    if (!same(reviewAccount.current, account)) {
      setError(
        "Wallet changed since this review. Close it and review the action again.",
      );
      return;
    }
    guard.current = true;
    setError("");
    setPhase("Simulating");
    const p = review;
    const signer = account;
    try {
      const check = () => {
        const current = getConnection(runtime.config);
        if (
          !same(current.address, signer) ||
          current.chainId !== runtime.chain.id
        )
          throw new Error(
            "Wallet or network changed. Reconnect and review the action again.",
          );
      };
      check();
      if ((await wallet.getChainId()) !== runtime.chain.id)
        throw new Error("Switch your wallet to the deployment network.");
      const code = await client.getCode({ address: p.address });
      if (!code || code === "0x")
        throw new Error("No contract code at the transaction target.");
      await p.validate?.();
      const { request } = await client.simulateContract({
        address: p.address,
        abi: p.abi,
        functionName: p.functionName,
        args: p.args ?? [],
        value: p.value,
        account: signer,
      });
      check();
      setPhase("Confirm in wallet");
      const h = await wallet.writeContract({
        ...request,
        chain: runtime.chain,
        account: signer,
      });
      setHash(h);
      update({ title: p.title, hash: h, status: "pending" });
      setReview(null);
      await receipt(h, p.title);
    } catch (e) {
      setError(errorText(e));
      setPhase("");
      guard.current = false;
    }
  }
  return (
    <div className="tx-control">
      <button
        className={primary ? "primary" : ""}
        disabled={disabled || !ready || busy || !!hash}
        onClick={() => void prepare()}
      >
        {busy ? `${label} · ${phase.toLowerCase()}…` : label}
      </button>
      <div className="tx-feedback" role="status">
        {confirmed && <span className="success">Confirmed on chain.</span>}
        {hash && (
          <>
            <a
              href={`${runtime.deployment.network.explorer}/tx/${hash}`}
              target="_blank"
              rel="noreferrer"
            >
              View transaction ↗
            </a>
            {!busy && (
              <button onClick={() => void receipt(hash, label)}>
                Check confirmation
              </button>
            )}
          </>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {review && (
        <Modal
          title={review.title}
          onClose={() => {
            if (!busy) setReview(null);
          }}
        >
          <p>{review.description}</p>
          <dl className="review-list">
            <div>
              <dt>Network</dt>
              <dd>{runtime.chain.name}</dd>
            </div>
            {review.details?.map((d, i) => (
              <div key={i}>
                <dt>{d.label}</dt>
                <dd>{d.value}</dd>
              </div>
            ))}
            <div>
              <dt>Contract</dt>
              <dd>
                <AddressView address={review.address} />
              </dd>
            </div>
          </dl>
          <p className="small muted">
            Your wallet will show the network gas fee. The call is simulated
            before signing.
          </p>
          {review.irreversible && (
            <label>
              Type RENOUNCE to confirm permanent loss of this role
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
              />
            </label>
          )}
          <button
            className="primary wide"
            disabled={
              busy || !ready || (review.irreversible && typed !== "RENOUNCE")
            }
            onClick={() => void execute()}
          >
            {busy ? phase + "…" : `Confirm ${review.title.toLowerCase()}`}
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
