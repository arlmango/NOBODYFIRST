// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {GameItems} from "./GameItems.sol";
import {NPC_A} from "./NPC_A.sol";
import {NPC_B} from "./NPC_B.sol";
import {NPC_C} from "./NPC_C.sol";
import {AtomicCoordinator} from "./AtomicCoordinator.sol";

/// @title Level1Deployer — one-shot, atomic wiring of the five level-1 contracts.
/// @notice The constructor predicts the addresses of its own CREATE nonces 1..5, deploys
///         GameItems, NPC_A, NPC_B, NPC_C and AtomicCoordinator in that order with the predicted
///         cross-references, and checks every created address against its prediction. The deployer
///         has no functions that change anything afterwards; it only exposes the five addresses.
contract Level1Deployer {
    error PredictionMismatch(uint256 nonce, address predicted, address actual);
    error UnsupportedNonce(uint8 nonce);

    GameItems public immutable items;
    NPC_A public immutable npcA;
    NPC_B public immutable npcB;
    NPC_C public immutable npcC;
    AtomicCoordinator public immutable coordinator;

    constructor() {
        address pItems = predict(address(this), 1);
        address pA = predict(address(this), 2);
        address pB = predict(address(this), 3);
        address pC = predict(address(this), 4);
        address pCoord = predict(address(this), 5);

        items = new GameItems(pCoord, pA, pB, pC);
        _check(1, pItems, address(items));
        npcA = new NPC_A(pItems, pCoord);
        _check(2, pA, address(npcA));
        npcB = new NPC_B(pItems, pCoord);
        _check(3, pB, address(npcB));
        npcC = new NPC_C(pItems, pCoord);
        _check(4, pC, address(npcC));
        coordinator = new AtomicCoordinator(pItems, pA, pB, pC);
        _check(5, pCoord, address(coordinator));
    }

    /// @notice CREATE address of `deployer` at `nonce` (valid for 1 <= nonce <= 0x7f). Pure helper.
    /// @dev rlp([deployer, nonce]) = 0xd6 0x94 <20-byte deployer> <nonce byte>.
    function predict(address deployer, uint8 nonce) public pure returns (address) {
        if (nonce == 0 || nonce > 0x7f) revert UnsupportedNonce(nonce);
        return address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xd6), bytes1(0x94), deployer, bytes1(nonce)))))
        );
    }

    function _check(uint256 nonce, address predicted, address actual) private pure {
        if (predicted != actual) revert PredictionMismatch(nonce, predicted, actual);
    }
}
