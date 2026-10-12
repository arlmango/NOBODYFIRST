// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

// TOOLCHAIN SMOKE TEST ONLY.
// This file proves only that the local tools work together (forge 1.8.5,
// solc 0.8.37, forge-std v1.17.0, offline mode). It is NOT evidence about
// NOBODY FIRST mechanics or any stage-2 contract. The harness below has no
// game semantics.

import {Test} from "forge-std/Test.sol";

contract ToolchainSmokeHarness {
    string public constant REVERT_REASON = "ToolchainSmoke: write-then-revert";

    uint256 private _value;

    function setValue(uint256 newValue) external {
        _value = newValue;
    }

    function getValue() external view returns (uint256) {
        return _value;
    }

    /// Writes storage first, then reverts with a fixed reason string.
    /// The write must be rolled back by the EVM.
    function writeThenRevert(uint256 newValue) external {
        _value = newValue;
        revert(REVERT_REASON);
    }
}

contract ToolchainSmokeTest is Test {
    ToolchainSmokeHarness internal harness;

    bytes internal constant EXPECTED_REASON = bytes("ToolchainSmoke: write-then-revert");

    function setUp() public {
        harness = new ToolchainSmokeHarness();
    }

    function test_StorageWriteAndRead() public {
        assertEq(harness.getValue(), 0, "initial value");
        harness.setValue(42);
        assertEq(harness.getValue(), 42, "after set");
        harness.setValue(type(uint256).max);
        assertEq(harness.getValue(), type(uint256).max, "after second set");
    }

    function test_WriteThenRevert_ExpectRevertRollsBackStorage() public {
        harness.setValue(7);
        uint256 before = harness.getValue();

        vm.expectRevert(EXPECTED_REASON);
        harness.writeThenRevert(999);

        assertEq(harness.getValue(), before, "storage must be unchanged after revert");
        assertEq(harness.getValue(), 7);
    }

    function test_WriteThenRevert_TryCatchRollsBackStorage() public {
        harness.setValue(11);
        uint256 before = harness.getValue();

        bool reverted;
        string memory reason;
        try harness.writeThenRevert(12345) {
            reverted = false;
        } catch Error(string memory r) {
            reverted = true;
            reason = r;
        }

        assertTrue(reverted, "call must revert");
        assertEq(keccak256(bytes(reason)), keccak256(EXPECTED_REASON), "exact revert reason");
        assertEq(reason, harness.REVERT_REASON());
        assertEq(harness.getValue(), before, "storage must be unchanged after revert");
    }
}
