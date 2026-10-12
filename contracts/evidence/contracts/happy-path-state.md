# Happy path: before / after (from test source, not from printed tables)

Test: `test_HappyPath_ExactBalancesRunStateEventsNoPermits` in `test/Level1Exchange.t.sol` (`forge test --match-test test_HappyPath_ExactBalancesRunStateEventsNoPermits -vvv`, output in `happy-path-state.log`, `EXIT=0`, 1 test passed, gas 883254).

The test prints **no console tables** (`test/Level1Exchange.t.sol` has no `console` calls; `-vvv` shows only PASS). The values below are the test's own `assert` values, copied from the source. They are not printed runtime output. The local Anvil deployment files are in `anvil-deploy2/` (`addresses-and-results.json`, `session.log`). Correction (documentation pass): an earlier version of this sentence cited `anvil-deploy/state-before-after.md`, which does not exist. No on-chain before/after table is saved. `anvil-deploy2/session.log:110-127` (and `anvil-deploy2/addresses-and-results.json`) records the on-chain state after the happy-path `execute` (balances `[0,1,1,0,0,0]`, `runOf` `(0xf39F…, false, true, 1)`, snapshot hash `0x6b1513eb…`, all permits zero; execute tx status 1 at `session.log:102`). On-chain before-balances are not saved; only the before snapshot hash is (`session.log:75`, the `currentSnapshotHash` call before `execute`). See `GUARANTEES.md` section 10.

| Field | Before (after `startRun`, from `setUp`/`start`) | After `execute(runId, validPkg(), 0, snap)` (asserted) |
|---|---|---|
| balances `[A.KEY, A.COIN, B.KEY, B.COIN, C.KEY, C.COIN]` | `[1, 0, 0, 1, 0, 0]` (`test_StartRun_InitialState`) | `[0, 1, 1, 0, 0, 0]` (`assertBalances`) |
| conservation | 1 KEY + 1 COIN | 1 KEY + 1 COIN (`_assertConserved`) |
| `runOf` (owner, active, solved, nonce) | (player, true, false, 0) | (player, false, true, 1) |
| `currentSnapshotHash` | equals `expectedSnapshotHash(runId)` | equals `expectedSnapshotHash(runId)` (recomputed after) |
| permits (NPC_A, NPC_B, NPC_C) | inactive, zero fields (`assertNoActivePermits`) | inactive, zero fields (`assertNoActivePermits`) |
| goals (`isGoalSatisfied` per NPC on final balances) | not asserted | A, B, C all true |

Events asserted (exact count and order, `logs.length == 7`):
1. `PermitIssued` from NPC_A (offer A1, snapshot, planHash)
2. `PermitIssued` from NPC_B (offer B1, snapshot, planHash)
3. `PermitConsumed` NPC_A (A1)
4. `ItemMoved` A -> B, KEY, qty 1
5. `PermitConsumed` NPC_B (B1)
6. `ItemMoved` B -> A, COIN, qty 1
7. `LevelSolved` from AtomicCoordinator, topics `[SIG_LEVEL_SOLVED, runId, player]`, data `(nonce 1, snap, planHash)`

Failure tests in `test/Level1Exchange.t.sol` (for example `test_Reject_*`, `test_RepeatAfterSolved_RevertsAlreadySolved`) are not quoted here. The shared helper `expectExecRevert` in `test/harness/Level1TestBase.sol` checks exact revert data and asserts state is unchanged (per its source). None of these tests print tables, so no failure state tables exist in this evidence. The failure state tables that are printed are the late-failure ones (`latefail-state-tables.log`).
