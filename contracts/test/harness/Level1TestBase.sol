// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

// Shared test base for NOBODY FIRST level 1 (stage 2). Test-only code.
// Holds references to one deployment (items, three NPCs, coordinator), builds
// packages, captures the complete observable state of a run, and recomputes the
// SPEC hashes independently (SPEC.md "Hashes") so tests do not trust the
// production helper functions for expected values.

import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";

import {
    Transfer,
    Selection,
    Permit,
    KEY,
    COIN,
    NPC_A_ID,
    NPC_B_ID,
    NPC_C_ID,
    OFFER_NONE,
    OFFER_A1,
    OFFER_B1,
    LEVEL_ID,
    SNAPSHOT_DOMAIN,
    PLAN_DOMAIN
} from "../../src/Types.sol";
import {GameItems} from "../../src/GameItems.sol";
import {NPC_A} from "../../src/NPC_A.sol";
import {NPC_B} from "../../src/NPC_B.sol";
import {NPC_C} from "../../src/NPC_C.sol";
import {AtomicCoordinator} from "../../src/AtomicCoordinator.sol";
import {INpc} from "../../src/interfaces/INpc.sol";
import {Level1Deployer} from "../../src/Level1Deployer.sol";

abstract contract Level1TestBase is Test {
    GameItems internal items;
    NPC_A internal npcA;
    NPC_B internal npcB; // may be a test fixture subclass of NPC_B in LateFailure tests
    NPC_C internal npcC;
    AtomicCoordinator internal coord;

    address internal player = makeAddr("player");
    address internal player2 = makeAddr("player2");
    address internal attacker = makeAddr("attacker");

    /// Complete observable state of one run. Field list (used by LateFailure as the
    /// "record everything before / re-read everything after" set):
    ///   bal[0..5]      items.balanceOf(runId, npc, item) for A,B,C x KEY,COIN (canonical order)
    ///   granted        items.isGranted(runId)
    ///   permits[0..2]  npcX.permitOf(runId) = (offerId, snapshotHash, planHash, active) for A,B,C
    ///   owner/active/solved/nonce   coord.runOf(runId)
    ///   snap           coord.currentSnapshotHash(runId)
    struct FullState {
        uint256[6] bal;
        bool granted;
        Permit[3] permits;
        address owner;
        bool active;
        bool solved;
        uint64 nonce;
        bytes32 snap;
    }

    /// Production wiring: everything deployed by the unmodified Level1Deployer.
    function deployViaDeployer() internal returns (Level1Deployer d) {
        d = new Level1Deployer();
        items = GameItems(address(d.items()));
        npcA = NPC_A(address(d.npcA()));
        npcB = NPC_B(address(d.npcB()));
        npcC = NPC_C(address(d.npcC()));
        coord = AtomicCoordinator(address(d.coordinator()));
    }

    // ---------------------------------------------------------------- packages

    function sel(uint8 npcId, bytes32 offerId) internal pure returns (Selection memory) {
        return Selection({npcId: npcId, offerId: offerId});
    }

    function pkg3(Selection memory a, Selection memory b, Selection memory c)
        internal
        pure
        returns (Selection[] memory p)
    {
        p = new Selection[](3);
        p[0] = a;
        p[1] = b;
        p[2] = c;
    }

    /// The only solving package: [A:A1, B:B1, C:NONE].
    function validPkg() internal pure returns (Selection[] memory) {
        return pkg3(sel(NPC_A_ID, OFFER_A1), sel(NPC_B_ID, OFFER_B1), sel(NPC_C_ID, OFFER_NONE));
    }

    /// Transfers of the valid package in npcId order (A's outgoing, then B's).
    function validTransfers() internal pure returns (Transfer[] memory t) {
        t = new Transfer[](2);
        t[0] = Transfer({fromNpc: NPC_A_ID, toNpc: NPC_B_ID, item: KEY, qty: 1});
        t[1] = Transfer({fromNpc: NPC_B_ID, toNpc: NPC_A_ID, item: COIN, qty: 1});
    }

    function runIdOf(address p) internal pure returns (uint256) {
        return uint256(uint160(p));
    }

    // ------------------------------------------------------- independent hashes

    /// SPEC: keccak256(abi.encode(SNAPSHOT_DOMAIN, address(this), address(items), block.chainid,
    /// runId, owner, LEVEL_ID, nonce, active, solved, balances)). All members are static, so
    /// abi.encode(a..k) == bytes.concat(abi.encode(a..f), abi.encode(g..k)) (split only to avoid
    /// stack-too-deep in the test, the byte string is identical).
    function expectedSnapshotHash(uint256 runId) internal view returns (bytes32) {
        AtomicCoordinator.Run memory r = coord.runOf(runId);
        uint256[6] memory b = items.snapshotBalances(runId);
        bytes memory head =
            abi.encode(SNAPSHOT_DOMAIN, address(coord), address(items), block.chainid, runId, r.owner);
        bytes memory tail = abi.encode(LEVEL_ID, r.nonce, r.active, r.solved, b);
        return keccak256(bytes.concat(head, tail));
    }

    /// SPEC: keccak256(abi.encode(PLAN_DOMAIN, snapshotHash, offerIds[3] (by npcId), transfers)).
    function expectedPlanHash(bytes32 snapshotHash, bytes32[3] memory offerIds, Transfer[] memory transfers)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(PLAN_DOMAIN, snapshotHash, offerIds, transfers));
    }

    function validPlanHash(bytes32 snapshotHash) internal pure returns (bytes32) {
        return expectedPlanHash(snapshotHash, [OFFER_A1, OFFER_B1, OFFER_NONE], validTransfers());
    }

    // ---------------------------------------------------------------- run flow

    function start(address p) internal returns (uint256 runId) {
        vm.prank(p);
        runId = coord.startRun();
        assertEq(runId, runIdOf(p), "runId = uint160(player)");
    }

    function execAs(address p, uint256 runId, Selection[] memory package) internal {
        AtomicCoordinator.Run memory r = coord.runOf(runId);
        bytes32 snap = coord.currentSnapshotHash(runId);
        vm.prank(p);
        coord.execute(runId, package, r.nonce, snap);
    }

    /// expectRevert(exact data) + execute with live nonce/snapshot, then assert nothing changed.
    function expectExecRevert(address p, uint256 runId, Selection[] memory package, bytes memory err) internal {
        FullState memory beforeS = capture(runId);
        vm.expectRevert(err);
        vm.prank(p);
        coord.execute(runId, package, beforeS.nonce, beforeS.snap);
        assertStateEq(beforeS, capture(runId));
    }

    /// Same as expectExecRevert, but also pins the contract the revert ORIGINATES in
    /// (vm.expectRevert(bytes, address reverter)). Needed where selectors are shared between the
    /// coordinator and an NPC (UnknownOffer, InvalidNpc, Reentrancy, ...).
    function expectExecRevertFrom(
        address p,
        uint256 runId,
        Selection[] memory package,
        bytes memory err,
        address reverter
    ) internal {
        FullState memory beforeS = capture(runId);
        vm.expectRevert(err, reverter);
        vm.prank(p);
        coord.execute(runId, package, beforeS.nonce, beforeS.snap);
        assertStateEq(beforeS, capture(runId));
    }

    // ------------------------------------------------------------ state capture

    function npcAt(uint8 id) internal view returns (INpc) {
        if (id == NPC_A_ID) return INpc(address(npcA));
        if (id == NPC_B_ID) return INpc(address(npcB));
        return INpc(address(npcC));
    }

    function capture(uint256 runId) internal view returns (FullState memory s) {
        for (uint8 n = 0; n < 3; n++) {
            s.bal[n * 2] = items.balanceOf(runId, n, KEY);
            s.bal[n * 2 + 1] = items.balanceOf(runId, n, COIN);
            s.permits[n] = npcAt(n).permitOf(runId);
        }
        s.granted = items.isGranted(runId);
        AtomicCoordinator.Run memory r = coord.runOf(runId);
        s.owner = r.owner;
        s.active = r.active;
        s.solved = r.solved;
        s.nonce = r.nonce;
        s.snap = coord.currentSnapshotHash(runId);
    }

    function assertStateEq(FullState memory a, FullState memory b) internal pure {
        for (uint256 i = 0; i < 6; i++) {
            assertEq(a.bal[i], b.bal[i], "balance changed");
        }
        assertEq(a.granted, b.granted, "granted changed");
        for (uint256 n = 0; n < 3; n++) {
            assertEq(a.permits[n].offerId, b.permits[n].offerId, "permit.offerId changed");
            assertEq(a.permits[n].snapshotHash, b.permits[n].snapshotHash, "permit.snapshotHash changed");
            assertEq(a.permits[n].planHash, b.permits[n].planHash, "permit.planHash changed");
            assertEq(a.permits[n].active, b.permits[n].active, "permit.active changed");
        }
        assertEq(a.owner, b.owner, "run.owner changed");
        assertEq(a.active, b.active, "run.active changed");
        assertEq(a.solved, b.solved, "run.solved changed");
        assertEq(uint256(a.nonce), uint256(b.nonce), "run.nonce changed");
        assertEq(a.snap, b.snap, "snapshotHash changed");
    }

    function assertBalances(uint256 runId, uint256[6] memory want) internal view {
        uint256[6] memory got = items.snapshotBalances(runId);
        for (uint256 i = 0; i < 6; i++) {
            assertEq(got[i], want[i], "balance");
        }
        // cross-check the per-slot view against the canonical array view
        for (uint8 n = 0; n < 3; n++) {
            assertEq(items.balanceOf(runId, n, KEY), want[n * 2], "balanceOf KEY");
            assertEq(items.balanceOf(runId, n, COIN), want[n * 2 + 1], "balanceOf COIN");
        }
    }

    function assertNoActivePermits(uint256 runId) internal view {
        for (uint8 n = 0; n < 3; n++) {
            Permit memory p = npcAt(n).permitOf(runId);
            assertFalse(p.active, "residual active permit");
            assertEq(p.offerId, bytes32(0), "residual permit.offerId");
            assertEq(p.snapshotHash, bytes32(0), "residual permit.snapshotHash");
            assertEq(p.planHash, bytes32(0), "residual permit.planHash");
        }
    }

    function logState(string memory label, FullState memory s) internal pure {
        console2.log("==== state:", label);
        console2.log("field                         | value");
        console2.log("items.balanceOf A.KEY         |", s.bal[0]);
        console2.log("items.balanceOf A.COIN        |", s.bal[1]);
        console2.log("items.balanceOf B.KEY         |", s.bal[2]);
        console2.log("items.balanceOf B.COIN        |", s.bal[3]);
        console2.log("items.balanceOf C.KEY         |", s.bal[4]);
        console2.log("items.balanceOf C.COIN        |", s.bal[5]);
        console2.log("items.isGranted               |", s.granted);
        for (uint256 n = 0; n < 3; n++) {
            console2.log("npc permitOf: npcId           |", n);
            console2.log("  .offerId                    |", vm.toString(s.permits[n].offerId));
            console2.log("  .snapshotHash               |", vm.toString(s.permits[n].snapshotHash));
            console2.log("  .planHash                   |", vm.toString(s.permits[n].planHash));
            console2.log("  .active                     |", s.permits[n].active);
        }
        console2.log("coord.runOf.owner             |", s.owner);
        console2.log("coord.runOf.active            |", s.active);
        console2.log("coord.runOf.solved            |", s.solved);
        console2.log("coord.runOf.nonce             |", uint256(s.nonce));
        console2.log("coord.currentSnapshotHash     |", vm.toString(s.snap));
    }
}
