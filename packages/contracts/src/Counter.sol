// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @title Counter - Simple contract to verify Foundry setup
/// @notice This is a placeholder contract - will be replaced by StolenWalletRegistry
contract Counter {
    uint256 public count;

    function increment() external {
        count += 1;
    }

    function setCount(uint256 _count) external {
        count = _count;
    }
}
