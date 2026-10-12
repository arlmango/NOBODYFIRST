// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {IGameItems} from "./interfaces/IGameItems.sol";
import {KEY, COIN, NPC_A_ID, NPC_B_ID, NPC_C_ID, NPC_COUNT, balanceIndex} from "./Types.sol";

/// @title GameItems — per-run item ledger for NOBODY FIRST level 1.
/// @notice Wiring (coordinator + three NPCs) is immutable and fixed at construction. There is no
///         owner, no mint, no setBalance, no approvals and no transfer path for users or the
///         coordinator. Only a registered NPC can move its own balance. Makes no external calls.
contract GameItems is IGameItems {
    /// @notice The only address allowed to call `grantInitial`.
    address public immutable coordinator;

    address private immutable _npcA;
    address private immutable _npcB;
    address private immutable _npcC;

    mapping(uint256 runId => bool) private _granted;
    mapping(uint256 runId => uint256[6]) private _balances;

    constructor(address coordinator_, address npcA, address npcB, address npcC) {
        if (coordinator_ == address(0) || npcA == address(0) || npcB == address(0) || npcC == address(0)) {
            revert ZeroAddress();
        }
        if (
            coordinator_ == npcA || coordinator_ == npcB || coordinator_ == npcC || npcA == npcB || npcA == npcC
                || npcB == npcC
        ) revert DuplicateAddress();
        coordinator = coordinator_;
        _npcA = npcA;
        _npcB = npcB;
        _npcC = npcC;
    }

    /// @notice Grants the fixed level-1 starting stock (A: 1 KEY, B: 1 COIN, C: nothing) once per run.
    /// @dev Callable only by the coordinator.
    function grantInitial(uint256 runId) external {
        if (msg.sender != coordinator) revert NotCoordinator();
        if (_granted[runId]) revert AlreadyGranted(runId);
        _granted[runId] = true;
        uint256[6] storage b = _balances[runId];
        b[balanceIndex(NPC_A_ID, KEY)] = 1;
        b[balanceIndex(NPC_B_ID, COIN)] = 1;
        emit InitialGranted(runId);
    }

    /// @notice Moves `qty` of `item` from the calling NPC's own balance to NPC `toNpc`.
    /// @dev Callable only by a registered NPC; the caller is always the source.
    function transferFromNpc(uint256 runId, uint8 toNpc, uint8 item, uint32 qty) external {
        (bool registered, uint8 fromNpc) = npcIdOf(msg.sender);
        if (!registered) revert NotRegisteredNpc(msg.sender);
        if (!_granted[runId]) revert RunNotGranted(runId);
        if (item != KEY && item != COIN) revert InvalidItem(item);
        if (toNpc >= NPC_COUNT) revert InvalidNpc(toNpc);
        if (toNpc == fromNpc) revert SelfTransfer();
        if (qty == 0) revert ZeroQuantity();

        uint256[6] storage b = _balances[runId];
        uint256 src = balanceIndex(fromNpc, item);
        uint256 have = b[src];
        if (have < qty) revert InsufficientBalance(runId, fromNpc, item, have, qty);
        unchecked {
            b[src] = have - qty;
        }
        b[balanceIndex(toNpc, item)] += qty;
        emit ItemMoved(runId, fromNpc, toNpc, item, qty);
    }

    /// @notice Balance of `item` held by NPC `npcId` in run `runId`. Reverts on invalid id/item.
    function balanceOf(uint256 runId, uint8 npcId, uint8 item) external view returns (uint256) {
        if (npcId >= NPC_COUNT) revert InvalidNpc(npcId);
        if (item != KEY && item != COIN) revert InvalidItem(item);
        return _balances[runId][balanceIndex(npcId, item)];
    }

    /// @notice All balances of a run in canonical order `[A.KEY, A.COIN, B.KEY, B.COIN, C.KEY, C.COIN]`.
    function snapshotBalances(uint256 runId) external view returns (uint256[6] memory) {
        return _balances[runId];
    }

    /// @notice Whether the initial stock of `runId` has been granted.
    function isGranted(uint256 runId) external view returns (bool) {
        return _granted[runId];
    }

    /// @notice Registered address of NPC `npcId`. Reverts `InvalidNpc` for unknown ids.
    function npcAddress(uint8 npcId) external view returns (address) {
        if (npcId == NPC_A_ID) return _npcA;
        if (npcId == NPC_B_ID) return _npcB;
        if (npcId == NPC_C_ID) return _npcC;
        revert InvalidNpc(npcId);
    }

    /// @notice Resolves an address to its NPC id, if registered.
    function npcIdOf(address account) public view returns (bool registered, uint8 id) {
        if (account == _npcA) return (true, NPC_A_ID);
        if (account == _npcB) return (true, NPC_B_ID);
        if (account == _npcC) return (true, NPC_C_ID);
        return (false, 0);
    }
}
