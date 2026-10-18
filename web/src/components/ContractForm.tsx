import { useState, useId } from "react";
import { type Abi, type Address } from "viem";
import { amount, address as parseAddress, exact } from "../format";
import { TxButton, type TxPlan } from "../transactions";

export type Field = {
  name: string;
  label: string;
  kind: "address" | "amount";
  decimals?: number;
  zero?: boolean;
  unit?: string;
};
export type Operation = {
  name: string;
  fn: string;
  description: string;
  fields?: Field[];
  args?: readonly unknown[];
  irreversible?: boolean;
  build?: (values: Record<string, string>) => Promise<Partial<TxPlan>>;
};
export const tokenAmount = (label = "Amount", zero = false): Field => ({
  name: "amount",
  label,
  kind: "amount",
  decimals: 18,
  unit: "LOCKER",
  zero,
});
export const recipient = (
  name = "recipient",
  label = "Recipient address",
): Field => ({ name, label, kind: "address" });
export function ContractForm({
  title,
  contract,
  operations,
}: {
  title: string;
  contract: { address: Address; abi: Abi };
  operations: Operation[];
}) {
  const selectId = useId();
  const [selected, setSelected] = useState(operations[0]?.fn ?? ""),
    [values, setValues] = useState<Record<string, string>>({});
  const op = operations.find((o) => o.fn === selected) ?? operations[0];
  if (!op) return null;
  return (
    <section className="contract-form">
      <h3>{title}</h3>
      <label htmlFor={selectId}>Action</label>
      <select
        id={selectId}
        value={op.fn}
        onChange={(e) => {
          setSelected(e.target.value);
          setValues({});
        }}
      >
        {operations.map((o) => (
          <option key={o.fn} value={o.fn}>
            {o.name}
          </option>
        ))}
      </select>
      <p className="small muted">{op.description}</p>
      {op.fields?.map((f) => (
        <label key={f.name}>
          {f.label}
          {f.unit ? ` (${f.unit})` : ""}
          <input
            value={values[f.name] ?? ""}
            onChange={(e) =>
              setValues((v) => ({ ...v, [f.name]: e.target.value }))
            }
            inputMode={f.kind === "amount" ? "decimal" : "text"}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      ))}
      <TxButton
        key={op.fn}
        label={op.name}
        plan={async () => {
          const args =
            op.args ??
            op.fields?.map((f) =>
              f.kind === "address"
                ? parseAddress(values[f.name] ?? "", f.zero)
                : amount(values[f.name] ?? "", f.decimals ?? 18, f.zero),
            ) ??
            [];
          const details = op.fields?.map((f, i) => ({
            label: f.label,
            value:
              f.kind === "amount"
                ? `${exact(args[i] as bigint, f.decimals ?? 18)} ${f.unit ?? ""}`
                : String(args[i]),
          }));
          return {
            ...contract,
            functionName: op.fn,
            args,
            title: op.name,
            description: op.description,
            details,
            irreversible: op.irreversible,
            ...(await op.build?.(values)),
          };
        }}
      />
    </section>
  );
}
