// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { console2 } from "forge-std/Script.sol";
import { DeployBase } from "./DeployBase.s.sol";
import { FeeManager } from "../src/FeeManager.sol";
import { RegistryHub } from "../src/RegistryHub.sol";
import { OperatorRegistry } from "../src/OperatorRegistry.sol";
import { StolenWalletRegistry } from "../src/registries/StolenWalletRegistry.sol";
import { StolenTransactionRegistry } from "../src/registries/StolenTransactionRegistry.sol";
import { FraudulentContractRegistry } from "../src/registries/FraudulentContractRegistry.sol";

/// @title Deploy Script for Stolen Wallet Registry (Single-Chain)
/// @notice Deploys core registry system without cross-chain infrastructure
/// @dev Usage:
///   Local:   forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
///   Testnet: forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast --verify
contract Deploy is DeployBase {
    function run() external {
        uint256 deployerPrivateKey =
            vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));

        address deployer = vm.addr(deployerPrivateKey);

        console2.log("=== SINGLE-CHAIN DEPLOYMENT ===");
        console2.log("Chain ID:", block.chainid);
        console2.log("Deployer:", deployer);
        console2.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy core contracts (no cross-chain inbox)
        (address priceFeed, address feeManager, address payable hub, address walletRegistry, address txRegistry) =
            deployCore(deployer, address(0));

        // Deploy Multicall3 for local chains (needed for viem/wagmi batch calls)
        address multicall3 = deployMulticall3();

        // Deploy soulbound contracts (fee collector = hub for unified treasury)
        (address translations, address walletSoulbound, address supportSoulbound) = deploySoulbound(walletRegistry, hub);

        // Deploy OperatorRegistry and wire to hub + individual registries
        OperatorRegistry opReg = new OperatorRegistry(deployer);
        address operatorRegistry = address(opReg);
        console2.log("OperatorRegistry:", operatorRegistry);
        RegistryHub(hub).setOperatorRegistry(operatorRegistry);
        StolenWalletRegistry(walletRegistry).setOperatorRegistry(operatorRegistry);
        StolenTransactionRegistry(txRegistry).setOperatorRegistry(operatorRegistry);

        // Deploy FraudulentContractRegistry and wire to hub
        FraudulentContractRegistry fcReg = new FraudulentContractRegistry(deployer, operatorRegistry, feeManager, hub);
        address fraudulentContractRegistry = address(fcReg);
        console2.log("FraudulentContractRegistry:", fraudulentContractRegistry);
        RegistryHub(hub).setFraudulentContractRegistry(fraudulentContractRegistry);

        vm.stopBroadcast();

        // Summary
        console2.log("");
        console2.log("=== DEPLOYMENT COMPLETE ===");
        console2.log("--- Core ---");
        console2.log("StolenWalletRegistry:", walletRegistry);
        console2.log("StolenTransactionRegistry:", txRegistry);
        console2.log("FeeManager:", feeManager);
        console2.log("RegistryHub:", hub);
        console2.log("Price Feed:", priceFeed);
        console2.log("Multicall3:", multicall3);
        console2.log("Current Fee (wei):", FeeManager(feeManager).currentFeeWei());
        console2.log("");
        console2.log("--- Soulbound ---");
        console2.log("TranslationRegistry:", translations);
        console2.log("WalletSoulbound:", walletSoulbound);
        console2.log("SupportSoulbound:", supportSoulbound);
        console2.log("");
        console2.log("--- Operator ---");
        console2.log("OperatorRegistry:", operatorRegistry);
        console2.log("");
        console2.log("--- Registries ---");
        console2.log("FraudulentContractRegistry:", fraudulentContractRegistry);
    }
}
