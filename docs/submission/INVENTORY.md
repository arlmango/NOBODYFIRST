# Inventory of submission materials

Checked 2026-10-12 by haiku-sub (model claude-haiku-5-5). Status values: **ready** (usable as is), **ready with caveats** (usable after the note), **needs user** (a decision or input from the team), **missing** (does not exist).

## Public demo and deployment

| Item | Path or URL | What it is | Status |
|---|---|---|---|
| Public demo | https://nobody-first.vercel.app | Static browser simulation of level 1. The root URL returns HTTP 200 and shows the rooms page. The level is at the hash route `#/room/1`; the path `/room/1` also returns HTTP 200 but shows the rooms page. No blockchain transaction is sent. | ready |
| Deployment record | `evidence/stage4/DEPLOYMENT.md` | Vercel static upload, sha256 checked against the staging manifest. Production alias open; deployment-specific URLs use Vercel Authentication. | ready |
| Public site checks | `evidence/stage4/screenshots-production/results.json` | 136 checks, all `ok: true`, run from a fresh unauthenticated browser on 2026-10-12 (startedAt 17:55 UTC). | ready |
| Final public screenshots | `evidence/stage4/screenshots-production-final/` | PNG: `{1440,390}-{rooms,level,review,result}.png`. | ready |
| Public build scripts | `scripts/public/stage.mjs`, `scripts/public/verify-site.mjs`, `scripts/public/verify-staging.mjs` | Build staging, site verification. | ready |

## Repository and documentation

| Item | Path | What it is | Status |
|---|---|---|---|
| Project README | `README.md` | The top section (public demo, stage 4) is current. Sections below it are stage-1 history and contain stale numbers (26 unit tests, 113 browser checks, "design preview" copy). | ready with caveats: do not quote the stage-1 numbers |
| Contracts README | `contracts/README.md` | Commands for forge tests, evidence list, known limits. | ready |
| Contract spec | `contracts/SPEC.md` | Interface spec for the level-1 contracts. Two stale lines are noted in `contracts/evidence/contracts/GUARANTEES.md` section 10 (`snapshotHashFor` listed as view; `before` check described as keccak comparison). | ready with caveats |
| Guarantees and limits | `contracts/evidence/contracts/GUARANTEES.md` | Trust boundary, rejection codes, mutation results, late-failure evidence status, initcode margin, Foundry cache note. | ready |
| Chain tooling README | `scripts/chain/README-chain.md` | Local Anvil tooling and the test-only provider. | ready |
| Local run instructions | `evidence/stage3/RUN-INSTRUCTIONS.md` | Commands for the local-chain browser E2E. | ready |
| Submission requirements | `docs/submission/OFFICIAL-REQUIREMENTS.md` | Verified contest facts (authoritative for this package). | ready |
| Internal checklist | `docs/CHECKS.md` | Internal verification checklist. Not for judges. | internal |
| Original brief | `/Users/mango/Downloads/NOBODY_FIRST_handoff_RU.txt` | Russian project brief (idea, mechanics, honesty rules). Not for judges. | internal |

## Contracts and tests

| Item | Path | What it is | Status |
|---|---|---|---|
| Solidity sources | `contracts/src/` | GameItems, NpcBase, NPC_A, NPC_B, NPC_C, AtomicCoordinator, Level1Deployer, types and interfaces. | ready |
| Solidity tests | `contracts/test/` | 7 suites, 77 tests (74 for NOBODY FIRST, 3 toolchain smoke tests in `ToolchainSmoke.t.sol`). Result in `contracts/evidence/contracts/tests.log` line 309: "77 tests passed, 0 failed, 0 skipped". | ready |
| Contract evidence | `contracts/evidence/contracts/` | Logs, sizes (`sizes.log`), selectors, late-failure docs, mutation results, hashes. | ready |
| Foundry toolchain | `contracts/.tools/` | forge, cast, anvil 1.8.5 and solc 0.8.37 binaries. **Gitignored** (`.gitignore`: `contracts/.tools/`). Present only on this machine. | needs user: a judge must install the same toolchain |
| Forge dependency | `contracts/lib/forge-std/` | Test library. **Gitignored** (`contracts/lib/`). | needs user: same as above |

## Browser and local-chain evidence

| Item | Path | What it is | Status |
|---|---|---|---|
| Local-chain E2E results | `evidence/stage3/e2e-results.json` | Combined result: 14 scenarios `PASS` (S1, S1b, S2 to S12, S12b). Local Anvil, local preview build, test-only provider. The round-4 full run failed S12b; S12 and S12b were re-run with adapted checks (see next row). | ready with caveats: not a wallet flow; S12b has a stated limitation |
| E2E run log | `evidence/stage3/logs/r4-e2e-run.log` | Round-4 full run. Ends with `== S12b FAIL` and `EXIT=1`: 13 of 14 scenarios passed; S12b failed two display checks. | ready: keep as the record of that run |
| Unit test logs | `evidence/stage3/logs/r4-04-vitest.log` | "Test Files 8 passed (8)", "Tests 126 passed (126)". | ready |
| Typecheck and build logs | `evidence/stage3/logs/r4-03-tsc.log`, `r4-05-build.log` | Round-4 typecheck and build output. | ready |
| Stage-3 logs | `evidence/stage3/logs/` | Anvil, deploy, scenario logs. Not ignored: `.gitignore` line 30 (`!evidence/**/*.log`) un-ignores them. Also includes the re-run `r4-s12-run.log` (EXIT=0). | ready (tracked in commit `0daf26d`) |
| Deployment manifests | `evidence/stage3/deployment-manifest.json` | Local-chain addresses from the test run. Local only; no public deployment exists. | ready |

## Screenshots and design

| Item | Path | What it is | Status |
|---|---|---|---|
| Stage-1 screenshots | `docs/screenshots/` (PNG) | Produced by the stage-1 browser script (`scripts/e2e/run.mjs`). Copy may predate the public build. | ready with caveats: re-shoot before use |
| Design kit | `/Users/mango/Downloads/nobody-first-design/` | 8 PNG mockups (imagegen, not the built UI) and `DESIGN-HANDOFF.md` (Russian). | ready as design reference; do not present as product screenshots |
| Design handoff | `/Users/mango/Downloads/nobody-first-design/DESIGN-HANDOFF.md` | Says the mockups were not browser-checked and the Impeccable audit was not run. | ready |
| Character sheet | `characters-and-items.png` (repo root) | Source sheet for the three portraits and two items. | ready as source material; not a logo |
| Portraits and items | `src/assets/portraits/{a,b,c}.png`, `src/assets/items/{key,coin}.png` | Transparent PNGs used by the UI. | ready |

## Video

| Item | Path | Status |
|---|---|---|
| Pitch video (2 to 3 min) | none found | missing: needs user (script written: `08-pitch-video-script.md`; video not recorded) |
| Product-demo video (up to 3 min) | none found | missing: needs user |

Search scope: the project directory (excluding `node_modules`) and `/Users/mango/Downloads/nobody-first-design/`. No `.mp4`, `.mov` or `.webm` files were found.

## Logo and graphic

| Item | Status |
|---|---|
| Dedicated logo | missing: needs user |
| Candidates | portrait crops from `src/assets/portraits/`; a crop of `characters-and-items.png`; a frame from the final screenshots. None has been chosen or checked for use rights. |

## License

| Item | Status |
|---|---|
| Project license file (root `LICENSE`) | missing: no license file in the project. The `.sol` files carry `SPDX-License-Identifier: MIT`, so a LICENSE file matching that header is a USER action. Only third-party licences exist in `contracts/lib/forge-std/` (LICENSE-APACHE, LICENSE-MIT). Needs user decision. |

## Repository state

| Item | Value | Status |
|---|---|---|
| Git | `main`, first published commit `0daf26d` (394 files); working tree clean at that commit | ready |
| Remote | `origin` = `https://github.com/arlmango/NOBODYFIRST.git` | configured |
| Reachability | The repository exists and is **private**: an unauthenticated GET returns 404, which GitHub also returns for private repositories. It was pushed from this machine, so it exists. | ready (private) |
| Ignored files that matter for a clone | `.gitignore` ignores `*.log` except `contracts/evidence/**`, `docs/evidence/*.log` and `evidence/**/*.log` (line 30). `scripts/chain/.run/anvil.log` stays ignored: it contains Anvil's banner with public dev keys; it is not evidence and must not be shown, `contracts/.tools/`, `contracts/lib/`, `contracts/out/`, `contracts/cache/`, `contracts/deployments/`, `dist-public/`, `.vercel/`. A clone lacks the toolchain and forge-std until they are installed as in `05`. The evidence logs are tracked in commit `0daf26d`. | ready with caveats |
| Access for judges | FAQ: private repositories are allowed if access is granted to hackathon@colosseum.com. **Not confirmed**: whether that access has been granted is not recorded here. | needs user |

## Team and admin items (not in the repo)

| Item | Status |
|---|---|
| Team members, backgrounds, Colosseum accounts | missing: needs user |
| Team location | missing: needs user |
| Track selection | not selected: see `09-requirements-matrix.md` (owned by another agent) |
| Eligibility confirmation (rules §3) | needs user (only the user can confirm) |
