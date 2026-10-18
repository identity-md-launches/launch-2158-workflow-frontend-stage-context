import { useState, useEffect } from "react";
import {
  useConnection,
  useConnect,
  useDisconnect,
  type Connector,
} from "wagmi";
import { toHex } from "viem";
import { useRuntime } from "./protocol";
import { short, errorText, full } from "./format";
import { Modal } from "./components/Modal";
import { AddressView } from "./components/AddressView";

export const OPEN_IN = [
  {
    id: "metamask",
    name: "MetaMask",
    href: (url: string) =>
      `https://link.metamask.io/dapp/${url.replace(/^https?:\/\//, "")}`,
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    href: (url: string) =>
      `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`,
  },
  {
    id: "rabby",
    name: "Rabby",
    href: (url: string) =>
      `https://go.rabby.io/mobile/?_cmd=open-dapp&dapp=${encodeURIComponent(url)}`,
  },
  {
    id: "phantom",
    name: "Phantom",
    href: (url: string) =>
      `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(new URL(url).origin)}`,
  },
];
type Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};
export async function switchNetwork(
  provider: Provider,
  chainId: number,
  addChain?: unknown,
) {
  const params = [{ chainId: toHex(chainId) }];
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params });
  } catch (err) {
    const e = err as {
      code?: number;
      message?: string;
      data?: { originalError?: { code?: number } };
    };
    if (
      e.code === 4902 ||
      e.data?.originalError?.code === 4902 ||
      /unknown chain|unrecognized chain|not added/i.test(e.message ?? "")
    ) {
      if (!addChain)
        throw new Error(
          "This network has no wallet setup parameters. Add the network in your wallet first.",
        );
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [addChain],
      });
      await provider.request({ method: "wallet_switchEthereumChain", params });
    } else throw err;
  }
}
export function WalletControl() {
  const runtime = useRuntime();
  const { address, chainId, connector, isConnected } = useConnection();
  const {
    connectors,
    mutateAsync: connect,
    isPending,
    variables,
  } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [switching, setSwitching] = useState(false);
  const mobile =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !(window as unknown as { ethereum?: unknown }).ethereum;
  const named = connectors.some(
    (c) => c.type === "injected" && c.id !== "injected",
  );
  const listed = [
    ...connectors.filter((c) => c.type === "injected"),
    ...connectors.filter((c) => c.type !== "injected"),
  ].filter(
    (c) =>
      !(c.id === "injected" && named) && (!mobile || c.type !== "injected"),
  );
  const label = (c: Connector) =>
    c.id === "injected"
      ? "Browser wallet"
      : c.id === "coinbaseWalletSDK"
        ? mobile
          ? "Coinbase Smart Wallet"
          : "Coinbase Wallet"
        : c.name;
  const wrong = isConnected && chainId !== runtime.chain.id;
  async function changeNetwork(c = connector) {
    if (!c) return;
    setError("");
    setSwitching(true);
    try {
      await switchNetwork(
        (await c.getProvider()) as Provider,
        runtime.chain.id,
        runtime.deployment.walletAddChain,
      );
      setOpen(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSwitching(false);
    }
  }
  async function choose(c: Connector) {
    setError("");
    try {
      const result = await connect({ connector: c });
      if (result.chainId !== runtime.chain.id) await changeNetwork(c);
      else setOpen(false);
    } catch (e) {
      setError(errorText(e));
    }
  }
  useEffect(() => {
    const open = () => setOpen(true);
    window.addEventListener("locker:connect", open);
    return () => window.removeEventListener("locker:connect", open);
  }, []);
  return (
    <>
      <button
        className={isConnected ? "wallet-button" : "primary wallet-button"}
        disabled={switching}
        onClick={() => (wrong ? void changeNetwork() : setOpen(true))}
      >
        {switching
          ? "Switching…"
          : wrong
            ? `Switch to ${runtime.chain.name}`
            : address
              ? short(full(address))
              : "Connect wallet"}
      </button>
      {error && !open && (
        <span className="wallet-error" role="alert">
          {error}
        </span>
      )}
      {open && (
        <Modal
          title={isConnected ? "Your wallet" : "Connect a wallet"}
          onClose={() => setOpen(false)}
        >
          {isConnected && address ? (
            <>
              <AddressView address={address} />
              <p>
                {wrong
                  ? "Switch networks to use Locker."
                  : `${runtime.chain.name} · Connected`}
              </p>
              {wrong && (
                <button
                  onClick={() => void changeNetwork()}
                  disabled={switching}
                >
                  Switch to {runtime.chain.name}
                </button>
              )}
              <button
                className="wide"
                onClick={() => {
                  disconnect();
                  setOpen(false);
                }}
              >
                Disconnect
              </button>
            </>
          ) : (
            <>
              <p className="muted">Choose a wallet to enter the vault.</p>
              {mobile &&
                OPEN_IN.map((w) => (
                  <a
                    className="wallet-row"
                    key={w.id}
                    href={w.href(location.href)}
                  >
                    <img
                      src={`./wallets/${w.id}.svg`}
                      width="28"
                      height="28"
                      alt=""
                    />
                    Open in {w.name}
                    <span aria-hidden="true">↗</span>
                  </a>
                ))}
              {listed.map((c) => (
                <button
                  className="wallet-row"
                  key={c.uid}
                  disabled={isPending || switching}
                  onClick={() => void choose(c)}
                >
                  <img
                    width="28"
                    height="28"
                    alt=""
                    src={
                      c.icon ??
                      `./wallets/${c.id === "coinbaseWalletSDK" ? "coinbase" : "browser"}.svg`
                    }
                  />
                  <span>
                    {label(c)}
                    {isPending && variables?.connector === c
                      ? " · opening…"
                      : ""}
                  </span>
                </button>
              ))}
              {!named && !mobile && (
                <p className="small muted">
                  No named browser wallet found. Unlock an extension, or use
                  Coinbase to create a passkey wallet.
                </p>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
