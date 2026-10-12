# 08. Pitch video: script

> **This is a script, not a finished video.** No video file exists. Nothing below has been recorded.
> Contest requirement: "A two-to-three-minute presentation video" (FAQ, portal field 7; see
> `docs/submission/OFFICIAL-REQUIREMENTS.md`). Target length: **2:45** picture, about 301 voice-over words (about 2:00 at 150 wpm before the [USER TO FILL] lines are written; must stay between 2:00 and 3:00 of video and ≤ 2:50).

Written 2026-10-12 ~18:45 UTC. Parts marked **[USER TO FILL]** are facts only the user can state
(names, background, location, the ask). Do not replace them with invented text.

## Format

- Presenter on camera (or voice over slides), plus short cuts to the public demo and to the stage-3 local-chain screenshots.
- Every cut to a product screen carries the same corner tag as the demo video:
  `[PUBLIC SIMULATION]`, `[LOCAL CHAIN – recorded on a developer machine]` or `[TERMINAL – local Foundry tests]`
  (definitions in `07-demo-video-script.md`).
- English only (rules §12(a)(i)). Burned-in captions recommended.
- Rules §12(b)(iv): every person who appears or speaks in the video must have given permission. The characters A, B and C
  are fictional and their art was generated with an image model (`src/assets/PROVENANCE.md`); the user confirms the right to use it.
- No market sizes, user numbers, traction, partners, revenue or "first ever" claims: none exist in the evidence.
  The project's own brief says uniqueness and demand are not proven (`/Users/mango/Downloads/NOBODY_FIRST_handoff_RU.txt`, section 3).

## Timecode table

| Time | Section | Picture | Voice-over | Words / spoken time at 150 wpm |
|---|---|---|---|---|
| 0:00–0:15 | Hook | Presenter. Then rooms page, `[PUBLIC SIMULATION]`, headline "Three rooms. One rule." | "Two strangers want to trade. Each will hand over their item only after receiving the other's. So who goes first? Usually someone has to trust someone." | 26 w / 10.4 s of 15 s |
| 0:15–0:30 | Team | Presenter, name lower-third. | "I'm **[USER TO FILL: name]**, **[USER TO FILL: one sentence of background]**, based in **[USER TO FILL: location]**. **[USER TO FILL: team members, or "I built this on my own."]**" | budget: at most 30 spoken words (12 s) once filled |
| 0:30–0:50 | Problem | Slide: "I give only if I receive" x 2, an arrow loop. | "That is the problem of conditional promises. Explaining an all-or-nothing exchange usually takes a whiteboard or jargon. I wanted something you understand by playing it for a minute." | 28 w / 11.2 s of 20 s |
| 0:50–1:12 | Idea | Level 01 screen, `[PUBLIC SIMULATION]`: A, B, C, the two "Select promise" boxes, then the review table. | "NOBODY FIRST is a short puzzle. Two characters each make one conditional promise; the third only watches. You choose which promises go into a deal. If one is missing, the game shows why. If every condition is met, everything moves together." | 41 w / 16.4 s of 22 s |
| 1:12–1:40 | Why a chain (honest) | Slide with two columns: "A database transaction could do this" / "What the contracts add". | "Honestly, this could run on a server with a database transaction. What the contracts add: each character is its own contract with fixed terms, and one transaction settles the whole deal or rolls it all back. Once deployed publicly, anyone could check the result. That is not done yet." | 49 w / 19.6 s of 28 s |
| 1:40–2:00 | How it works | `[LOCAL CHAIN – recorded on a developer machine]` stills: `chain-incomplete-A-1440.png` (error "PlanRejected(0, 4)"), then `chain-result-1440.png` (receipt, events). One second of `[TERMINAL – local Foundry tests]`: "77 tests passed". | "Locally, the page first simulates the deal against the contracts. A half-deal is rejected by the character's own contract before anything is sent. Seventy-four Foundry tests cover the rules, including a late failure that rolls everything back." | 37 w / 14.8 s of 20 s (74 = 77 minus 3 toolchain smoke tests) |
| 2:00–2:20 | Status today | Slide, plain list (same text as the demo's status card). | "Status today: the public site is a browser simulation of level one and sends no transaction. The contracts are tested only on a local chain; there is no public deployment. Levels two and three are planned, with mock-ups, but not built. No audit." | 43 w / 17.2 s of 20 s |
| 2:20–2:35 | What's next | Slide: four bullets. | "Next: deploy level one to a public test network **[USER TO FILL: which network, after the user decides]**, connect the site to it, build the other two rooms, and get an outside review." | 33 w incl. placeholder / 13.2 s of 15 s; the filled network name must be 1–3 words |
| 2:35–2:45 | Ask and close | Rooms page footer "Nobody has to go first.", URL `nobody-first.vercel.app`. | "**[USER TO FILL: the ask, at most 10 words]**. Play level one at nobody-first dot vercel dot app." | 9 w + ask (≤ 10 w) / ≤ 7.6 s of 10 s |

Picture length 2:45 (15 s margin to the 3:00 limit; stays within the 2–3 minute range). Fixed voice-over text, counted as
written above including the placeholder words: 301 words = about 2:00 at 150 words per minute. With the team line
(≤ 30 words) and the ask (≤ 10 words) filled to their budgets the spoken time stays under each slot and the video
under 2:50. If a take still runs long, shorten the problem section first. Never cut the database-transaction sentence
in "Why a chain (honest)" or the "Status today" scene.

## Facts used, and where they come from

| Statement in the script | Source |
|---|---|
| Public site is a browser simulation, sends no transaction | Live notice "Interactive demo · No blockchain transaction is sent." (`https://nobody-first.vercel.app`); `README.md` "Public demo (stage 4)" |
| Rooms 02 and 03 not built ("Coming soon") | `evidence/stage4/screenshots-production-final/1440-rooms.png`; `contracts/README.md` "No levels 2 and 3" |
| A database transaction could do this | Project brief, section 3 (`/Users/mango/Downloads/NOBODY_FIRST_handoff_RU.txt`) |
| Each NPC is its own contract with fixed terms; checks the plan, issues a one-time permit, gives at most its fixed item once | `contracts/evidence/contracts/GUARANTEES.md` §2 (`NPC_A/B/C`; `NpcBase` plan check and permit, `src/NpcBase.sol:147-170`; "an NPC can lose at most its fixed offer, once"). Limit: the permit's hashes come from the coordinator and are compared for equality only (`contracts/README.md`, Known limits) |
| Levels 2 and 3 "planned, with mock-ups" | Mockups `/Users/mango/Downloads/nobody-first-design/03-level-two.png`, `04-level-three-invalid.png`; brief section 6 (three levels with solutions). Not implemented in code |
| One transaction, everything rolled back on any failure | `GUARANTEES.md` §6; `contracts/evidence/contracts/latefail-trace.log` |
| Half-deal rejected by the character's contract in a simulation | `evidence/stage3/screenshots/chain-incomplete-A-1440.png` ("Contract error: PlanRejected(0, 4)") |
| Page reads balances back and lists events | `evidence/stage3/screenshots/chain-result-1440.png` |
| 74 Foundry tests cover the rules | `contracts/evidence/contracts/tests.log` line 309: 77 tests in 7 suites, of which 3 are toolchain smoke tests (`ToolchainSmoke.t.sol`, `tests.log:3-7`) |
| Local only, no public deployment | `contracts/README.md` "Anvil results come from a local chain (chainId 31337)"; `evidence/stage4/DEPLOYMENT.md` (static upload, no chain) |
| No audit | `contracts/README.md` "Not an audit. No security review has been done." |

## Words to avoid in the pitch

"trustless", "secure", "audited", "deployed", "on-chain" (for anything public), "live on testnet", "mainnet",
"first", "only", "revolutionary", any number of users or a market size. "Independent" may be used only as
"enforced by separate contracts"; it does not mean the characters are run by different people
(all contracts are created by one deployer, `contracts/evidence/contracts/GUARANTEES.md` §1).
