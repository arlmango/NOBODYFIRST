# NOBODY FIRST

## Public demo (stage 4)

The public build is an **interactive browser demo** of level 1. No blockchain transaction is sent;
Local chain mode, wallet connection and the Solidity prototype are not part of it. Rooms 02 and 03
are marked "Coming soon". The Solidity prototype (`contracts/`) has been tested locally only.

- Public build: `npm run build:public` (= `tsc --noEmit && vite build --mode public`, output `dist-public/`).
  The compile-time flag `__PUBLIC_BUILD__` removes the Local chain code from the bundle.
- Staging and checks: `node scripts/public/stage.mjs` (builds, copies only `dist-public/` + `vercel.json`
  into `build/public-staging/`, verifies the file set and forbidden strings), `scripts/public/verify-site.mjs <url>`.
- Deployment record: `evidence/stage4/DEPLOYMENT.md`.
- Development build with the optional Local chain mode (Anvil): `npm run build` / `npm run dev`,
  see `scripts/chain/README-chain.md` and `evidence/stage3/RUN-INSTRUCTIONS.md`.

The sections below describe stage 1 (the original design preview) and are kept as history; where they
differ from this section (notice text, "Complete Room 01 first.", test counts) this section is current:
the project now has 126 unit tests and the development build contains the Local chain mode.

---

## Stage 1 design preview (history)

Stage 1 is a browser-only **design preview** of the first room ("You First") of the NOBODY FIRST
exchange game, plus the rooms list that leads to it.

**This is a design preview with demonstration logic.** It has no blockchain, no wallet, no RPC,
no contracts, no hashes, no receipts and no on-chain statuses. "Run demo exchange" changes state
in the page only. The screen says so: "Design preview · No blockchain connected" is shown on every view.

## What is in stage 1

- **Rooms view** (`#/`): three rooms. Room 01 opens. Rooms 02 and 03 show art and a lock line and cannot be entered.
- **Level 01, "You First"** (`#/room/1`): two promises to choose from. A gives a key to B if B gives a coin to A,
  and the reverse. The preview shows the transfers and before/after holdings. The demo run shows a simulated result.
- **How to play** section on the rooms view (`#how-to-play`).
- **Header:** from 760px the links are shown inline. Below 760px they sit behind a **Menu** button (disclosure with
  The rooms, How to play and Close; Escape and Close return focus to Menu).
- **Copy:** the rooms page says "This demo runs locally. Blockchain execution is not implemented yet."

Out of scope for stage 1: levels 2 and 3, wallet connection, RPC, smart contracts, backend, NFTs,
and a restart room.

## Requirements

- Node.js (checked with v22.22.3).
- npm.
- Google Chrome, only for the browser checks in `scripts/e2e/` (the script launches it through `playwright-core`).

## Run it

```bash
npm install
npm run dev        # Vite dev server on http://127.0.0.1:5173
npm run typecheck  # tsc --noEmit
npm test           # vitest run (26 unit tests for src/demo, in src/demo/engine.test.ts)
npm run build      # typecheck, then vite build into dist/
npm run preview    # serves dist/ on http://127.0.0.1:4173
```

Browser checks run against a server you start yourself. Build and preview first, then in another terminal:

```bash
node scripts/e2e/run.mjs
BASE_URL=http://127.0.0.1:5173 node scripts/e2e/run.mjs   # against the dev server instead
```

The script prints a PASS or FAIL line per check and a JSON summary. It exits 1 on any failure.
It writes full-page screenshots to `docs/screenshots/`: `rooms-`, `level-one-`, `level-one-review-` and `level-one-result-`
each at 390, 768 and 1440 px (12 files), plus `menu-open-390.png`, `rooms-1440-2x.png` and `level-one-result-1440-2x.png` (15 files in total).
The verification status of each check is tracked in `docs/CHECKS.md`.

## Demo state

- The demo state lives in memory only. Nothing is written to `localStorage`, cookies or a server.
- **A page reload resets the demo.** This is intentional. A demo success is never treated as real progress.
- Leaving Level 01 for the rooms view and coming back also starts from the initial state.

## Project structure

```
src/
  main.tsx                 entry point
  App.tsx                  view state (rooms / level 1) mirrored to the URL hash
  components/              Header, DemoNotice, Button, Portrait, ItemIcon, Icons, ExchangeResult
  screens/
    Rooms.tsx              rooms view
    LevelOne.tsx           Level 01 screen: reads the demo logic, renders the UI
    level-one.css
  styles/                  tokens.css, base.css, components.css, level-result.css
  demo/                    pure TypeScript demo logic, no React imports
    levelOne.ts            fixed offer table and starting holdings for Level 01
    types.ts               shared types
    engine.ts              selection check, preview, apply, reset
    format.ts              plain-language strings derived from demo data
    index.ts               public exports
    engine.test.ts         unit tests
  assets/
    portraits/a.png, b.png, c.png
    items/key.png, coin.png
    PROVENANCE.md          where each image came from and how it was cropped
docs/
  CHECKS.md                verification checklist
  screenshots/             output of scripts/e2e/run.mjs
  evidence/                logs and manifest of the final run (RUN.md, SCREENSHOT-REVIEW.md, MANIFEST.sha256)
scripts/e2e/run.mjs        browser checks (playwright-core), main flows
scripts/e2e/flows-extra.mjs menu, resize-focus, Room 02 and regression checks
scripts/e2e/flows-assets.mjs asset checks (no filter, natural widths, DPR 2, one source per character) and 2x screenshots
scripts/e2e/flows-geometry.mjs observer-scale and Room 02 size regression checks (ratios with tolerance, not pixel-exact)
scripts/e2e/lib.mjs        shared helpers, locators and copy strings
```

`src/demo` has no React code. `LevelOne.tsx` imports `LEVEL_ONE` and calls the engine synchronously from React state.
The UI passes offer IDs only, and the engine rejects unknown IDs. A contract-backed source is not built and is not
a drop-in swap: it would need an adapter and asynchronous states (pending, rejected, stale), and `LevelOne.tsx` would change.

## Assets

The portraits (A, B, C) and item icons (key, coin) are transparent PNGs supplied for stage 1.2. They are
committed as `src/assets/portraits/{a,b,c}.png` and `src/assets/items/{key,coin}.png`; the unmodified source sheet is
`characters-and-items.png` at the repo root.

- No paper filter and no blend mode: the images are drawn as they are (`mix-blend-mode: normal`, no `filter`).
- The screen uses one source file per character and per item, and the browser checks confirm the natural widths
  (A 490, B 522, C 472, key 288, coin 234 px).
- DPR table (rendered CSS width against source, from `src/assets/PROVENANCE.md`): A/B/C 3.13, key 2.90, coin 4.17.
  The browser checks measure the minimum natural/rendered ratio at 390, 768 and 1440 px and require at least 2.

## Known limits

- Design preview only. The results are demonstration output, not a transaction or a record.
- Only Level 01 is built. Rooms 02 and 03 show their art and a lock line ("Complete Room 01 first.", "Complete Room 02 first."); they cannot be entered.
- The demo state is not persisted, so a reload or a route change clears it.
- Visual design follows the static mockups with known differences (for example, the notice sits under the header
  and the result omits "Preview Room 02"). The screenshots in `docs/screenshots/` were reviewed by eye, not by pixel comparison.
- Browser checks: the script has 113 checks. The final run recorded in `docs/evidence/RUN.md` passed 113/113 against
  `vite preview` on 2026-10-12. That result applies to that build only. See `docs/CHECKS.md`.
- Room 03 arrowhead size below 760px and the Room 03 arrow attachment are not checked by the script (NOT RUN; checked by eye only).
- OPEN: at 1024px the Room 02 portraits are about 83% of their 390px width (measured A 68.5 vs 82.5 px). Not fixed; out of scope for stage 1.3.
- One supplied image per character and per item. No alternative poses or sizes are included.
- Digits in step numbers and holdings use the sans stack. Georgia is used for headings and body serif text.
- No accessibility conformance has been tested or claimed.
- No security review has been done. The source has no backend and no network requests (no `fetch`, no external URLs).
