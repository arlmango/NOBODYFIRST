// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

// =====================================================================================
// LATE FAILURE evidence (mandatory criterion, stage 2).
//
// Fixture vs production:
//   * GameItems, NPC_A, NPC_C and AtomicCoordinator are the UNMODIFIED production contracts
//     (src/**), deployed with their production constructors.
//   * Only NPC B differs: test/harness/LateFailNpcB.sol inherits production NPC_B and overrides
//     exactly one virtual function:
//       - LateFailNpcB.release           -> reverts LateFailInjected(runId, aKey, bKey)
//       - LateFailNpcB_Final.isGoalSatisfied -> returns false (coordinator: GoalNotSatisfied(1))
//     No settlement logic is copied, no switches/flags; the fault is unconditional.
//   * The wiring is built HERE with vm.computeCreateAddress over this test contract's CREATE
//     nonces (items, npcA, npcB-variant, npcC, coordinator), NOT by Level1Deployer (which can
//     only deploy production NPC_B). Every created address is asserted equal to its prediction.
//   * Control: the same wiring procedure with production NPC_B solves the level, so the wiring
//     itself is sound and the failures below are caused by the injected fault only.
//
// Recorded state fields (before == after asserted field by field, see Level1TestBase.FullState):
//   items.balanceOf(runId, A|B|C, KEY|COIN)          (6 values)
//   items.isGranted(runId)
//   npcA/npcB/npcC.permitOf(runId) = (offerId, snapshotHash, planHash, active)   (3 x 4 values)
//   coord.runOf(runId) = (owner, active, solved, nonce)
//   coord.currentSnapshotHash(runId)
//
// Proof that the first transfer REALLY happened and was then rolled back:
//   (a) LateFailInjected carries the ledger balances observed inside B.release: A.KEY = 0,
//       B.KEY = 1, i.e. A -> B 1 KEY had been executed in production GameItems at that point;
//   (b) vm.startStateDiffRecording() around a low-level call shows the SSTOREs to the GameItems
//       balance slots (identified by a vm.store probe, not by assuming the storage layout) with
//       `reverted == true`, and after the call vm.load shows the original values;
//   (c) the -vvvv trace (`forge test --match-contract LateFailure -vvvv`) shows the ItemMoved
//       event(s) inside the reverted frame.
//   NOTE on events: trace events of a reverted frame are debug output, NOT persisted events.
//   Measured with forge 1.8.5: vm.recordLogs()/vm.getRecordedLogs() ALSO captures LOG opcodes
//   of reverted frames (it records opcodes, it is not a transaction receipt), so it cannot show
//   "no log persisted". The tests therefore assert the exact set of logs EMITTED inside the
//   reverted frame (Permit*/ItemMoved counts = how far settlement got) and that LevelSolved was
//   never emitted at all. Receipt-level non-persistence (a reverted tx has no logs) follows from
//   EVM semantics and is not observable in this in-process test.
//
// Boundaries: this proves EVM revert atomicity for THIS call path (AtomicCoordinator.execute ->
// npcA.release -> GameItems.transferFromNpc -> npcB.release / isGoalSatisfied revert) and
// THESE state fields. It says nothing about other call paths, other contracts or off-chain state.
// =====================================================================================

import {Vm, VmSafe} from "forge-std/Vm.sol";
import {console2} from "forge-std/console2.sol";
import {Level1TestBase} from "./harness/Level1TestBase.sol";
import {LateFailNpcB, LateFailNpcB_Final} from "./harness/LateFailNpcB.sol";
import {KEY, COIN, NPC_A_ID, NPC_B_ID, NPC_C_ID} from "../src/Types.sol";
import {GameItems} from "../src/GameItems.sol";
import {NPC_A} from "../src/NPC_A.sol";
import {NPC_B} from "../src/NPC_B.sol";
import {NPC_C} from "../src/NPC_C.sol";
import {NpcRules} from "../src/NpcBase.sol";
import {AtomicCoordinator} from "../src/AtomicCoordinator.sol";

contract Level1LateFailureTest is Level1TestBase {
    enum BVariant {
        Production,
        FailOnRelease,
        FailOnFinalGoal
    }

    uint256 internal runId;

    bytes32 internal constant SIG_ITEM_MOVED = keccak256("ItemMoved(uint256,uint8,uint8,uint8,uint32)");
    bytes32 internal constant SIG_PERMIT_ISSUED = keccak256("PermitIssued(uint256,uint8,bytes32,bytes32,bytes32)");
    bytes32 internal constant SIG_PERMIT_CONSUMED = keccak256("PermitConsumed(uint256,uint8,bytes32)");
    bytes32 internal constant SIG_LEVEL_SOLVED = keccak256("LevelSolved(uint256,address,uint64,bytes32,bytes32)");

    // ------------------------------------------------------------------ fixture

    function _deploy(BVariant v) internal {
        uint256 n = vm.getNonce(address(this));
        address pItems = vm.computeCreateAddress(address(this), n);
        address pA = vm.computeCreateAddress(address(this), n + 1);
        address pB = vm.computeCreateAddress(address(this), n + 2);
        address pC = vm.computeCreateAddress(address(this), n + 3);
        address pCoord = vm.computeCreateAddress(address(this), n + 4);

        items = new GameItems(pCoord, pA, pB, pC);
        npcA = new NPC_A(pItems, pCoord);
        if (v == BVariant.Production) npcB = new NPC_B(pItems, pCoord);
        else if (v == BVariant.FailOnRelease) npcB = NPC_B(address(new LateFailNpcB(pItems, pCoord)));
        else npcB = NPC_B(address(new LateFailNpcB_Final(pItems, pCoord)));
        npcC = new NPC_C(pItems, pCoord);
        coord = new AtomicCoordinator(pItems, pA, pB, pC);

        assertEq(address(items), pItems, "items address");
        assertEq(address(npcA), pA, "npcA address");
        assertEq(address(npcB), pB, "npcB address");
        assertEq(address(npcC), pC, "npcC address");
        assertEq(address(coord), pCoord, "coordinator address");
        assertEq(items.coordinator(), address(coord));
        assertEq(items.npcAddress(NPC_B_ID), address(npcB));
        assertEq(coord.npcAddress(NPC_B_ID), address(npcB));
        assertEq(address(npcB.items()), address(items));
        assertEq(npcB.coordinator(), address(coord));

        runId = start(player);
    }

    // ------------------------------------------------------------------ control

    /// Same fixture procedure, production NPC_B: the level solves. Also records the state diff to
    /// show that on success the same ledger writes carry `reverted == false`.
    function test_LateFailure_Control_ProductionNpcBSolves() public {
        _deploy(BVariant.Production);
        FullState memory s0 = capture(runId);
        logState("control: before", s0);

        vm.startStateDiffRecording();
        vm.prank(player);
        coord.execute(runId, validPkg(), 0, s0.snap);
        Vm.AccountAccess[] memory diff = vm.stopAndReturnStateDiff();

        assertBalances(runId, [uint256(0), 1, 1, 0, 0, 0]);
        AtomicCoordinator.Run memory r = coord.runOf(runId);
        assertTrue(r.solved);
        assertFalse(r.active);
        assertEq(uint256(r.nonce), 1);
        assertNoActivePermits(runId);
        logState("control: after", capture(runId));

        Vm.StorageAccess[] memory w = _ledgerWrites(diff);
        assertEq(w.length, 4, "control: 4 ledger balance writes");
        for (uint256 i = 0; i < w.length; i++) {
            assertFalse(w[i].reverted, "control: write persisted");
        }
    }

    /// The fault variants keep production rules: only the overridden function differs.
    function test_LateFailure_FixturesKeepProductionRules() public {
        _deploy(BVariant.Production);
        NpcRules memory prod = npcB.rules();
        _deploy(BVariant.FailOnRelease);
        _assertSameRules(prod, npcB.rules());
        assertTrue(keccak256(address(npcB).code) != keccak256(address(npcA).code));
        _deploy(BVariant.FailOnFinalGoal);
        _assertSameRules(prod, npcB.rules());
    }

    // ------------------------------------------------- fault 1: B.release reverts

    function test_LateFailure_ReleaseB_ExpectRevert_AllStateRestored() public {
        _deploy(BVariant.FailOnRelease);
        FullState memory beforeS = capture(runId);
        logState("fault1 (B.release reverts): before", beforeS);

        vm.recordLogs();
        // A.KEY observed 0 and B.KEY observed 1 inside B.release: A's transfer had settled.
        vm.expectRevert(abi.encodeWithSelector(LateFailNpcB.LateFailInjected.selector, runId, uint256(0), uint256(1)));
        vm.prank(player);
        coord.execute(runId, validPkg(), 0, beforeS.snap);
        _assertRevertedFrameLogs(vm.getRecordedLogs(), 2, 1, 1);

        FullState memory afterS = capture(runId);
        logState("fault1 (B.release reverts): after", afterS);
        assertStateEq(beforeS, afterS);
        assertBalances(runId, [uint256(1), 0, 0, 1, 0, 0]);
        assertNoActivePermits(runId);
        assertFalse(afterS.solved);
        assertTrue(afterS.active);
        assertEq(uint256(afterS.nonce), 0);
    }

    function test_LateFailure_ReleaseB_StateDiff_FirstTransferWrittenThenReverted() public {
        _deploy(BVariant.FailOnRelease);
        FullState memory beforeS = capture(runId);

        vm.recordLogs();
        vm.startStateDiffRecording();
        vm.prank(player);
        (bool ok, bytes memory ret) =
            address(coord).call(abi.encodeCall(AtomicCoordinator.execute, (runId, validPkg(), 0, beforeS.snap)));
        Vm.AccountAccess[] memory diff = vm.stopAndReturnStateDiff();
        _assertRevertedFrameLogs(vm.getRecordedLogs(), 2, 1, 1);

        assertFalse(ok, "execute must revert");
        assertEq(ret, abi.encodeWithSelector(LateFailNpcB.LateFailInjected.selector, runId, uint256(0), uint256(1)));

        // Exactly A's transfer reached the ledger: A.KEY 1->0 and B.KEY 0->1, both reverted.
        Vm.StorageAccess[] memory w = _ledgerWrites(diff);
        assertEq(w.length, 2, "only the first transfer wrote to the ledger");
        _assertWrite(w[0], 1, 0, NPC_A_ID, KEY);
        _assertWrite(w[1], 0, 1, NPC_B_ID, KEY);
        _assertAllWritesReverted(diff);
        _assertLedgerCalledByNpcA(diff);

        FullState memory afterS = capture(runId);
        assertStateEq(beforeS, afterS);
        assertEq(uint256(vm.load(address(items), w[0].slot)), 1, "A.KEY slot restored");
        assertEq(uint256(vm.load(address(items), w[1].slot)), 0, "B.KEY slot restored");
    }

    // ----------------------------------- fault 2: goal check fails after both transfers

    function test_LateFailure_FinalGoal_ExpectRevert_AllStateRestored() public {
        _deploy(BVariant.FailOnFinalGoal);
        FullState memory beforeS = capture(runId);
        logState("fault2 (B.isGoalSatisfied=false): before", beforeS);

        vm.recordLogs();
        vm.expectRevert(abi.encodeWithSelector(AtomicCoordinator.GoalNotSatisfied.selector, NPC_B_ID));
        vm.prank(player);
        coord.execute(runId, validPkg(), 0, beforeS.snap);
        _assertRevertedFrameLogs(vm.getRecordedLogs(), 2, 2, 2);

        FullState memory afterS = capture(runId);
        logState("fault2 (B.isGoalSatisfied=false): after", afterS);
        assertStateEq(beforeS, afterS);
        assertBalances(runId, [uint256(1), 0, 0, 1, 0, 0]);
        assertNoActivePermits(runId);
    }

    function test_LateFailure_FinalGoal_StateDiff_BothTransfersWrittenThenReverted() public {
        _deploy(BVariant.FailOnFinalGoal);
        FullState memory beforeS = capture(runId);

        vm.startStateDiffRecording();
        vm.prank(player);
        (bool ok, bytes memory ret) =
            address(coord).call(abi.encodeCall(AtomicCoordinator.execute, (runId, validPkg(), 0, beforeS.snap)));
        Vm.AccountAccess[] memory diff = vm.stopAndReturnStateDiff();

        assertFalse(ok, "execute must revert");
        assertEq(ret, abi.encodeWithSelector(AtomicCoordinator.GoalNotSatisfied.selector, NPC_B_ID));

        Vm.StorageAccess[] memory w = _ledgerWrites(diff);
        assertEq(w.length, 4, "both transfers wrote to the ledger");
        _assertWrite(w[0], 1, 0, NPC_A_ID, KEY); // A -> B KEY: source
        _assertWrite(w[1], 0, 1, NPC_B_ID, KEY); //              destination
        _assertWrite(w[2], 1, 0, NPC_B_ID, COIN); // B -> A COIN: source
        _assertWrite(w[3], 0, 1, NPC_A_ID, COIN); //              destination
        _assertAllWritesReverted(diff);

        assertStateEq(beforeS, capture(runId));
        for (uint256 i = 0; i < 4; i++) {
            assertEq(vm.load(address(items), w[i].slot), w[i].previousValue, "slot restored");
        }
    }

    // ------------------------------------------------------------------ helpers

    function _ledgerWrites(Vm.AccountAccess[] memory diff) internal view returns (Vm.StorageAccess[] memory out) {
        uint256 n;
        for (uint256 i = 0; i < diff.length; i++) {
            for (uint256 j = 0; j < diff[i].storageAccesses.length; j++) {
                Vm.StorageAccess memory s = diff[i].storageAccesses[j];
                if (s.account == address(items) && s.isWrite) n++;
            }
        }
        out = new Vm.StorageAccess[](n);
        n = 0;
        for (uint256 i = 0; i < diff.length; i++) {
            for (uint256 j = 0; j < diff[i].storageAccesses.length; j++) {
                Vm.StorageAccess memory s = diff[i].storageAccesses[j];
                if (s.account == address(items) && s.isWrite) out[n++] = s;
            }
        }
    }

    /// Checks prev/new values, the reverted flag, and identifies the slot as the ledger balance
    /// of (npcId, item) by probing: write a marker with vm.store and read it back via balanceOf.
    function _assertWrite(Vm.StorageAccess memory s, uint256 prev, uint256 next, uint8 npcId, uint8 item) internal {
        assertEq(uint256(s.previousValue), prev, "previousValue");
        assertEq(uint256(s.newValue), next, "newValue");
        assertTrue(s.reverted, "write must be flagged reverted");
        uint256 sid = vm.snapshotState();
        vm.store(address(items), s.slot, bytes32(uint256(0xBEEF)));
        assertEq(items.balanceOf(runId, npcId, item), 0xBEEF, "slot is this balance");
        vm.revertToState(sid);
        console2.log("ledger SSTORE (reverted=true) npcId/item:", uint256(npcId), uint256(item));
        console2.log("  slot", vm.toString(s.slot));
        console2.log("  prev -> new", prev, next);
    }

    function _assertAllWritesReverted(Vm.AccountAccess[] memory diff) internal pure {
        uint256 writes;
        for (uint256 i = 0; i < diff.length; i++) {
            for (uint256 j = 0; j < diff[i].storageAccesses.length; j++) {
                Vm.StorageAccess memory s = diff[i].storageAccesses[j];
                if (s.isWrite) {
                    writes++;
                    assertTrue(s.reverted, "a write survived the revert");
                }
            }
        }
        assertGt(writes, 0, "writes were recorded");
    }

    function _assertLedgerCalledByNpcA(Vm.AccountAccess[] memory diff) internal view {
        bool found;
        for (uint256 i = 0; i < diff.length; i++) {
            if (
                diff[i].account == address(items) && diff[i].accessor == address(npcA)
                    && diff[i].kind == VmSafe.AccountAccessKind.Call
            ) {
                found = true;
                assertTrue(diff[i].reverted, "ledger call frame reverted");
            }
            // B never reached the ledger as a caller
            assertFalse(
                diff[i].account == address(items) && diff[i].accessor == address(npcB)
                    && diff[i].kind == VmSafe.AccountAccessKind.Call,
                "B must not have called the ledger"
            );
        }
        assertTrue(found, "npcA called the ledger");
    }

    /// Counts the logs recorded during a REVERTED execute. These were emitted inside the reverted
    /// frame (forge records LOG opcodes, not receipts); they show how far settlement progressed.
    /// LevelSolved must never have been emitted.
    function _assertRevertedFrameLogs(
        Vm.Log[] memory logs,
        uint256 wantIssued,
        uint256 wantConsumed,
        uint256 wantMoved
    ) internal pure {
        uint256 issued;
        uint256 consumed;
        uint256 moved;
        for (uint256 i = 0; i < logs.length; i++) {
            bytes32 t = logs[i].topics.length > 0 ? logs[i].topics[0] : bytes32(0);
            assertTrue(t != SIG_LEVEL_SOLVED, "LevelSolved emitted");
            if (t == SIG_PERMIT_ISSUED) issued++;
            if (t == SIG_PERMIT_CONSUMED) consumed++;
            if (t == SIG_ITEM_MOVED) moved++;
        }
        assertEq(issued, wantIssued, "PermitIssued in reverted frame");
        assertEq(consumed, wantConsumed, "PermitConsumed in reverted frame");
        assertEq(moved, wantMoved, "ItemMoved in reverted frame");
        console2.log("logs emitted inside reverted frame (NOT persisted): issued/consumed/moved");
        console2.log(issued, consumed, moved);
    }

    function _assertSameRules(NpcRules memory a, NpcRules memory b) internal pure {
        assertEq(abi.encode(a), abi.encode(b), "rules differ");
    }
}
