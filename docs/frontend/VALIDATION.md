# Locker frontend validation

| Area | Final result |
| --- | --- |
| Frontend requirement groups below | 13 met; 0 faked |
| Broken frontend features observed and left unresolved | 0 in exercised Chromium flows |
| Product and main action on first screen at 390 | Yes; live-browser deposit button bottom ≈ 732 px in an 844 px viewport |
| Final taste@1 probe | 16 / 16 checks passed |
| Interaction validation | 25 / 25 Chromium tests passed; 10 / 10 unit tests passed |
| Copy / layout findings | Applicable findings fixed and rechecked; details below |
| Share metadata | Title, favicon, description, og:title, og:image present; local PNG supplied |
| Browser coverage limitation | WebKit could not launch because its system libraries are absent |

This is worker-produced evidence, not an independent certification. The useful frontend deliverable is complete within the assigned write scope. Real wallet signing/broadcasts, physical devices, WebKit rendering and later publication checks are explicitly unverified.

## Scope, assumptions and requirements

The review covers the exported farm dashboard, trade page, rules page, owner/role dashboard, wallet sheet and transaction reviews. The visual idea is a functional farming dashboard framed by a moss-dark vault and animated golden pixel chests.

1. **“Premium dark fantasy pixel RPG design with animated golden treasure chests.” — Met.** Local Pixelify faces, original SVG chest art and stepped lid/sparkle animation; pause control and reduced-motion support.
2. **“Home: Connect Wallet, IMD/sIMD/LOCKER pool cards.” — Met.** The deployed LOCKER farm is immediately listed; uncreated IMD/sIMD farms have honest setup states. Actual registry farms replace/add cards from live reads. No farm address is invented.
3. **“Deposit, Withdraw, Claim Fees, Claim LOCKER.” — Met.** Separate controls, approval step, contract-derived withdrawal preview and full-exit control. The post-exit claim path was exercised.
4. **“Balances, farming countdown, and APR per pool.” — Met.** Live wallet/principal/reward state and chain-based epoch countdown. Same-token current-rate Farming APR is computed when valid; independent historical fee APR and unsupported cross-token APR say “APR unavailable.”
5. **“How It Works page, configurable X link.” — Met.** Hash-routed guide and publisher-editable `site-settings.json`; empty X setting is explicitly unconfigured.
6. **“Owner-only Admin Dashboard.” — Met with independent-role semantics preserved.** Treasury/factory owners and current/pending farm role holders see only their applicable controls. A non-owner has no admin controls. Two-step acceptance remains available to its recipient.
7. **“Owner can fund farms independently, set reward rates, boost future emissions, start new epochs, and add farms.” — Met.** See `ACTIONS.md`. Funding and scheduling are separate transactions. Factory setup, Treasury transfer/refill and starting an epoch were exercised with mocks.
8. **“Separate administrative roles … permanently renounced individually … retaining Treasury control.” — Met in the frontend.** Appropriate role checks and explicit irreversible review with `RENOUNCE`; Treasury renouncement is not offered because the deployed implementation refuses it. No launch role was changed by this worker.
9. **“Wallet connection, swap controls, observability.” — Met.** EIP-6963, four mobile wallet-browser links, Coinbase Smart Wallet, unknown-chain add fallback, exact-pool quotes/swaps, explicit Permit2 steps, block/read status and session transaction links. Physical wallet handoffs remain untested.
10. **“Complete editable React/TypeScript source … independently hostable.” — Met.** Vite/React/TypeScript source, npm lockfile, local assets, raw ABI exports and static `dist/`; hash routing works at `/preview/` without rewrites.
11. **“Runtime deployment configuration … every exported file with SHA-256.” — Met.** The app loads `imd-deployment.json` and its ABI paths. All four ABI hashes and pinned bytes match. Exact contract set, pool key and network blocks are preserved; 19 exported assets are inventoried, with no manifest self-hash.
12. **“Build, typecheck and meaningful interaction validation … Better Interface.” — Met with documented coverage limits.** Actual commands and six-domain review below. No contract tests or deployment were claimed as part of this frontend assignment.
13. **“First screen at 390 … nothing scrolls sideways … metadata … DESIGN.md.” — Met within the overriding write budget.** Measured at 320/390 and larger widths, including large values. Design documentation is `docs/DESIGN.md`, because the explicit allowed paths exclude a root `DESIGN.md`.

Contract deployment, token allocation and LP creation predate this assignment and were preserved. The handoff's actual pool pairs LOCKER with native ETH, rather than the original request's IMD wording; the UI explains that difference. At the live snapshot, the owner had not registered/funded the farm or funded Treasury, and IMD/sIMD farms were not created. The UI supplies the authorized setup controls; it does not execute those operations, choose unknown tokens or silently change the deployment. Published URLs, CIDs and site naming occur after this worker's delivery.

## Executed checks

| Check / command | Actual result and evidence |
| --- | --- |
| `npm --prefix web run typecheck` | Exit 0, TypeScript clean |
| `npm --prefix web run build` | Exit 0; production Vite export followed by manifest generation |
| `npm --prefix web test` | Exit 0; 10 unit tests, including integer precision, invalid recipient/amounts, canonical hashing, unknown-chain fallback, rejection behavior, slippage floors, exact native swap tuple/actions, extended tuple, token sell value and nested router errors |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/locker-browsers node web/tests/browser.mjs` | Exit 0; 25 Chromium checks. Exact tests/results in `evidence/browser-results.json` |
| `node web/scripts/verify.mjs` | Exit 0; four ABI bindings, 19 assets, exact handoff/network/pool matching, safe relative paths and complete SHA-256 inventory. `evidence/manifest-check.json` |
| Pinned ABI byte comparison using `git show <sourceCommit>:docs/abi/<name>.json` | All four equal; canonical Keccak also matches. `evidence/abi-provenance.json` |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/locker-browsers IMD_PLAYWRIGHT="$PWD/web/node_modules/playwright/index.mjs" node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | Exit 0, 16/16 final checks. Copied report: `evidence/taste.json`; scratch screenshots are transient |
| Development-server smoke test | Vite served the same production manifest and all four ABI JSON files successfully through its development middleware; server stopped afterwards |
| `tsx web/scripts/check-live.ts` | Live configured chain IDs, nonempty deployed code, farm/Treasury/owner reads, quote and router simulation succeeded. `evidence/live-chain.json` |
| Assigned browser tool | Inspected the export at 390 × 844 and 1440 × 1000, from `/preview/`; the final control-boundary refinement was then rechecked by `tests/live-browser.mjs`. Actual RPC reads loaded; all observed local resources and RPC calls returned 200. Zero console errors or warnings in `evidence/live-browser-console.txt`; request evidence in `evidence/live-browser-network.txt` |

The interaction suite covers disconnected state, mobile links, focus restoration, automatic unknown-chain addition, rejected connection, approval/deposit sequencing, full withdrawal plus subsequent claims, combined exit, decoded simulation errors, signature rejection, pending receipts, reverted receipts, account/network changes, permissionless funding, native buy, two-stage token sell approvals, quote invalidation, owner setup, renouncement guard, access control, public-RPC fallback, no-code blocking, ABI tampering, responsive stress and axe scans.

Tests do not use real keys or broadcast. Mock owner/visitor addresses and balances exist only in the test harness; the production import graph contains none of those fixtures. Screenshots beginning `mock-` are test states, not claims about live chain balances.

## Live-chain observations

The first RPC probes returned HTTP 403. Subsequent probes and the final browser read succeeded, so the earlier network error was transient rather than a hidden stub.

At block **11940337**, each configured RPC reported chain **11155111**. Application code lengths were 1,739 bytes (LaunchToken), 2,457 (Treasury), 15,464 (Factory), and 12,198 (Farm). The read snapshot showed Treasury LOCKER balance 0, farm total stake/reserve/rate/period finish 0, deposits unpaused and the directly deployed farm not registered. These values are historical evidence, not frontend constants.

A read-only quoter simulation for **0.001 ETH** returned **49,149.205162735736687161 LOCKER** at that snapshot. The configured router's exact-input call with the attested nonzero hook, 0.5% slippage and exact ETH value also simulated successfully. **No approval, wallet signature or transaction was broadcast.** Later execution remains dependent on balances, allowances, gas, liquidity, price movement and chain state.

The assigned-browser inspection observed block 11940379; the final scripted browser capture after the control-boundary correction observed block 11940411. At 390 px, `scrollWidth` and `clientWidth` were both 390. The primary control's box was `(x=41, y≈686, width=308, height=46)`, placing its bottom at approximately 732 px. The Pixelify 700 face reported loaded.

## Better Interface coverage

| Domain | Coverage and result | Limits |
| --- | --- | --- |
| Accessibility | Checked native landmarks/buttons/links/fields, explicit select labels, modal semantics, keyboard Escape/focus return, reduced motion and axe WCAG A/AA scans on farms, guide, admin and wallet dialog. No violations in those scans. | No screen-reader session, physical device, native 200% zoom, full forced-colors manual review or exhaustive keyboard traversal of every admin action. Automated scans are not full accessibility certification. |
| Layout | Checked production subpath, 320/390/768/1440 layouts, first mobile screen, long token balance, full addresses, expanded details, wallet sheet and 200% text enlargement. Final probe reports no horizontal scroll, text overlap, floating-control overlap or hidden text. | No localization or RTL mirror; 200% text enlargement differs from browser zoom. |
| Writing | Checked verb/action consistency, explicit withdrawal fee, lack of emission schedule, missing farm setup, separate approvals, recipient/amount reviews, APR limitations and recoverable errors. No fabricated rates, balances or publication claims. | External wallet copy is controlled by its provider. |
| Typography | Confirmed local Pixelify load, two family stacks, weights 400/600/700 and source scale of six sizes. Probe found only five sizes per tested viewport including one-offs. Full critical values wrap. | Fallback system sans-serif differs by device; no untested font is claimed loaded. |
| Colors | Final rendered solid-background text pairs passed the probe. Observed token pairs were also calculated: text/surface 14.59:1, muted/surface 7.90:1, primary-button text 11.44:1, success/surface 9.75:1, error/surface 9.77:1. | Pixel-art colors and translucent overlays are not treated as measured text pairs; see `evidence/contrast.json`. |
| UI | Checked border-only surfaces, stateful primary/secondary buttons, per-action pending/rejected/confirmed state, disabled prerequisites, coherent chest art and no `transition: all`. Reduced motion stopped all eight decorative animations. | No browser Animation-panel slow-motion inspection. WebKit unavailable. |

## Findings fixed and rechecked

| Finding | Source location / reproduction | Correction and evidence |
| --- | --- | --- |
| Layout: token suffix split across lines in the amount field | `web/src/styles.css:625`, `.amount-input > span`; initial 390 screenshot showed `LOCK` / `ER` | Made the suffix nonshrinking. Final 320/390 screenshots and overflow checks pass. |
| Layout: decorative arch extended the viewport by 1 px | `web/src/styles.css:1217`; mobile measurement was 391/390 and 321/320 | Matched the scene and arch widths at 112 px. No content was hidden. Strict mobile sheet and base-page overflow checks now pass. |
| Accessibility/layout: enlarged text exceeded small columns/header | `web/src/styles.css:529`, `:588`, metric-label rules and mobile header; 200% text at 320 exceeded the viewport | Allowed header/status wrapping and long tab/metric text wrapping. The 320 px / 200% text test now has no horizontal overflow. |
| Nontext contrast: active input/control borders were too subtle | `web/src/styles.css`, `--control-border`; former border/surface ratio was 2.01:1 | Added a separate lighter control-boundary token while retaining decorative card borders. Control boundaries now exceed 3:1 on page, surface and hover backgrounds; final browser/probe checks rerun. |
| Form semantics: select's wrapping label included option text | `web/src/components/ContractForm.tsx:44`; exact “Action” label lookup failed in owner test | Added unique native `id`/`htmlFor` association with a separate label. Owner action tests and axe scan pass. |
| Transaction lifecycle: post-confirmation UI could race a new quote | `web/src/transactions.tsx:101`; fast next-step quote could be cleared by the prior receipt's refresh callback | Final confirmed activity is emitted after the refresh and completion callback. Three-step ERC-20 selling passes. A reverted receipt now also releases the action for review. |
| Transaction review: account needed binding across wallet changes | `web/src/transactions.tsx:78`; reviewed plan could otherwise outlive its originating account | Bound prepared reviews to the account, checked before signing, and tested external account changes. The old review is discarded; no signature request is sent. |
| Funding: allowance label relied on local completion state | `web/src/components/FarmTools.tsx:24`; a pre-existing or externally changed allowance could disagree with the button | Query actual allowance, refresh after receipts and re-read during preparation. Permissionless approve/fund interaction passes. |
| Wallet navigation: Rabby requires command query parameters | `web/src/wallet.tsx`, `OPEN_IN`; source inspection of its released link handler | Uses `/mobile/?_cmd=open-dapp&dapp=...`; href construction verified and mobile rows rendered. Physical Rabby handoff remains untested. |
| Financial context: no active emissions needed to be clear before a deposit | `web/src/components/FarmCard.tsx:280`; live state showed no funded epoch | Show an inactive-emissions note beside the connected deposit control and in the deposit review. The live state remains read-only and no owner operation is automatic. |

Test-harness-only repairs included more precise wallet-button locators, advancing mocked block numbers during receipt polling and asserting global confirmation for controls that disappear after setup. These repairs did not change deployed contracts or claim real-chain transaction results.

## Evidence and remaining boundaries

- `disconnected-mobile-390.png` and `live-desktop-1440.png`: final actual-browser export with live public RPC reads and no connected wallet, recaptured after the control-border correction by `web/tests/live-browser.mjs`; see `evidence/live-browser.json`.
- `mock-mobile-390.png` and `mock-desktop-1440.png`: large-balance fixture stress states, clearly synthetic.
- `mobile-wallets.png`: phone picker with no injected wallet.
- `mock-admin-desktop.png`: owner-only control layout with mocked chain state.
- No live signing, physical wallet app opening, Coinbase passkey creation, funded farming transactions, LP collection or manual split was performed. Token sell approval paths and dynamic farm creation were tested with mocks, not broadcast.
- WebKit installation completed, but launching it reported missing host libraries including `libgtk-4.so.1`, Cairo/Pango and GStreamer libraries. Chromium validation completed; no Safari behavior is claimed.
- Absolute OG URLs await a published domain. Publishing, IPFS pinning, naming and later control-plane HTTP/RPC verification are not performed or claimed here.
- Root `DESIGN.md` conflicts with the explicit path budget. `docs/DESIGN.md` contains the required design record. Root build configuration, deployment source, libraries and existing ABI files are unchanged.

See `evidence/submission-size.json` for final permitted-path and byte accounting. Dependencies, caches, registry archives and browser installations are excluded; runtime assets remain intact. The readonly partial Git checkout cannot create the publisher's final commit/bundle, so worker evidence distinguishes the measured tree from that later packaging step.
