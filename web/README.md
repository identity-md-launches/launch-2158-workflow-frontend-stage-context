# Locker frontend

Editable React / TypeScript frontend for the existing Locker deployment on Ethereum Sepolia. The production site is the repository-root `dist/` directory. It works as plain files, including under an IPFS gateway subpath, without server routing or a backend.

This frontend does not deploy contracts, change ownership, fund the Treasury or create farms on its own. Those actions require the appropriate connected wallet and an explicit transaction review.

## Install, develop and export

Use Node 22.12+ (validated with Node 24.21.0 and npm 11.19.0).

```sh
cd web
npm ci
npm run dev
```

`predev` builds the export first. The development server serves the **same generated deployment manifest and ABI files** from `../dist/`, while Vite handles editable source. After changing deployment inputs or ABI files, rebuild.

```sh
cd web
npm run typecheck
npm run build
npm run verify
npm run preview
```

The build runs TypeScript, Vite, then the manifest generator. It replaces `dist/`; never hand-edit exported assets. Vite uses `base: './'` and navigation uses hash routes: `#farms`, `#trade`, `#guide`, `#admin`. The Admin navigation item appears only for a connected owner, farm role holder or pending role recipient.

For an explicit gateway-style preview, run `node web/scripts/serve.mjs 4173` from the repository root and open `http://127.0.0.1:4173/preview/`. Stop it with Ctrl+C. This preview is local, not a published site.

## Deployment binding and configuration

The authoritative runtime configuration is `dist/imd-deployment.json`. `src/config.ts` fetches it and the ABI JSON paths it declares before creating the chain, wallets, public client and contract objects. It rejects ABI hash mismatches. There is no second deployment address or chain map in application source.

- `web/deployment/handoff.json` and `web/deployment/network.json` are preserved build inputs from the supplied handoff. They are not separately bundled runtime configurations.
- `docs/abi/*.json` are the implementation-derived raw ABI arrays from deployed source commit `f27a482805c941e6e086a94ec46e1121ba896984`. They were checked byte-for-byte against that commit and by canonical Keccak against all four attested hashes. Contract source and these existing ABI files were not changed.
- `scripts/manifest.mjs` validates the ABI hashes, copies the ABI bytes, copies the exact identities, contract set, `poolKey`, `network` and `walletAddChain`, then inventories every other exported file using SHA-256. The manifest excludes itself. `scripts/verify.mjs` independently checks the generated manifest, paths, asset inventory, hashes and size limits against the preserved handoff.
- Canonical ABI hashing recursively sorts object keys lexicographically, preserves array order, uses compact JSON and Keccak-256 of UTF-8 bytes. ABI hash fields omit `0x`.
- Runtime verification requires the configured RPC chain ID and nonempty code at all four deployed application addresses. Farm reads also require matching reward-token and Treasury immutables. Every write target is checked again before simulation.
- Token metadata and balances come from the contracts. Registry farms come from `allFarms()` and are deduplicated with the directly deployed LOCKER farm. Standard ERC-20 and minimal public Uniswap interfaces live in source; **all their addresses** come from runtime configuration or discovered on-chain state.

For future releases of this same deployment, edit source and rebuild. No contract redeployment or token relaunch is needed. Changing the attested deployment requires a new validated handoff, not a hand-edited address in the bundle. The generator intentionally refuses an ABI that no longer matches its attested hash.

### Social link and artwork

Set `xUrl` in `web/public/site-settings.json` to the project's HTTPS X/Twitter profile, then rebuild. An empty string means no profile is configured and no fake link is shown. This is a publisher-editable static setting, not a per-browser owner preference. It cannot change protocol configuration.

Original chest art is editable in `src/components/Chest.tsx`; the arch scene and animation are CSS. `src/assets/share.svg` is the editable source of `public/share.png` (1200 × 630). The favicon, wallet marks and share image are bundled locally. Open Graph paths remain relative because no published domain was supplied. A publisher with a fixed domain can set absolute metadata URLs and rebuild the manifest.

## Current deployment and owner setup

The handoff deploys one LOCKER farm, a farm factory and Treasury. It does **not** supply IMD/sIMD token addresses or pre-created IMD/sIMD farms. No stand-in addresses are used. Their cards show “Awaiting setup” until discovered in the registry. The owner can supply the token and admin addresses in the Admin dashboard's “Create isolated farm” control. Non-rebasing ERC-20 tokens are required by the deployed farming design; the frontend cannot establish that property from `symbol()` and `decimals()` alone.

At the recorded live validation block, the LOCKER farm was unregistered, unfunded and had no active epoch; Treasury held no LOCKER. These are observed initial states, not permanent assumptions. The frontend continues to read them live. An inactive-emission warning appears beside the deposit control and in its transaction review.

The owner workflow is:

1. Register the already deployed LOCKER farm.
2. Create the IMD and sIMD farms with the correct Sepolia token addresses and intended admin. Other token farms can be added later.
3. Transfer the intended LOCKER allocation to Treasury. The brief's planned transfer is 500,000,000 LOCKER; the interface never sends this automatically or infers completion from the current balance.
4. Refill each farm independently, from Treasury or through permissionless reward funding.
5. Start a separate 30-day epoch for each funded farm. Funding alone does not increase emissions.

Treasury ownership, factory ownership and farm roles are read on chain. Two-step transfer recipients can accept their offers. Renouncement requires typing `RENOUNCE` in the review. Factory and farm roles cannot be restored after renouncement; Treasury ownership cannot be renounced and no such transaction is offered.

## Farming and trading behavior

Deposit requires an exact token allowance, then a separate deposit. The current allowance is read again before preparing the action. Withdrawals display the contract's `previewWithdraw` result: net payout, other eligible depositors' share and Treasury share. The 10% fee rounds up, the 9% redistributed share rounds down, and a lone eligible depositor's withdrawal sends the entire fee to Treasury. The withdrawing address never shares its own fee.

The deployed contract delays fee eligibility until the second daily bucket boundary after deposit (1–2 days). LOCKER emissions still accrue during that period if an epoch is active. Claims have no additional protocol fee and remain available after full withdrawal. `Exit & claim all` exposes the combined exit action. Principal, fee rewards and LOCKER reserves are displayed separately.

Farming APR is calculated only for a running same-token LOCKER farm with nonzero total stake: `rewardRate × 31,536,000 / totalStaked × 100`. It annualizes a changing rate, does not promise a year's emissions and does not compound. Cross-token farming APR and historical Withdrawal Fee APR display “APR unavailable” because no reliable price/history source is supplied. USD values are also explicitly unavailable.

The actual attested pool is **LOCKER/native ETH**, despite the original workflow's IMD pairing wording. The Trade page discloses that difference and preserves the complete attested pool key, including its nonzero initialization hook.

- Quotes use `simulateContract` on the network-listed quoter; quoting never sends a transaction.
- Swaps use the listed Universal Router, command `0x10`, actions `0x060c0f`, exact-input pool parameters, settle-all and take-all. The network's optional extended tuple flag is supported and unit tested.
- Native input sends exactly the input value and requires no approvals. ERC-20 input sends no ETH value and exposes token-to-Permit2 approval, Permit2-to-router authorization, then swap as separate steps. Allowances are refreshed; authorizations are amount-limited and expire after 30 minutes.
- Slippage is 0.5% by default, configurable from 0.01% to 5%. Quotes expire after 30 seconds, reset after edits and are rechecked when signing. A swap deadline is five minutes from review preparation.
- Every write is reviewed, simulated, requested from the visitor's wallet, tracked through its receipt and followed by refreshed reads. Rejections and reverts are shown locally. Pending transactions cannot be resubmitted through their action. Receipt timeouts retain the explorer link and offer a confirmation recheck. A wallet change invalidates the old review.

LP fee collection, the 80/20 Treasury/Team split and buybacks are manual operational steps, not automatic contract features. The dashboard provides Treasury withdrawal/refill controls and the Trade page supports wallet buybacks. No LP position ID or Team recipient is invented.

## Wallets, reads and observability

EIP-6963 discovery lists browser wallets by name and supplied icon. Phones without a provider receive MetaMask, Coinbase Wallet, Rabby and Phantom app-browser links. Coinbase Smart Wallet is available through the Coinbase SDK; no relay, project ID or private RPC credential is required. Missing chains use switch → add chain with the unchanged supplied parameters → switch again.

Reads try all supplied public RPCs, then the connected wallet provider when it is on Sepolia. Snapshot refresh is every 15 seconds while active, also on window focus, manually, and after confirmed transactions. The longer-than-guide default reflects Sepolia block timing and avoids heavy repeated farm reads. Receipt polling is handled by viem. State older than 60 seconds or a failed refresh disables writes; no balances are fabricated after errors.

The page shows the observed block, refresh/error state, wallet address, exact address links and copy controls, simulation errors, pending and confirmed transaction links, and a session-only activity list. It includes no analytics, tracking service, backend or persisted fake activity.

## Validation

```sh
cd web
npm run typecheck
npm test
npm run build
npm run verify
npx playwright install chromium webkit
npm run test:browser
npm run check:live
# Optional actual-browser public-read capture (no wallet or transactions):
node tests/live-browser.mjs
```

On a restricted worker, set `PLAYWRIGHT_BROWSERS_PATH` to a writable external browser directory when installing and running Playwright. `test:browser` starts and closes its own bounded preview server under `/preview/`. Tests use a mock EIP-1193 wallet and explicit RPC fixtures; no private key or funds are needed. The mocks live only in `web/tests/`, are excluded from the production import graph and are not emitted in `dist/`.

The pinned taste probe can be run from the repository root when the assignment inputs are present:

```sh
IMD_PLAYWRIGHT="$PWD/web/node_modules/playwright/index.mjs" \
  node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
```

See [validation evidence](../docs/frontend/VALIDATION.md), [design system](../docs/DESIGN.md) and [action coverage](../docs/frontend/ACTIONS.md). Live read-only validation is distinguished from mocked transaction tests. Physical wallets, Coinbase passkeys and real transactions were not exercised. WebKit was downloaded but could not launch because required host libraries are missing.

## Hosting and submission

Serve `dist/` as the site's root. For Cloudflare Pages or Vercel, use repository root as the build context, `npm ci --prefix web && npm run build --prefix web` as the build command, and `dist` as the output directory. No rewrite or server function is needed. IPFS hosting pins the existing export directly. Source, lockfile, assets and manifest travel together; publication/naming is a later control-plane step.

The explicit `web/.gitignore` path allowance is used only for dependency/cache/test-output exclusions, including nested `node_modules`. No root ignore file is changed. Keep dependencies and caches out of the submission. Do not remove runtime assets or ABIs to save space.

The task restricts all writes to `web/**`, `dist/**` and `docs/**`. Its requested root `DESIGN.md` is therefore delivered as `docs/DESIGN.md`; no root configuration or deployed source is modified.

## Attribution

The interface review applies the pinned Better Interface guide (Jakub Krehel, MIT) and its Impeccable documentation method (Paul Bakaus, Apache-2.0), and the pinned ethskills frontend guidance (Austin Griffith, MIT). Notices and licenses are retained in `docs/frontend/`. Pixelify Sans is bundled under its SIL Open Font License. The MetaMask, Rabby and Phantom marks were extracted from RainbowKit 2.2.11; its MIT license is included. Coinbase's supplied mark is retained in its original colors.

The swap encoding follows the supplied workflow and [Uniswap's routing guide](https://developers.uniswap.org/docs/protocols/v4/guides/swapping/routing). Common router errors are from [IUniversalRouter](https://github.com/Uniswap/universal-router/blob/main/contracts/interfaces/IUniversalRouter.sol) and [IV4Router](https://github.com/Uniswap/v4-periphery/blob/main/src/interfaces/IV4Router.sol). Rabby's app link was checked against its [universal-link handler](https://github.com/RabbyHub/rabby-mobile/blob/develop/apps/mobile/src/hooks/universalLink.ts) and [release link constants](https://github.com/RabbyHub/rabby-mobile/blob/develop/apps/mobile/src/constant/universalLink.ts). These references supply interface behavior, never replacement deployment addresses.
