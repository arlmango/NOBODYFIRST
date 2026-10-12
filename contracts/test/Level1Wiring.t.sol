// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

// Wiring evidence for the production deployment built by Level1Deployer:
// distinct addresses, code present, CREATE-nonce prediction, immutable wiring
// consistent in both directions, fixed NPC terms, no admin surface, no ETH intake.

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
    OFFER_B1
} from "../src/Types.sol";
import {Level1Deployer} from "../src/Level1Deployer.sol";
import {GameItems} from "../src/GameItems.sol";
import {NPC_A} from "../src/NPC_A.sol";
import {NPC_B} from "../src/NPC_B.sol";
import {NPC_C} from "../src/NPC_C.sol";
import {NpcRules} from "../src/NpcBase.sol";
import {AtomicCoordinator} from "../src/AtomicCoordinator.sol";
import {IGameItems} from "../src/interfaces/IGameItems.sol";
import {INpc} from "../src/interfaces/INpc.sol";

contract Level1WiringTest is Level1TestBase {
    Level1Deployer internal deployer;

    function setUp() public {
        deployer = deployViaDeployer();
    }

    function _all() internal view returns (address[5] memory a) {
        a = [address(items), address(npcA), address(npcB), address(npcC), address(coord)];
    }

    function test_Wiring_DistinctNonZeroAddressesWithCode() public view {
        address[5] memory a = _all();
        for (uint256 i = 0; i < 5; i++) {
            assertTrue(a[i] != address(0), "zero address");
            assertGt(a[i].code.length, 0, "no code");
            for (uint256 j = i + 1; j < 5; j++) {
                assertTrue(a[i] != a[j], "duplicate address");
            }
        }
        // The three NPCs are separate contracts with distinct runtime code.
        assertTrue(keccak256(address(npcA).code) != keccak256(address(npcB).code), "A/B same code");
        assertTrue(keccak256(address(npcA).code) != keccak256(address(npcC).code), "A/C same code");
        assertTrue(keccak256(address(npcB).code) != keccak256(address(npcC).code), "B/C same code");
    }

    function test_Wiring_AddressesMatchDeployerCreateNonces() public view {
        address[5] memory a = _all(); // items, npcA, npcB, npcC, coordinator = CREATE nonces 1..5
        for (uint256 i = 0; i < 5; i++) {
            assertEq(a[i], vm.computeCreateAddress(address(deployer), i + 1), "CREATE prediction");
        }
    }

    function test_Wiring_ItemsPointsToCoordinatorAndNpcs() public view {
        assertEq(items.coordinator(), address(coord));
        assertEq(items.npcAddress(NPC_A_ID), address(npcA));
        assertEq(items.npcAddress(NPC_B_ID), address(npcB));
        assertEq(items.npcAddress(NPC_C_ID), address(npcC));
        (bool r, uint8 id) = items.npcIdOf(address(npcA));
        assertTrue(r);
        assertEq(id, NPC_A_ID);
        (r, id) = items.npcIdOf(address(npcB));
        assertTrue(r);
        assertEq(id, NPC_B_ID);
        (r, id) = items.npcIdOf(address(npcC));
        assertTrue(r);
        assertEq(id, NPC_C_ID);
        (r,) = items.npcIdOf(address(coord));
        assertFalse(r, "coordinator is not an NPC");
        (r,) = items.npcIdOf(player);
        assertFalse(r, "player is not an NPC");
        (r,) = items.npcIdOf(address(deployer));
        assertFalse(r, "deployer is not an NPC");
    }

    function test_Wiring_CoordinatorPointsToItemsAndNpcs() public view {
        assertEq(address(coord.items()), address(items));
        assertEq(coord.npcAddress(NPC_A_ID), address(npcA));
        assertEq(coord.npcAddress(NPC_B_ID), address(npcB));
        assertEq(coord.npcAddress(NPC_C_ID), address(npcC));
    }

    function test_Wiring_NpcsPointBackAndHaveFixedTerms() public view {
        INpc[3] memory n = [INpc(address(npcA)), INpc(address(npcB)), INpc(address(npcC))];
        for (uint8 i = 0; i < 3; i++) {
            assertEq(address(n[i].items()), address(items), "npc.items");
            assertEq(n[i].coordinator(), address(coord), "npc.coordinator");
            assertEq(n[i].npcIdValue(), i, "npc id");
            assertTrue(n[i].hasOffer(OFFER_NONE), "NONE always allowed");
        }
        assertEq(npcA.ownOffer(), OFFER_A1);
        assertEq(npcB.ownOffer(), OFFER_B1);
        assertEq(npcC.ownOffer(), OFFER_NONE);
        assertTrue(npcA.hasOffer(OFFER_A1));
        assertFalse(npcA.hasOffer(OFFER_B1));
        assertTrue(npcB.hasOffer(OFFER_B1));
        assertFalse(npcB.hasOffer(OFFER_A1));
        assertFalse(npcC.hasOffer(OFFER_A1));
        assertFalse(npcC.hasOffer(OFFER_B1));

        // NPC_A: offer A1; give B 1 KEY; need from B 1 COIN; goal 0 KEY / 1 COIN
        NpcRules memory r = npcA.rules();
        assertEq(r.npcId, NPC_A_ID);
        assertEq(r.offerId, OFFER_A1);
        assertEq(r.giveTo, NPC_B_ID);
        assertEq(r.giveItem, KEY);
        assertEq(uint256(r.giveQty), 1);
        assertEq(r.needFrom, NPC_B_ID);
        assertEq(r.needItem, COIN);
        assertEq(uint256(r.needQty), 1);
        assertEq(uint256(r.goalKey), 0);
        assertEq(uint256(r.goalCoin), 1);
        // NPC_B: offer B1; give A 1 COIN; need from A 1 KEY; goal 1 KEY / 0 COIN
        r = npcB.rules();
        assertEq(r.npcId, NPC_B_ID);
        assertEq(r.offerId, OFFER_B1);
        assertEq(r.giveTo, NPC_A_ID);
        assertEq(r.giveItem, COIN);
        assertEq(uint256(r.giveQty), 1);
        assertEq(r.needFrom, NPC_A_ID);
        assertEq(r.needItem, KEY);
        assertEq(uint256(r.needQty), 1);
        assertEq(uint256(r.goalKey), 1);
        assertEq(uint256(r.goalCoin), 0);
        // NPC_C: observer, no offer, holds nothing at goal
        r = npcC.rules();
        assertEq(r.npcId, NPC_C_ID);
        assertEq(r.offerId, OFFER_NONE);
        assertEq(uint256(r.giveQty), 0);
        assertEq(uint256(r.needQty), 0);
        assertEq(uint256(r.goalKey), 0);
        assertEq(uint256(r.goalCoin), 0);

        (bool has, Transfer memory t) = npcA.outgoing(OFFER_A1);
        assertTrue(has);
        assertEq(t.fromNpc, NPC_A_ID);
        assertEq(t.toNpc, NPC_B_ID);
        assertEq(t.item, KEY);
        assertEq(uint256(t.qty), 1);
        (has, t) = npcB.outgoing(OFFER_B1);
        assertTrue(has);
        assertEq(t.fromNpc, NPC_B_ID);
        assertEq(t.toNpc, NPC_A_ID);
        assertEq(t.item, COIN);
        assertEq(uint256(t.qty), 1);
        for (uint8 i = 0; i < 3; i++) {
            (has,) = n[i].outgoing(OFFER_NONE);
            assertFalse(has, "NONE has no transfer");
        }
    }

    function test_Wiring_OutgoingRejectsForeignOffer() public {
        vm.expectRevert(abi.encodeWithSelector(INpc.UnknownOffer.selector, NPC_A_ID, OFFER_B1));
        npcA.outgoing(OFFER_B1);
        vm.expectRevert(abi.encodeWithSelector(INpc.UnknownOffer.selector, NPC_C_ID, OFFER_A1));
        npcC.outgoing(OFFER_A1);
    }

    function test_Wiring_InitialStateBeforeAnyRun() public view {
        uint256 runId = runIdOf(player);
        assertFalse(items.isGranted(runId));
        assertBalances(runId, [uint256(0), 0, 0, 0, 0, 0]);
        AtomicCoordinator.Run memory r = coord.runOf(runId);
        assertEq(r.owner, address(0));
        assertFalse(r.active);
        assertFalse(r.solved);
        assertEq(uint256(r.nonce), 0);
        assertNoActivePermits(runId);
    }

    /// No admin/mint/upgrade/initialize surface: calls with plausible admin selectors
    /// revert with empty returndata (no matching function, no fallback). Not exhaustive:
    /// this checks a list of common names, the ABI itself is the full evidence.
    function test_Wiring_NoAdminSelectors() public {
        bytes[] memory calls = new bytes[](14);
        calls[0] = abi.encodeWithSignature("setCoordinator(address)", attacker);
        calls[1] = abi.encodeWithSignature("transferOwnership(address)", attacker);
        calls[2] = abi.encodeWithSignature("owner()");
        calls[3] = abi.encodeWithSignature("initialize()");
        calls[4] = abi.encodeWithSignature("initialize(address)", attacker);
        calls[5] = abi.encodeWithSignature("mint(uint256,uint8,uint8,uint32)", 1, 0, 1, 1);
        calls[6] = abi.encodeWithSignature("setBalance(uint256,uint8,uint8,uint256)", 1, 0, 1, 1);
        calls[7] = abi.encodeWithSignature("upgradeTo(address)", attacker);
        calls[8] = abi.encodeWithSignature("pause()");
        calls[9] = abi.encodeWithSignature("setNpc(uint8,address)", 0, attacker);
        calls[10] = abi.encodeWithSignature("setItems(address)", attacker);
        calls[11] = abi.encodeWithSignature("resetRun(uint256)", 1);
        calls[12] = abi.encodeWithSignature("transfer(address,uint256)", attacker, 1);
        calls[13] = abi.encodeWithSignature("approve(address,uint256)", attacker, 1);
        address[5] memory a = _all();
        address[6] memory targets = [a[0], a[1], a[2], a[3], a[4], address(deployer)];
        for (uint256 t = 0; t < targets.length; t++) {
            for (uint256 c = 0; c < calls.length; c++) {
                vm.prank(attacker);
                (bool ok, bytes memory ret) = targets[t].call(calls[c]);
                assertFalse(ok, "admin-like selector accepted");
                assertEq(ret.length, 0, "unexpected revert data");
            }
        }
    }

    /// No contract accepts ETH (no receive / payable fallback / payable functions used here).
    function test_Wiring_NoEthIntake() public {
        vm.deal(attacker, 10 ether);
        address[5] memory a = _all();
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(attacker);
            (bool ok,) = a[i].call{value: 1}("");
            assertFalse(ok, "accepted ETH");
            assertEq(a[i].balance, 0);
        }
        vm.prank(attacker);
        (bool ok2,) = address(coord).call{value: 1}(abi.encodeCall(AtomicCoordinator.startRun, ()));
        assertFalse(ok2, "startRun is payable");
    }

    function test_Wiring_GameItemsConstructorGuards() public {
        vm.expectRevert(abi.encodeWithSelector(IGameItems.ZeroAddress.selector));
        new GameItems(address(0), address(1), address(2), address(3));
        vm.expectRevert(abi.encodeWithSelector(IGameItems.ZeroAddress.selector));
        new GameItems(address(4), address(1), address(2), address(0));
        vm.expectRevert(abi.encodeWithSelector(IGameItems.DuplicateAddress.selector));
        new GameItems(address(1), address(1), address(2), address(3));
        vm.expectRevert(abi.encodeWithSelector(IGameItems.DuplicateAddress.selector));
        new GameItems(address(4), address(1), address(2), address(2));
    }

    /// A second deployer yields a fully separate, equally wired world (no shared state).
    function test_Wiring_SecondDeployerIsIndependent() public {
        Level1Deployer d2 = new Level1Deployer();
        assertTrue(address(d2.items()) != address(items));
        assertTrue(address(d2.coordinator()) != address(coord));
        assertEq(d2.items().coordinator(), address(d2.coordinator()));
        start(player);
        assertFalse(d2.items().isGranted(runIdOf(player)), "state leaked to second deployment");
    }

    function test_Wiring_PermitOfEmptyForUnknownRun() public view {
        Permit memory p = npcA.permitOf(123);
        assertFalse(p.active);
    }
}
