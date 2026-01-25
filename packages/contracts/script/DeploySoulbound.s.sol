// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { console2 } from "forge-std/Script.sol";
import { DeployBase } from "./DeployBase.s.sol";

/// @title DeploySoulbound
/// @notice Standalone deployment script for soulbound token contracts
/// @dev Inherits from DeployBase to reuse MIN_DONATION
///
/// Use this script when:
/// - Deploying soulbound contracts separately from core contracts
/// - Upgrading/redeploying soulbound contracts to an existing registry
///
/// Environment Variables Required:
/// - STOLEN_WALLET_REGISTRY: Address of the StolenWalletRegistry contract
/// - FEE_COLLECTOR: Address to receive withdrawn fees (can be RegistryHub or DAO treasury)
///
/// Usage:
/// ```bash
/// # Local development (requires anvil running)
/// forge script script/DeploySoulbound.s.sol --rpc-url localhost --broadcast
///
/// # Testnet (Base Sepolia)
/// forge script script/DeploySoulbound.s.sol --rpc-url base-sepolia --broadcast --verify
///
/// # Production (Base Mainnet)
/// forge script script/DeploySoulbound.s.sol --rpc-url base --broadcast --verify
/// ```
contract DeploySoulbound is DeployBase {
    function run() external {
        // Load required addresses from environment
        address registry = vm.envAddress("STOLEN_WALLET_REGISTRY");
        address feeCollector = vm.envAddress("FEE_COLLECTOR");

        // Validate addresses early
        require(registry != address(0), "STOLEN_WALLET_REGISTRY cannot be zero address");
        require(feeCollector != address(0), "FEE_COLLECTOR cannot be zero address");

        console2.log("=== Soulbound Deployment ===");
        console2.log("Using StolenWalletRegistry:", registry);
        console2.log("Using FeeCollector:", feeCollector);
        console2.log("");

        vm.startBroadcast();

        // Deploy using inherited function from DeployBase
        (address translations, address walletSoulbound, address supportSoulbound) =
            deploySoulbound(registry, feeCollector);

        vm.stopBroadcast();

        // Output summary for .env update
        console2.log("");
        console2.log("=== Deployment Complete ===");
        console2.log("Add to your .env:");
        console2.log("TRANSLATION_REGISTRY=", translations);
        console2.log("WALLET_SOULBOUND=", walletSoulbound);
        console2.log("SUPPORT_SOULBOUND=", supportSoulbound);
    }
}
