// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Test} from "forge-std/Test.sol";
import {Counter} from "../src/Counter.sol";

contract CounterTest is Test {
    Counter public counter;

    function setUp() public {
        counter = new Counter();
    }

    function test_InitialCount() public view {
        assertEq(counter.count(), 0);
    }

    function test_Increment() public {
        counter.increment();
        assertEq(counter.count(), 1);
    }

    function test_SetCount() public {
        counter.setCount(42);
        assertEq(counter.count(), 42);
    }

    function testFuzz_SetCount(uint256 x) public {
        counter.setCount(x);
        assertEq(counter.count(), x);
    }
}
