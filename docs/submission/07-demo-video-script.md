# 07. Product demo video: script and shot list

> **This is a script, not a finished video.** No video file exists. Nothing below has been recorded.
> Contest limit: the product demo is "no more than three minutes explaining how the product works"
> (FAQ, see `docs/submission/OFFICIAL-REQUIREMENTS.md`, portal field 8). Target length: **2:48** picture, voice-over 301 words (about 2:09 at 140 words per minute), 12 s under the limit.

Written 2026-10-12 ~18:40 UTC. Every on-screen text below is taken from the live public bundle
(`https://nobody-first.vercel.app`, checked with curl on 2026-10-12), from the source files cited,
or from the stage-3 and stage-4 screenshots cited. If a text on screen differs at recording time,
the screen wins: fix the caption, do not fake the screen.

## Scene labels (mandatory, burned into the video as a corner tag)

| Tag | Means | Source of the picture |
|---|---|---|
| `[PUBLIC SIMULATION]` | The public site. A browser simulation. No blockchain transaction is sent. | Live recording of https://nobody-first.vercel.app |
| `[LOCAL CHAIN – recorded on a developer machine]` | Development build talking to a local Anvil chain (chain ID 31337, `http://127.0.0.1:8545`). Not public, not a testnet. | Plan A: the stage-3 E2E screenshots (real, round 4, 2026-10-12). Plan B: a new local recording (see "Local-chain recording"). |
| `[TERMINAL – local Foundry tests]` | Saved Foundry output from a local run. | `contracts/evidence/contracts/tests.log`, `latefail-trace.log` |

Do not show any scene with a tag it does not deserve. The public site never shows a transaction, a hash,
a wallet or a receipt; every hash shown in this video comes from the local chain screenshots.

## Timecode table

Caption = the lower-third text burned into the video. Voice-over (VO) is about 140 words per minute.

| Time | Tag | On-screen action | Exact UI text visible (key lines) | Voice-over | Caption |
|---|---|---|---|---|---|
| 0:00–0:12 | `[PUBLIC SIMULATION]` | Rooms page at 1440 px, static, slow zoom on the headline. | "Three rooms. One rule." / "Everyone gets what they need, or nothing moves." / notice "Interactive demo · No blockchain transaction is sent." | "Two people each have what the other needs. Nobody wants to give first. NOBODY FIRST is a puzzle: everyone keeps their promise, or nothing moves." (25 w) | NOBODY FIRST, a puzzle about atomic exchange |
| 0:12–0:24 | `[PUBLIC SIMULATION]` | Pan across the three room cards; hover Room 02 and Room 03. | "ROOM 01 / You First / Two people. Two promises." · "ROOM 02 / The Circle / Coming soon" · "ROOM 03 / The Wrong Door / Coming soon" · "Play the first level in your browser. The Solidity prototype has been tested locally; public testnet play is not available yet." | "This is the public demo: a browser simulation of level one. Rooms two and three are not built yet." (19 w) | Public demo = browser simulation. Levels 2–3: not built |
| 0:24–0:36 | `[PUBLIC SIMULATION]` | Click "Enter room". Level 01 loads. | "LEVEL 01 / You First / Choose both promises to complete the exchange." · A: "Has 1 key", "Gives to B 1 key", "Needs from B 1 coin" · B: "Has 1 coin", "Gives to A 1 coin", "Needs from A 1 key" · C: "Observer", "No exchange this round." | "A has a key and wants a coin. B has a coin and wants a key. C only watches. Each gives only if it receives." (25 w) | Each promise: give only if you receive |
| 0:36–0:52 | `[PUBLIC SIMULATION]` | Tick A's "Select promise" only. Hold 3 s on the exchange summary; point at the disabled "Preview exchange". | "1 of 2 promises selected" · "B → A: 1 coin · not promised" · "B has not promised 1 coin to A, so A's key would not move." · "Select both promises to preview the exchange." · under B: "A is waiting for this promise." (texts from `src/demo/format.ts:37-41,59` and `src/screens/LevelOne.tsx:39,316-319`; present in the live bundle; no saved public screenshot of this state, confirm on screen) | "Pick only A's promise and the deal is incomplete. The game says why: B has not promised the coin, so A's key would not move." (25 w) | Incomplete deal: nothing can move |
| 0:52–1:04 | `[PUBLIC SIMULATION]` | Tick B's "Select promise". Click "Preview exchange". Review panel appears. | "Both promises selected" · "Both transfers happen together, or neither happens." · "Review your exchange" · "Nothing has moved yet. This is what the demo would do." · table Before/After: A 1 key → 1 coin, B 1 coin → 1 key, C empty → empty · "Runs on this page only. No blockchain transaction is sent." (`evidence/stage4/screenshots-production-final/1440-review.png`) | "With both promises, the preview shows every transfer and everyone's before and after. Nothing has moved yet." (17 w) | Preview first. Nothing moves yet |
| 1:04–1:16 | `[PUBLIC SIMULATION]` | Click "Run demo exchange". Result view. Hover "Transaction details". | "INTERACTIVE DEMO · SIMULATED RESULT" · "Simulated result. No blockchain transaction was sent." · "Everyone kept their promise." · "A received a coin. B received a key." · "Transaction details — Unavailable in this demo" (`1440-result.png`) | "Run it, and both promises are kept together. On the public site this is a simulation, and it says so." (20 w) | Simulated result. No transaction on the public site |
| 1:16–1:22 | (title card) | Full-screen card, no UI. | Card text: "What the chain adds. Recorded on a developer machine with a local Anvil chain (chain ID 31337). Not on the public site. Not on a public network." | "What the contracts add, on a local test chain only." (10 w) | Local chain only. Not public |
| 1:22–1:34 | `[LOCAL CHAIN – recorded on a developer machine]` | Still `evidence/stage3/screenshots/chain-incomplete-A-1440.png`, slow pan to the error block. | Mode switch "Mode · Demo · Local chain" · notice "Local blockchain · Anvil" · "This exchange would not work" · "A rejected the package: A's promise (1 key to B for 1 coin from B) needs B's promise of 1 coin, but B's promise is not selected. A will not give first." · "Contract error: PlanRejected(0, 4)" · "Nothing was sent. Change your selection and preview again." | "The same half-deal, now checked by the contracts. A's contract rejects it in a simulation, before anything is sent." (19 w) | Rejected by A's contract in simulation. Nothing sent |
| 1:34–1:46 | `[LOCAL CHAIN – recorded on a developer machine]` | Still `chain-game-1440.png`. Highlight the note under "Execute deal". | "Preview simulates this exact exchange on the local chain. Nothing is sent." · "Review your exchange / Simulated on the local chain. Nothing has moved yet." · "Before and expected after" · buttons "Execute deal", "Edit selection" · "Sends one transaction from your wallet to the local chain. One transaction: if any check fails, all of it is reverted." | "With both promises, the preview simulates against the local chain. Execute sends one transaction; if any check fails, all of it reverts." (22 w) | One transaction. Any failed check reverts all of it |
| 1:46–2:04 | `[LOCAL CHAIN – recorded on a developer machine]` | Still `chain-result-1440.png`: top (result), then scroll to "Transaction details". Blur nothing; all values are local test values. | "LOCAL CHAIN · CONFIRMED RESULT" · "Confirmed on the local chain." · "Everyone kept their promise." · "The After column is read back from the item ledger after the receipt." · "Chain ID 31337" · "RPC http://127.0.0.1:8545" · "Start run transaction … Block 2 … Receipt status success" · "Execute transaction … Block 3 … Receipt status success" · events "PermitIssued", "PermitConsumed", "ItemMoved", "LevelSolved" · "Final balances (read from the ledger) A 1 coin, B 1 key, C empty" | "A Start run transaction set up A, B and C. The execute transaction is confirmed in block three. The page reads the final balances back from the contracts and lists every event." (32 w) | Receipts and events from local chain 31337 |
| 2:04–2:12 | `[LOCAL CHAIN – recorded on a developer machine]` | Still `chain-reload-restored-1440.png`. | "LOCAL CHAIN · RESTORED RESULT" · "Restored from the local chain. This run was solved earlier." · "A repeat attempt is not supported in this version." | "After a reload, the result is rebuilt from the contracts. One run per account." (14 w) | After reload: state read from the contracts |
| 2:12–2:30 | `[TERMINAL – local Foundry tests]` | Terminal, large font. Show two saved excerpts (commands below). | `Ran 7 test suites in 12.34ms (47.16ms CPU time): 77 tests passed, 0 failed, 0 skipped (77 total tests)` then trace lines with `NPC_A::release`, `emit ItemMoved(... fromNpc: 0, toNpc: 1, item: 1, qty: 1)`, `LateFailNpcB::release`, `← [Revert] LateFailInjected(...)` | "Seventy-seven Foundry tests, including three toolchain smoke tests. Here the first item has moved, then the second release fails, and everything reverts. The tests compare the listed state fields (balances, permits, run data, snapshot hash) before and after." (38 w; field list: `contracts/evidence/contracts/latefail-README.md` "Fields compared") | Saved local Foundry run, 2026-10-12 09:34 UTC |
| 2:30–2:42 | (title card) | Full-screen card, list. | Card text: "Status today: · Public site: browser simulation, no transaction sent · Contracts: tested on a local chain only, no public deployment · Levels 2 and 3: not built · No security audit · Reset demo resets the page only; contracts have no reset" | "To be clear: the public site is a simulation. The contracts are tested locally, not deployed publicly. Levels two and three are not built. No audit." (26 w) | Honest status |
| 2:42–2:48 | `[PUBLIC SIMULATION]` | Click "Back to rooms" on the result screen (or the header link "The rooms"); scroll to the rooms page footer. | "Nobody has to go first." · URL bar `nobody-first.vercel.app` | "Try level one at nobody-first dot vercel dot app." (9 w; the closing line "Nobody has to go first." is on screen) | nobody-first.vercel.app |

Total picture 2:48 (12 s margin to the 3:00 limit). Voice-over 301 words = about 2:09 at 140 wpm. Per scene the spoken text fills 61–93 % of its slot (longest: 2:30–2:42, 26 words = 11.1 s in 12 s; 2:12–2:30, 38 words = 16.3 s in 18 s). Word counts are given in each VO cell; if a line is rewritten, recount and keep it under its slot at 140 wpm.

## Prerequisites before recording

### Public scenes (`[PUBLIC SIMULATION]`)

- Open https://nobody-first.vercel.app in a clean browser profile (no extensions shown, no bookmarks bar,
  no other tabs). Share only this URL; the deployment-specific Vercel URLs are behind Vercel login
  (`evidence/stage4/DEPLOYMENT.md`).
- Window 1440 x 900 CSS px (record at 2880 x 1800 on a Retina display, export 1920 x 1080 or 2560 x 1440).
- "Reset demo" before the take. Note: "Reset demo" only resets the page state. It is not a contract reset;
  the contracts have no reset function (`contracts/README.md`, "No reset").
- Navigation: "Back to rooms" exists only on the result screen (`1440-result.png`). After "Reset demo", or on the
  level screen, use the header link "The rooms" to return to the rooms page (scene 2:42).

### Local-chain scenes (`[LOCAL CHAIN – recorded on a developer machine]`)

**Plan A (recommended, no new run, no code change):** use the real stage-3 screenshots as stills:
`evidence/stage3/screenshots/chain-incomplete-A-1440.png`, `chain-game-1440.png`, `chain-result-1440.png`,
`chain-reload-restored-1440.png` (index: `evidence/stage3/SCREENSHOT-INDEX.md`; produced by the round-4 E2E run,
results `evidence/stage3/e2e-results.json`: 14 scenarios PASS, merged from the round-4 full run, 13 of 14 PASS, and a fresh-deploy re-run of S12 and S12b, both PASS; see `evidence/stage3/RUN-INSTRUCTIONS.md`). Put the tag and the caption
"Screenshot from the local E2E run, 2026-10-12" on each. Use slow pans (Ken Burns), not fake cursor clicks:
the screenshots were taken by Playwright, not by a person clicking.

No screenshot exists of the "Start a run" panel ("Start a run" / "This account has no run yet. Starting one sends a
transaction that sets up A, B and C on the local chain." / "Start run", `src/screens/LevelOneChainParts.tsx:187-197`)
or of the in-progress "Simulating this exchange on the local chain." state. Plan A shows Start run only through
the "Start run transaction" rows of the proof panel. Do not mock up those panels.

**Plan B (live screen recording, only if the user decides so):** the app needs an EIP-1193 browser wallet.
The E2E used a test-only provider injected by Playwright (`scripts/chain/test-provider.js`), and the E2E launcher
is headless only (`scripts/chain/e2e/lib.mjs:179`); there is no headed or video mode. A live take therefore needs
either a code change to the test harness (not authorised in this task) or a real wallet extension configured for
chain 31337 with an imported Anvil dev account. If a wallet is used, the account import must happen off camera, and
no private key, seed phrase or wallet-import screen may appear. Commands (from `evidence/stage3/RUN-INSTRUCTIONS.md`,
run from `/Users/mango/NOBODYFIRST`):

```bash
npx tsc --noEmit
npx vitest run
npx vite build
node scripts/chain/local-chain.mjs stop      # safe if nothing runs
node scripts/chain/local-chain.mjs start     # Anvil 127.0.0.1:8545
node scripts/chain/local-chain.mjs deploy    # writes contracts/deployments/local-anvil.json
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort &   # note the PID
# open http://127.0.0.1:4173/#/local/room/1 ; record ; then:
kill <preview-pid>
node scripts/chain/local-chain.mjs stop
```

Each account has one run (`startRun` uses the caller as run id; a second run reverts `RunExists`), so every new take
needs a fresh `start` + `deploy` or another account. `deploy` runs `forge create`, which writes Forge's cache under
`~/.foundry/cache/nobodyfirst-stage3` (`scripts/chain/README-chain.md`), outside the project.

### Terminal scene (`[TERMINAL – local Foundry tests]`)

Show the saved output; do **not** re-run `forge test` for the video. Every forge run writes
`~/.foundry/cache/signatures` outside the project, a write that was never permitted
(`contracts/README.md`, warning; `contracts/evidence/contracts/GUARANTEES.md` §8).

```bash
cd /Users/mango/NOBODYFIRST/contracts/evidence/contracts
sed -n 307,309p tests.log            # "Suite result ... 6 passed" and "77 tests passed, 0 failed, 0 skipped"
sed -n 1503,1515p latefail-trace.log # first release moves the key, LateFailNpcB::release reverts, revert propagates
```

Font size ≥ 20 pt, window 120 columns wide, a plain prompt (no user name, host name or path beyond `contracts/evidence/contracts`).
The trace lines are wide; crop or scroll horizontally rather than shrinking the font. Caption the run date from
`GUARANTEES.md` §9: "Saved output of the run on 2026-10-12 09:34 UTC."

## What must never be on screen

- `scripts/chain/.run/anvil.log` or the Anvil start banner: they list Anvil's dev accounts and private keys
  (`scripts/chain/README-chain.md`). Do not run `anvil` in a visible terminal; `local-chain.mjs start` writes the banner
  to that log file. Do not `cat` or open it.
- Any private key, seed phrase, wallet-import dialog, `.env` file, Vercel dashboard or token.
- The deployment-specific Vercel URLs (`*-robertdipolson-3358s-projects.vercel.app`).
- Any hash, address, block or "confirmed" status in a `[PUBLIC SIMULATION]` scene. The only hashes in this video are
  on the local-chain screenshots.
- Personal data: mail, chat, notifications (turn on Do Not Disturb), desktop files, browser history and the macOS user name.
- Words not supported by evidence: "on-chain" for the public site, "deployed", "testnet", "mainnet", "audited", "secure",
  "trustless", "production-ready", "first ever".

The local-chain screenshots show Anvil's default account address (`0x70997970…79C8`, Player) and local contract
addresses. These are public test addresses, not secrets, and need no blur.

## Risks and fallbacks

| Risk | Fallback |
|---|---|
| Live site down or changed at recording time | Use `evidence/stage4/screenshots-production-final/1440-*.png` as stills for the public scenes and label them "Screenshot of the public demo, 2026-10-12". Do not record a local build and present it as the public site. |
| Incomplete-selection texts differ from this script | Record what the screen says and change the caption. There is no saved public screenshot of that state. |
| Plan B take fails (wallet, RPC, `RunExists`, wrong network) | Switch to Plan A stills. Do not stage a success with a mock-up. The E2E screenshots of real error states exist if needed (`chain-wrong-network-1440.png`, `chain-declined-1440.png`, `chain-rpc-failure-1440.png`). |
| Video runs past 3:00 | Drop 2:04–2:12 (reload restore) first, then shorten the terminal scene to the "77 tests passed" line only. Never cut the honest-status card. |
| Voice-over too fast | Cut lines, not pauses. The limit is three minutes, not a word count. |
| Terminal font unreadable | Use the caption to state the result and show the file name; do not retype the output by hand. |

## Export and upload

- 1920 x 1080 (or 2560 x 1440), 30 fps, H.264, stereo AAC. Burn in the captions; add an English subtitle file if the host allows it.
- English only (rules §12(a)(i)). Rules §12(b)(iv): anyone who appears or speaks in the video must have given permission.
- Upload where the user chooses (for example unlisted YouTube or Loom) and test the link in a logged-out browser before pasting it into the portal.
- Before uploading, watch the full file once and check every frame against "What must never be on screen".
