// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

// Exchange evidence on the production deployment (Level1Deployer): happy path with exact
// balances / run state / events, every package rejection with its exact error, run guards,
// NPC validatePlan codes, and isolation between players.

import {Vm} from "forge-std/Vm.sol";
import {Level1TestBase} from "./harness/Level1TestBase.sol";
import {
    Transfer,
    Selection,
    KEY,
    COIN,
    NPC_A_ID,
    NPC_B_ID,
    NPC_C_ID,
    OFFER_NONE,
    OFFER_A1,
    OFFER_B1,
    UNKNOWN_OFFER,
    OWN_TRANSFER_MISSING,
    OWN_TRANSFER_MISMATCH,
    INCOMING_MISSING,
    INCOMING_MISMATCH,
    UNEXPECTED_INCOMING,
    UNEXPECTED_OUTGOING,
    INSUFFICIENT_STOCK,
    GOAL_NOT_MET
} from "../src/Types.sol";
import {AtomicCoordinator} from "../src/AtomicCoordinator.sol";
import {IGameItems} from "../src/interfaces/IGameItems.sol";
import {INpc} from "../src/interfaces/INpc.sol";

contract Level1ExchangeTest is Level1TestBase {
    uint256 internal runId;

    bytes32 internal constant SIG_ITEM_MOVED = keccak256("ItemMoved(uint256,uint8,uint8,uint8,uint32)");
    bytes32 internal constant SIG_PERMIT_ISSUED = keccak256("PermitIssued(uint256,uint8,bytes32,bytes32,bytes32)");
    bytes32 internal constant SIG_PERMIT_CONSUMED = keccak256("PermitConsumed(uint256,uint8,bytes32)");
    bytes32 internal constant SIG_LEVEL_SOLVED = keccak256("LevelSolved(uint256,address,uint64,bytes32,bytes32)");
    bytes32 internal constant OFFER_X = keccak256("NOBODYFIRST.L1.X");

    function setUp() public {
        deployViaDeployer();
        runId = start(player);
    }

    // ================================================================ happy path

    function test_StartRun_InitialState() public {
        assertTrue(items.isGranted(runId));
        assertBalances(runId, [uint256(1), 0, 0, 1, 0, 0]); // A:1 KEY, B:1 COIN, C: nothing
        AtomicCoordinator.Run memory r = coord.runOf(runId);
        assertEq(r.owner, player);
        assertTrue(r.active);
        assertFalse(r.solved);
        assertEq(uint256(r.nonce), 0);
        assertEq(coord.currentSnapshotHash(runId), expectedSnapshotHash(runId), "snapshot encoding");
        assertNoActivePermits(runId);
        // ledger has no player/coordinator accounts: the only accounts are NPC ids 0..2
        vm.expectRevert(abi.encodeWithSelector(IGameItems.InvalidNpc.selector, uint8(3)));
        items.balanceOf(runId, 3, KEY);
    }

    function test_StartRun_Events() public {
        vm.recordLogs();
        uint256 run2 = start(player2);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 2);
        assertEq(logs[0].emitter, address(coord));
        assertEq(logs[0].topics[0], keccak256("RunStarted(uint256,address)"));
        assertEq(logs[0].topics[1], bytes32(run2));
        assertEq(logs[0].topics[2], bytes32(uint256(uint160(player2))));
        assertEq(logs[1].emitter, address(items));
        assertEq(logs[1].topics[0], keccak256("InitialGranted(uint256)"));
        assertEq(logs[1].topics[1], bytes32(run2));
    }

    function test_EventSignaturesMatchSource() public pure {
        assertEq(IGameItems.ItemMoved.selector, SIG_ITEM_MOVED);
        assertEq(INpc.PermitIssued.selector, SIG_PERMIT_ISSUED);
        assertEq(INpc.PermitConsumed.selector, SIG_PERMIT_CONSUMED);
        assertEq(AtomicCoordinator.LevelSolved.selector, SIG_LEVEL_SOLVED);
    }

    function test_HappyPath_ExactBalancesRunStateEventsNoPermits() public {
        bytes32 snap = coord.currentSnapshotHash(runId);
        assertEq(snap, expectedSnapshotHash(runId));
        bytes32 planHash = validPlanHash(snap);
        assertEq(planHash, coord.computePlanHash(snap, [OFFER_A1, OFFER_B1, OFFER_NONE], validTransfers()));

        vm.recordLogs();
        vm.prank(player);
        coord.execute(runId, validPkg(), 0, snap);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        // balances: A only 1 COIN, B only 1 KEY, C empty; conservation 1 KEY + 1 COIN total
        assertBalances(runId, [uint256(0), 1, 1, 0, 0, 0]);
        _assertConserved(runId);
        // run
        AtomicCoordinator.Run memory r = coord.runOf(runId);
        assertEq(r.owner, player);
        assertFalse(r.active);
        assertTrue(r.solved);
        assertEq(uint256(r.nonce), 1);
        assertEq(coord.currentSnapshotHash(runId), expectedSnapshotHash(runId));
        assertNoActivePermits(runId);
        // goals hold per NPC view
        uint256[6] memory fin = items.snapshotBalances(runId);
        assertTrue(npcA.isGoalSatisfied(fin));
        assertTrue(npcB.isGoalSatisfied(fin));
        assertTrue(npcC.isGoalSatisfied(fin));

        // events, exact order and args
        assertEq(logs.length, 7, "exactly 7 logs");
        _assertPermitIssued(logs[0], address(npcA), NPC_A_ID, OFFER_A1, snap, planHash);
        _assertPermitIssued(logs[1], address(npcB), NPC_B_ID, OFFER_B1, snap, planHash);
        _assertPermitConsumed(logs[2], address(npcA), NPC_A_ID, OFFER_A1);
        _assertItemMoved(logs[3], NPC_A_ID, NPC_B_ID, KEY, 1);
        _assertPermitConsumed(logs[4], address(npcB), NPC_B_ID, OFFER_B1);
        _assertItemMoved(logs[5], NPC_B_ID, NPC_A_ID, COIN, 1);
        assertEq(logs[6].emitter, address(coord));
        assertEq(logs[6].topics.length, 3);
        assertEq(logs[6].topics[0], SIG_LEVEL_SOLVED);
        assertEq(logs[6].topics[1], bytes32(runId));
        assertEq(logs[6].topics[2], bytes32(uint256(uint160(player))));
        assertEq(logs[6].data, abi.encode(uint64(1), snap, planHash));
    }

    /// SPEC step 2: any order is allowed iff every NPC appears exactly once. Result: the reversed
    /// package [C:NONE, B:B1, A:A1] SOLVES with the same planHash (offerIds are keyed by npcId).
    function test_ReorderedPackage_IsValidAndSamePlanHash() public {
        bytes32 snap = coord.currentSnapshotHash(runId);
        Selection[] memory p = pkg3(sel(NPC_C_ID, OFFER_NONE), sel(NPC_B_ID, OFFER_B1), sel(NPC_A_ID, OFFER_A1));
        vm.recordLogs();
        vm.prank(player);
        coord.execute(runId, p, 0, snap);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertBalances(runId, [uint256(0), 1, 1, 0, 0, 0]);
        assertTrue(coord.runOf(runId).solved);
        assertEq(logs[logs.length - 1].data, abi.encode(uint64(1), snap, validPlanHash(snap)));
    }

    function test_RepeatAfterSolved_RevertsAlreadySolved() public {
        execAs(player, runId, validPkg());
        // SPEC Amendments: AlreadySolved is checked before RunNotActive, so the repeat (with the
        // fresh nonce 1 and live snapshot) reverts exactly AlreadySolved(runId).
        expectExecRevert(player, runId, validPkg(), abi.encodeWithSelector(AtomicCoordinator.AlreadySolved.selector, runId));
        // and with the stale pre-solve nonce/snapshot the run guard still fires first
        bytes32 snapNow = coord.currentSnapshotHash(runId);
        vm.expectRevert(abi.encodeWithSelector(AtomicCoordinator.AlreadySolved.selector, runId));
        vm.prank(player);
        coord.execute(runId, validPkg(), 0, bytes32(0));
        assertEq(coord.currentSnapshotHash(runId), snapNow);
        assertBalances(runId, [uint256(0), 1, 1, 0, 0, 0]);
        assertEq(uint256(coord.runOf(runId).nonce), 1);
    }

    function test_SecondStartRunAfterSolved_RevertsRunExists() public {
        execAs(player, runId, validPkg());
        vm.expectRevert(abi.encodeWithSelector(AtomicCoordinator.RunExists.selector, runId));
        vm.prank(player);
        coord.startRun();
    }

    // ======================================================= package rejections

    function test_Reject_EmptyArray_BadPackageLength() public {
        expectExecRevertFrom(
            player, runId, new Selection[](0), abi.encodeWithSelector(AtomicCoordinator.BadPackageLength.selector, 0),
            address(coord)
        );
    }

    function test_Reject_TwoEntries_BadPackageLength() public {
        Selection[] memory p = new Selection[](2);
        p[0] = sel(NPC_A_ID, OFFER_A1);
        p[1] = sel(NPC_B_ID, OFFER_B1);
        expectExecRevertFrom(player, runId, p, abi.encodeWithSelector(AtomicCoordinator.BadPackageLength.selector, 2), address(coord));
    }

    function test_Reject_FourEntries_BadPackageLength() public {
        Selection[] memory p = new Selection[](4);
        p[0] = sel(NPC_A_ID, OFFER_A1);
        p[1] = sel(NPC_B_ID, OFFER_B1);
        p[2] = sel(NPC_C_ID, OFFER_NONE);
        p[3] = sel(NPC_C_ID, OFFER_NONE);
        expectExecRevertFrom(player, runId, p, abi.encodeWithSelector(AtomicCoordinator.BadPackageLength.selector, 4), address(coord));
    }

    /// [A:NONE,B:NONE,C:NONE]: no transfers; A validates first (npcId order) and its expected
    /// final holdings (1 KEY, 0 COIN) differ from its goal -> PlanRejected(0, GOAL_NOT_MET=9).
    function test_Reject_AllNone_PlanRejectedA_GoalNotMet() public {
        expectExecRevertFrom(
            player,
            runId,
            pkg3(sel(NPC_A_ID, OFFER_NONE), sel(NPC_B_ID, OFFER_NONE), sel(NPC_C_ID, OFFER_NONE)),
            abi.encodeWithSelector(INpc.PlanRejected.selector, NPC_A_ID, GOAL_NOT_MET),
            address(npcA)
        );
    }

    /// Only A1: A sends its KEY but nothing arrives from B -> PlanRejected(0, INCOMING_MISSING=4).
    function test_Reject_OnlyA1_PlanRejectedA_IncomingMissing() public {
        expectExecRevertFrom(
            player,
            runId,
            pkg3(sel(NPC_A_ID, OFFER_A1), sel(NPC_B_ID, OFFER_NONE), sel(NPC_C_ID, OFFER_NONE)),
            abi.encodeWithSelector(INpc.PlanRejected.selector, NPC_A_ID, INCOMING_MISSING),
            address(npcA)
        );
    }

    /// Only B1: A (NONE) validates first and sees an incoming COIN -> PlanRejected(0, UNEXPECTED_INCOMING=6).
    function test_Reject_OnlyB1_PlanRejectedA_UnexpectedIncoming() public {
        expectExecRevertFrom(
            player,
            runId,
            pkg3(sel(NPC_A_ID, OFFER_NONE), sel(NPC_B_ID, OFFER_B1), sel(NPC_C_ID, OFFER_NONE)),
            abi.encodeWithSelector(INpc.PlanRejected.selector, NPC_A_ID, UNEXPECTED_INCOMING),
            address(npcA)
        );
    }

    function test_Reject_DuplicateNpcId() public {
        expectExecRevertFrom(
            player,
            runId,
            pkg3(sel(NPC_A_ID, OFFER_A1), sel(NPC_A_ID, OFFER_A1), sel(NPC_C_ID, OFFER_NONE)),
            abi.encodeWithSelector(AtomicCoordinator.DuplicateNpc.selector, NPC_A_ID),
            address(coord)
        );
        expectExecRevertFrom(
            player,
            runId,
            pkg3(sel(NPC_A_ID, OFFER_A1), sel(NPC_B_ID, OFFER_B1), sel(NPC_B_ID, OFFER_B1)),
            abi.encodeWithSelector(AtomicCoordinator.DuplicateNpc.selector, NPC_B_ID),
            address(coord)
        );
    }

    function test_Reject_InvalidNpcId() public {
        expectExecRevertFrom(
            player,
            runId,
            pkg3(sel(NPC_A_ID, OFFER_A1), sel(NPC_B_ID, OFFER_B1), sel(3, OFFER_NONE)),
            abi.encodeWithSelector(AtomicCoordinator.InvalidNpc.selector, uint8(3)),
            address(coord)
        );
    }

    /// Same offer id used for two different NPCs: the foreign holder does not own it -> UnknownOffer.
    function test_Reject_DuplicateOfferIds() public {
        expectExecRevertFrom(
            player,
            runId,
            pkg3(sel(NPC_A_ID, OFFER_A1), sel(NPC_B_ID, OFFER_A1), sel(NPC_C_ID, OFFER_NONE)),
            abi.encodeWithSelector(AtomicCoordinator.UnknownOffer.selector, NPC_B_ID, OFFER_A1),
            address(coord)
        );
        expectExecRevertFrom(
            player,
            runId,
            pkg3(sel(NPC_A_ID, OFFER_B1), sel(NPC_B_ID, OFFER_B1), sel(NPC_C_ID, OFFER_NONE)),
            abi.encodeWithSelector(AtomicCoordinator.UnknownOffer.selector, NPC_A_ID, OFFER_B1),
            address(coord)
        );
    }

    function test_Reject_UnknownOffer() public {
        expectExecRevertFrom(
            player,
            runId,
            pkg3(sel(NPC_A_ID, OFFER_X), sel(NPC_B_ID, OFFER_B1), sel(NPC_C_ID, OFFER_NONE)),
            abi.encodeWithSelector(AtomicCoordinator.UnknownOffer.selector, NPC_A_ID, OFFER_X),
            address(coord)
        );
    }

    function test_Reject_OfferAtObserverC() public {
        expectExecRevertFrom(
            player,
            runId,
            pkg3(sel(NPC_A_ID, OFFER_A1), sel(NPC_B_ID, OFFER_B1), sel(NPC_C_ID, OFFER_A1)),
            abi.encodeWithSelector(AtomicCoordinator.ObserverMustSelectNone.selector, OFFER_A1),
            address(coord)
        );
        expectExecRevertFrom(
            player,
            runId,
            pkg3(sel(NPC_A_ID, OFFER_A1), sel(NPC_B_ID, OFFER_B1), sel(NPC_C_ID, OFFER_X)),
            abi.encodeWithSelector(AtomicCoordinator.ObserverMustSelectNone.selector, OFFER_X),
            address(coord)
        );
    }

    // ============================================================== run guards

    function test_Reject_ForeignUserExecutesRun_NotRunOwner() public {
        bytes32 snap = coord.currentSnapshotHash(runId);
        FullState memory b = capture(runId);
        vm.expectRevert(abi.encodeWithSelector(AtomicCoordinator.NotRunOwner.selector, runId, attacker));
        vm.prank(attacker);
        coord.execute(runId, validPkg(), 0, snap);
        assertStateEq(b, capture(runId));
    }

    function test_Reject_MissingRun_RunMissing() public {
        uint256 other = runIdOf(attacker);
        bytes32 snap = coord.currentSnapshotHash(other);
        FullState memory bOther = capture(other);
        FullState memory bMine = capture(runId);
        vm.expectRevert(abi.encodeWithSelector(AtomicCoordinator.RunMissing.selector, other), address(coord));
        vm.prank(attacker);
        coord.execute(other, validPkg(), 0, snap);
        assertStateEq(bOther, capture(other));
        assertStateEq(bMine, capture(runId));
        assertEq(coord.runOf(other).owner, address(0), "no run created");
        assertFalse(items.isGranted(other), "no stock granted");
    }

    function test_Reject_WrongNonce_StaleNonce() public {
        FullState memory b = capture(runId);
        vm.expectRevert(abi.encodeWithSelector(AtomicCoordinator.StaleNonce.selector, uint256(1), uint256(0)));
        vm.prank(player);
        coord.execute(runId, validPkg(), 1, b.snap);
        assertStateEq(b, capture(runId));
    }

    function test_Reject_WrongSnapshot_StaleSnapshot() public {
        FullState memory b = capture(runId);
        bytes32 wrong = keccak256("wrong");
        vm.expectRevert(abi.encodeWithSelector(AtomicCoordinator.StaleSnapshot.selector, wrong, b.snap));
        vm.prank(player);
        coord.execute(runId, validPkg(), 0, wrong);
        assertStateEq(b, capture(runId));
    }

    // ================================================================ isolation

    function test_PlayersIsolated() public {
        uint256 run2 = start(player2);
        assertTrue(run2 != runId);
        FullState memory s2 = capture(run2);
        bytes32 snap1 = coord.currentSnapshotHash(runId);
        assertTrue(snap1 != s2.snap, "snapshots are run-bound");

        // player2 cannot execute player1's run, nor use player1's snapshot for its own run
        vm.expectRevert(abi.encodeWithSelector(AtomicCoordinator.NotRunOwner.selector, runId, player2));
        vm.prank(player2);
        coord.execute(runId, validPkg(), 0, snap1);
        vm.expectRevert(abi.encodeWithSelector(AtomicCoordinator.StaleSnapshot.selector, snap1, s2.snap));
        vm.prank(player2);
        coord.execute(run2, validPkg(), 0, snap1);

        // player1 solves; player2's run is untouched
        execAs(player, runId, validPkg());
        assertBalances(runId, [uint256(0), 1, 1, 0, 0, 0]);
        assertStateEq(s2, capture(run2));
        assertBalances(run2, [uint256(1), 0, 0, 1, 0, 0]);

        // player2 solves independently; player1's state stays as solved
        FullState memory s1 = capture(runId);
        execAs(player2, run2, validPkg());
        assertBalances(run2, [uint256(0), 1, 1, 0, 0, 0]);
        assertTrue(coord.runOf(run2).solved);
        assertStateEq(s1, capture(runId));
    }

    // ================================================================= helpers

    function _assertConserved(uint256 id) internal view {
        uint256[6] memory b = items.snapshotBalances(id);
        assertEq(b[0] + b[2] + b[4], 1, "KEY total");
        assertEq(b[1] + b[3] + b[5], 1, "COIN total");
    }

    function _assertPermitIssued(
        Vm.Log memory l,
        address emitter,
        uint8 npcId,
        bytes32 offerId,
        bytes32 snap,
        bytes32 planHash
    ) internal view {
        assertEq(l.emitter, emitter, "PermitIssued emitter");
        assertEq(l.topics.length, 4);
        assertEq(l.topics[0], SIG_PERMIT_ISSUED);
        assertEq(l.topics[1], bytes32(runId));
        assertEq(l.topics[2], bytes32(uint256(npcId)));
        assertEq(l.topics[3], offerId);
        assertEq(l.data, abi.encode(snap, planHash));
    }

    function _assertPermitConsumed(Vm.Log memory l, address emitter, uint8 npcId, bytes32 offerId) internal view {
        assertEq(l.emitter, emitter, "PermitConsumed emitter");
        assertEq(l.topics.length, 4);
        assertEq(l.topics[0], SIG_PERMIT_CONSUMED);
        assertEq(l.topics[1], bytes32(runId));
        assertEq(l.topics[2], bytes32(uint256(npcId)));
        assertEq(l.topics[3], offerId);
        assertEq(l.data.length, 0);
    }

    function _assertItemMoved(Vm.Log memory l, uint8 from, uint8 to, uint8 item, uint32 qty) internal view {
        assertEq(l.emitter, address(items), "ItemMoved emitter");
        assertEq(l.topics.length, 4);
        assertEq(l.topics[0], SIG_ITEM_MOVED);
        assertEq(l.topics[1], bytes32(runId));
        assertEq(l.topics[2], bytes32(uint256(from)));
        assertEq(l.topics[3], bytes32(uint256(to)));
        assertEq(l.data, abi.encode(item, qty));
    }
}
