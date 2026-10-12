// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @title Per-run item ledger for NOBODY FIRST level 1.
/// @notice Balances can only change through `grantInitial` (coordinator, once per run) and
///         `transferFromNpc` (a registered NPC spending its own balance). Nothing else.
interface IGameItems {
    error ZeroAddress();
    error DuplicateAddress();
    error NotCoordinator();
    error AlreadyGranted(uint256 runId);
    error NotRegisteredNpc(address sender);
    error RunNotGranted(uint256 runId);
    error InvalidItem(uint8 item);
    error InvalidNpc(uint8 npcId);
    error SelfTransfer();
    error ZeroQuantity();
    error InsufficientBalance(uint256 runId, uint8 npcId, uint8 item, uint256 have, uint256 need);

    event InitialGranted(uint256 indexed runId);
    event ItemMoved(uint256 indexed runId, uint8 indexed fromNpc, uint8 indexed toNpc, uint8 item, uint32 qty);

    function grantInitial(uint256 runId) external;
    function transferFromNpc(uint256 runId, uint8 toNpc, uint8 item, uint32 qty) external;

    function balanceOf(uint256 runId, uint8 npcId, uint8 item) external view returns (uint256);
    function snapshotBalances(uint256 runId) external view returns (uint256[6] memory);
    function isGranted(uint256 runId) external view returns (bool);
    function coordinator() external view returns (address);
    function npcAddress(uint8 npcId) external view returns (address);
    function npcIdOf(address account) external view returns (bool registered, uint8 id);
}
