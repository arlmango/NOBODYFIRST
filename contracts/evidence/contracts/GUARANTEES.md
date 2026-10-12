# Level 1 contracts: what is guaranteed, by whom, and how far the evidence goes

Status: documentation of the stage-2 level-1 contracts as they are in `contracts/src/` on the day of this pass. No contract, test or script was changed. This pass ran **no** forge, cast, anvil, solc, npm or build command (see section 9). Every claim cites `file:line` in the repository, or a saved evidence file. Anything without support is marked **NOT EVIDENCED**.

Citation convention: `src/X.sol:N` is relative to `contracts/`. `test/X.t.sol:N` likewise. Evidence files are in `evidence/contracts/`.

---

## 1. Scope

- The guarantees below refer only to the set of contracts created by `Level1Deployer` (`src/Level1Deployer.sol:25-42`): `GameItems`, `NPC_A`, `NPC_B`, `NPC_C` and `AtomicCoordinator`, wired to each other through immutable constructor arguments. The deployer checks each created address against its CREATE-nonce prediction (`src/Level1Deployer.sol:26-41`), and `test/Level1Wiring.t.sol` covers that wiring (for example `test_Wiring_AddressesMatchDeployerCreateNonces`, line 57).
- They do **not** apply to any other contract that implements the same interfaces (`src/interfaces/INpc.sol`, `src/interfaces/IGameItems.sol`). A different coordinator, NPC or ledger with the same ABI carries none of these guarantees, because each guarantee depends on the specific wiring and code described in section 2.
- Out of scope: levels 2 and 3, the frontend, a security audit (none has been done; see `README.md`).

## 2. Trust boundary

Column meanings: **verifies itself** = the check is in this contract's own code; **takes as given** = the value is accepted from a caller and not checked here.

| Component | Verifies itself | Takes as given | Where |
|---|---|---|---|
| `GameItems` | `grantInitial`: caller is the coordinator (`src/GameItems.sol:39`), once per run (`:40`). `transferFromNpc`: caller is a registered NPC address (`:51-52`, `npcIdOf` `:96-101`), run was granted (`:53`), item in {KEY, COIN} (`:54`), `toNpc` in range (`:55`), not self (`:56`), qty > 0 (`:57`), sufficient balance (`:62`). | `runId` (any value; only checked to be granted). Which NPC is calling is taken from `msg.sender`, not from an argument. **It does not verify any permit**: there is no permit state in this contract (`:50-68`). | `src/GameItems.sol:38-68`, `:96-101` |
| `NpcBase` (A, B, C) | Coordinator-only gate and reentrancy lock (`src/NpcBase.sol:178-182`). In `authorize`: live `before` equals `items.snapshotBalances(runId)`, element by element (`:147-151`), then its own plan check (`:152`). Plan check: own outgoing and incoming shape (`:204-240`), stock measured only against `before` (`:244-258`), observer rule (`:263`), goal on expected final holdings (`:265`). In `release`: permit exists (`:163`), offer, snapshot and plan hashes equal the stored permit (`:164-166`); permit deleted before the ledger call (`:167`). | `plan`, `offerId`, `runId`, and `before` in `validatePlan` (`:112-117`; `runId` is unnamed and unused). `snapshotHash` and `planHash` in `authorize`/`release`: **stored exactly as given** (`:153`) and **compared for equality only** (`:164`). They are never recomputed here (no hashing code in this file). | `src/NpcBase.sol:63-77`, `:112-117`, `:136-172`, `:178-268` |
| `NPC_A`, `NPC_B`, `NPC_C` | Nothing of their own. Each only passes fixed terms to `NpcBase` (A: give 1 KEY to B, need 1 COIN from B, goal 1 COIN; B: give 1 COIN to A, need 1 KEY from A, goal 1 KEY; C: observer, offer NONE, goal 0/0). The production classes do not override `release` or `isGoalSatisfied`. | Nothing beyond the constructor arguments (`items`, `coordinator`). | `src/NPC_A.sol:8-26`, `src/NPC_B.sol:8-26`, `src/NPC_C.sol:8-26` |
| `AtomicCoordinator` | Run owner (`src/AtomicCoordinator.sol:125`), not solved/active/nonce (`:126-128`). Reads live balances itself (`:130`) and recomputes the snapshot hash from live state (`:131-132`). Package: length, range, duplicates, observer must be NONE, offer belongs to the NPC (`:232-248`). Transfers are derived only from each NPC's `outgoing()` (`:251-272`), with a shape sanity check (`:261-264`). Stock (`:283-285`), conservation (`:302`), expected final balances (`:290-294`). Each NPC validates (`:145`). Permits collected in npcId order (`:307-316`); snapshot unchanged after prepare (`:313`). Release in npcId order (`:152-155`). Final: actual == expected (`:322`), no permits remain (`:325`), each NPC's `isGoalSatisfied` (`:328`). | `package` (the `Selection[]`: which offer each NPC uses), `expectedNonce` and `expectedSnapshotHash` (checked against the recomputed value, `:128`, `:132`). The NPC and ledger addresses are immutable constructor arguments (`:89-100`). | `src/AtomicCoordinator.sol:89-100`, `:106-166`, `:232-330` |
| `Level1Deployer` | Predicts CREATE addresses for nonces 1..5 and checks each created address (`src/Level1Deployer.sol:26-41`, `_check` `:53-55`). No state-changing function afterwards (comment `:11-14`). | Nothing. | `src/Level1Deployer.sol:25-56` |
| `validatePlan` and `isGoalSatisfied` (public views on each NPC) | Judge only the arguments passed in. `validatePlan` takes `before` as an argument and does not read the ledger (`src/NpcBase.sol:112-117`); `isGoalSatisfied` takes `finalBalances` as an argument (`:125-128`). **A successful view call does not, by itself, confirm the real state of any run.** | Everything (`before` / `finalBalances`, `runId` is ignored). | `src/NpcBase.sol:112-128` |

Points that follow from the table:
- `release` ignores the plan and spends only the NPC's immutable give terms (`src/NpcBase.sol:168-170`); whatever hashes it is given, an NPC can lose at most its fixed offer, once, and only while a matching permit exists.
- The coordinator never calls `authorize` on NPC_C (`src/AtomicCoordinator.sol:309-310`: only when `p.sends[id]`; C's `outgoing(OFFER_NONE)` returns no transfer, `src/NpcBase.sol:106`). A direct call to C with NONE reverts `NothingToAuthorize` (`:145`); with any other offer, C rejects it as UNKNOWN_OFFER. C's check inside `execute` therefore runs only in step 6 (`src/AtomicCoordinator.sol:145`) on `p.before`, which is the coordinator's own live read (`:130`).
- The NPC-side "live `before`" check exists only in `authorize` (`src/NpcBase.sol:147-151`). Calls to `validatePlan` by anyone use whatever `before` the caller supplies.
- `isGoalSatisfied` is `virtual` (`src/NpcBase.sol:125`); the test fixture `LateFailNpcB_Final` overrides it (`test/harness/LateFailNpcB.sol`, see section 6 and `evidence/contracts/latefail-README.md`). `ENTRYPOINTS.md` records that no override exists in production `src/`.

## 3. Rejection codes and the tests that reach them

Codes are defined in `src/Types.sol:49-58`. "Via execute" means the code is produced inside `AtomicCoordinator.execute` (a test calls `execute` and the revert names the NPC). "Direct" means a test calls `validatePlan` or `authorize` on the NPC itself. Test file:line is the `vm.expectRevert` line.

| Code | Name | Via execute | Direct call | Standalone fixture | Notes |
|---|---|---|---|---|---|
| 1 | UNKNOWN_OFFER | **No.** The coordinator fires first: `UnknownOffer` in `_parsePackage` (`src/AtomicCoordinator.sol:245`), tested at `test/Level1Exchange.t.sol:271-279` as a coordinator error. | `test/Level1NpcValidation.t.sol:53-54` (A with B1), `:55-56` (C with A1); `test/Level1Permissions.t.sol:183-185` (`authorize` by a pranked coordinator, C with A1) | no | |
| 2 | OWN_TRANSFER_MISSING | not reached by any test. Derived from source: a selected offer always produces its transfer through `outgoing()` (`src/AtomicCoordinator.sol:259-266`), so this cannot fire through `execute`. | `test/Level1NpcValidation.t.sol:61-62` (B1 with only A's transfer) | no | |
| 3 | OWN_TRANSFER_MISMATCH | not reached by any test. Derived from source as for code 2. | `test/Level1NpcValidation.t.sol:67-68` (qty 2), `:73-74` (duplicate own transfer), `:143-146` (A), `:149-152` (B) | no | |
| 4 | INCOMING_MISSING | **Yes**: `test/Level1Exchange.t.sol:205-213` (only A1 selected, expects `npcA`) | `test/Level1NpcValidation.t.sol:77-78`; `test/Level1Permissions.t.sol:189-190` (authorize); `:256-257` (authorize, after the BeforeMismatch check) | no | |
| 5 | INCOMING_MISMATCH | not reached by any test. Derived from source: the coordinator only derives exact transfers (`src/AtomicCoordinator.sol:251-272`). | `test/Level1NpcValidation.t.sol:83-84` (A), `:123-124` (A), `:127-128` (B), `:133-134` (A), `:137-138` (B), `:160-161` (A), `:165-166` (B) | no | Field-by-field checks: test function `test_NpcValidatePlan_IncomingSourceQtyRecipientMultiplicity` (`:116`). |
| 6 | UNEXPECTED_INCOMING | **Yes**: `test/Level1Exchange.t.sol:216-224` (only B1 selected, expects `npcA`) | `test/Level1NpcValidation.t.sol:89-90` (C receives) | no | |
| 7 | UNEXPECTED_OUTGOING | not reached by any test. C has no offer, so the coordinator never derives a C transfer. | `test/Level1NpcValidation.t.sol:96-97` (C sends) | no | |
| 8 | INSUFFICIENT_STOCK | **No.** The coordinator's `InsufficientStock` fires at step 5 (`src/AtomicCoordinator.sol:285`), before any NPC validates (step 6, `:145`). | `test/Level1NpcValidation.t.sol:102-103` (A with `before` KEY = 0) | no | Covered only by direct `validatePlan`. |
| 9 | GOAL_NOT_MET | **Yes**: `test/Level1Exchange.t.sol:194-202` (all NONE; A is the first validator; expects `npcA`) | `test/Level1NpcValidation.t.sol:108-109` (A with an extra COIN) | no | |
| 10 | OBSERVER_TOUCHED | **No.** Unreachable with production NPCs: codes 7 and 6 fire first (`src/NpcBase.sol:226-238`, `:263`). | none | `test/Level1FaultInjection.t.sol:202-204` uses `RejectingObserverC` (`test/harness/FaultFixtures.sol:123-127`), which **itself** reverts `PlanRejected(NPC_C_ID, OBSERVER_TOUCHED)`. The `NpcBase` branch at `src/NpcBase.sol:263` is **not** executed by this test. | See section 4. |

Other NPC errors reached (not rejection codes): `Reentrancy` (`test/Level1FaultInjection.t.sol:161-166`), `NothingToAuthorize` (`test/Level1Permissions.t.sol:174-182`), `PermitExists` (`:266-278`), `BeforeMismatch` (`test/Level1Permissions.t.sol:199-220`, `:244-263`), `NoPermit` and `PermitMismatch` (`:281-320`), `NotCoordinator` (`test/Level1Permissions.t.sol:145-160` for release, `:161-172` for authorize).

## 4. Unreachable or untested defensive branches

These are not covered by a test that reaches them. The reasons given are the ones written in the header of `test/Level1FaultInjection.t.sol:15-25` and in `test/Level1NpcValidation.t.sol:42-43`, plus what the source shows.

| Branch | Location | Status | Reason |
|---|---|---|---|
| `AtomicCoordinator.ConservationViolated` | `src/AtomicCoordinator.sol:302` | Not reached, no test expects it. | Header `test/Level1FaultInjection.t.sol:16-18`: every transfer subtracts and adds the same qty of the same item, and `InvalidTransfer` bounds item and npcId. Defence in depth. Mutant M06 (remove this check) survives in both mutation rounds (section 5). |
| `AtomicCoordinator.RunNotActive` | `src/AtomicCoordinator.sol:127` | Not reached, no test expects it. | Header `test/Level1FaultInjection.t.sol:19-20`: a run becomes inactive only together with `solved = true`, and `AlreadySolved` (`:126`) is checked first. |
| NPC rejection code 10 `OBSERVER_TOUCHED` | `src/NpcBase.sol:263` | Not reached with production NPCs. | Header `test/Level1FaultInjection.t.sol:21`; comment `test/Level1NpcValidation.t.sol:42-43`. The fixture test (section 3) does not execute this branch. |
| `Level1Deployer.PredictionMismatch` | `src/Level1Deployer.sol:16`, `:54` | Not reached, no test expects it. | Header `test/Level1FaultInjection.t.sol:24-25`: CREATE addresses are deterministic and the constructor uses only nonces 1..5. |
| `Level1Deployer.UnsupportedNonce` | `src/Level1Deployer.sol:17`, `:47` | Not reached, no test expects it. | Same header. `predict` is public, but no test calls `predict(` (grep of `test/` finds no call; the error name appears only in the header comment). |
| `GameItems.AlreadyGranted` | `src/GameItems.sol:40` | **Tested, but only via a pranked coordinator**: `test/Level1Permissions.t.sol:68-74` (`vm.prank(address(coord))`). | Not reachable through the production path: `grantInitial` is called only from `startRun` (`src/AtomicCoordinator.sol:111`). A second grant would need `_granted[runId]` true while `_runs[runId].owner == address(0)`; `startRun` sets the owner before the grant (`src/AtomicCoordinator.sol:109,111`) and the owner is never cleared. `startRun` also reverts `RunExists` first (`:108`). |

## 5. Mutation testing

Mutants were applied to a copy of the source by the reviewer (reviewer-5), not in the repository. The definitions are the scripts `mut.py`, `mut2.py`, `mutR2.py` (copies in `evidence/contracts/reviewer5-artifacts/`).

**Round 1 (against the first 64-test suite, reviewer-5).** 31 mutants: 16 killed, 15 survived. Source: `evidence/contracts/reviewer5-artifacts/mutation-results-round1.txt` (byte copy, SHA-256 in `reviewer5-artifacts/README.md`). Survivors: M01, M03, M06, M08, M09, M10, M11, M12, M13, M25, M26, M27, M29, M30, M31. Several of them were then killed by the tests added in round 2 (for example M01 by `test_Fault_PermitConsumedBeforeLedgerCall`, per `mutation-results-round2.txt`).

**Round 2 (against the final 77-test suite, reviewer-5 independent re-run).** 31 mutants: 30 killed, 1 survived: **M06 (drop the ConservationViolated check)**. Source: `reviewer5-artifacts/mutation-results-round2.txt` (`M06_drop_conservation EXIT=0 SURVIVED ('77', '0')`).

**Why M06 survives (the reviewer's analysis, not a test).** The reviewer's reasoning, as recorded in the reviewer's report: the simulated transfer subtracts and adds the same quantity of the same item; ids are bounded by `InvalidTransfer` (`src/AtomicCoordinator.sol:262-264`); and checked arithmetic would panic before any mismatch. This is an argument, not a test result. No test in the suite reaches `ConservationViolated`, so the survival is consistent with section 4.

**Author's scratch run.** `evidence/contracts/mutation-results-author.txt` (copied unchanged; the header says it was an author scratch run and that the reviewer re-ran independently). Result: 30 killed, 1 survived (M06). Some test-name lists are **empty** for M01, M02 and M18 in that file; the file does not say why, so the empty lists are not evidence of which test killed them.

**What is preserved and what is not.**

| Item | Status |
|---|---|
| Round-1 and round-2 result summaries (byte copies), mutant scripts `mut.py`, `mut2.py`, `mutR2.py`, author's file | **Preserved** in `evidence/contracts/reviewer5-artifacts/` and `evidence/contracts/` |
| Per-mutant raw forge logs | **Not preserved.** They remain only in the reviewer's scratch directory `/private/tmp/claude-501/-Users-mango-NOBODYFIRST/98af9731-d60f-4f75-9ccd-d2bf0a46ecf5/scratchpad/reviewer5/mut/` and `.../mutR2/`. That path is outside the project and may be deleted. |
| Reviewer's narrative (which test kills which mutant beyond the result lists, reasons for each survival) | **Only in the reviewer's report.** Not reproduced here beyond M06. |

## 6. Late failure on a real local chain: evidence status

What the in-process tests show (these are the accepted proof and are not affected by the Anvil material below):
- `test/Level1LateFailure.t.sol` uses unmodified production `GameItems`, `NPC_A`, `NPC_C` and `AtomicCoordinator`, and a fixture NPC B (`test/harness/LateFailNpcB.sol`) that overrides only `release` or `isGoalSatisfied` (header `:7-14`). All six tests pass (`evidence/contracts/tests-by-suite-Level1LateFailure.log`, "6 passed").
- Field-by-field rollback comparison is in `test/Level1LateFailure.t.sol` and `test/harness/Level1TestBase.sol` (`FullState`, `assertStateEq`), per `evidence/contracts/latefail-README.md`, section "Fields compared".

What the reviewer did on a local Anvil chain (reviewer's own manual replay, **not** produced by `scripts/run-stage2.sh`):

Files in `evidence/contracts/reviewer5-artifacts/` (originals in the reviewer's scratch directory, SHA-256 unchanged after copy):

| Saved file | SHA-256 | Shows |
|---|---|---|
| `latefail-tx.txt` | `9da5f643c1c4b887520218062d24b7e5eef5956b2f51dcad06cba263e68eb39b` | Transaction hash `0x9d3ffbf7ef92741602d6a38ebc85c0fdd79fd3d19bb91ac64272b60af45d987a`. |
| `latefail-anvil-receipt.json` | `deea743de0dd8b5a28b2a095c9975332cf00a8c77637762902e9d3d10de0a6b9` | `status` `0x0`, `logs` `[]`, `blockNumber` `0x6`, `gasUsed` `0x6ae2e`, `from` `0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc`, `to` `0xd97e3fc9c922f57f941c5b31adc1f5e48c5894d4`; `revertReason` is custom error `0x8c202106` with data ending in `…0001`. |
| `latefail-anvil-castrun.log` | `25e7d0042f697f7dca7b99a0a36bb239f0940c555fd0bcdbff0873f67f0fb5c9` | Call trace of the same transaction: `execute` at `0xd97e3f…` (line 3); first NPC `release` (line 36) → `GameItems::transferFromNpc(…, 1, 1, 1)` (line 38) → `emit ItemMoved(fromNpc 0, toNpc 1, item 1, qty 1)` (line 39); second NPC `release` (line 42) reverts `LateFailInjected(runId, 0, 1)` (line 47), which propagates out of `execute` (line 48). |
| `R5FixtureDeployer.sol.txt` | `f77407b27a6a2f8b9e47dda64d6505af3bdd78b7456c4c01a7b6519035f8db68` | The reviewer's scratch deployer for the fault world (NPC B = `LateFailNpcB`). Not part of the repository; `.txt` so no tool compiles it. |

**EVIDENCED (from the saved files):** the transaction hash; receipt `status` 0x0; empty `logs`; the trace order (first transfer, then the revert in the second release, propagated out of `execute`). The saved trace names contracts by address only; that the second release is `LateFailNpcB` rests on the scratch deployer (`R5FixtureDeployer.sol.txt:26`) and on the revert data.

**NOT EVIDENCED (no saved file):** the post-transaction state read (balances, run fields, snapshot hash, permits, lock slots). It exists only in the reviewer's report. Do not present the in-process table in `latefail-README.md` as that receipt.

Other limits, stated by the reviewer and consistent with the files:
- The scratch deployment is not reproducible from the repository alone (`R5FixtureDeployer.sol.txt` is outside the repository's build and scripts).
- The Anvil instance was stopped and its state is gone. No `anvil` process is running at the time of this pass (`pgrep`, checked).
- This Anvil result is from a local chain (chainId 31337), not a public network.
- The accepted rollback proof is still the contract tests (section 6, first list). The Anvil receipt is a second, independent observation of the same revert and does not replace them.

## 7. Deployer initcode size

- `Level1Deployer` creates all five contracts in its constructor, so its initcode contains the NPC and coordinator creation code.
- Size table, `evidence/contracts/sizes.log` (generated by `forge build --sizes`, quoted): `| Level1Deployer | 1,540 | 48,084 | 23,036 | 1,068 |` (columns: runtime size, initcode size, runtime margin, initcode margin). `sizes.log` line 16.
- EIP-3860 initcode limit is 49,152 B (the margin in `sizes.log` is measured against it: 49,152 − 48,084 = 1,068).
- Margin: 1,068 B, about 2.2 % of the limit.
- Optimizer: `foundry.toml` sets no optimizer option (the file has no `optimizer` key; the grep returns no match). The Foundry default applies. This pass did not change it. Build products under `out/` and `cache/` (not in the evidence folder; observed by grep in this pass, 60 occurrences) record `"optimizer":{"enabled":false,"runs":200}`, e.g. `out/NpcBase.sol/NpcBase.json`.
- Each NPC's creation code is embedded in the deployer. `NpcBase` is inherited by three NPCs (`src/NPC_A.sol`, `NPC_B.sol`, `NPC_C.sol`), so growth in `NpcBase` is multiplied by three in the deployer's initcode. This is a constraint for any extension (levels 2–3 or extra checks). Do not change the optimizer as a fix without re-measuring.
- `snapshotHashFor` is `internal` (`src/AtomicCoordinator.sol:181`). The source comment at `:219` says `_liveBalances` is a single call site "keeps unoptimized bytecode small". The reason `snapshotHashFor` was made internal is **NOT EVIDENCED** in the files read. `SPEC.md:55` lists `snapshotHashFor(runId, ...)` among views "as needed"; the source now has it internal. `ENTRYPOINTS.md:39` records it as internal.

## 8. Foundry signature cache outside the project: write boundary violation

Facts:
- Path: `/Users/mango/.foundry/cache/signatures` (forge's global cache; outside `contracts/` and outside the repository).
- Creation: the directory `~/.foundry/cache` was born 2026-10-12 10:27:04 +0500 (05:27:04 UTC), checked with `stat -f %SB` during this pass. `evidence/env/SMOKE-README.md:82` records the same time and says it was created by the first `forge build` during the toolchain smoke test. SMOKE-README.md:82 says it "did not exist before this run" and "Not deleted (report only)".
- Size and hash history (`evidence/contracts/signatures-cache-history.md:6-9`):
  - 31,183 B, sha256 `fb390d35d080a835b57d69347b0f6b80d78a676bf81f609b3ed7fc26472f79e8`: the first measurement, recorded in `evidence/env/SMOKE-README.md:82`. The orchestrator states that it measured this value. **Correction:** earlier text labelled it "task-stated"; that label is wrong, and the value is not from the task statement.
  - 38,561 B, sha256 `aa77290175a4ed1805cc1d5c64b4d59ff1c1f4ea1acecfb82fa78ac9233c8e05`: start of the round-1 run.
  - 39,450 B, sha256 `afbb8b2ad6e9f5e4c501e32dd73c002b440fedd630a5b0505e72cbc0f9cbd277`: start of the round-2 debug run. `signatures-cache.txt` shows the same hash and size before and after the final run (`evidence/contracts/signatures-cache.txt`).
- `signatures-cache-history.md:3` records that the size changes between runs and that an earlier note claiming identical content was false. `signatures-cache-history.md:11` says forge is the only writer. Forge runs refreshing the mtime without a content change is evidenced by `run2/signatures-cache.txt` (a file outside the project; see the run2 bullet below).
- State at the time of this pass (read-only `stat` and `shasum`, see section 10): size 39,450 B, sha256 `afbb8b2ad6e9f5e4c501e32dd73c002b440fedd630a5b0505e72cbc0f9cbd277`, mtime 2026-10-12 15:14:07 +0500. The file was not deleted or edited by this pass.
- Another forge run outside the project: reviewer-5's second full `scripts/run-stage2.sh` run (`date -u` 10:13:59 UTC, `reviewer5/run2/versions.txt:33`; files in his scratch `reviewer5/run2/`, outside the project). `run2/signatures-cache.txt` records 39,450 B, sha256 `afbb8b2a…` before and after. The cache mtime is 15:14:07 +0500 (10:14:07 UTC), observed in this pass. Attribution of that mtime write to run2 is **INFERRED** from the time correlation with the run2 date and with the `out/build-info` mtime 15:14:06 +0500 (observed in this pass). The content did not change. This is another write outside the project of the same kind.
- Per the task brief (orchestrator), when stage-2 work started the instruction was to find a documented way to move the extra cache into `contracts/.tools`. The brief states that none was found: there is no env var in the binary, and the only override found was `HOME`, which was forbidden. The brief states that the blocker was declared, and that work continued and several agents ran forge, writing to that cache without explicit user permission. This statement comes from the brief; the repository files read in this pass do not record the search itself.

Status: **this is a violation of the write boundary.** It must not be described as permitted after the fact. The file was not deleted. For future forge runs the cache problem needs a separate solution (for example a documented way to relocate the cache, verified in a sandbox) or the user's explicit permission. `scripts/run-stage2.sh` runs forge and therefore writes to this cache: **warn before running it** (see `contracts/README.md`).

## 9. Dating of the test results

- The 77-test results come from the run recorded in `evidence/contracts/versions.txt`, section `## date -u`, line 33: `Mon Oct 12 09:34:07 UTC 2026`. The run's exit codes are in `evidence/contracts/exit-codes.txt` (`tests EXIT=0`, `tests-json EXIT=0`, and one line per suite).
- `evidence/contracts/tests.log`, line 309: `Ran 7 test suites … 77 tests passed, 0 failed, 0 skipped (77 total tests)`.
- The round-2 mutation run has no date line. Its result file `mutation-results-round2.txt` has mtime 2026-10-12 15:12:46 +0500 (10:12:46 UTC). The mtime is the only date evidence.
- **This documentation pass ran no tests.** Old results are quoted with their original dates above. They are not a new run.

## 10. Link and reference check

Checked in this pass. "Yes" means the target was confirmed to exist with `ls`, `stat` or `grep` during this pass.

Results of the `anvil-deploy/` → `anvil-deploy2/` search (grep over `contracts/README.md` and `contracts/evidence/**`, plus `SPEC.md`):

| File | Old reference | Fix | Status |
|---|---|---|---|
| `evidence/contracts/happy-path-state.md:5` | `anvil-deploy/state-before-after.md` | Changed to `anvil-deploy2/` (`addresses-and-results.json`, `session.log`), and the file name is stated as not present (see below). | Fixed in this pass |

All other mentions of `anvil-deploy2/` were already correct: `contracts/README.md:48`, `evidence/contracts/addresses-from-tests.md`, `exit-codes.txt`, `EVIDENCE.sha256`, `hash-verify.log`, `scripts/run-stage2.sh:10,141,297`. No historical log was edited.

`anvil-deploy2/state-before-after.md` does **not** exist: `evidence/contracts/anvil-deploy2/` contains only `addresses-and-results.json` and `session.log` (checked with `ls -la`). No on-chain before/after table is saved. `anvil-deploy2/session.log:110-127` (and `anvil-deploy2/addresses-and-results.json`) records the on-chain state after the happy-path `execute` (balances `[0,1,1,0,0,0]`, `runOf` `(0xf39F…, false, true, 1)`, snapshot hash `0x6b1513eb…`, all permits zero; execute tx status 1 at `session.log:102`). On-chain before-balances are not saved; only the before snapshot hash is (`session.log:75`, the `currentSnapshotHash` call before `execute`).

Link and path targets (checked):

| Reference (file → target) | Exists |
|---|---|
| `contracts/README.md` → `scripts/run-stage2.sh` | yes |
| `contracts/README.md` → `foundry.toml`, `.tools/`, `.tools/solc/solc-0.8.37` | yes |
| `contracts/README.md` → `evidence/contracts/anvil-deploy2/` (`session.log`, `addresses-and-results.json`) | yes |
| `contracts/README.md` → `evidence/contracts/abi-selectors.log`, `exit-codes.txt`, `forbidden-grep.log`, `frontend-unchanged.log`, `hash-verify.log`, `SOURCES.sha256`, `EVIDENCE.sha256`, `mutation-results-author.txt`, `addresses-from-tests.md` | yes (each checked) |
| `contracts/README.md` → `evidence/contracts/GUARANTEES.md` | yes (created in this pass) |
| `ENTRYPOINTS.md` → `abi-selectors.log`, `forbidden-grep.log` | yes |
| `latefail-README.md` → `latefail-trace.log`, `latefail-state-tables.log` | yes |
| `latefail-README.md` → `reviewer5-artifacts/README.md`, `GUARANTEES.md` | yes (created in this pass) |
| `fault-injection-README.md` → `fault-injection.log`, `mutation-results-author.txt`, `test/Level1FaultInjection.t.sol`, `test/harness/FaultFixtures.sol` | yes |
| `happy-path-state.md` → `happy-path-state.log`, `test/Level1Exchange.t.sol` | yes |
| `signatures-cache-history.md` → `signatures-cache.txt` | yes |
| `signatures-cache-history.md` → `GUARANTEES.md` section 8 | yes (created in this pass) |
| `addresses-from-tests.md` → `setup-trace-happy.log`, `setup-trace-wiring.log`, `latefail-trace.log`, `anvil-deploy2/addresses-and-results.json` | yes |
| `GUARANTEES.md` → `reviewer5-artifacts/*` (all files in section 5 and 6) | yes |
| `evidence/env/SMOKE-README.md:82` (cited by section 8) | yes |
| `~/.foundry/cache/signatures` (external) | yes; not modified by this pass (section 10, cache check) |

Historical logs that still mention old paths: none found with `anvil-deploy/` (only `anvil-deploy2/`). `evidence/env/SMOKE-README.md` and `evidence/env/*` were not edited.

Cache check for this pass: see the `stat` and `shasum` output in the report.

SPEC notes (`SPEC.md` was not edited in this pass; it is outside the editable set and its hash is in `SOURCES.sha256`): `SPEC.md:55` lists `snapshotHashFor` as a view helper while the source has it internal (`src/AtomicCoordinator.sol:181`). `SPEC.md:41` describes the `before` check as a keccak256 comparison (`keccak256(abi.encode(before)) == keccak256(abi.encode(items.snapshotBalances(runId)))`), while `src/NpcBase.sol:147-151` compares element by element.
