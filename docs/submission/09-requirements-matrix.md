# 09. Requirements → evidence matrix

Checked 2026-10-12, 18:39 UTC (`date -u`); repository rows (D) and the time left re-checked at 19:00 UTC after the review. Contest facts come only from `docs/submission/OFFICIAL-REQUIREMENTS.md`
(official pages and rules PDF, verified by the orchestrator the same day). Project facts cite files in this repository.

## Deadline

| | Time |
|---|---|
| Rules §5 / §6 | 11:59 pm PT, Monday 12 October 2026 (PDT, UTC−7) |
| UTC | 06:59, Tuesday 13 October 2026 |
| UTC+05:00 | 11:59, Tuesday 13 October 2026 |
| Remaining at 19:00 UTC | **about 12 h 00 min** |

Registration of every member (§6(a)) and the leader's upload (§6(b)) must both happen before this time.

Status values: **MET** (evidence exists), **PARTIAL**, **NOT MET**, **UNKNOWN** (cannot be decided from evidence or
official text), **USER ACTION** (only the user can do or confirm it).

## A. Entry and eligibility

| # | Requirement | Official source | Existing evidence | Status | Missing / what to do |
|---|---|---|---|---|---|
| A1 | Every team member registers on colosseum.com before the deadline | Rules §6(a); FAQ "every member must have a Colosseum account" | None in the repository | USER ACTION | Each member registers at https://colosseum.com/arena/hackathon/register?entry=worldsfair and confirms it worked. |
| A2 | Team leader uploads the Project Submission before the end of the Entry Period | Rules §6(b) | Draft texts only: `docs/submission/01-…06-*.md` | NOT MET | Leader submits in the portal before 06:59 UTC 13 Oct. A draft or an empty form is not a submission. |
| A3 | Eligibility: 18 or the age of majority, whichever is older; not subject to U.S. or other applicable sanctions (OFAC) and not employed by an entity under blocking sanctions; not an employee, contractor or officer of the Administrator or a Contest Sponsor or their immediate family; not located or ordinarily resident in a listed sanctioned country/region; employer and third-party-rights representations (§3(c)) | Rules §3 | None (deliberately not inferred) | USER ACTION | Only the user can confirm. This package makes no assumption about location. |
| A4 | All content in English | Rules §12(a)(i) | `docs/submission/*.md` (English), public site (English, `evidence/stage4/screenshots-production-final/`) | PARTIAL | Repository and site are English. Videos not recorded yet; record in English. The original brief `/Users/mango/Downloads/NOBODY_FIRST_handoff_RU.txt` is in Russian: do not link or upload it. |
| A5 | One team per entrant, one submission per team; Signor Scam must not be a second submission | Rules §7; FAQ | `OFFICIAL-REQUIREMENTS.md` "Other rules" | USER ACTION | Confirm Signor Scam is not submitted (or withdraw it) by the same person or team. |
| A6 | Disclose pre-existing work | FAQ ("disclose all relevant past development work in the submission form") | File birth times: `package.json` 2026-10-11 20:22, `src/main.tsx` 2026-10-11 20:34, design mockups `/Users/mango/Downloads/nobody-first-design/` 2026-10-11 19:54–20:09, brief 2026-10-11 19:42 (all +05:00, inside the window that began 14 Sep). Images generated with an image model (`src/assets/PROVENANCE.md`) | PARTIAL | Evidence suggests all code is from 11–12 Oct 2026. The user must state in the form whether any earlier work (idea, design, Signor Scam code) was reused. No AI-tool policy was found (`OFFICIAL-REQUIREMENTS.md`); disclosing AI-assisted development and AI-generated art is the user's decision, recommended for honesty. |

## B. Submission portal fields (FAQ list)

| # | Field | Source | Existing evidence | Status | Missing / what to do |
|---|---|---|---|---|---|
| B1 | Product name and brief description | FAQ field 1 | `docs/submission/01-short-description.md` (draft; the short description, line 13, is 274 characters, counted 2026-10-12; plus a longer version) | PARTIAL | Text exists; user reviews and pastes. |
| B2 | Blockchains and tools integrated | FAQ field 2 | Solidity 0.8.37, Foundry/Anvil 1.8.5 (`contracts/README.md`), viem 2.57.4 (`package.json`), local chain ID 31337 (`chain-result-1440.png`) | PARTIAL | Must say "local EVM (Anvil) only; no public chain integrated". Do not list Ethereum, Base or Arbitrum as integrated: there is no deployment on any of them. |
| B3 | Team members and backgrounds | FAQ field 3 | None | USER ACTION | User fills names and backgrounds; leader adds members (each with a Colosseum account). Placeholders in `08-pitch-video-script.md`. |
| B4 | Team location | FAQ field 4 | None | USER ACTION | User states it. Not inferred here. |
| B5 | Logo or graphic | FAQ field 5 | No dedicated logo. Candidate graphics: `characters-and-items.png` (source sheet, 2.4 MB), `src/assets/portraits/*.png`, `evidence/stage4/screenshots-production-final/1440-rooms.png` | USER ACTION | Choose one (a crop of the rooms page or a portrait). The art was generated with an image model (`src/assets/PROVENANCE.md`); the user confirms the right to use it (§3(c)). |
| B5a | Permission of every person who appears in submitted Content (videos) | Rules §12(b)(iv) | Videos not recorded. Characters A, B, C are fictional; their art was generated with an image model in the designer's chat (`src/assets/PROVENANCE.md`; source sheet `characters-and-items.png`) | USER ACTION | Presenter and any other person in either video gives permission. User confirms provenance of and right to use the image-model art (§3(c)). |
| B6 | GitHub repository link; private allowed if access is given to hackathon@colosseum.com | FAQ field 6 | `git rev-list --all --count` = **0** (no commits). `origin` = https://github.com/arlmango/NOBODYFIRST.git; unauthenticated `curl` of the page and of the GitHub API both return **404** (private, or not created) | **NOT MET** (repo state on GitHub: UNKNOWN) | See section D. Create or confirm the repository, commit, push, then either make it public or grant access to hackathon@colosseum.com, and test the link while logged out (public) or ask the grantee to confirm (private). |
| B7 | Pitch video, 2–3 minutes | FAQ field 7 | Script only: `docs/submission/08-pitch-video-script.md` | **NOT MET** | Record (script: 2:45 picture, ≤ 2:50), upload, test the link. |
| B8 | Product demo video, no more than 3 minutes | FAQ field 8 | Script only: `docs/submission/07-demo-video-script.md` | **NOT MET** | Record (script: 2:48 picture, ≤ 3:00), upload, test the link. |
| B9 | Go-to-market strategy, demand validation and plans for developing distribution | FAQ field 9 (wording per `OFFICIAL-REQUIREMENTS.md`) | Honest draft in `docs/submission/06-form-answers.md` §9: states that demand is not validated (no users, interviews, partners, waiting list, traffic or sales) and leaves the first audience and the measurable test to the team. The brief also says demand is unproven (handoff section 3). | PARTIAL (text drafted; no validation exists; nothing on distribution yet) | User confirms or edits the draft and adds a short distribution plan (where the first players would come from). Do not invent numbers or claim validation. |

## C. Technical evidence (what exists)

| Item | Evidence | Status |
|---|---|---|
| Public demo, level 1, browser simulation | https://nobody-first.vercel.app (HTTP 200 on 2026-10-12); `evidence/stage4/DEPLOYMENT.md`; 136 checks in `evidence/stage4/screenshots-production/results.json` | MET (as a simulation) |
| Solidity contracts, level 1, 77 tests (7 suites, 3 of them toolchain smoke tests) | `contracts/evidence/contracts/tests.log:309`, run 2026-10-12 09:34 UTC (`GUARANTEES.md` §9) | MET (local only) |
| Late-failure rollback | `contracts/evidence/contracts/latefail-trace.log`, `latefail-README.md`, `GUARANTEES.md` §6 | MET (local tests; Anvil replay receipt by a reviewer, state not saved) |
| Local chain E2E in the browser | `evidence/stage3/e2e-results.json` lists 14 scenarios PASS. It merges two runs (`evidence/stage3/RUN-INSTRUCTIONS.md`): the round-4 full run passed 13 of 14 (S12b FAIL under the old replacement assertions, `evidence/stage3/logs/r4-e2e-run.log:271`), and S12 and S12b were re-run on a fresh deployment with adapted assertions, both PASS (`evidence/stage3/logs/r4-s12-run.log`). S12b is PASS with a stated limitation | MET with that caveat (local Anvil, chain 31337, test-only provider, not a real wallet) |
| Mutation testing | `GUARANTEES.md` §5: 30 of 31 killed; M06 survives | PARTIAL |
| Public chain deployment (any testnet or mainnet) | None (`OFFICIAL-REQUIREMENTS.md` tracks section; `evidence/stage4/DEPLOYMENT.md` = static upload) | NOT MET |
| Levels 2 and 3 | "Coming soon" on the public site; `contracts/README.md` "No levels 2 and 3" | NOT MET |
| Contract-level reset / new run | `contracts/README.md` "No reset"; public "Reset demo" is a page reset only | NOT MET |
| Security audit | `contracts/README.md` "Not an audit. No security review has been done." | NOT MET |
| Full implementation of the original brief (three levels, restart, public testnet, explorer links) | Brief sections 5, 6, 11 vs `contracts/README.md` Known limits | NOT MET (partial MVP) |

## D. Repository readiness (blocks field B6)

| # | Check | Evidence | Status | What to do |
|---|---|---|---|---|
| D1 | Any commit exists | `git rev-list --all --count` → 0 | NOT MET | First commit after D2–D11. Until that commit is pushed, nothing (including the now un-ignored evidence logs) reaches a clone. |
| D2 | Remote exists and judges can reach it | 404 unauthenticated (page and API) | UNKNOWN | User logs in to GitHub, creates `arlmango/NOBODYFIRST` if missing. |
| D3 | Secret scan of the **394** files that `git add .` would include (`git ls-files -o --exclude-standard \| wc -l` at 19:00 UTC, about 26 MB; includes the 113 now un-ignored `.log` files) | Grep for the full Anvil dev keys 0–2, `BEGIN … KEY`, the Anvil banner heading `Private Keys`, the dev mnemonic, `ghp_`, `sk-`, `AKIA`, `VERCEL_TOKEN=`: the only hit is `scripts/public/verify-staging.mjs:28`, a list of forbidden strings that contains the words `Private Keys` (a scan needle, not a key). Earlier scan (305 files): only the 16-hex needle `ac0974bec39a17e3` (prefix of the public Anvil test key) in three `e2e-results.json` files, `scripts/chain/e2e/scenarios-static.mjs`, `scripts/public/verify-staging.mjs`, `evidence/stage3/README-REDACTION.md`. No `.env` file in the list | MET (pattern scan only, not a guarantee) | Re-run the scan on `git diff --cached --name-only` right before the first commit. |
| D4 | `scripts/chain/.run/anvil.log` (contains dev keys) excluded | `.gitignore:21` `scripts/chain/.run/` (confirmed with `git check-ignore`) | MET | Keep. |
| D5 | `contracts/.tools/` (286 MB of binaries) excluded | `.gitignore` `contracts/.tools/` | MET | Keep. Judges must install Foundry 1.8.5 and solc 0.8.37 themselves; `contracts/foundry.toml` points `solc` at `./.tools/solc/solc-0.8.37` with `offline = true`, so a fresh clone **will not build** the contracts without those tools. Documented in `docs/submission/05-instructions-for-judges.md`. |
| D6 | `contracts/lib/forge-std` v1.17.0 (own `.git`, license `(Apache-2.0 OR MIT)` per its `package.json`) | Ignored by `.gitignore` `contracts/lib/`; not a submodule | PARTIAL | A fresh clone has no forge-std, so `forge test` fails there. Either add it as a git submodule pinned to v1.17.0, or follow `docs/submission/05-instructions-for-judges.md` step 3: `git clone --depth 1 --branch v1.17.0 https://github.com/foundry-rs/forge-std contracts/lib/forge-std` (expected commit `f3dae6e6ee381f25eb6a246f7da9b85c91a68219`). Do not commit its nested `.git` as a plain folder. |
| D7 | Evidence logs included in the repository | `.gitignore:30` `!evidence/**/*.log` (added after a secret scan; comment `.gitignore:29`). `git check-ignore` now leaves only `scripts/chain/.run/*` ignored outside tool/build folders (`anvil.log`, `preview.log`, pid and manifest copies) | MET | Keep `scripts/chain/.run/` ignored: `anvil.log` holds Anvil's dev keys. |
| D8 | LICENSE | No `LICENSE*` at the root or in `contracts/`. All 20 `.sol` files in `contracts/src` and `contracts/test` carry `// SPDX-License-Identifier: MIT`, but no license file grants it for the repository | NOT MET | Needed for the open-source criterion (§8). User picks a license (MIT would match the SPDX headers) and adds `LICENSE`. |
| D9 | Other names in the repository | `evidence/stage4/DEPLOYMENT.md` names the Vercel account `robertdipolson-3358` | USER ACTION | Confirm this account name may be published. |
| D10 | Large binary | `characters-and-items.png` 2.4 MB at the root | MET | Fine for GitHub (< 50 MB). |
| D11 | Rules §9: inform the Administrator of the status and ownership of open-source and third-party code | Runtime: React 19.3.0, react-dom 19.3.0, viem 2.57.4. Dev: Vite 8.3.4, @vitejs/plugin-react 6.1.2, TypeScript 7.0.2, Vitest 5.0.3, playwright-core 1.64.0, @types/react(-dom) 19.3.0 (`package.json`). Contracts: forge-std 1.17.0 (`contracts/lib/forge-std`, Apache-2.0 OR MIT); toolchain Foundry forge/cast/anvil 1.8.5 and solc 0.8.37 (`contracts/README.md`), used as tools, not shipped. No OpenZeppelin or other contract library (`contracts/lib` holds only forge-std). Art: image-model output (`src/assets/PROVENANCE.md`) | PARTIAL (list exists here; not yet in the form) | Paste this list into the form (pre-existing work / tools field) or the README. Licenses of the npm packages were not checked one by one; check `node_modules/<pkg>/package.json` if the form asks. |

## E. Tracks (rules §14)

Rule text: each ecosystem track rewards "best products that integrate with" the named chain; teams choose one ecosystem
(worldsfair page). Not stated by the organizers: whether a testnet counts, whether a local EVM prototype counts, and
how a track is selected in the form (`OFFICIAL-REQUIREMENTS.md`). **No track is chosen here; the choice is the user's.**

| Option | Does the evidence support "integrates with the chain"? | What it would need |
|---|---|---|
| No ecosystem track (main awards only: Grand Champion, Public Goods, University, next 20) | Not required. FAQ: "every submission is eligible for prizes regardless of the crypto infrastructure used." | Nothing extra. Weakness remains against §1 "leverage public blockchains" (section G). |
| Ethereum L1 | **No.** No deployment on Ethereum mainnet or any Ethereum testnet. The contracts are plain EVM Solidity and were run only on local Anvil (chain 31337). | A public deployment on the network the track accepts (UNKNOWN whether a testnet such as Sepolia counts), verified contract addresses, and the public site or a script that sends a real transaction. **Not done and not authorised in this task.** |
| Base | **No.** Same: no Base or Base testnet deployment. | Same as above, on Base. Not done, not authorised. |
| Arbitrum | **No.** Same: no Arbitrum or Arbitrum testnet deployment. | Same as above, on Arbitrum. Not done, not authorised. |
| Robinhood Chain, HyperEVM | **No.** No deployment. EVM-compatible per the track list, but not checked. | As above; requirements of these chains not researched. |
| Solana, Tempo, Zcash, Hypercore | **No.** The code is EVM Solidity; nothing targets these chains. | A rewrite for that chain. Not realistic before the deadline. |

**Does the Solidity prototype conform to the chosen track?** Precisely: the prototype is EVM-compatible Solidity
(0.8.37) that compiles and passes 77 tests locally, and it ran on a local Anvil chain. That shows it *could* be deployed
to an EVM chain; it does not show integration with any named chain. Whether a local-only EVM prototype satisfies any
ecosystem track is not stated by the organizers → **UNKNOWN**, and on the stated criterion ("integrate with") the
evidence is **NOT MET** for every named chain. Deploying to a public network inside 12 hours would also need new
secrets (a funded deployer key), a decision about which network, and re-verification of the public site; none of
that is authorised here.

## F. Judging criteria (rules §8)

| Criterion | Strengths (with evidence) | Weaknesses |
|---|---|---|
| Functionality (quality of code) | 77 Foundry tests, 3 of them toolchain smoke tests, including late-failure rollback (`contracts/evidence/contracts/tests.log:309`, `latefail-trace.log`); 30/31 mutants killed (`GUARANTEES.md` §5); local E2E: full run 13 of 14 + re-run of S12/S12b, both PASS (`evidence/stage3/e2e-results.json` merges both; `evidence/stage3/logs/r4-e2e-run.log`, `r4-s12-run.log`); 126 unit tests passed (`evidence/stage3/logs/r4-04-vitest.log:6`); public site checked with 136 checks (`DEPLOYMENT.md`); written trust-boundary document (`GUARANTEES.md`) | Only level 1. No public deployment. No audit. One run per player, no reset. Deployer initcode margin 1,068 B (2.2 %) limits extension (`GUARANTEES.md` §7). Fresh clone does not build contracts without manual tool setup (D5, D6). |
| Potential impact | A playable explanation of conditional, all-or-nothing exchange | No users, no validation, no audience research. Impact is a hypothesis. |
| Novelty | Conditional promises as separate NPC contracts plus a coordinator that settles one package atomically, explained as a puzzle | Close references exist (Ethernaut format, Tact; brief section 3). Uniqueness is not proven; do not claim "first". |
| UX ("How well does this Project Submission utilize blockchain to create great UX for downstream users?") | Local chain mode explains rejections in plain words with the contract error, reads results back from the chain, restores after reload, handles wrong network, declined requests, RPC failure, stale preview, replaced transactions (`SCREENSHOT-INDEX.md`) | **The public demo uses no blockchain at all.** Judges using the URL see a simulation. The chain UX exists only on a developer machine and in screenshots. |
| Open-source | Code is ready to publish after D1–D11; MIT SPDX headers in all `.sol` files | Repository not public, no commits, no LICENSE file (D1, D2, D8). |
| Business plan | An honest draft states that nothing is validated (`06-form-answers.md` §9) | No business model, distribution plan or demand data (B9). |

## G. Rules §1 "leverage public blockchains"

The objective in rules §1 is "to leverage public blockchains to build solutions and experiment with blockchain technology". The public demo sends no transaction,
and the contracts have never been on a public blockchain (`OFFICIAL-REQUIREMENTS.md`, other rules). This is the
submission's main weakness. It must be stated plainly in the description, the videos and the form (the scripts in 07
and 08 do so), not hidden. The rules do not say that a project without a public deployment is ineligible.

## H. Prioritized user actions (about 12 h left at 19:00 UTC)

Times are estimates for one person, including checks. Stop adding features; do the submission.

| Priority | Action | Est. time | Blocks |
|---|---|---|---|
| 1 | Register every member on colosseum.com; confirm eligibility (§3) and that Signor Scam is not a second submission (§7) | 15 min | A1, A3, A5 |
| 2 | Open the portal now, create the project draft, check which fields are mandatory and how a track is chosen | 15 min | A2, E |
| 3 | Repository: choose a LICENSE (MIT matches the SPDX headers); decide on forge-std (submodule or install note); re-run the secret scan on the staged list; first commit; create/push `arlmango/NOBODYFIRST`; make it public or grant access to hackathon@colosseum.com; open the link logged out | 60–90 min | B6, D1–D11, open-source |
| 4 | Record the demo video from `07-demo-video-script.md` (Plan A stills for local chain), edit, caption, upload, test link | 2–3 h | B8 |
| 5 | Record the pitch video from `08-pitch-video-script.md` after filling the [USER TO FILL] parts, upload, test link | 1.5–2 h | B7 |
| 6 | Confirm or edit the go-to-market draft in `06-form-answers.md` §9 and add a short distribution plan; say plainly that no validation exists | 30 min | B9 |
| 7 | Fill the remaining fields: name and description (01), blockchains and tools ("local EVM only"), team, location, logo, pre-existing work, third-party code list (D11) and AI-use disclosure; get permission from anyone appearing in the videos (B5a) | 30–45 min | B1–B5a, A6, D11 |
| 8 | Decide the track: main awards only, or an ecosystem track knowing the evidence does not show integration (E). Do not start a public deployment without a separate, explicit decision; it would not fit safely in the remaining time with verification | 10 min to decide | E |
| 9 | Final read-through of every pasted text against `04-implemented-and-limits.md`; submit; screenshot the confirmation | 30 min | A2 |
| — | Buffer for upload failures and portal issues | ≥ 2 h | — |

Total without buffer: about 6.5–9 h. Submit no later than about 04:00 UTC (09:00 +05:00, 9:00 pm PT on 12 Oct) to keep a buffer.
