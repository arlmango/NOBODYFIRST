// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

// Permission evidence on the production deployment (Level1Deployer): who may grant, move,
// authorize and release; permit binding and one-time use (pranked coordinator); and that every
// rejected call leaves the full run state unchanged.
//
// Trust boundary (stated, not hidden): the ledger trusts the three registered NPC addresses to
// spend their own balance. A pranked NPC address therefore CAN move that NPC's own stock; in
// production only NpcBase.release (coordinator-only, permit-gated) makes that call. Likewise a
// pranked coordinator can drive authorize/release directly — those tests show the NPC-side
// checks (permit match, one-time use) that still hold even against the coordinator address.

import {Level1TestBase} from "./harness/Level1TestBase.sol";
import {
    Transfer,
    Permit,
    KEY,
    COIN,
    NPC_A_ID,
    NPC_B_ID,
    NPC_C_ID,
    OFFER_NONE,
    OFFER_A1,
    OFFER_B1,
    INCOMING_MISSING,
    UNKNOWN_OFFER
} from "../src/Types.sol";
import {AtomicCoordinator} from "../src/AtomicCoordinator.sol";
import {IGameItems} from "../src/interfaces/IGameItems.sol";
import {INpc} from "../src/interfaces/INpc.sol";

contract Level1PermissionsTest is Level1TestBase {
    uint256 internal runId;

    function setUp() public {
        deployViaDeployer();
        runId = start(player);
    }

    // ============================================================ run / grant

    function test_SecondStartRun_RunExists() public {
        FullState memory b = capture(runId);
        vm.expectRevert(abi.encodeWithSelector(AtomicCoordinator.RunExists.selector, runId));
        vm.prank(player);
        coord.startRun();
        assertStateEq(b, capture(runId));
    }

    function test_DirectGrantInitial_NotCoordinator() public {
        FullState memory b = capture(runId);
        address[4] memory callers = [player, attacker, address(npcA), address(this)];
        for (uint256 i = 0; i < callers.length; i++) {
            vm.expectRevert(abi.encodeWithSelector(IGameItems.NotCoordinator.selector));
            vm.prank(callers[i]);
            items.grantInitial(runId);
        }
        // also for a not-yet-started run: nobody but the coordinator can create stock
        uint256 other = runIdOf(attacker);
        vm.expectRevert(abi.encodeWithSelector(IGameItems.NotCoordinator.selector));
        vm.prank(attacker);
        items.grantInitial(other);
        assertFalse(items.isGranted(other));
        assertStateEq(b, capture(runId));
    }

    function test_RepeatedGrantByCoordinator_AlreadyGranted() public {
        FullState memory b = capture(runId);
        vm.expectRevert(abi.encodeWithSelector(IGameItems.AlreadyGranted.selector, runId));
        vm.prank(address(coord));
        items.grantInitial(runId);
        assertStateEq(b, capture(runId));
    }

    // ============================================== foreign escrow via ledger

    function test_LedgerTransfer_ByUser_NotRegisteredNpc() public {
        FullState memory b = capture(runId);
        vm.expectRevert(abi.encodeWithSelector(IGameItems.NotRegisteredNpc.selector, player));
        vm.prank(player);
        items.transferFromNpc(runId, NPC_C_ID, KEY, 1);
        vm.expectRevert(abi.encodeWithSelector(IGameItems.NotRegisteredNpc.selector, attacker));
        vm.prank(attacker);
        items.transferFromNpc(runId, NPC_B_ID, KEY, 1);
        assertStateEq(b, capture(runId));
    }

    function test_LedgerTransfer_ByCoordinator_NotRegisteredNpc() public {
        FullState memory b = capture(runId);
        vm.expectRevert(abi.encodeWithSelector(IGameItems.NotRegisteredNpc.selector, address(coord)));
        vm.prank(address(coord));
        items.transferFromNpc(runId, NPC_B_ID, KEY, 1);
        assertStateEq(b, capture(runId));
    }

    /// A registered NPC can only spend its OWN balance: B and C trying to move A's KEY fail
    /// on their own (empty) KEY balance.
    function test_LedgerTransfer_WrongNpc_InsufficientBalance() public {
        FullState memory b = capture(runId);
        vm.expectRevert(
            abi.encodeWithSelector(IGameItems.InsufficientBalance.selector, runId, NPC_B_ID, KEY, uint256(0), uint256(1))
        );
        vm.prank(address(npcB));
        items.transferFromNpc(runId, NPC_C_ID, KEY, 1);
        vm.expectRevert(
            abi.encodeWithSelector(IGameItems.InsufficientBalance.selector, runId, NPC_C_ID, KEY, uint256(0), uint256(1))
        );
        vm.prank(address(npcC));
        items.transferFromNpc(runId, NPC_A_ID, KEY, 1);
        vm.expectRevert(
            abi.encodeWithSelector(IGameItems.InsufficientBalance.selector, runId, NPC_C_ID, COIN, uint256(0), uint256(1))
        );
        vm.prank(address(npcC));
        items.transferFromNpc(runId, NPC_B_ID, COIN, 1);
        assertStateEq(b, capture(runId));
    }

    function test_LedgerTransfer_ArgumentGuards() public {
        FullState memory b = capture(runId);
        uint256 notGranted = runIdOf(attacker);
        vm.startPrank(address(npcA));
        vm.expectRevert(abi.encodeWithSelector(IGameItems.RunNotGranted.selector, notGranted));
        items.transferFromNpc(notGranted, NPC_B_ID, KEY, 1);
        vm.expectRevert(abi.encodeWithSelector(IGameItems.InvalidItem.selector, uint8(0)));
        items.transferFromNpc(runId, NPC_B_ID, 0, 1);
        vm.expectRevert(abi.encodeWithSelector(IGameItems.InvalidItem.selector, uint8(3)));
        items.transferFromNpc(runId, NPC_B_ID, 3, 1);
        vm.expectRevert(abi.encodeWithSelector(IGameItems.InvalidNpc.selector, uint8(3)));
        items.transferFromNpc(runId, 3, KEY, 1);
        vm.expectRevert(abi.encodeWithSelector(IGameItems.SelfTransfer.selector));
        items.transferFromNpc(runId, NPC_A_ID, KEY, 1);
        vm.expectRevert(abi.encodeWithSelector(IGameItems.ZeroQuantity.selector));
        items.transferFromNpc(runId, NPC_B_ID, KEY, 0);
        vm.expectRevert(
            abi.encodeWithSelector(IGameItems.InsufficientBalance.selector, runId, NPC_A_ID, KEY, uint256(1), uint256(2))
        );
        items.transferFromNpc(runId, NPC_B_ID, KEY, 2);
        vm.stopPrank();
        assertStateEq(b, capture(runId));
    }

    // ============================================ authorize / release gates

    function test_DirectRelease_ByUser_NotCoordinator() public {
        FullState memory b = capture(runId);
        bytes32 snap = b.snap;
        bytes32 ph = validPlanHash(snap);
        address[3] memory callers = [player, attacker, address(npcB)];
        for (uint256 i = 0; i < callers.length; i++) {
            vm.expectRevert(abi.encodeWithSelector(INpc.NotCoordinator.selector));
            vm.prank(callers[i]);
            npcA.release(runId, OFFER_A1, snap, ph);
            vm.expectRevert(abi.encodeWithSelector(INpc.NotCoordinator.selector));
            vm.prank(callers[i]);
            npcB.release(runId, OFFER_B1, snap, ph);
        }
        assertStateEq(b, capture(runId));
    }

    function test_Authorize_ByNonCoordinator_NotCoordinator() public {
        FullState memory b = capture(runId);
        uint256[6] memory before = items.snapshotBalances(runId);
        bytes32 ph = validPlanHash(b.snap);
        address[3] memory callers = [player, attacker, address(npcB)];
        for (uint256 i = 0; i < callers.length; i++) {
            vm.expectRevert(abi.encodeWithSelector(INpc.NotCoordinator.selector));
            vm.prank(callers[i]);
            npcA.authorize(runId, OFFER_A1, validTransfers(), before, b.snap, ph);
        }
        assertStateEq(b, capture(runId));
    }

    function test_Authorize_NoneOrObserver_NothingToAuthorize() public {
        FullState memory b = capture(runId);
        uint256[6] memory before = items.snapshotBalances(runId);
        bytes32 ph = validPlanHash(b.snap);
        vm.startPrank(address(coord));
        vm.expectRevert(abi.encodeWithSelector(INpc.NothingToAuthorize.selector));
        npcC.authorize(runId, OFFER_NONE, validTransfers(), before, b.snap, ph);
        vm.expectRevert(abi.encodeWithSelector(INpc.NothingToAuthorize.selector));
        npcA.authorize(runId, OFFER_NONE, validTransfers(), before, b.snap, ph);
        // C with a foreign offer: rejected by its own validation (UNKNOWN_OFFER)
        vm.expectRevert(abi.encodeWithSelector(INpc.PlanRejected.selector, NPC_C_ID, UNKNOWN_OFFER));
        npcC.authorize(runId, OFFER_A1, validTransfers(), before, b.snap, ph);
        // A with an incomplete plan: NPC re-validates even for the coordinator
        Transfer[] memory onlyA = new Transfer[](1);
        onlyA[0] = validTransfers()[0];
        vm.expectRevert(abi.encodeWithSelector(INpc.PlanRejected.selector, NPC_A_ID, INCOMING_MISSING));
        npcA.authorize(runId, OFFER_A1, onlyA, before, b.snap, ph);
        vm.stopPrank();
        assertStateEq(b, capture(runId));
    }

    // ===================================== authorize: `before` must equal live ledger

    /// Forged `before` (A gets an extra COIN; swapped A/B balances) is rejected by A and B with
    /// BeforeMismatch(runId) even when the coordinator calls; no permit, nothing changes.
    function test_Authorize_ForgedBefore_BeforeMismatch() public {
        FullState memory b = capture(runId);
        bytes32 ph = validPlanHash(b.snap);
        uint256[6] memory extraCoin = items.snapshotBalances(runId);
        extraCoin[1] = 1; // A: 1 KEY + 1 COIN (not the live state)
        uint256[6] memory swapped = [uint256(0), 1, 1, 0, 0, 0]; // A/B holdings swapped

        vm.startPrank(address(coord));
        vm.expectRevert(abi.encodeWithSelector(INpc.BeforeMismatch.selector, runId));
        npcA.authorize(runId, OFFER_A1, validTransfers(), extraCoin, b.snap, ph);
        vm.expectRevert(abi.encodeWithSelector(INpc.BeforeMismatch.selector, runId));
        npcB.authorize(runId, OFFER_B1, validTransfers(), extraCoin, b.snap, ph);
        vm.expectRevert(abi.encodeWithSelector(INpc.BeforeMismatch.selector, runId));
        npcA.authorize(runId, OFFER_A1, validTransfers(), swapped, b.snap, ph);
        vm.expectRevert(abi.encodeWithSelector(INpc.BeforeMismatch.selector, runId));
        npcB.authorize(runId, OFFER_B1, validTransfers(), swapped, b.snap, ph);
        vm.stopPrank();

        assertStateEq(b, capture(runId));
        assertNoActivePermits(runId);
    }

    /// With the correct live `before` the same calls issue permits (positive control).
    function test_Authorize_LiveBefore_IssuesPermit() public {
        FullState memory b = capture(runId);
        uint256[6] memory live = items.snapshotBalances(runId);
        bytes32 ph = validPlanHash(b.snap);
        vm.startPrank(address(coord));
        npcA.authorize(runId, OFFER_A1, validTransfers(), live, b.snap, ph);
        npcB.authorize(runId, OFFER_B1, validTransfers(), live, b.snap, ph);
        vm.stopPrank();
        Permit memory pa = npcA.permitOf(runId);
        Permit memory pb = npcB.permitOf(runId);
        assertTrue(pa.active);
        assertTrue(pb.active);
        assertEq(pa.offerId, OFFER_A1);
        assertEq(pb.offerId, OFFER_B1);
        assertEq(pa.snapshotHash, b.snap);
        assertEq(pb.planHash, ph);
        assertBalances(runId, [uint256(1), 0, 0, 1, 0, 0]); // authorize moves nothing
    }

    /// Check order: BeforeMismatch precedes PlanRejected (forged before AND an invalid plan).
    /// The same invalid plan with the live `before` yields the PlanRejected code, proving the
    /// plan alone would be rejected.
    function test_Authorize_BeforeMismatchPrecedesPlanRejected() public {
        FullState memory b = capture(runId);
        bytes32 ph = validPlanHash(b.snap);
        uint256[6] memory forged = items.snapshotBalances(runId);
        forged[1] = 1;
        Transfer[] memory onlyA = new Transfer[](1);
        onlyA[0] = validTransfers()[0];

        vm.startPrank(address(coord));
        vm.expectRevert(abi.encodeWithSelector(INpc.BeforeMismatch.selector, runId));
        npcA.authorize(runId, OFFER_A1, onlyA, forged, b.snap, ph);
        uint256[6] memory live = items.snapshotBalances(runId); // read BEFORE expectRevert
        vm.expectRevert(abi.encodeWithSelector(INpc.PlanRejected.selector, NPC_A_ID, INCOMING_MISSING));
        npcA.authorize(runId, OFFER_A1, onlyA, live, b.snap, ph);
        vm.expectRevert(abi.encodeWithSelector(INpc.BeforeMismatch.selector, runId));
        npcB.authorize(runId, OFFER_B1, onlyA, forged, b.snap, ph);
        vm.stopPrank();

        assertStateEq(b, capture(runId));
    }

    /// Check order: PermitExists precedes BeforeMismatch; NothingToAuthorize precedes both.
    function test_Authorize_OrderPermitExistsAndNothingToAuthorizeBeforeMismatch() public {
        uint256[6] memory live = items.snapshotBalances(runId);
        uint256[6] memory forged = items.snapshotBalances(runId);
        forged[1] = 1;
        bytes32 snap = coord.currentSnapshotHash(runId);
        bytes32 ph = validPlanHash(snap);
        vm.startPrank(address(coord));
        vm.expectRevert(abi.encodeWithSelector(INpc.NothingToAuthorize.selector));
        npcA.authorize(runId, OFFER_NONE, validTransfers(), forged, snap, ph);
        npcA.authorize(runId, OFFER_A1, validTransfers(), live, snap, ph);
        vm.expectRevert(abi.encodeWithSelector(INpc.PermitExists.selector, runId));
        npcA.authorize(runId, OFFER_A1, validTransfers(), forged, snap, ph);
        vm.stopPrank();
    }

    function test_Release_WithoutPermit_NoPermit() public {
        FullState memory b = capture(runId);
        vm.expectRevert(abi.encodeWithSelector(INpc.NoPermit.selector, runId));
        vm.prank(address(coord));
        npcA.release(runId, OFFER_A1, b.snap, validPlanHash(b.snap));
        assertStateEq(b, capture(runId));
    }

    /// Permit lifecycle with a pranked coordinator: bound to (offer, snapshot, plan), one-time,
    /// consumed before the ledger spend, no balance change on authorize.
    function test_Permit_BindingMismatchAndOneTimeUse() public {
        FullState memory s0 = capture(runId);
        uint256[6] memory before = items.snapshotBalances(runId);
        bytes32 snap = s0.snap;
        bytes32 ph = validPlanHash(snap);

        vm.startPrank(address(coord));
        npcA.authorize(runId, OFFER_A1, validTransfers(), before, snap, ph);
        Permit memory p = npcA.permitOf(runId);
        assertEq(p.offerId, OFFER_A1);
        assertEq(p.snapshotHash, snap);
        assertEq(p.planHash, ph);
        assertTrue(p.active);
        assertBalances(runId, [uint256(1), 0, 0, 1, 0, 0]); // authorize moves nothing

        // second authorize while active
        vm.expectRevert(abi.encodeWithSelector(INpc.PermitExists.selector, runId));
        npcA.authorize(runId, OFFER_A1, validTransfers(), before, snap, ph);

        FullState memory s1 = capture(runId);
        // wrong plan hash / wrong snapshot / wrong offer
        vm.expectRevert(abi.encodeWithSelector(INpc.PermitMismatch.selector, runId));
        npcA.release(runId, OFFER_A1, snap, keccak256("other plan"));
        vm.expectRevert(abi.encodeWithSelector(INpc.PermitMismatch.selector, runId));
        npcA.release(runId, OFFER_A1, keccak256("other snapshot"), ph);
        vm.expectRevert(abi.encodeWithSelector(INpc.PermitMismatch.selector, runId));
        npcA.release(runId, OFFER_NONE, snap, ph);
        // permit of another run does not exist
        vm.expectRevert(abi.encodeWithSelector(INpc.NoPermit.selector, runIdOf(player2)));
        npcA.release(runIdOf(player2), OFFER_A1, snap, ph);
        assertStateEq(s1, capture(runId));

        // matching release: permit consumed, A's KEY moved to B
        npcA.release(runId, OFFER_A1, snap, ph);
        p = npcA.permitOf(runId);
        assertFalse(p.active);
        assertEq(p.planHash, bytes32(0));
        assertBalances(runId, [uint256(0), 0, 1, 1, 0, 0]);

        // replay of the consumed permit
        FullState memory s2 = capture(runId);
        vm.expectRevert(abi.encodeWithSelector(INpc.NoPermit.selector, runId));
        npcA.release(runId, OFFER_A1, snap, ph);
        vm.stopPrank();
        assertStateEq(s2, capture(runId));

        // The live snapshot moved, so the player's old snapshot is stale ...
        vm.expectRevert(abi.encodeWithSelector(AtomicCoordinator.StaleSnapshot.selector, snap, s2.snap));
        vm.prank(player);
        coord.execute(runId, validPkg(), 0, snap);
        // ... and with the fresh snapshot the coordinator's in-memory stock check rejects A1
        // (A has 0 KEY in `before`) before any NPC is asked.
        vm.expectRevert(
            abi.encodeWithSelector(AtomicCoordinator.InsufficientStock.selector, NPC_A_ID, KEY, uint256(0), uint256(1))
        );
        vm.prank(player);
        coord.execute(runId, validPkg(), 0, s2.snap);
        assertStateEq(s2, capture(runId));
    }

    /// A permit issued for one run cannot be used for another run of the same NPC.
    function test_Permit_IsRunScoped() public {
        uint256 run2 = start(player2);
        FullState memory b2 = capture(run2);
        bytes32 snap1 = coord.currentSnapshotHash(runId);
        bytes32 ph = validPlanHash(snap1);
        vm.startPrank(address(coord));
        npcB.authorize(runId, OFFER_B1, validTransfers(), items.snapshotBalances(runId), snap1, ph);
        vm.expectRevert(abi.encodeWithSelector(INpc.NoPermit.selector, run2));
        npcB.release(run2, OFFER_B1, snap1, ph);
        vm.stopPrank();
        assertStateEq(b2, capture(run2));
    }

    /// Successful solve leaves no permit anywhere and the coordinator itself holds no permit path
    /// for C (observer never authorized).
    function test_NoResidualPermitsAfterSolve() public {
        execAs(player, runId, validPkg());
        assertNoActivePermits(runId);
        assertBalances(runId, [uint256(0), 1, 1, 0, 0, 0]);
    }

    function test_Execute_ByCoordinatorOrNpcAddress_NotRunOwner() public {
        FullState memory b = capture(runId);
        address[3] memory callers = [address(coord), address(npcA), address(items)];
        for (uint256 i = 0; i < callers.length; i++) {
            vm.expectRevert(abi.encodeWithSelector(AtomicCoordinator.NotRunOwner.selector, runId, callers[i]));
            vm.prank(callers[i]);
            coord.execute(runId, validPkg(), 0, b.snap);
        }
        assertStateEq(b, capture(runId));
        // sanity: B1 offer id is not accepted by A even through the view path
        assertFalse(npcA.hasOffer(OFFER_B1));
    }
}
