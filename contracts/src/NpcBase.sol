// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {INpc} from "./interfaces/INpc.sol";
import {IGameItems} from "./interfaces/IGameItems.sol";
import {
    Transfer,
    Permit,
    KEY,
    OFFER_NONE,
    UNKNOWN_OFFER,
    OWN_TRANSFER_MISSING,
    OWN_TRANSFER_MISMATCH,
    INCOMING_MISSING,
    INCOMING_MISMATCH,
    UNEXPECTED_INCOMING,
    UNEXPECTED_OUTGOING,
    INSUFFICIENT_STOCK,
    GOAL_NOT_MET,
    OBSERVER_TOUCHED,
    balanceIndex
} from "./Types.sol";

/// @notice Fixed rules a concrete NPC passes to `NpcBase`. Offer NONE means the NPC is an observer.
struct NpcRules {
    uint8 npcId;
    bytes32 offerId;
    uint8 giveTo;
    uint8 giveItem;
    uint32 giveQty;
    uint8 needFrom;
    uint8 needItem;
    uint32 needQty;
    uint32 goalKey;
    uint32 goalCoin;
}

/// @title NpcBase — shared logic of an independent level-1 NPC.
/// @notice All rules are immutable. The NPC trusts nobody's verdict but its own: it re-validates
///         every plan before issuing a permit, and the permit is consumed before its ledger spend.
abstract contract NpcBase is INpc {
    /// @notice This NPC's id (0 = A, 1 = B, 2 = C).
    uint8 public immutable npcId;
    /// @notice The item ledger this NPC spends from.
    IGameItems public immutable items;
    /// @notice The only address allowed to call `authorize` and `release`.
    address public immutable coordinator;

    // Fixed rules (exposed together through `rules()`).
    bytes32 internal immutable offerId_;
    uint8 internal immutable giveTo;
    uint8 internal immutable giveItem;
    uint32 internal immutable giveQty;
    uint8 internal immutable needFrom;
    uint8 internal immutable needItem;
    uint32 internal immutable needQty;
    uint32 internal immutable goalKey;
    uint32 internal immutable goalCoin;

    mapping(uint256 runId => Permit) private _permits;
    uint256 private _lock = 1;

    constructor(address items_, address coordinator_, NpcRules memory r) {
        if (items_ == address(0) || coordinator_ == address(0)) revert ZeroAddress();
        items = IGameItems(items_);
        coordinator = coordinator_;
        npcId = r.npcId;
        offerId_ = r.offerId;
        giveTo = r.giveTo;
        giveItem = r.giveItem;
        giveQty = r.giveQty;
        needFrom = r.needFrom;
        needItem = r.needItem;
        needQty = r.needQty;
        goalKey = r.goalKey;
        goalCoin = r.goalCoin;
    }

    // ------------------------------------------------------------------ views

    /// @notice All fixed rules of this NPC (immutable). Callable by anyone.
    function rules() public view returns (NpcRules memory) {
        return NpcRules(npcId, offerId_, giveTo, giveItem, giveQty, needFrom, needItem, needQty, goalKey, goalCoin);
    }

    /// @notice This NPC's id. Callable by anyone.
    function npcIdValue() external view returns (uint8) {
        return npcId;
    }

    /// @notice This NPC's own offer id (OFFER_NONE for an observer). Callable by anyone.
    function ownOffer() external view returns (bytes32) {
        return offerId_;
    }

    /// @notice True for OFFER_NONE and for this NPC's own offer. Callable by anyone.
    function hasOffer(bytes32 offerId) public view returns (bool) {
        return offerId == OFFER_NONE || offerId == offerId_;
    }

    /// @notice Outgoing transfer implied by `offerId` (none for OFFER_NONE). Callable by anyone.
    /// @dev Reverts `UnknownOffer` if the offer does not belong to this NPC.
    function outgoing(bytes32 offerId) external view returns (bool hasTransfer, Transfer memory t) {
        NpcRules memory r = rules();
        if (!hasOffer(offerId)) revert UnknownOffer(r.npcId, offerId);
        if (offerId == OFFER_NONE) return (false, t);
        return (true, Transfer(r.npcId, r.giveTo, r.giveItem, r.giveQty));
    }

    /// @notice Independent check of `plan` against `before` for this NPC. Callable by anyone.
    /// @dev Reverts `PlanRejected(npcId, code)`; `runId` is accepted for interface symmetry only.
    function validatePlan(uint256, bytes32 offerId, Transfer[] calldata plan, uint256[6] calldata before)
        external
        view
    {
        _requireValid(offerId, plan, before);
    }

    /// @notice Permit currently stored for `runId` (inactive if none). Callable by anyone.
    function permitOf(uint256 runId) external view returns (Permit memory) {
        return _permits[runId];
    }

    /// @notice True iff this NPC's holdings in `finalBalances` equal its goal exactly. Callable by anyone.
    function isGoalSatisfied(uint256[6] calldata finalBalances) external view virtual returns (bool) {
        uint256 keyIdx = balanceIndex(npcId, KEY);
        return finalBalances[keyIdx] == goalKey && finalBalances[keyIdx + 1] == goalCoin;
    }

    // -------------------------------------------------------------- mutations

    /// @notice Validates the plan again and stores a one-time permit bound to
    ///         (runId, offerId, snapshotHash, planHash). Changes no item balances.
    /// @dev Callable only by the coordinator. Not callable with OFFER_NONE (`NothingToAuthorize`).
    ///      `before` must equal the live ledger snapshot of `runId` (`BeforeMismatch`).
    function authorize(
        uint256 runId,
        bytes32 offerId,
        Transfer[] calldata plan,
        uint256[6] calldata before,
        bytes32 snapshotHash,
        bytes32 planHash
    ) external {
        _enter();
        if (offerId == OFFER_NONE) revert NothingToAuthorize();
        if (_permits[runId].active) revert PermitExists(runId);
        // Never trust the caller's view of stock: `before` must equal the live ledger.
        uint256[6] memory live = items.snapshotBalances(runId);
        for (uint256 i = 0; i < 6; ++i) {
            if (live[i] != before[i]) revert BeforeMismatch(runId);
        }
        _requireValid(offerId, plan, before);
        _permits[runId] = Permit(offerId, snapshotHash, planHash, true);
        emit PermitIssued(runId, npcId, offerId, snapshotHash, planHash);
        _lock = 1;
    }

    /// @notice Consumes the matching permit, then spends this NPC's own stock on the ledger.
    /// @dev Callable only by the coordinator. The permit is deleted BEFORE the ledger call.
    function release(uint256 runId, bytes32 offerId, bytes32 snapshotHash, bytes32 planHash) external virtual {
        _enter();
        Permit memory p = _permits[runId];
        if (!p.active) revert NoPermit(runId);
        if (p.offerId != offerId || p.snapshotHash != snapshotHash || p.planHash != planHash) {
            revert PermitMismatch(runId);
        }
        delete _permits[runId];
        NpcRules memory r = rules();
        emit PermitConsumed(runId, r.npcId, offerId);
        items.transferFromNpc(runId, r.giveTo, r.giveItem, r.giveQty);
        _lock = 1;
    }

    // --------------------------------------------------------------- internal

    /// @dev Reentrancy lock + coordinator-only gate for the two mutating entrypoints.
    ///      The caller resets `_lock = 1` at its end (a revert rolls it back anyway).
    function _enter() private {
        if (_lock != 1) revert Reentrancy();
        if (msg.sender != coordinator) revert NotCoordinator();
        _lock = 2;
    }

    function _requireValid(bytes32 offerId, Transfer[] calldata plan, uint256[6] calldata before) private view {
        uint8 code = _check(rules(), offerId, plan, before);
        if (code != 0) revert PlanRejected(npcId, code);
    }

    /// @dev Returns 0 if acceptable, else a rejection code. Order: 1, spend (7/2/3),
    ///      incoming (6/4/5), 8, 10 (observer), 9. Only `before` counts as stock.
    function _check(NpcRules memory r, bytes32 offerId, Transfer[] calldata plan, uint256[6] calldata before)
        private
        pure
        returns (uint8)
    {
        if (offerId != OFFER_NONE && offerId != r.offerId) return UNKNOWN_OFFER;
        bool active = offerId != OFFER_NONE;
        (uint8 code, bool touched) = _checkShape(r, active, plan);
        if (code != 0) return code;
        return _checkHoldings(r, active, touched, before);
    }

    /// @dev Spend (7/2/3) then incoming (6/4/5). `touched` = this NPC appears in any transfer.
    function _checkShape(NpcRules memory r, bool active, Transfer[] calldata plan)
        private
        pure
        returns (uint8 code, bool touched)
    {
        uint256 outCount = 0;
        uint256 inCount = 0;
        bool outOk = true;
        bool inOk = true;
        for (uint256 i = 0; i < plan.length; ++i) {
            Transfer memory t = plan[i];
            if (t.fromNpc == r.npcId) {
                ++outCount;
                outOk = outOk && t.toNpc == r.giveTo && t.item == r.giveItem && t.qty == r.giveQty;
            }
            if (t.toNpc == r.npcId) {
                ++inCount;
                inOk = inOk && t.fromNpc == r.needFrom && t.item == r.needItem && t.qty == r.needQty;
            }
        }
        touched = outCount != 0 || inCount != 0;

        if (!active) {
            if (outCount != 0) return (UNEXPECTED_OUTGOING, touched);
        } else {
            if (outCount == 0) return (OWN_TRANSFER_MISSING, touched);
            if (outCount > 1 || !outOk) return (OWN_TRANSFER_MISMATCH, touched);
        }

        if (!active) {
            if (inCount != 0) return (UNEXPECTED_INCOMING, touched);
        } else {
            if (inCount == 0) return (INCOMING_MISSING, touched);
            if (inCount > 1 || !inOk) return (INCOMING_MISMATCH, touched);
        }
        return (0, touched);
    }

    /// @dev Stock (8), observer (10), goal on expected final holdings (9). Shape is already valid,
    ///      so the only own transfers are exactly the immutable give/need terms.
    function _checkHoldings(NpcRules memory r, bool active, bool touched, uint256[6] calldata before)
        private
        pure
        returns (uint8)
    {
        uint256 keyIdx = balanceIndex(r.npcId, KEY);
        uint256 finalKey = before[keyIdx];
        uint256 finalCoin = before[keyIdx + 1];
        if (active) {
            uint256 have = r.giveItem == KEY ? finalKey : finalCoin;
            if (have < r.giveQty) return INSUFFICIENT_STOCK;
            if (r.giveItem == KEY) finalKey -= r.giveQty;
            else finalCoin -= r.giveQty;
            if (r.needItem == KEY) finalKey += r.needQty;
            else finalCoin += r.needQty;
        }

        // Observer (no own offer) must not appear in any transfer. Defence in depth: with the
        // check order above, 7/6 already reject every such transfer first.
        if (r.offerId == OFFER_NONE && touched) return OBSERVER_TOUCHED;

        if (finalKey != r.goalKey || finalCoin != r.goalCoin) return GOAL_NOT_MET;
        return 0;
    }
}
