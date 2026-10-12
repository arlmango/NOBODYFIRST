# NOBODY FIRST: submission package (index)

Reviewer notes (Evidence: lines, local paths) are for verification; do not paste them into the portal.

Package for the Crypto World's Fair Hackathon (Colosseum). Contest facts are in `OFFICIAL-REQUIREMENTS.md`, which is authoritative for this package.

**Read this first:** the public site is a browser simulation of level 1 and sends no blockchain transaction. The Solidity contracts and the local-chain integration were tested locally (Foundry, Anvil). There is no public contract deployment, no public transaction, and levels 2 and 3 are not implemented. There is no security audit; separate AI review agents and the project's own tests are the only checks.

## Files

| File | Purpose | Status |
|---|---|---|
| `OFFICIAL-REQUIREMENTS.md` | Verified contest facts, portal fields, rules that affect the submission | owned by the orchestrator |
| `INVENTORY.md` | Every material for the submission, with path and status | ready for review |
| `01-short-description.md` | Tagline, description under 280 characters, about 100-word description, test-count disclosure | ready |
| `02-problem.md` | The problem and its honest scope | ready |
| `03-solution-and-atomic-exchange.md` | Rules, mechanics, what "atomic" does and does not mean | ready |
| `04-implemented-and-limits.md` | What is implemented, what is not, and the limitations | ready |
| `05-instructions-for-judges.md` | 60-second path on the public site, toolchain setup, local test commands, where evidence lives | ready; commands not run from a clean clone |
| `06-form-answers.md` | Answers for each portal field | has [USER TO FILL] and [USER TO CONFIRM] items |
| `07-demo-video-script.md` | Demo video script | written by another agent; video not recorded |
| `08-pitch-video-script.md` | Pitch video script | written by another agent; video not recorded |
| `09-requirements-matrix.md` | Requirement-by-requirement matrix, including the track decision | written by another agent |

## Key facts (with their sources)

- Public demo: https://nobody-first.vercel.app, a static browser simulation. 136 browser checks passed: `evidence/stage4/screenshots-production/results.json`.
- Solidity: 77 tests in 7 suites pass locally (74 for NOBODY FIRST, 3 toolchain smoke tests): `contracts/evidence/contracts/tests.log` line 309.
- Frontend unit tests: 126 pass: `evidence/stage3/logs/r4-04-vitest.log`.
- Local-chain browser E2E: the round-4 full run passed 13 of 14 (S12b failed two display checks); S12 and S12b were re-run and passed; the combined result file records 14 PASS with a documented limitation: `evidence/stage3/e2e-results.json`, `evidence/stage3/logs/r4-s12-run.log`.
- No security audit has been done. Separate AI review agents checked the contracts during development; this is not a security audit, and no human security review has been done.

## Open items before submission

The list of [USER TO FILL] and [USER TO CONFIRM] items is in `06-form-answers.md`. The repository exists and is private; its first published commit is `0daf26d`. Access for the judges is not confirmed. There is no LICENSE file (the `.sol` files carry an MIT SPDX header).
