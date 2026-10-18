import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { erc20Abi, zeroAddress } from "viem";
import { useProtocol, holdsRole, type Farm } from "../protocol";
import { amount, same, exact } from "../format";
import { TxButton } from "../transactions";
import {
  ContractForm,
  tokenAmount,
  recipient,
  type Operation,
} from "./ContractForm";
import { AddressView } from "./AddressView";

export function FarmTools({
  farm,
  maintenance = false,
}: {
  farm: Farm;
  maintenance?: boolean;
}) {
  const { runtime, account, client, ready } = useProtocol();
  const [fund, setFund] = useState("");
  const fundingAllowance = useQuery({
    queryKey: ["fundingAllowance", account, farm.address],
    enabled: maintenance && ready && !!account,
    queryFn: () =>
      client.readContract({
        address: runtime.contracts.LaunchToken.address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account!, farm.address],
      }),
    refetchInterval: 15000,
    retry: false,
  });
  let fundingAmount = 0n;
  try {
    fundingAmount = amount(fund, 18);
  } catch {
    /* validated on review */
  }
  const needsFundingApproval = fundingAmount > (fundingAllowance.data ?? 0n);
  const contract = { address: farm.address, abi: runtime.abis.LockerFarm };
  const manager = holdsRole(account, farm.emissionsManager),
    guardian = holdsRole(account, farm.guardian);
  const publicOps: Operation[] = [
    {
      name: "Sync donated LOCKER",
      fn: "syncRewardReserve",
      description:
        "Credit untracked LOCKER to the reward reserve. All principal and accrued rewards remain protected.",
    },
    ...(!same(farm.token.address, runtime.contracts.LaunchToken.address)
      ? [
          {
            name: "Recover excess staking tokens",
            fn: "recoverExcessStakingToken",
            description:
              "Send only untracked staking tokens to the immutable Treasury. User principal and rewards stay in the farm.",
          },
        ]
      : []),
    {
      name: "Recover unrelated tokens",
      fn: "recoverERC20",
      description:
        "Send unrelated ERC-20 tokens held by the farm to the Treasury. Staking and reward tokens are protected.",
      fields: [recipient("token", "Token address")],
    },
    ...(same(farm.emissionsManager, zeroAddress)
      ? [
          {
            name: "Return uncommitted rewards",
            fn: "returnUncommittedRewards",
            description:
              "Return uncommitted LOCKER to the Treasury after permanent emissions renouncement.",
            fields: [tokenAmount()],
          },
        ]
      : []),
  ];
  const managerOps: Operation[] = [
    {
      name: "Start 30-day epoch",
      fn: "startEpoch",
      description:
        "Commit reserve to a new 30-day epoch. Remaining rewards from the running epoch roll into this new schedule.",
      fields: [tokenAmount("Reserve to commit", true)],
    },
    {
      name: "Boost current emissions",
      fn: "boostEmissions",
      description:
        "Commit more reserve to the running epoch without changing its end time.",
      fields: [tokenAmount("Additional reserve")],
    },
    {
      name: "Set emission rate",
      fn: "setRewardRate",
      description:
        "Change LOCKER emitted per second for the remainder of this epoch. Zero pauses emissions. Higher rates require available reserve.",
      fields: [tokenAmount("LOCKER per second", true)],
    },
    {
      name: "Return uncommitted rewards",
      fn: "returnUncommittedRewards",
      description:
        "Send uncommitted LOCKER reserve back to the immutable Treasury. Committed emissions, principal and accrued rewards remain protected.",
      fields: [tokenAmount()],
    },
    {
      name: "Offer emissions role",
      fn: "setEmissionsManager",
      description:
        "Offer emission control to a new address. It must accept before your authority changes.",
      fields: [recipient("newManager", "New manager address")],
    },
    {
      name: "Cancel emissions offer",
      fn: "setEmissionsManager",
      description:
        "Clear the pending emissions-manager offer. You keep the role.",
      args: [zeroAddress],
    },
    {
      name: "Renounce emissions forever",
      fn: "renounceEmissionsManager",
      description:
        "Permanently give up emission control and disable future funding. Uncommitted reserve is returned to the Treasury. The running epoch and accrued rewards remain intact. No administrator can restore this role.",
      irreversible: true,
    },
  ];
  // Select values include an explicit variant for cancellation despite the shared contract method.
  managerOps[5] = {
    ...managerOps[5],
    fn: "cancelEmissionsOffer",
    build: async () => ({ functionName: "setEmissionsManager" }),
  };
  const guardianOps: Operation[] = [
    {
      name: farm.depositsPaused ? "Resume deposits" : "Pause deposits",
      fn: farm.depositsPaused ? "unpauseDeposits" : "pauseDeposits",
      description:
        "Only deposits are affected. Withdrawals and claims always remain available.",
    },
    {
      name: "Offer guardian role",
      fn: "setGuardian",
      description:
        "Offer emergency deposit control to a new address. It must accept the role.",
      fields: [recipient("newGuardian", "New guardian address")],
    },
    {
      name: "Cancel guardian offer",
      fn: "cancelGuardianOffer",
      args: [zeroAddress],
      build: async () => ({ functionName: "setGuardian" }),
      description: "Clear the pending guardian offer. You keep the role.",
    },
    {
      name: "Renounce guardian forever",
      fn: "renounceGuardian",
      description:
        "Permanently remove emergency control and unpause deposits. This role cannot be restored.",
      irreversible: true,
    },
  ];
  if (maintenance)
    return (
      <div className="maintenance">
        <h3>Reward funding & maintenance</h3>
        {same(farm.emissionsManager, zeroAddress) ? (
          <p>
            Emission control is permanently renounced. New funding is disabled.
          </p>
        ) : (
          <>
            <label>
              Fund rewards (LOCKER)
              <input
                value={fund}
                onChange={(e) => setFund(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
              />
            </label>
            <TxButton
              label={
                needsFundingApproval ? "Approve reward funding" : "Fund rewards"
              }
              disabled={fundingAllowance.isError || fundingAllowance.isPending}
              plan={async () => {
                if (!account) throw new Error("Connect a wallet first.");
                const n = amount(fund, 18);
                const token = runtime.contracts.LaunchToken.address;
                const allowance = await client.readContract({
                  address: token,
                  abi: erc20Abi,
                  functionName: "allowance",
                  args: [account, farm.address],
                });
                if (allowance < n)
                  return {
                    address: token,
                    abi: erc20Abi,
                    functionName: "approve",
                    args: [farm.address, n],
                    title: "Approve reward funding",
                    description:
                      "Allow this farm to spend the entered LOCKER amount. Funding is a separate step.",
                    details: [
                      { label: "Allowance", value: exact(n) + " LOCKER" },
                    ],
                  };
                return {
                  ...contract,
                  functionName: "fundRewards",
                  args: [n],
                  title: "Fund rewards",
                  description:
                    "Add LOCKER to this farm’s uncommitted reserve. Funding does not change emissions.",
                  details: [{ label: "Fund", value: exact(n) + " LOCKER" }],
                };
              }}
              onDone={() => {
                void fundingAllowance.refetch();
              }}
            />
            <p className="small muted">
              Funding is permissionless. The manager schedules emissions
              separately.
            </p>
            {fundingAllowance.isError && (
              <p className="error">
                Allowance could not be read.{" "}
                <button onClick={() => void fundingAllowance.refetch()}>
                  Retry allowance
                </button>
              </p>
            )}
          </>
        )}
        <ContractForm
          title="Maintenance"
          contract={contract}
          operations={publicOps}
        />
      </div>
    );
  return (
    <div className="admin-farm">
      <h2>{farm.token.symbol} farm controls</h2>
      <AddressView address={farm.address} />
      <dl className="role-list">
        <div>
          <dt>Emission manager</dt>
          <dd>
            {same(farm.emissionsManager, zeroAddress) ? (
              "Permanently renounced"
            ) : (
              <AddressView address={farm.emissionsManager} />
            )}
          </dd>
        </div>
        <div>
          <dt>Guardian</dt>
          <dd>
            {same(farm.guardian, zeroAddress) ? (
              "Permanently renounced"
            ) : (
              <AddressView address={farm.guardian} />
            )}
          </dd>
        </div>
        <div>
          <dt>Uncommitted reserve</dt>
          <dd>{exact(farm.rewardReserve)} LOCKER</dd>
        </div>
        <div>
          <dt>Committed, not yet emitted</dt>
          <dd>{exact(farm.remainingEpochRewards)} LOCKER</dd>
        </div>
      </dl>
      {manager && (
        <ContractForm
          title="Emissions"
          contract={contract}
          operations={managerOps}
        />
      )}
      {guardian && (
        <ContractForm
          title="Emergency controls"
          contract={contract}
          operations={guardianOps}
        />
      )}
      {holdsRole(account, farm.pendingEmissionsManager) && (
        <TxButton
          label="Accept emissions role"
          plan={() => ({
            ...contract,
            functionName: "acceptEmissionsManager",
            title: "Accept emissions role",
            description:
              "Accept the pending emissions-manager offer. The previous manager loses authority.",
          })}
        />
      )}
      {holdsRole(account, farm.pendingGuardian) && (
        <TxButton
          label="Accept guardian role"
          plan={() => ({
            ...contract,
            functionName: "acceptGuardian",
            title: "Accept guardian role",
            description:
              "Accept emergency deposit control. The previous guardian loses authority.",
          })}
        />
      )}
    </div>
  );
}
