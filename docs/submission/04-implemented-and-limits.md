# 04. What is implemented, and limitations (English, ready to paste)

Reviewer notes (Evidence: lines, local paths) are for verification; do not paste them into the portal.

## Implemented

**Public demo (browser simulation, level 1).** The site at https://nobody-first.vercel.app has a rooms page, the level-1 screen with promise selection, a preview, a simulated run and a result screen. Rooms 02 and 03 show "Coming soon". Nothing is sent to a blockchain. The public site was checked from a clean browser session with 136 checks, all passing.

Evidence: `evidence/stage4/DEPLOYMENT.md`; `evidence/stage4/screenshots-production/results.json` (136 entries, all `ok: true`).

**Frontend unit tests.** 126 tests in 8 test files pass (Vitest), in the round-4 run.

Evidence: `evidence/stage3/logs/r4-04-vitest.log` ("Test Files 8 passed (8)", "Tests 126 passed (126)").

**Solidity prototype (level 1).** Five production contracts (GameItems, NPC_A, NPC_B, NPC_C, AtomicCoordinator) and Level1Deployer. The 77 Foundry tests in 7 suites pass locally with Foundry 1.8.5 and solc 0.8.37. Of these, 74 test NOBODY FIRST rules (permissions, rejection codes, late-failure rollback, fault injection, wiring, happy path) and 3 are toolchain smoke tests.

Evidence: `contracts/evidence/contracts/tests.log` line 309 ("77 tests passed, 0 failed, 0 skipped"); `contracts/test/ToolchainSmoke.t.sol` (3 tests); `contracts/evidence/contracts/versions.txt`; `contracts/evidence/contracts/tests-by-suite-*.log`.

**Late-failure rollback.** A test makes the second character fail after the first has moved its item, and checks that the listed state fields are unchanged afterwards. A manual replay on a local Anvil chain produced a reverted transaction with status 0x0 and no logs; the project scripts do not produce this replay.

Evidence: `contracts/test/Level1LateFailure.t.sol`; `contracts/evidence/contracts/latefail-README.md`; `contracts/evidence/contracts/reviewer5-artifacts/` (receipt and trace files, with SHA-256 values).

**Mutation check.** A 31-mutant run found 30 mutants detected by the final suite. The one survivor (M06) removes the `ConservationViolated` check, a branch no test reaches.

Evidence: `contracts/evidence/contracts/GUARANTEES.md` section 5; `contracts/evidence/contracts/reviewer5-artifacts/mutation-results-round2.txt`.

**Local-chain integration (development build).** The browser flow was run against a local Anvil chain (chainId 31337) with the contracts deployed by Level1Deployer. The round-4 full run passed 13 of 14 scenarios: S12b failed two display checks. S12 and S12b were then re-run with adapted checks and passed. The combined result file records 14 scenarios PASS, with S12b carrying a documented limitation. The scenarios cover a reload that does not re-send a transaction, a rejected transaction, a lost RPC connection, an Anvil restart, a run changed outside the page, a cancelled transaction, and a replacement transaction.

Evidence: `evidence/stage3/e2e-results.json` (combined, 14 PASS); `evidence/stage3/logs/r4-e2e-run.log` (ends with `== S12b FAIL`, `EXIT=1`); `evidence/stage3/logs/r4-s12-run.log` (S12 and S12b re-run, `EXIT=0`); `evidence/stage3/RUN-INSTRUCTIONS.md`.

**Size check.** Level1Deployer initcode is 48,084 bytes against the 49,152-byte EIP-3860 limit.

Evidence: `contracts/evidence/contracts/sizes.log` line 16.

**Reviews.** Separate AI review agents checked the contracts and tests during development, including a 31-mutant run (30 detected) and a manual local Anvil replay. This is not a security audit, and no human security review has been done.

Evidence: `contracts/README.md` line 63 ("Not an audit. No security review has been done."); `contracts/evidence/contracts/GUARANTEES.md` section 5 (mutation work).

## Not implemented

- Levels 2 and 3 (the game's second and third rooms).
- Any public deployment of the contracts, on a testnet or mainnet.
- A wallet connection and any transaction in the public site.
- A backend and NFTs (both are out of scope in the project README).

Evidence: `contracts/README.md` line 3 ("Not in scope: levels 2 and 3"); `evidence/stage4/DEPLOYMENT.md` (static upload, no environment variables, no backend); `README.md` (Local chain mode not in the public build).

## Limitations

1. **No public deployment.** No contract is deployed to a public network. There is no public contract address and no public transaction.
2. **The public demo is a simulation.** It is a browser demo of level 1. It sends no blockchain transaction and does not connect a wallet.
3. **Levels 2 and 3 are absent.** The public site shows "Coming soon" for rooms 02 and 03.
4. **One run per player address, no contract reset.** `startRun` uses the caller's address as the run id, so a second run by the same address reverts. The contracts have no function to reset a run or redeploy the level. "Reset demo" on the public site resets only the browser simulation.
5. **No security audit.** This is not a security audit, and no human security review has been done.
6. **Trust boundary.** Each guarantee holds only for the set created by Level1Deployer. The NPCs store the snapshot and plan hashes they are given and compare them for equality; they do not recompute them. `validatePlan` and `isGoalSatisfied` judge only the arguments they are passed.
7. **Test coverage gaps.** The `ConservationViolated` check is not reached by any test. Two other defensive branches (`RunNotActive` and rejection code 10 with the production NPCs) are also not reached.
8. **Little room for growth.** The initcode margin is 1,068 bytes (about 2.2%). Each NPC's creation code is embedded in the deployer, so any growth in the shared base contract is multiplied by three. The optimizer is off (the Foundry default).
9. **Local tests only.** Anvil results come from a local chain (chainId 31337), not from a public network. The browser E2E injects a test-only EIP-1193 provider; it is not a real wallet.
10. **Accessibility is not tested.** No accessibility conformance has been tested or claimed.
11. **Stale project README sections.** The stage-1 sections of `README.md` contain older test counts and copy. The top section is current.
12. **Repository state.** The GitHub repository `arlmango/NOBODYFIRST` exists and is **private**; its first published commit is `0daf26d` on `main`. Access for the judges (hackathon@colosseum.com) has **not been confirmed**. No license file exists yet (the `.sol` files carry an MIT SPDX header; see `06`). The evidence logs under `evidence/**/*.log` are tracked in that commit; the toolchain (`contracts/.tools/`) and forge-std (`contracts/lib/`) are not, so a clone needs them installed as in `05` before the contract tests run. `scripts/chain/.run/anvil.log` is not evidence and stays ignored.

Evidence: items 1-3: `evidence/stage4/DEPLOYMENT.md`, `contracts/README.md` line 3, public site (`https://nobody-first.vercel.app`); item 4: `contracts/evidence/contracts/GUARANTEES.md` section 2 and `contracts/README.md` "Known limits" (line 69-70); item 5: `contracts/README.md` line 63; item 6: `contracts/evidence/contracts/GUARANTEES.md` section 2; item 7: `contracts/evidence/contracts/GUARANTEES.md` section 4 and `contracts/test/Level1FaultInjection.t.sol` header; item 8: `contracts/evidence/contracts/sizes.log` and `GUARANTEES.md` section 7; item 9: `evidence/stage3/RUN-INSTRUCTIONS.md`, `scripts/chain/README-chain.md`, `GUARANTEES.md` section 6; item 10: `README.md` (stage-1 "Known limits"); item 11: `README.md` lines 16-18; item 12: `git log` (`0daf26d`), `ls` (no LICENSE file in the project root), `contracts/src/*.sol` (SPDX header).
