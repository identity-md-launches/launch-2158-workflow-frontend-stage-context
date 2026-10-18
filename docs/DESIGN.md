# Locker design system

This is the implemented design of the frontend in `web/src/`, not a proposal. The assignment's write budget excludes root `DESIGN.md`, so this document is delivered under `docs/`.

## Overview

Locker is a farming dashboard presented as a dark fantasy vault: moss-dark stone surfaces, pixel-cut golden chests and clear transaction controls. The chest is the single visual motif. It carries the RPG identity without turning financial controls into game mechanics.

The product leads the page. A short introduction gives way to the LOCKER deposit control, wallet balance and wallet connection on the first 390 × 844 screen. IMD and sIMD cards identify missing owner setup honestly. Navigation separates farms, trading, the rules and role-gated administration. The design deliberately uses a single dark theme, as requested; there is no ineffective theme toggle.

## Colors

Canonical values are in `web/src/styles.css` at `:root`. Primitive colors feed semantic roles; components should use the semantic tokens.

| Semantic token | Value | Use |
| --- | --- | --- |
| `--bg` | `#101512` | Page and input background |
| `--surface` | `#171e19` | Vault cards, panels, dialogs |
| `--hover` | `#263129` | Neutral button hover |
| `--border` | `#405145` | Decorative structural outlines |
| `--control-border` | `#708774` | Enabled input, button and wallet-row boundaries |
| `--text` | `#f0eee2` | Main copy and labels |
| `--muted` | `#a8b4a9` | Secondary descriptions and field context |
| `--accent` | `#edc773` | Primary action fill, links and brand |
| `--accent-hover` | `#f4d998` | Primary action hover |
| `--success` | `#a7cf9c` | Verified/open/confirmed state, always with words |
| `--error` | `#ffb1a4` | Recoverable errors and failed reads |
| `--focus` | `#fff0b9` | Two-pixel visible keyboard outline |

`--stone-850` (`#1c251f`) is used for unavailable controls; `--stone-800` also supplies low-emphasis separators. Illustration-only colors live in `Chest.tsx` and the arch/torch CSS. They are decorative, not text contrast pairs. Measured contrast and its scope are recorded in `frontend/VALIDATION.md` and the taste evidence.

## Typography

- **Pixelify Sans**, locally bundled as `src/assets/pixelify-600.woff2` and `pixelify-700.woff2`, is used for the brand, main headings and vault names. The actual 600 and 700 weights are loaded separately, with `font-display: swap`. Georgia/serif is the fallback.
- **System sans-serif** (`ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`) carries prose, navigation, fields and data. There is no font-network request.
- The six source scale tokens are `--small: .875rem`, `--body: 1rem`, `--lead: 1.125rem`, `--section: 1.5rem`, `--title: 2rem`, `--display: 3rem` (14, 16, 18, 24, 32 and 48 px at the normal root size).
- The three weights are 400, 600 and 700. The main heading is the heaviest. Body line height is 1.5; headings use 1.2 and balanced wrapping. Only the display heading has negative tracking, `-.025em`. There are no tracked-capital kicker labels.
- Inputs are at least 16 px. Changing amounts/countdowns use tabular numerals. Addresses and critical numeric values can wrap; they are not hidden by ellipsis. The short header wallet address opens a dialog containing its full checksummed address, explorer link and Copy control.
- Long prose is limited to roughly 68 characters. Typography remains selectable. The interface is English; localized and RTL variants have not been tested.

## Layout

`App.tsx` composes the header, navigation, content and footer. `.app` caps the site at 1440 px. Main horizontal insets are 48 px on desktop, 28 px below 1150 px, 20 px below 620 px and 16 px below 350 px. Spacing is mostly an 8 px rhythm, with 12 px control gaps, 20–24 px panel insets and 28–40 px section separation.

- Farm cards use three equal `minmax(0, 1fr)` columns, collapse to two below 880 px, then one below 620 px. The first farm spans the two compact setup cards at the middle breakpoint.
- The welcome scene is a normal-flow decorative area on desktop. On mobile it becomes a small, subdued illustration inside the introduction. Its container exactly fits the arch width, preventing a previously observed one-pixel overflow.
- Trade is a 480 px maximum form column beside pool facts; it stacks below 880 px. Admin uses two columns that also stack below 880 px. The guide is a centered 720 px reading column.
- Header content can wrap under text enlargement. Farm tabs and metric labels allow long content to wrap. Full addresses use `overflow-wrap: anywhere`; the layout does not conceal overflow to pass checks.
- Desktop dialogs are at most 480 px wide. Below 620 px they are bottom sheets with safe-area padding and at most 90 dynamic viewport height. They scroll internally when needed.

The finished export was inspected at 320, 390, 768 and 1440 CSS pixels. The large-balance fixture, expanded addresses and mobile wallet sheet were exercised. Text enlargement to 200% was checked at 320 px; this is not a claim of native browser zoom testing.

## Elevation & depth

The surface system is flat. Structural borders distinguish farm cards and inputs; there are no card shadows or nested card decorations. The welcome panel uses a tonal background. A native dialog occupies the browser top layer over a dark translucent backdrop (`#050907c9`). The arch and chest convey depth through pixel geometry, not UI glows.

## Shapes

Controls and cards have 4 px corners. Desktop dialogs have 8 px corners and mobile sheets have 12 px upper corners. Pixel-cut SVG paths and the CSS arch belong only to the illustration system; text, inputs and transaction controls use ordinary rectangular geometry. No content-bearing panel uses clipping to hide text.

## Components

| Component / source | Purpose and states |
| --- | --- |
| `WalletControl`, `wallet.tsx` | One header control; EIP-6963 rows, mobile app links, Coinbase Smart Wallet, pending/rejection state, connected-address dialog, disconnect and wrong-network switching. Wallet rows have marks and at least 48 px targets. |
| `Modal`, `components/Modal.tsx` | Native modal dialog, backdrop/Escape close, browser focus containment and explicit focus restoration. Transaction dialogs refuse dismissal while simulation/signing is in progress. |
| `FarmCard`, `components/FarmCard.tsx` | Shared deposit/withdraw layout, wallet/principal balance, exact approval step, APRs, countdown, independent claims, and expandable position/maintenance details. Inactive emissions and unavailable farms are explicit. |
| `TxButton`, `transactions.tsx` | Prepare → review → simulate → sign → wait for receipt → refresh. Local pending/error state; global session activity and explorer links. Renouncement adds a typed confirmation. The reviewed account is bound to the action. |
| `ContractForm`, `components/ContractForm.tsx` | Labeled native action select plus address/amount fields. Used for role-gated administrative and permissionless maintenance operations. One operation is shown at a time. |
| `AddressView`, `components/AddressView.tsx` | Checksummed, wrapping explorer address and Copy button. Copy failure gives a selectable-address fallback. |
| `Chest`, `components/Chest.tsx` | Original decorative SVG, muted and small variants. Lid movement uses 5-second stepped motion; sparkles use 3-second stepped opacity. |
| `.primary`, `.text-button`, `.wallet-row` | Gold primary action, quiet secondary control and full-width wallet row. Hover, active, disabled and focus-visible states are explicit. Controls generally have 44 px minimum height; compact Copy/Max/Refresh controls remain above the 24 px minimum. |

Animation can be paused from the footer. `prefers-reduced-motion` disables animation, transitions and press scaling. High-frequency transitions are 120 ms and name only the changing properties. State is conveyed in text as well as color. Forced-colors focus uses the system highlight color.

## Do's and don'ts

- Reuse the `--text`, `--muted`, `--accent`, `--success` and `--error` roles; do not choose a border color for text because it looks close.
- Keep token units and the cost/consequence beside the control or inside its review. Do not add invented USD figures, APRs or sample balances to an empty state.
- Reuse `TxButton` for writes, `AddressView` for contract addresses and `Modal` for reviews. A button alone does not provide the transaction lifecycle.
- Keep the wallet control, selected farm state and primary action close to the top on phones. Explanations belong in the guide or adjacent details, not in a larger hero.
- Preserve the exact deployment configuration while editing presentation. All new protocol addresses must have an authorized source; never put them in a component.
- Add another page as a hash route in `App.tsx`, with one `h1`, the existing `.page-heading` or `.reading` layout, and existing field/button tokens. Check it at 320/390 widths, with keyboard focus and enlarged text, before rebuilding the manifest.

The design method is adapted from Better Interface (Jakub Krehel, MIT) and Impeccable's document method (Paul Bakaus, Apache-2.0); see `frontend/interface-guides-LICENSE.txt`. This document describes the implemented source and measured checks only.
