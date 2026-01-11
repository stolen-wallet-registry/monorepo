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

    function test_GracePeriodEndBlock_InRange() public {
        vm.roll(100);
        uint256 result = harness.graceEnd(10);
        assertGe(result, 110);
        assertLe(result, 119);
    }

    function test_DeadlineBlock_InRange() public {
        vm.roll(200);
        uint256 result = harness.deadlineEnd(50);
        assertGe(result, 250);
        assertLe(result, 299);
    }

    function test_SignatureDeadline_InRange() public {
        vm.warp(1_700_000_000);
        uint256 result = harness.signatureDeadline();
        assertGe(result, 1_700_001_800);
        assertLt(result, 1_700_003_600);
    }
}
