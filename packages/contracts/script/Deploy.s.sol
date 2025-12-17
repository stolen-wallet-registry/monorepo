// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { StolenWalletRegistry } from "../src/registries/StolenWalletRegistry.sol";

/// @title Deploy Script for StolenWalletRegistry
/// @notice Deploys the registry contract to the target network
/// @dev Usage:
///   Local:   forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
///   Testnet: forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast --verify
contract Deploy is Script {
    function run() external {
        // Use default anvil private key if not set
        uint256 deployerPrivateKey =
            vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));

        vm.startBroadcast(deployerPrivateKey);

        StolenWalletRegistry registry = new StolenWalletRegistry();

        vm.stopBroadcast();

        console.log("StolenWalletRegistry deployed to:", address(registry));
        console.log("Deployer:", vm.addr(deployerPrivateKey));
    }
}
