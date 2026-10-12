// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

// TEST FIXTURES ONLY — fault injection for Level1FaultInjection.t.sol. Never deployed by
// Level1Deployer. Each fixture has exactly one unconditional fault (no switches/flags).
//   * NPC_B subclasses override only the virtual `release` of production NPC_B.
//   * Standalone NPCs (implement INpc, do NOT inherit NpcBase) model a faulty/hostile NPC in a
//     slot where the needed behaviour is not a virtual function of NpcBase.
//   * Ledger probes have GameItems' exact storage layout (slot 0 `_granted`, slot 1 `_balances`,
//     checked by `forge inspect GameItems storageLayout`) and are installed with vm.etch over
//     the production ledger address; they replace ONLY transferFromNpc's behaviour.

import {NPC_B} from "../../src/NPC_B.sol";
import {NpcRules} from "../../src/NpcBase.sol";
import {INpc} from "../../src/interfaces/INpc.sol";
import {IGameItems} from "../../src/interfaces/IGameItems.sol";
import {AtomicCoordinator} from "../../src/AtomicCoordinator.sol";
import {Transfer, Selection, Permit, OFFER_NONE, NPC_A_ID, NPC_B_ID, NPC_C_ID, COIN, OBSERVER_TOUCHED} from "../../src/Types.sol";

// ------------------------------------------------------------ NPC_B subclasses

/// release does nothing: no ledger call, permit NOT consumed -> coordinator SettlementMismatch.
contract NoopReleaseNpcB is NPC_B {
    constructor(address items_, address coordinator_) NPC_B(items_, coordinator_) {}

    function release(uint256, bytes32, bytes32, bytes32) external view override {
        if (msg.sender != coordinator) revert NotCoordinator();
    }
}

/// release performs B's ledger transfer but never consumes the permit -> PermitsRemaining(1).
contract KeepPermitNpcB is NPC_B {
    constructor(address items_, address coordinator_) NPC_B(items_, coordinator_) {}

    function release(uint256 runId, bytes32, bytes32, bytes32) external override {
        if (msg.sender != coordinator) revert NotCoordinator();
        NpcRules memory r = rules();
        items.transferFromNpc(runId, r.giveTo, r.giveItem, r.giveQty);
    }
}

/// release re-enters AtomicCoordinator.execute -> coordinator Reentrancy().
contract ReenterExecuteNpcB is NPC_B {
    constructor(address items_, address coordinator_) NPC_B(items_, coordinator_) {}

    function release(uint256 runId, bytes32, bytes32 snapshotHash, bytes32) external override {
        AtomicCoordinator(coordinator).execute(runId, new Selection[](0), 0, snapshotHash);
    }
}

/// release re-enters AtomicCoordinator.startRun -> coordinator Reentrancy().
contract ReenterStartRunNpcB is NPC_B {
    constructor(address items_, address coordinator_) NPC_B(items_, coordinator_) {}

    function release(uint256, bytes32, bytes32, bytes32) external override {
        AtomicCoordinator(coordinator).startRun();
    }
}

// ------------------------------------------------------------- standalone NPCs

/// Minimal honest-shaped INpc: own offer (or NONE), accepts any plan, never holds permits,
/// goal always satisfied. Concrete fixtures override one behaviour each.
abstract contract StandaloneNpc is INpc {
    IGameItems internal immutable _items;
    address internal immutable _coordinator;
    uint8 internal immutable _id;
    bytes32 internal immutable _offer;

    constructor(address items_, address coordinator_, uint8 id_, bytes32 offer_) {
        _items = IGameItems(items_);
        _coordinator = coordinator_;
        _id = id_;
        _offer = offer_;
    }

    function npcIdValue() external view returns (uint8) {
        return _id;
    }

    function ownOffer() external view returns (bytes32) {
        return _offer;
    }

    function hasOffer(bytes32 offerId) external view returns (bool) {
        return offerId == OFFER_NONE || offerId == _offer;
    }

    function outgoing(bytes32 offerId) external view virtual returns (bool, Transfer memory t) {
        if (offerId != OFFER_NONE && offerId != _offer) revert UnknownOffer(_id, offerId);
        return (false, t);
    }

    function validatePlan(uint256, bytes32, Transfer[] calldata, uint256[6] calldata) external view virtual {}

    function authorize(uint256, bytes32, Transfer[] calldata, uint256[6] calldata, bytes32, bytes32)
        external
        virtual
    {
        revert NothingToAuthorize();
    }

    function release(uint256, bytes32, bytes32, bytes32) external virtual {}

    function permitOf(uint256) external pure returns (Permit memory p) {
        return p;
    }

    function isGoalSatisfied(uint256[6] calldata) external pure returns (bool) {
        return true;
    }

    function items() external view returns (IGameItems) {
        return _items;
    }

    function coordinator() external view returns (address) {
        return _coordinator;
    }
}

/// Observer in slot C whose own validation always rejects (proves the coordinator asks C).
contract RejectingObserverC is StandaloneNpc {
    constructor(address items_, address coordinator_) StandaloneNpc(items_, coordinator_, NPC_C_ID, OFFER_NONE) {}

    function validatePlan(uint256, bytes32, Transfer[] calldata, uint256[6] calldata) external view override {
        revert PlanRejected(NPC_C_ID, OBSERVER_TOUCHED);
    }
}

/// B whose offer terms are malformed (qty 0) -> coordinator InvalidTransfer(1).
contract MalformedOfferNpcB is StandaloneNpc {
    constructor(address items_, address coordinator_, bytes32 offer_)
        StandaloneNpc(items_, coordinator_, NPC_B_ID, offer_)
    {}

    function outgoing(bytes32 offerId) external view override returns (bool, Transfer memory t) {
        if (offerId == OFFER_NONE) return (false, t);
        if (offerId != _offer) revert UnknownOffer(_id, offerId);
        return (true, Transfer({fromNpc: NPC_B_ID, toNpc: NPC_A_ID, item: COIN, qty: 0}));
    }
}

/// B with correct offer terms whose authorize moves ledger stock (B -> A 1 COIN) during the
/// prepare phase -> coordinator PrepareChangedState().
contract PrepareMutatingNpcB is StandaloneNpc {
    constructor(address items_, address coordinator_, bytes32 offer_)
        StandaloneNpc(items_, coordinator_, NPC_B_ID, offer_)
    {}

    function outgoing(bytes32 offerId) external view override returns (bool, Transfer memory t) {
        if (offerId == OFFER_NONE) return (false, t);
        if (offerId != _offer) revert UnknownOffer(_id, offerId);
        return (true, Transfer({fromNpc: NPC_B_ID, toNpc: NPC_A_ID, item: COIN, qty: 1}));
    }

    function authorize(uint256 runId, bytes32, Transfer[] calldata, uint256[6] calldata, bytes32, bytes32)
        external
        override
    {
        _items.transferFromNpc(runId, NPC_A_ID, COIN, 1);
    }
}

// ----------------------------------------------------------------- ledger probes

/// Shared storage layout with GameItems (slot 0 `_granted`, slot 1 `_balances`).
abstract contract LedgerProbeBase {
    mapping(uint256 runId => bool) internal _granted;
    mapping(uint256 runId => uint256[6]) internal _balances;
    address internal immutable _a;
    address internal immutable _b;
    address internal immutable _c;

    constructor(address a, address b, address c) {
        _a = a;
        _b = b;
        _c = c;
    }

    function _idOf(address x) internal view returns (uint8) {
        if (x == _a) return NPC_A_ID;
        if (x == _b) return NPC_B_ID;
        if (x == _c) return NPC_C_ID;
        revert("probe: not an npc");
    }

    function _move(uint256 runId, uint8 from, uint8 toNpc, uint8 item, uint32 qty) internal {
        _balances[runId][uint256(from) * 2 + item - 1] -= qty;
        _balances[runId][uint256(toNpc) * 2 + item - 1] += qty;
    }

    function snapshotBalances(uint256 runId) external view returns (uint256[6] memory) {
        return _balances[runId];
    }

    function balanceOf(uint256 runId, uint8 npcId, uint8 item) external view returns (uint256) {
        return _balances[runId][uint256(npcId) * 2 + item - 1];
    }

    function isGranted(uint256 runId) external view returns (bool) {
        return _granted[runId];
    }
}

/// transferFromNpc reverts if the calling NPC's permit is still active at call time.
contract PermitOrderLedgerProbe is LedgerProbeBase {
    error PermitStillActiveDuringLedgerCall(address npc, uint256 runId);

    constructor(address a, address b, address c) LedgerProbeBase(a, b, c) {}

    function transferFromNpc(uint256 runId, uint8 toNpc, uint8 item, uint32 qty) external {
        if (INpc(msg.sender).permitOf(runId).active) revert PermitStillActiveDuringLedgerCall(msg.sender, runId);
        _move(runId, _idOf(msg.sender), toNpc, item, qty);
    }
}

/// transferFromNpc calls back into the calling NPC's release (NPC-level re-entrancy attempt).
contract ReentrantLedgerProbe is LedgerProbeBase {
    constructor(address a, address b, address c) LedgerProbeBase(a, b, c) {}

    function transferFromNpc(uint256 runId, uint8, uint8, uint32) external {
        INpc(msg.sender).release(runId, bytes32(0), bytes32(0), bytes32(0));
    }
}
