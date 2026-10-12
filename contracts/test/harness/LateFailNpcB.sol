// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

// TEST FIXTURES ONLY — never deployed by Level1Deployer.
// Both contracts inherit the production NPC_B unchanged (same constructor, same rules, same
// validatePlan/authorize/permit storage) and override exactly ONE virtual function each.
// No settlement logic is copied and there are no switches/flags: the fault is unconditional.

import {NPC_B} from "../../src/NPC_B.sol";
import {KEY, NPC_A_ID, NPC_B_ID} from "../../src/Types.sol";

/// Fault 1: B's `release` (the SECOND release in the settlement; A releases first in npcId order)
/// reverts. By the time it runs, A's release has already consumed A's permit and executed
/// A -> B 1 KEY in the production GameItems. The revert carries the ledger balances observed
/// at that moment so the revert data itself proves the first transfer had settled.
contract LateFailNpcB is NPC_B {
    error LateFailInjected(uint256 runId, uint256 observedAKey, uint256 observedBKey);

    constructor(address items_, address coordinator_) NPC_B(items_, coordinator_) {}

    function release(uint256 runId, bytes32, bytes32, bytes32) external view override {
        if (msg.sender != coordinator) revert NotCoordinator(); // same gate as production
        revert LateFailInjected(runId, items.balanceOf(runId, NPC_A_ID, KEY), items.balanceOf(runId, NPC_B_ID, KEY));
    }
}

/// Fault 2: B's goal check reports false, so the coordinator reaches step 9 with BOTH transfers
/// executed (A -> B KEY, B -> A COIN) and then reverts GoalNotSatisfied(1).
/// NPC_B's own validatePlan uses its internal check, not this external view, so validation and
/// authorization behave exactly as in production.
contract LateFailNpcB_Final is NPC_B {
    constructor(address items_, address coordinator_) NPC_B(items_, coordinator_) {}

    function isGoalSatisfied(uint256[6] calldata) external pure override returns (bool) {
        return false;
    }
}
