import { useState } from "react";
import type { Address } from "viem";
import { useRuntime } from "../protocol";
import { full, short } from "../format";
export function AddressView({
  address,
  compact = false,
}: {
  address: Address;
  compact?: boolean;
}) {
  const { deployment } = useRuntime();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  return (
    <span className="address">
      <a
        href={`${deployment.network.explorer}/address/${address}`}
        target="_blank"
        rel="noreferrer"
        title={full(address)}
      >
        {compact ? short(full(address)) : full(address)}
      </a>
      <button
        className="copy-button"
        aria-label={`Copy ${full(address)}`}
        onClick={() =>
          navigator.clipboard
            .writeText(full(address))
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            })
            .catch(() => setError(true))
        }
      >
        {copied ? "Copied" : "Copy"}
      </button>
      {error && <span>Select the address to copy it.</span>}
    </span>
  );
}
