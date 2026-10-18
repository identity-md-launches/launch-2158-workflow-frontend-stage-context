# Contract action coverage

The app loads the implementation-derived ABI JSON declared by the runtime manifest. The following are the exposed application actions. All writes require the correct wallet chain, verified code, fresh state, a review, successful simulation and wallet confirmation. Solidity authorization remains authoritative even when the UI hides an operation.

| Contract / authority | Functions | UI location |
| --- | --- | --- |
| Farm / depositor | `deposit`, `withdraw`, `claimFees`, `claimRewards` | Farm amount control and separate claim buttons |
| Farm / depositor | `exit` | Position & farm details → Exit & claim all |
| Farm / anyone | `fundRewards` | Position details → Reward funding, explicit LOCKER approval then funding |
| Farm / anyone | `syncRewardReserve`, `recoverExcessStakingToken`, `recoverERC20` | Position details → Maintenance; excess staking recovery appears only for different-token farms |
| Farm / emissions manager, or anyone after renouncement | `returnUncommittedRewards` | Admin emissions, or Maintenance after the role is renounced; destination is always Treasury |
| Farm / emissions manager | `startEpoch`, `boostEmissions`, `setRewardRate` | Admin → Emissions; amounts are LOCKER, rate is LOCKER/second |
| Farm / emissions manager | `setEmissionsManager`, `renounceEmissionsManager` | Admin → Emissions; explicit offer/cancel variants and irreversible confirmation |
| Farm / pending manager | `acceptEmissionsManager` | Admin → Accept emissions role |
| Farm / guardian | `pauseDeposits`, `unpauseDeposits`, `setGuardian`, `renounceGuardian` | Admin → Emergency controls; no pause of claims or withdrawals |
| Farm / pending guardian | `acceptGuardian` | Admin → Accept guardian role |
| Factory / owner | `createFarm`, `registerFarm` | Admin → Farm registry; shortcut registers the directly deployed LOCKER farm |
| Factory / owner | `transferOwnership`, `renounceOwnership` | Admin → Factory ownership; offer/cancel and permanent renouncement |
| Factory / pending owner | `acceptOwnership` | Admin → Accept factory ownership |
| Treasury / owner | `fundFarm` | Admin → Fund farm reserve |
| Treasury / owner | `withdrawToken`, `withdrawETH` | Admin → Manual withdrawals & ownership; ERC-20 symbol, decimals and Treasury balance read before review |
| Treasury / owner and pending owner | `transferOwnership`, `acceptOwnership` | Admin → Treasury ETH & ownership, or Accept Treasury ownership |
| LOCKER / holder | `transfer` | Admin → Transfer LOCKER to Treasury, with exact amount and recipient review |
| ERC-20 / holder | `approve` | Explicit farm deposit/funding and Permit2 approval steps |
| Uniswap quoter / simulated only | `quoteExactInputSingle` | Trade → Get quote; an `eth_call`, never a transaction |
| Permit2 / holder | `approve` | Trade → Authorize router; amount-limited, 30-minute expiry |
| Universal Router / holder | `execute` | Trade → Swap tokens, following the exact attested pool key |

Treasury `renounceOwnership` always reverts in the implementation, so the dashboard explains that ownership is not renounceable instead of offering a failing transaction. The ERC-20 `transferFrom` method is exercised by contracts after approvals, not exposed as an arbitrary allowance-spending console. Generic peer-to-peer token transfers are a wallet function; they are not the platform's primary farming action.

Factory and farm authorities are independent of Treasury ownership. An emissions manager or guardian can see only the controls for roles it holds. Pending recipients can accept their own roles. No address supplied by a visitor is saved as a global website setting: only confirmed factory transactions change the shared farm registry.

## Read coverage

The initial snapshot reads chain ID, application code, current block/timestamp, owner and pending-owner addresses, the farm registry, token symbol/decimals, Treasury LOCKER/ETH balances, farm immutables, total principal, fee-eligible total, reward reserve/rate/finish, remaining committed rewards, pause state, roles and lifetime redistributed fees. A connected wallet additionally gets token and ETH balances, principal, claimable fee/LOCKER rewards, pending/eligible stake and deposit allowance. Withdrawal previews and all writes use fresh contract calls.

Count and amounts are never seeded from browser storage. Mock values appear only in the test harness and explicitly named mock screenshots.
