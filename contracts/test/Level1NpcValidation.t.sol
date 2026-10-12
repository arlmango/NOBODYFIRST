// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

// NPC independent plan validation on the production deployment (Level1Deployer): direct
// (view, anyone) validatePlan calls reaching every reachable rejection code with exact
// PlanRejected(npcId, code), the emitting NPC pinned via vm.expectRevert(bytes, address).
// (Moved out of Level1Exchange.t.sol unchanged to keep files under 500 lines.)

import {Level1TestBase} from "./harness/Level1TestBase.sol";
import {
    Transfer,
    KEY,
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
import {INpc} from "../src/interfaces/INpc.sol";

contract Level1NpcValidationTest is Level1TestBase {
    uint256 internal runId;

    function setUp() public {
        deployViaDeployer();
        runId = start(player);
    }

    // ================================================== NPC independent checks

    /// Direct (view, anyone) calls of validatePlan reach the remaining rejection codes.
    /// Code 10 OBSERVER_TOUCHED is unreachable: with the SPEC check order any transfer touching C
    /// is caught first by 7 (C sends) or 6 (C receives).
    function test_NpcValidatePlan_Codes() public {
        uint256[6] memory before = items.snapshotBalances(runId);
        Transfer[] memory v = validTransfers();
        // accepted
        npcA.validatePlan(runId, OFFER_A1, v, before);
        npcB.validatePlan(runId, OFFER_B1, v, before);
        npcC.validatePlan(runId, OFFER_NONE, v, before);

        // 1 UNKNOWN_OFFER
        vm.expectRevert(abi.encodeWithSelector(INpc.PlanRejected.selector, NPC_A_ID, UNKNOWN_OFFER));
        npcA.validatePlan(runId, OFFER_B1, v, before);
        vm.expectRevert(abi.encodeWithSelector(INpc.PlanRejected.selector, NPC_C_ID, UNKNOWN_OFFER));
        npcC.validatePlan(runId, OFFER_A1, v, before);

        // 2 OWN_TRANSFER_MISSING: B1 selected but plan only has A's transfer
        Transfer[] memory onlyA = new Transfer[](1);
        onlyA[0] = v[0];
        vm.expectRevert(abi.encodeWithSelector(INpc.PlanRejected.selector, NPC_B_ID, OWN_TRANSFER_MISSING));
        npcB.validatePlan(runId, OFFER_B1, onlyA, before);

        // 3 OWN_TRANSFER_MISMATCH: wrong qty / duplicated own transfer
        Transfer[] memory m = validTransfers();
        m[0].qty = 2;
        vm.expectRevert(abi.encodeWithSelector(INpc.PlanRejected.selector, NPC_A_ID, OWN_TRANSFER_MISMATCH));
        npcA.validatePlan(runId, OFFER_A1, m, before);
        Transfer[] memory dup = new Transfer[](3);
        dup[0] = v[0];
        dup[1] = v[0];
        dup[2] = v[1];
        vm.expectRevert(abi.encodeWithSelector(INpc.PlanRejected.selector, NPC_A_ID, OWN_TRANSFER_MISMATCH));
        npcA.validatePlan(runId, OFFER_A1, dup, before);

        // 4 INCOMING_MISSING
        vm.expectRevert(abi.encodeWithSelector(INpc.PlanRejected.selector, NPC_A_ID, INCOMING_MISSING));
        npcA.validatePlan(runId, OFFER_A1, onlyA, before);

        // 5 INCOMING_MISMATCH: B sends KEY instead of COIN
        Transfer[] memory w = validTransfers();
        w[1].item = KEY;
        vm.expectRevert(abi.encodeWithSelector(INpc.PlanRejected.selector, NPC_A_ID, INCOMING_MISMATCH));
        npcA.validatePlan(runId, OFFER_A1, w, before);

        // 6 UNEXPECTED_INCOMING: C receives
        Transfer[] memory toC = new Transfer[](1);
        toC[0] = Transfer({fromNpc: NPC_A_ID, toNpc: NPC_C_ID, item: KEY, qty: 1});
        vm.expectRevert(abi.encodeWithSelector(INpc.PlanRejected.selector, NPC_C_ID, UNEXPECTED_INCOMING));
        npcC.validatePlan(runId, OFFER_NONE, toC, before);

        // 7 UNEXPECTED_OUTGOING: C sends (also receives -> 7 wins by order)
        Transfer[] memory fromC = new Transfer[](2);
        fromC[0] = Transfer({fromNpc: NPC_C_ID, toNpc: NPC_A_ID, item: KEY, qty: 1});
        fromC[1] = toC[0];
        vm.expectRevert(abi.encodeWithSelector(INpc.PlanRejected.selector, NPC_C_ID, UNEXPECTED_OUTGOING));
        npcC.validatePlan(runId, OFFER_NONE, fromC, before);

        // 8 INSUFFICIENT_STOCK: A has no KEY in `before` (incoming never counts as stock)
        uint256[6] memory noKey = items.snapshotBalances(runId); // fresh copy (no aliasing)
        noKey[0] = 0;
        vm.expectRevert(abi.encodeWithSelector(INpc.PlanRejected.selector, NPC_A_ID, INSUFFICIENT_STOCK));
        npcA.validatePlan(runId, OFFER_A1, v, noKey);

        // 9 GOAL_NOT_MET: A would end with 2 COIN
        uint256[6] memory extra = items.snapshotBalances(runId); // fresh copy
        extra[1] = 1;
        vm.expectRevert(abi.encodeWithSelector(INpc.PlanRejected.selector, NPC_A_ID, GOAL_NOT_MET));
        npcA.validatePlan(runId, OFFER_A1, v, extra);
    }

    /// Exact incoming/outgoing field checks of NpcBase._checkShape, for A and for B
    /// (reviewer mutants M03 source, M25 incoming qty, M26 own recipient, M27 multiple incoming).
    /// Each case differs from the valid plan in exactly one field so only that check can reject;
    /// without the check the NPC's goal computation (from its immutable terms) would accept.
    function test_NpcValidatePlan_IncomingSourceQtyRecipientMultiplicity() public {
        uint256[6] memory before = items.snapshotBalances(runId);
        Transfer[] memory t;

        // --- incoming source (fromNpc must be needFrom)
        t = validTransfers();
        t[1].fromNpc = NPC_C_ID; // COIN for A "from C"
        vm.expectRevert(abi.encodeWithSelector(INpc.PlanRejected.selector, NPC_A_ID, INCOMING_MISMATCH), address(npcA));
        npcA.validatePlan(runId, OFFER_A1, t, before);
        t = validTransfers();
        t[0].fromNpc = NPC_C_ID; // KEY for B "from C"
        vm.expectRevert(abi.encodeWithSelector(INpc.PlanRejected.selector, NPC_B_ID, INCOMING_MISMATCH), address(npcB));
        npcB.validatePlan(runId, OFFER_B1, t, before);

        // --- incoming quantity
        t = validTransfers();
        t[1].qty = 2;
        vm.expectRevert(abi.encodeWithSelector(INpc.PlanRejected.selector, NPC_A_ID, INCOMING_MISMATCH), address(npcA));
        npcA.validatePlan(runId, OFFER_A1, t, before);
        t = validTransfers();
        t[0].qty = 2;
        vm.expectRevert(abi.encodeWithSelector(INpc.PlanRejected.selector, NPC_B_ID, INCOMING_MISMATCH), address(npcB));
        npcB.validatePlan(runId, OFFER_B1, t, before);

        // --- own transfer recipient (toNpc must be giveTo)
        t = validTransfers();
        t[0].toNpc = NPC_C_ID; // A gives its KEY to C instead of B
        vm.expectRevert(
            abi.encodeWithSelector(INpc.PlanRejected.selector, NPC_A_ID, OWN_TRANSFER_MISMATCH), address(npcA)
        );
        npcA.validatePlan(runId, OFFER_A1, t, before);
        t = validTransfers();
        t[1].toNpc = NPC_C_ID; // B gives its COIN to C instead of A
        vm.expectRevert(
            abi.encodeWithSelector(INpc.PlanRejected.selector, NPC_B_ID, OWN_TRANSFER_MISMATCH), address(npcB)
        );
        npcB.validatePlan(runId, OFFER_B1, t, before);

        // --- more than one incoming (each individually well-formed)
        Transfer[] memory v = validTransfers();
        t = new Transfer[](3);
        t[0] = v[0];
        t[1] = v[1];
        t[2] = v[1]; // A would receive COIN twice; B's own outgoing is duplicated
        vm.expectRevert(abi.encodeWithSelector(INpc.PlanRejected.selector, NPC_A_ID, INCOMING_MISMATCH), address(npcA));
        npcA.validatePlan(runId, OFFER_A1, t, before);
        t[0] = v[0];
        t[1] = v[0]; // B would receive KEY twice; A's own outgoing is duplicated
        t[2] = v[1];
        vm.expectRevert(abi.encodeWithSelector(INpc.PlanRejected.selector, NPC_B_ID, INCOMING_MISMATCH), address(npcB));
        npcB.validatePlan(runId, OFFER_B1, t, before);

        // control: the unmodified valid plan is accepted by both
        npcA.validatePlan(runId, OFFER_A1, v, before);
        npcB.validatePlan(runId, OFFER_B1, v, before);
    }
}
