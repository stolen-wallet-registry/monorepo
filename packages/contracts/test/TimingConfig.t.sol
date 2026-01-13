// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { TimingConfig } from "../src/libraries/TimingConfig.sol";

contract TimingConfigHarness {
    function graceEnd(uint256 graceBlocks) external view returns (uint256) {
        return TimingConfig.getGracePeriodEndBlock(graceBlocks);
    }

    function deadlineEnd(uint256 deadlineBlocks) external view returns (uint256) {
        return TimingConfig.getDeadlineBlock(deadlineBlocks);
    }

    function signatureDeadline() external view returns (uint256) {
        return TimingConfig.getSignatureDeadline();
    }
}

contract TimingConfigTest is Test {
    TimingConfigHarness harness;

    function setUp() public {
        harness = new TimingConfigHarness();
    }

    // Randomized grace end block must remain within the documented range to
    // preserve UX guarantees and prevent unexpectedly long waits.
    function test_GracePeriodEndBlock_InRange() public {
        vm.roll(100);
        uint256 result = harness.graceEnd(10);
        assertGe(result, 110);
        assertLe(result, 119);
    }

    // Deadline block must stay within the expected range so registrations
    // are neither prematurely cut off nor excessively long.
    function test_DeadlineBlock_InRange() public {
        vm.roll(200);
        uint256 result = harness.deadlineEnd(50);
        assertGe(result, 250);
        assertLe(result, 299);
    }

    // Signature deadline jitter should stay within the expected bounds so
    // signatures are neither too short-lived nor too long-lived.
    function test_SignatureDeadline_InRange() public {
        vm.warp(1_700_000_000);
        uint256 result = harness.signatureDeadline();
        assertGe(result, 1_700_001_800);
        assertLt(result, 1_700_003_600);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BOUNDARY TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Minimum graceBlocks should still produce a deterministic valid result.
    function test_GracePeriodEndBlock_MinimumValue() public {
        vm.roll(100);
        uint256 result = harness.graceEnd(1);
        // With graceBlocks=1: range is [101, 101] (no randomness possible)
        assertGe(result, 101);
        assertLe(result, 101);
    }

    // Minimum deadlineBlocks should still produce a deterministic valid result.
    function test_DeadlineBlock_MinimumValue() public {
        vm.roll(200);
        uint256 result = harness.deadlineEnd(1);
        // With deadlineBlocks=1: range is [201, 201] (no randomness possible)
        assertGe(result, 201);
        assertLe(result, 201);
    }

    // Large graceBlocks should maintain correct range boundaries.
    function test_GracePeriodEndBlock_LargeValue() public {
        vm.roll(1000);
        uint256 graceBlocks = 10_000;
        uint256 result = harness.graceEnd(graceBlocks);
        assertGe(result, 1000 + graceBlocks);
        assertLe(result, 1000 + (2 * graceBlocks) - 1);
    }

    // Large deadlineBlocks should maintain correct range boundaries.
    function test_DeadlineBlock_LargeValue() public {
        vm.roll(1000);
        uint256 deadlineBlocks = 10_000;
        uint256 result = harness.deadlineEnd(deadlineBlocks);
        assertGe(result, 1000 + deadlineBlocks);
        assertLe(result, 1000 + (2 * deadlineBlocks) - 1);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FUZZ TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Fuzz test: grace end block should always be within the documented range.
    function testFuzz_GracePeriodEndBlock_Range(uint256 currentBlock, uint256 graceBlocks) public {
        // Bound inputs to reasonable values to avoid overflow
        currentBlock = bound(currentBlock, 1, type(uint128).max);
        graceBlocks = bound(graceBlocks, 1, type(uint64).max);

        vm.roll(currentBlock);
        uint256 result = harness.graceEnd(graceBlocks);

        assertGe(result, currentBlock + graceBlocks);
        assertLe(result, currentBlock + (2 * graceBlocks) - 1);
    }

    // Fuzz test: deadline block should always be within the documented range.
    function testFuzz_DeadlineBlock_Range(uint256 currentBlock, uint256 deadlineBlocks) public {
        // Bound inputs to reasonable values to avoid overflow
        currentBlock = bound(currentBlock, 1, type(uint128).max);
        deadlineBlocks = bound(deadlineBlocks, 1, type(uint64).max);

        vm.roll(currentBlock);
        uint256 result = harness.deadlineEnd(deadlineBlocks);

        assertGe(result, currentBlock + deadlineBlocks);
        assertLe(result, currentBlock + (2 * deadlineBlocks) - 1);
    }

    // Fuzz test: signature deadline should always be within the documented range.
    function testFuzz_SignatureDeadline_Range(uint256 currentTimestamp) public {
        // Bound to reasonable timestamp values (avoid overflow with deadline additions)
        currentTimestamp = bound(currentTimestamp, 1, type(uint128).max);

        vm.warp(currentTimestamp);
        uint256 result = harness.signatureDeadline();

        // Signature deadline should be between 30 min (1800s) and 1 hour (3600s) from now
        assertGe(result, currentTimestamp + 1800);
        assertLt(result, currentTimestamp + 3600);
    }
}
