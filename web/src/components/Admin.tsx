import { useState } from "react";
import { erc20Abi, zeroAddress } from "viem";
import { useProtocol, holdsRole, tokenInfo } from "../protocol";
import { address, amount, exact, same } from "../format";
import {
  ContractForm,
  recipient,
  tokenAmount,
  type Operation,
} from "./ContractForm";
import { FarmTools } from "./FarmTools";
import { AddressView } from "./AddressView";
import { TxButton } from "../transactions";

export function Admin() {
  const { data, account, runtime, client } = useProtocol();
  const [token, setToken] = useState(""),
    [to, setTo] = useState(""),
    [value, setValue] = useState("");
  if (!data || !account)
    return (
      <section className="empty-page">
        <h1>Admin dashboard</h1>
        <p>
          Connect the owner or a role holder’s wallet and load verified state to
          manage Locker.
        </p>
      </section>
    );
  const treasuryOwner = holdsRole(account, data.owner),
    factoryOwner = holdsRole(account, data.factoryOwner);
  const ownFarm = data.farms.filter((f) =>
    holdsRole(
      account,
      f.emissionsManager,
      f.guardian,
      f.pendingEmissionsManager,
      f.pendingGuardian,
    ),
  );
  if (
    !treasuryOwner &&
    !factoryOwner &&
    !holdsRole(account, data.pendingOwner, data.pendingFactoryOwner) &&
    !ownFarm.length
  )
    return (
      <section className="empty-page">
        <h1>Admin dashboard</h1>
        <p>
          This wallet does not hold an administrative role or a pending role
          offer.
        </p>
      </section>
    );
  const {
    LockerTreasury: treasury,
    LockerFarmFactory: factory,
    LaunchToken: locker,
    LockerFarm: launchFarm,
  } = runtime.contracts;
  function ownership(name: string): Operation[] {
    return [
      {
        name: `Offer ${name} ownership`,
        fn: "transferOwnership",
        description:
          "Offer ownership to a new wallet. The recipient must accept on chain before the current owner loses control.",
        fields: [recipient("owner", "New owner address")],
      },
      {
        name: "Cancel ownership offer",
        fn: "cancelOwnership",
        args: [zeroAddress],
        build: async () => ({ functionName: "transferOwnership" }),
        description:
          "Cancel the pending ownership offer. Current ownership is unchanged.",
      },
    ];
  }
  return (
    <>
      <div className="page-heading">
        <h1>Admin dashboard</h1>
        <p>Fund, schedule and manage each vault independently.</p>
      </div>
      <div className="admin-grid">
        {factoryOwner && (
          <section className="panel">
            <h2>Farm registry</h2>
            <p className="muted">
              Create IMD and sIMD farms once their Sepolia token addresses are
              known. Use plain, non-rebasing ERC-20 tokens.
            </p>
            <AddressView address={factory.address} />
            {!data.registered.some((a) => same(a, launchFarm.address)) && (
              <TxButton
                label="Register LOCKER farm"
                plan={() => ({
                  ...factory,
                  functionName: "registerFarm",
                  args: [launchFarm.address],
                  title: "Register LOCKER farm",
                  description:
                    "Add the attested LOCKER farm to the factory registry. This does not move funds or change its roles.",
                })}
              />
            )}
            <ContractForm
              title="Create or register a farm"
              contract={factory}
              operations={[
                {
                  name: "Create isolated farm",
                  fn: "createFarm",
                  description:
                    "Deploy a separate farm for this staking token. The admin address receives its emissions-manager and guardian roles. No existing farm changes.",
                  fields: [
                    recipient("token", "Staking token address"),
                    recipient("admin", "Initial farm admin address"),
                  ],
                  build: async (values) => {
                    await tokenInfo(client, address(values.token));
                    return {};
                  },
                },
                {
                  name: "Register existing farm",
                  fn: "registerFarm",
                  description:
                    "List an existing Locker farm that uses this Treasury and LOCKER reward token.",
                  fields: [recipient("farm", "Farm address")],
                },
              ]}
            />
            <details>
              <summary>Factory ownership</summary>
              <ContractForm
                title="Farm creation authority"
                contract={factory}
                operations={[
                  ...ownership("factory"),
                  {
                    name: "Renounce farm creation forever",
                    fn: "renounceOwnership",
                    description:
                      "Permanently stop creation and registration of farms through this factory. Existing farms and Treasury control remain unchanged. This authority cannot be restored.",
                    irreversible: true,
                  },
                ]}
              />
            </details>
          </section>
        )}
        {treasuryOwner && (
          <section className="panel">
            <h2>Treasury</h2>
            <AddressView address={treasury.address} />
            <dl>
              <div>
                <dt>LOCKER held</dt>
                <dd>{exact(data.treasuryBalance)} LOCKER</dd>
              </div>
              <div>
                <dt>ETH held</dt>
                <dd>{exact(data.treasuryETH)} ETH</dd>
              </div>
            </dl>
            <p className="muted">
              The planned owner transfer is 500,000,000 LOCKER. Transfers are
              manual; the current balance does not prove that the allocation was
              completed.
            </p>
            <ContractForm
              title="Fund the Treasury"
              contract={locker}
              operations={[
                {
                  name: "Transfer LOCKER to Treasury",
                  fn: "transfer",
                  description:
                    "Transfer LOCKER from your wallet into the Treasury. This does not fund farm emissions automatically.",
                  fields: [tokenAmount()],
                  build: async (values) => ({
                    args: [treasury.address, amount(values.amount, 18)],
                    details: [
                      { label: "Transfer", value: values.amount + " LOCKER" },
                      { label: "Recipient", value: treasury.address },
                    ],
                  }),
                },
              ]}
            />
            <ContractForm
              title="Fund farm reserve"
              contract={treasury}
              operations={[
                {
                  name: "Refill a farm",
                  fn: "fundFarm",
                  description:
                    "Move Treasury LOCKER to the selected farm’s reserve. This does not change its emission rate. Principal and accrued rewards cannot be used.",
                  fields: [recipient("farm", "Farm address"), tokenAmount()],
                },
              ]}
            />
            <details>
              <summary>Manual withdrawals & ownership</summary>
              <p>
                Collect LP fees manually, convert to IMD, and split 80% to
                Treasury / 20% to Team. The contracts do not execute this split.
                Buybacks are manual wallet trades.
              </p>
              <h3>Withdraw Treasury tokens</h3>
              <label>
                Token address
                <input
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <label>
                Recipient address
                <input
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <label>
                Token amount
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  inputMode="decimal"
                />
              </label>
              <TxButton
                label="Withdraw Treasury tokens"
                plan={async () => {
                  const asset = await tokenInfo(
                    client,
                    address(token),
                    treasury.address,
                  );
                  const n = amount(value, asset.decimals);
                  if (n > asset.balance)
                    throw new Error("The Treasury token balance is too low.");
                  return {
                    ...treasury,
                    functionName: "withdrawToken",
                    args: [asset.address, address(to), n],
                    title: "Withdraw Treasury tokens",
                    description:
                      "Send tokens held by the Treasury to the specified recipient. This does not access farm principal or rewards.",
                    details: [
                      { label: "Token", value: asset.address },
                      {
                        label: "Amount",
                        value: exact(n, asset.decimals) + " " + asset.symbol,
                      },
                      { label: "Recipient", value: address(to) },
                    ],
                  };
                }}
              />
              <ContractForm
                title="Treasury ETH & ownership"
                contract={treasury}
                operations={[
                  {
                    name: "Withdraw Treasury ETH",
                    fn: "withdrawETH",
                    description:
                      "Send ETH held by the Treasury to the recipient.",
                    fields: [
                      recipient(),
                      {
                        name: "amount",
                        label: "Amount",
                        kind: "amount",
                        decimals: 18,
                        unit: "ETH",
                      },
                    ],
                  },
                  ...ownership("Treasury"),
                ]}
              />
              <p className="small muted">
                Treasury ownership cannot be renounced.
              </p>
            </details>
          </section>
        )}
        {holdsRole(account, data.pendingOwner) && (
          <TxButton
            label="Accept Treasury ownership"
            plan={() => ({
              ...treasury,
              functionName: "acceptOwnership",
              title: "Accept Treasury ownership",
              description:
                "Accept the pending Treasury ownership transfer. The previous owner loses access.",
            })}
          />
        )}
        {holdsRole(account, data.pendingFactoryOwner) && (
          <TxButton
            label="Accept factory ownership"
            plan={() => ({
              ...factory,
              functionName: "acceptOwnership",
              title: "Accept factory ownership",
              description: "Accept the pending factory ownership transfer.",
            })}
          />
        )}
        {ownFarm.map((f) => (
          <section className="panel" key={f.address}>
            <FarmTools farm={f} />
          </section>
        ))}
      </div>
    </>
  );
}
