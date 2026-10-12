// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Transfer, Permit} from "../Types.sol";
import {IGameItems} from "./IGameItems.sol";

/// @title Independent NPC agent for NOBODY FIRST level 1.
/// @notice Each NPC validates a proposed plan on its own, issues a one-time permit bound to
///         (run, offer, snapshotHash, planHash), and spends only its own ledger balance on release.
interface INpc {
    error ZeroAddress();
    error NotCoordinator();
    error UnknownOffer(uint8 npcId, bytes32 offerId);
    error PlanRejected(uint8 npcId, uint8 code);
    error NothingToAuthorize();
    error PermitExists(uint256 runId);
    error BeforeMismatch(uint256 runId);
    error NoPermit(uint256 runId);
    error PermitMismatch(uint256 runId);
    error Reentrancy();

    event PermitIssued(
        uint256 indexed runId, uint8 indexed npcId, bytes32 indexed offerId, bytes32 snapshotHash, bytes32 planHash
    );
    event PermitConsumed(uint256 indexed runId, uint8 indexed npcId, bytes32 indexed offerId);

    function npcIdValue() external view returns (uint8);
    function ownOffer() external view returns (bytes32);
    function hasOffer(bytes32 offerId) external view returns (bool);
    function outgoing(bytes32 offerId) external view returns (bool hasTransfer, Transfer memory t);
    function validatePlan(uint256 runId, bytes32 offerId, Transfer[] calldata plan, uint256[6] calldata before)
        external
        view;
    function authorize(
        uint256 runId,
        bytes32 offerId,
        Transfer[] calldata plan,
        uint256[6] calldata before,
        bytes32 snapshotHash,
        bytes32 planHash
    ) external;
    function release(uint256 runId, bytes32 offerId, bytes32 snapshotHash, bytes32 planHash) external;
    function permitOf(uint256 runId) external view returns (Permit memory);
    function isGoalSatisfied(uint256[6] calldata finalBalances) external view returns (bool);

    function items() external view returns (IGameItems);
    function coordinator() external view returns (address);
}
