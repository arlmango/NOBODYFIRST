// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

// =====================================================================================
// FAULT INJECTION: coordinator/NPC defensive checks that an honest deployment never trips.
// Production src is unmodified. Faults come only from test/harness/FaultFixtures.sol:
//   NPC_B subclasses (override virtual `release` only), standalone INpc fixtures (slot B or C),
//   and ledger probes installed with vm.etch over the production GameItems address (same
//   storage layout, checked by reading the pre-etch balances back through the probe).
// Wiring with fixtures is built here with vm.computeCreateAddress (like Level1LateFailure);
// tests with ledger probes use the unmodified Level1Deployer wiring.
// Shared selectors (Reentrancy, UnknownOffer, InvalidNpc, PlanRejected) are pinned to the
// originating contract with vm.expectRevert(bytes, address reverter).
//
// Checks NOT reachable with any honest or faulty NPC/ledger we can build without editing src:
//   * AtomicCoordinator.ConservationViolated: _simulate subtracts and adds the same qty of the
//     same item for every transfer, and InvalidTransfer already guarantees item in {KEY, COIN}
//     and npc ids in range, so per-item sums are equal by construction (defence in depth).
//   * AtomicCoordinator.RunNotActive: every run is created active and becomes inactive only
//     together with solved=true, which AlreadySolved (checked first) reports.
//   * NpcBase rejection code 10 OBSERVER_TOUCHED: codes 7 (C sends) / 6 (C receives) fire first.
//   * NpcBase rejection code 8 via execute: the coordinator's InsufficientStock (step 5) fires
//     before any NPC validates (code 8 is covered by direct validatePlan in Level1Exchange).
//   * Level1Deployer.PredictionMismatch / UnsupportedNonce: CREATE addresses are deterministic
//     and the constructor only uses nonces 1..5.
// =====================================================================================

import {Level1TestBase} from "./harness/Level1TestBase.sol";
import {
    NoopReleaseNpcB,
    KeepPermitNpcB,
    ReenterExecuteNpcB,
    ReenterStartRunNpcB,
    RejectingObserverC,
    MalformedOfferNpcB,
    PrepareMutatingNpcB,
    PermitOrderLedgerProbe,
    ReentrantLedgerProbe
} from "./harness/FaultFixtures.sol";
import {Permit, KEY, NPC_A_ID, NPC_B_ID, NPC_C_ID, OFFER_A1, OFFER_B1, OBSERVER_TOUCHED} from "../src/Types.sol";
import {GameItems} from "../src/GameItems.sol";
import {NPC_A} from "../src/NPC_A.sol";
import {NPC_B} from "../src/NPC_B.sol";
import {NPC_C} from "../src/NPC_C.sol";
import {AtomicCoordinator} from "../src/AtomicCoordinator.sol";
import {INpc} from "../src/interfaces/INpc.sol";

contract Level1FaultInjectionTest is Level1TestBase {
    enum BKind {
        Production,
        NoopRelease,
        KeepPermit,
        ReenterExecute,
        ReenterStartRun,
        MalformedOffer,
        PrepareMutating
    }

    enum CKind {
        Production,
        RejectingObserver
    }

    uint256 internal runId;

    function _wire(BKind b, CKind c) internal {
        uint256 n = vm.getNonce(address(this));
        address pItems = vm.computeCreateAddress(address(this), n);
        address pA = vm.computeCreateAddress(address(this), n + 1);
        address pB = vm.computeCreateAddress(address(this), n + 2);
        address pC = vm.computeCreateAddress(address(this), n + 3);
        address pCoord = vm.computeCreateAddress(address(this), n + 4);

        items = new GameItems(pCoord, pA, pB, pC);
        npcA = new NPC_A(pItems, pCoord);
        address bAddr;
        if (b == BKind.Production) bAddr = address(new NPC_B(pItems, pCoord));
        else if (b == BKind.NoopRelease) bAddr = address(new NoopReleaseNpcB(pItems, pCoord));
        else if (b == BKind.KeepPermit) bAddr = address(new KeepPermitNpcB(pItems, pCoord));
        else if (b == BKind.ReenterExecute) bAddr = address(new ReenterExecuteNpcB(pItems, pCoord));
        else if (b == BKind.ReenterStartRun) bAddr = address(new ReenterStartRunNpcB(pItems, pCoord));
        else if (b == BKind.MalformedOffer) bAddr = address(new MalformedOfferNpcB(pItems, pCoord, OFFER_B1));
        else bAddr = address(new PrepareMutatingNpcB(pItems, pCoord, OFFER_B1));
        npcB = NPC_B(bAddr); // only INpc functions are called on it
        address cAddr = c == CKind.Production
            ? address(new NPC_C(pItems, pCoord))
            : address(new RejectingObserverC(pItems, pCoord));
        npcC = NPC_C(cAddr);
        coord = new AtomicCoordinator(pItems, pA, pB, pC);

        assertEq(address(items), pItems);
        assertEq(address(npcA), pA);
        assertEq(address(npcB), pB);
        assertEq(address(npcC), pC);
        assertEq(address(coord), pCoord);
        runId = start(player);
    }

    function _execExpect(bytes memory err, address reverter) internal {
        expectExecRevertFrom(player, runId, validPkg(), err, reverter);
        assertBalances(runId, [uint256(1), 0, 0, 1, 0, 0]);
        assertNoActivePermits(runId);
    }

    // ------------------------------------------------------------------ control

    function test_Fault_Control_ProductionWiringSolves() public {
        _wire(BKind.Production, CKind.Production);
        execAs(player, runId, validPkg());
        assertBalances(runId, [uint256(0), 1, 1, 0, 0, 0]);
        assertTrue(coord.runOf(runId).solved);
    }

    // ----------------------------------------------- MAJOR-2: permit before ledger

    /// Production NpcBase.release deletes the permit BEFORE calling the ledger: a probe ledger
    /// that reverts if the caller's permit is still active lets the full settlement pass.
    /// (Reviewer mutant M01 — delete moved after the ledger call — makes this test fail.)
    function test_Fault_PermitConsumedBeforeLedgerCall() public {
        deployViaDeployer();
        runId = start(player);
        uint256[6] memory pre = items.snapshotBalances(runId);
        PermitOrderLedgerProbe probe = new PermitOrderLedgerProbe(address(npcA), address(npcB), address(npcC));
        vm.etch(address(items), address(probe).code);
        // layout check: the probe reads the production ledger's storage unchanged
        uint256[6] memory post = items.snapshotBalances(runId);
        for (uint256 i = 0; i < 6; i++) {
            assertEq(post[i], pre[i], "probe storage layout");
        }
        assertTrue(items.isGranted(runId));

        execAs(player, runId, validPkg());
        assertTrue(coord.runOf(runId).solved);
        assertBalances(runId, [uint256(0), 1, 1, 0, 0, 0]);
        assertNoActivePermits(runId);
    }

    /// The probe is not vacuous: a ledger call while the caller holds an active permit reverts.
    function test_Fault_PermitOrderProbe_DetectsActivePermit() public {
        deployViaDeployer();
        runId = start(player);
        PermitOrderLedgerProbe probe = new PermitOrderLedgerProbe(address(npcA), address(npcB), address(npcC));
        vm.etch(address(items), address(probe).code);
        bytes32 snap = coord.currentSnapshotHash(runId);
        uint256[6] memory live = items.snapshotBalances(runId);
        vm.prank(address(coord));
        npcA.authorize(runId, OFFER_A1, validTransfers(), live, snap, validPlanHash(snap));
        assertTrue(npcA.permitOf(runId).active);
        vm.expectRevert(
            abi.encodeWithSelector(PermitOrderLedgerProbe.PermitStillActiveDuringLedgerCall.selector, address(npcA), runId),
            address(items)
        );
        vm.prank(address(npcA));
        items.transferFromNpc(runId, NPC_B_ID, KEY, 1);
    }

    // --------------------------------------------------------------- re-entrancy

    /// NPC-level lock: the (probe) ledger calls back into npcA.release during A's release.
    /// NpcBase checks the lock before the coordinator gate -> Reentrancy() from npcA (M31).
    function test_Fault_NpcReentrancyViaLedger_Reentrancy() public {
        deployViaDeployer();
        runId = start(player);
        ReentrantLedgerProbe probe = new ReentrantLedgerProbe(address(npcA), address(npcB), address(npcC));
        vm.etch(address(items), address(probe).code);
        _execExpect(abi.encodeWithSelector(INpc.Reentrancy.selector), address(npcA));
    }

    /// Coordinator lock: B's release re-enters execute -> Reentrancy() from the coordinator (M30).
    function test_Fault_ReenterExecute_CoordinatorReentrancy() public {
        _wire(BKind.ReenterExecute, CKind.Production);
        _execExpect(abi.encodeWithSelector(AtomicCoordinator.Reentrancy.selector), address(coord));
    }

    /// Coordinator lock: B's release re-enters startRun -> Reentrancy() from the coordinator.
    function test_Fault_ReenterStartRun_CoordinatorReentrancy() public {
        _wire(BKind.ReenterStartRun, CKind.Production);
        _execExpect(abi.encodeWithSelector(AtomicCoordinator.Reentrancy.selector), address(coord));
        assertEq(coord.runOf(runIdOf(address(npcB))).owner, address(0), "no run for the NPC");
    }

    // ---------------------------------------------------------- step 9 checks

    /// B's release is a no-op: B's COIN never moves and B's permit is NOT consumed. The first
    /// step-9 check (actual == expected) fires: SettlementMismatch() (M08). Had it been skipped,
    /// PermitsRemaining(1) would follow. All rolled back: no permit remains afterwards.
    function test_Fault_NoopReleaseB_SettlementMismatch() public {
        _wire(BKind.NoopRelease, CKind.Production);
        _execExpect(abi.encodeWithSelector(AtomicCoordinator.SettlementMismatch.selector), address(coord));
    }

    /// B's release moves the stock but keeps its permit: balances match, PermitsRemaining(1) (M10).
    function test_Fault_KeepPermitB_PermitsRemaining() public {
        _wire(BKind.KeepPermit, CKind.Production);
        _execExpect(abi.encodeWithSelector(AtomicCoordinator.PermitsRemaining.selector, NPC_B_ID), address(coord));
    }

    // ----------------------------------------------------------- steps 4/6/7

    /// Observer C's own validation rejects the valid package: the coordinator really asks C
    /// (M13 skip-C, M29 "A1+B1 wins" special case both make this solve instead).
    function test_Fault_RejectingObserverC_PlanRejectedFromC() public {
        _wire(BKind.Production, CKind.RejectingObserver);
        _execExpect(abi.encodeWithSelector(INpc.PlanRejected.selector, NPC_C_ID, OBSERVER_TOUCHED), address(npcC));
    }

    /// B's offer terms are malformed (qty 0): coordinator sanity check InvalidTransfer(1) (M12).
    function test_Fault_MalformedOfferB_InvalidTransfer() public {
        _wire(BKind.MalformedOffer, CKind.Production);
        _execExpect(abi.encodeWithSelector(AtomicCoordinator.InvalidTransfer.selector, NPC_B_ID), address(coord));
    }

    /// B moves ledger stock inside authorize: PrepareChangedState() after the prepare phase (M11).
    function test_Fault_PrepareMutatingB_PrepareChangedState() public {
        _wire(BKind.PrepareMutating, CKind.Production);
        _execExpect(abi.encodeWithSelector(AtomicCoordinator.PrepareChangedState.selector), address(coord));
    }

    // ------------------------------------------------------- constructor guards

    function test_Fault_CoordinatorAndNpcConstructorGuards() public {
        vm.expectRevert(abi.encodeWithSelector(AtomicCoordinator.ZeroAddress.selector));
        new AtomicCoordinator(address(0), address(1), address(2), address(3));
        vm.expectRevert(abi.encodeWithSelector(AtomicCoordinator.DuplicateAddress.selector));
        new AtomicCoordinator(address(1), address(1), address(2), address(3));
        vm.expectRevert(abi.encodeWithSelector(AtomicCoordinator.DuplicateAddress.selector));
        new AtomicCoordinator(address(4), address(1), address(2), address(2));
        vm.expectRevert(abi.encodeWithSelector(INpc.ZeroAddress.selector));
        new NPC_A(address(0), address(1));
        vm.expectRevert(abi.encodeWithSelector(INpc.ZeroAddress.selector));
        new NPC_B(address(1), address(0));
    }
}
