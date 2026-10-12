# Verification checks: stage 1.3 (final run, 2026-10-12)

Status values: `NOT RUN`, `PASS`, `FAIL`, `OPEN`, `N/A`.
Evidence: `docs/evidence/` (RUN.md records versions, date, the reasons and EXIT codes; logs are raw command output).
Chrome via playwright-core 1.64.0; `vite preview` on 127.0.0.1:4173 after `npm run build`.

## Commands

| Check | Command | Status | Evidence |
|---|---|---|---|
| Unit tests | `npx vitest run --reporter=verbose` | PASS | 26 passed (26); all in src/demo/engine.test.ts; vitest.log, EXIT=0 |
| Typecheck | `npx tsc --noEmit` | PASS | tsc.log, EXIT=0 |
| Build | `npx vite build` | PASS | build.log, EXIT=0 |
| Script syntax | `node --check` on run.mjs, lib.mjs, flows-extra.mjs, flows-assets.mjs, flows-geometry.mjs | PASS | node-check.log, EXIT=0 |
| Preview start/stop | `npx vite preview --port 4173 --strictPort`; stopped; port 4173 confirmed free | PASS | preview.log |
| Browser checks | `node scripts/e2e/run.mjs` | PASS | e2e.log, EXIT=0; 113/113 checks passed (0 failed) |

## Browser checks (113 checks, one run)

| ID | Check | Status |
|---|---|---|
| i-rooms | Design preview notice on rooms | PASS |
| a | Enter room opens Level 1 at #/room/1 | PASS |
| i-level | Design preview notice on Level 1 | PASS |
| b | Empty selection explains and blocks preview | PASS |
| c-a-only | Only A selected: names the missing promise from B | PASS |
| c-b-only | Only B selected: names the missing promise from A | PASS |
| a-run-guard | Run demo exchange is not rendered before Preview | PASS |
| d-select | Both selected: complete state, preview enabled | PASS |
| d-preview | Preview shows the review section with transfers | PASS |
| d-run | Run shows result: A has 1 coin, B has 1 key, C unchanged | PASS |
| f-storage | localStorage and sessionStorage are empty after a full exchange | PASS |
| i-result | Design preview notice on result | PASS |
| h | Back to rooms returns to the rooms view | PASS |
| errors-mouse | No page errors or console errors in mouse flow | PASS |
| e | Keyboard-only path completes the exchange with visible focus | PASS |
| errors-keyboard | No page errors or console errors in keyboard flow | PASS |
| g-uncheck | Unchecking a promise after Preview hides review and Run, and names the missing promise | PASS |
| g-reset-review | Reset while the review is open returns to the initial board | PASS |
| errors-guards | No page errors or console errors in guards flow | PASS |
| d-back | Browser Back from the result goes to rooms | PASS |
| d-forward | Browser Forward gives a fresh Level 1 with no result | PASS |
| e-reload | Reload resets the demo: initial board, no result | PASS |
| errors-history | No page errors or console errors in history flow | PASS |
| g-reduced-motion | With prefers-reduced-motion: reduce, no animations run on the result | PASS |
| errors-reduced-motion | No page errors or console errors in reduced-motion flow | PASS |
| f-dblclick-focus-hash-1440 | Mouse double-click on Run at 1440px: one result, hash kept, focus on result heading | PASS |
| errors-dblclick-1440 | No page or console errors after double-click at 1440px | PASS |
| f-dblclick-focus-hash-390 | Mouse double-click on Run at 390px: one result, hash kept, focus on result heading | PASS |
| errors-dblclick-390 | No page or console errors after double-click at 390px | PASS |
| f-enter-x3-focus | Keyboard: Enter three times on Run gives one result, focus on result heading | PASS |
| errors-enter-x3 | No page or console errors after Enter x3 | PASS |
| g-select | Reset demo clears a partial selection | PASS |
| g-result | Reset demo from the result returns to the initial state | PASS |
| errors-reset | No page errors or console errors in reset flow | PASS |
| j-rooms-390 | Rooms: no horizontal overflow at 390px | PASS |
| j-level-390 | Level 1 empty: no horizontal overflow at 390px | PASS |
| j-review-390 | Review state: no horizontal overflow at 390px | PASS |
| j-result-390 | Result: no horizontal overflow at 390px | PASS |
| errors-responsive-390 | No page errors at 390px | PASS |
| j-rooms-768 | Rooms: no horizontal overflow at 768px | PASS |
| j-level-768 | Level 1 empty: no horizontal overflow at 768px | PASS |
| j-review-768 | Review state: no horizontal overflow at 768px | PASS |
| j-result-768 | Result: no horizontal overflow at 768px | PASS |
| errors-responsive-768 | No page errors at 768px | PASS |
| j-rooms-1440 | Rooms: no horizontal overflow at 1440px | PASS |
| j-level-1440 | Level 1 empty: no horizontal overflow at 1440px | PASS |
| j-review-1440 | Review state: no horizontal overflow at 1440px | PASS |
| j-result-1440 | Result: no horizontal overflow at 1440px | PASS |
| errors-responsive-1440 | No page errors at 1440px | PASS |
| m-closed | Menu button at 390px is closed (aria-expanded=false) and links are hidden | PASS |
| m-aria-controls | Menu aria-controls matches the id of the menu panel | PASS |
| m-open | Opening Menu sets aria-expanded=true and shows The rooms, How to play, Close | PASS |
| m-tab-order | Tab order inside the open menu: Menu, The rooms, How to play, Close | PASS |
| m-tab-past-close | Tab past Close closes the menu | PASS |
| m-escape | Escape closes the menu and returns focus to Menu | PASS |
| m-close | Close button closes the menu and returns focus to Menu | PASS |
| m-click-outside | A click outside the menu closes it | PASS |
| m-choose | Choosing How to play closes the menu and navigates to #how-to-play | PASS |
| m-open-shot | Menu open at 390px: screenshot saved | PASS |
| errors-menu-390 | No page or console errors in the menu flow at 390px | PASS |
| m-wide-768 | No Menu button at 768px; The rooms and How to play both visible | PASS |
| errors-wide-768 | No page or console errors on rooms at 768px | PASS |
| m-wide-1440 | No Menu button at 1440px; The rooms and How to play both visible | PASS |
| errors-wide-1440 | No page or console errors on rooms at 1440px | PASS |
| m-resize-the-rooms | Resize 390-800-390 x3, focus on "The rooms": never body; lands on the expected control | PASS |
| errors-resize-the-rooms | No page or console errors in resize cycles for "The rooms" | PASS |
| m-resize-how-to-play | Resize 390-800-390 x3, focus on "How to play": never body; lands on the expected control | PASS |
| errors-resize-how-to-play | No page or console errors in resize cycles for "How to play" | PASS |
| m-resize-close | Resize 390-800-390 x3, focus on "Close": never body; lands on the expected control | PASS |
| errors-resize-close | No page or console errors in resize cycles for "Close" | PASS |
| m-resize-menu | Resize 390-800-390 x3, focus on "Menu": never body; lands on the expected control | PASS |
| errors-resize-menu | No page or console errors in resize cycles for "Menu" | PASS |
| m-resize-checkbox | Focus on a promise checkbox (outside the header) stays put across 390-800-390 x3 | PASS |
| errors-resize-checkbox | No page or console errors in checkbox resize flow | PASS |
| r-room2-art-390 | Room 02 art at 390px: portrait boxes do not overlap; no line crosses a figure (opaque pixels) | PASS |
| errors-room2-390 | No page or console errors on rooms at 390px (Room 02 art) | PASS |
| r-room2-art-768 | Room 02 art at 768px: portrait boxes do not overlap; no line crosses a figure (opaque pixels) | PASS |
| errors-room2-768 | No page or console errors on rooms at 768px (Room 02 art) | PASS |
| r-room2-art-1440 | Room 02 art at 1440px: portrait boxes do not overlap; no line crosses a figure (opaque pixels) | PASS |
| errors-room2-1440 | No page or console errors on rooms at 1440px (Room 02 art) | PASS |
| r-copy | Rooms page has the exact local-demo note and no "connected game" text | PASS |
| r-step-font | All step numbers (3) use the sans stack, not Georgia | PASS |
| r-has-font | All "Has" text on the level board (A and B) uses the sans stack, not Georgia | PASS |
| errors-regressions-1440 | No page or console errors in regression flow at 1440px | PASS |
| r-result-icon-390 | Result item icons are at least 44px wide at 390px | PASS |
| errors-icons-390 | No page or console errors in result icon check at 390px | PASS |
| r-result-icon-768 | Result item icons are at least 48px wide at 768px | PASS |
| errors-icons-768 | No page or console errors in result icon check at 768px | PASS |
| r-result-icon-1440 | Result item icons are at least 56px wide at 1440px | PASS |
| errors-icons-1440 | No page or console errors in result icon check at 1440px | PASS |
| r-terms-768 | .terms block is at most 420px wide at 768px | PASS |
| errors-terms-768 | No page or console errors in terms check at 768px | PASS |
| a-assets-no-paper-filter | No paper-lift filter in the DOM and no mix-blend-mode or filter on portraits and items | PASS |
| a-assets-natural-width | Every portrait and item has its expected natural width (no other source) | PASS |
| a-assets-dpr2 | natural/rendered width is at least 2 for every portrait and item at 390, 768 and 1440 | PASS |
| a-assets-one-source | One permanent source per character (3 portrait files) and per item (2 item files) | PASS |
| a-assets-same-origin | All network requests during the asset flows are same-origin | PASS |
| errors-assets | No page or console errors in the asset flows | PASS |
| shots-2x-rooms | Rooms at 1440px, deviceScaleFactor 2: viewport screenshot saved | PASS |
| shots-2x-result | Result at 1440px, deviceScaleFactor 2: viewport screenshot saved | PASS |
| g-observer-board-390 | Observer C on the board at 390px: 0.70 to 0.85 of A and of B | PASS |
| g-observer-result-390 | Observer C on the result at 390px: 0.70 to 0.85 of A and of B | PASS |
| errors-observer-390 | No page or console errors in observer checks at 390px | PASS |
| g-observer-board-768 | Observer C on the board at 768px: 0.70 to 0.85 of A and of B | PASS |
| g-observer-result-768 | Observer C on the result at 768px: 0.70 to 0.85 of A and of B | PASS |
| errors-observer-768 | No page or console errors in observer checks at 768px | PASS |
| g-observer-board-1440 | Observer C on the board at 1440px: 0.70 to 0.85 of A and of B | PASS |
| g-observer-result-1440 | Observer C on the result at 1440px: 0.70 to 0.85 of A and of B | PASS |
| errors-observer-1440 | No page or console errors in observer checks at 1440px | PASS |
| g-room2-scale | Room 02 at 1440px: C is not shrunk (width/natural within 5% of A) | PASS |
| errors-room2-scale | No page or console errors in Room 02 scale check | PASS |
| g-room2-768-vs-390 | Room 02 portraits at 768px are at least 0.95x their width at 390px (A, B, C) | PASS |
| errors-room2-grow | No page or console errors in Room 02 size check | PASS |

## Measurements (not pass/fail)

- Minimum natural/rendered width ratio over 60 rendered portraits and items at 390, 768 and 1440 px (rooms, board, result): **2.90** (unchanged; the PNG files are unchanged since stage 1.2).
- Room 02 portrait rendered widths (CSS px), measured with a one-off script on the same build:

| Width | A | B | C | Notes |
|---|---|---|---|---|
| 390 | 82.5 | 87.9 | 79.5 | |
| 768 | 82.5 | 87.9 | 79.5 | equal to 390 |
| 1024 | 68.5 | 73.0 | 66.0 | OPEN (see below) |
| 1280 | 86.4 | 92.0 | 83.2 | larger than 390 |
| 1440 | 90.5 | 96.4 | 87.2 | |

- OPEN item (not fixed; out of scope for stage 1.3): at 1024 px the Room 02 portraits are about 83% of their 390 width
  (A 68.5 vs 82.5 px). At 1280 px they are larger again. Only 1024 and 1280 were measured; the widths between them were not swept.

## Not run

| Check | Status | Reason |
|---|---|---|
| Room 03 arrowhead size below 760px | NOT RUN | The e2e cannot read SVG arrowhead geometry reliably. Checked by eye only (SCREENSHOT-REVIEW.md). |
| Room 03 arrows attached to the key (geometry) | NOT RUN | Not measured by the script. Checked by eye only. |

## Screenshots (docs/screenshots/, 15 files)

13 state shots at 390, 768 and 1440 px, plus rooms-1440-2x.png and level-one-result-1440-2x.png (deviceScaleFactor 2,
viewport only). Per-image and per-fix verdicts: `docs/evidence/SCREENSHOT-REVIEW.md`.

## Other checks

| Check | How | Status | Evidence |
|---|---|---|---|
| Assets | src/assets/** unchanged since stage 1.2; DPR table in PROVENANCE.md | PASS | a-assets-* checks; min ratio 2.90 |
| Forbidden copy | grep `src/` (excluding tests) for wallet, receipt, rpc, nft, contract, 0x | PASS | No matches, 2026-10-12 |
| No network requests in source | grep `src/` and `index.html` for fetch(, XMLHttpRequest, WebSocket, http(s):// | PASS | No matches, 2026-10-12 |
| Accessibility conformance | not measured | N/A | Not claimed |
| Security review | not done | N/A | Not claimed |
