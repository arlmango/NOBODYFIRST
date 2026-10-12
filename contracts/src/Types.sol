// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @title NOBODY FIRST level 1 shared types and constants (free-standing, no state).

/// @notice One item movement between two NPCs inside one run.
struct Transfer {
    uint8 fromNpc;
    uint8 toNpc;
    uint8 item;
    uint32 qty;
}

/// @notice One player choice: which offer (or OFFER_NONE) an NPC participates with.
struct Selection {
    uint8 npcId;
    bytes32 offerId;
}

/// @notice One-time release permit an NPC stores per run after independent validation.
struct Permit {
    bytes32 offerId;
    bytes32 snapshotHash;
    bytes32 planHash;
    bool active;
}

// ---- Items (0 is invalid) ----
uint8 constant KEY = 1;
uint8 constant COIN = 2;

// ---- NPC ids ----
uint8 constant NPC_A_ID = 0;
uint8 constant NPC_B_ID = 1;
uint8 constant NPC_C_ID = 2;
uint8 constant NPC_COUNT = 3;

// ---- Offers ----
bytes32 constant OFFER_NONE = bytes32(0);
bytes32 constant OFFER_A1 = keccak256("NOBODYFIRST.L1.A1");
bytes32 constant OFFER_B1 = keccak256("NOBODYFIRST.L1.B1");

// ---- Level / hashing domains ----
uint256 constant LEVEL_ID = 1;
bytes32 constant SNAPSHOT_DOMAIN = keccak256("NOBODYFIRST.SNAPSHOT.V1");
bytes32 constant PLAN_DOMAIN = keccak256("NOBODYFIRST.PLAN.V1");

// ---- NPC plan rejection codes (INpc.PlanRejected(npcId, code)) ----
uint8 constant UNKNOWN_OFFER = 1;
uint8 constant OWN_TRANSFER_MISSING = 2;
uint8 constant OWN_TRANSFER_MISMATCH = 3;
uint8 constant INCOMING_MISSING = 4;
uint8 constant INCOMING_MISMATCH = 5;
uint8 constant UNEXPECTED_INCOMING = 6;
uint8 constant UNEXPECTED_OUTGOING = 7;
uint8 constant INSUFFICIENT_STOCK = 8;
uint8 constant GOAL_NOT_MET = 9;
uint8 constant OBSERVER_TOUCHED = 10;

/// @notice Canonical balance index: `[A.KEY, A.COIN, B.KEY, B.COIN, C.KEY, C.COIN]`.
/// @dev Caller must ensure npcId < NPC_COUNT and item is KEY or COIN.
function balanceIndex(uint8 npcId, uint8 item) pure returns (uint256) {
    return uint256(npcId) * 2 + uint256(item) - 1;
}
