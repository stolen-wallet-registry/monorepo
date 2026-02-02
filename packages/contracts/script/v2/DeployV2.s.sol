// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { FraudRegistryV2 } from "../../src/v2/FraudRegistryV2.sol";
import { OperatorRegistry } from "../../src/OperatorRegistry.sol";

/// @title DeployV2
/// @notice Deployment script for FraudRegistryV2 contracts
/// @dev Usage:
///      Local (Anvil):
///        forge script script/v2/DeployV2.s.sol --rpc-url http://localhost:8545 --broadcast \
///          --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
///
///      Testnet (Base Sepolia):
///        forge script script/v2/DeployV2.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify \
///          --etherscan-api-key $BASESCAN_API_KEY --private-key $DEPLOYER_PRIVATE_KEY
contract DeployV2 is Script {
    // Timing configuration by chain
    // Block times: Anvil ~13s, Base/OP ~2s, Arbitrum ~0.25s
    // Target: ~2 min grace, ~10 min deadline

    // Local Anvil (13s blocks)
    uint256 constant ANVIL_GRACE_BLOCKS = 10; // ~2 min
    uint256 constant ANVIL_DEADLINE_BLOCKS = 50; // ~10 min

    // Base/Optimism L2 (2s blocks)
    uint256 constant L2_GRACE_BLOCKS = 60; // ~2 min
    uint256 constant L2_DEADLINE_BLOCKS = 300; // ~10 min

    function run() external {
        // Get private key from env or use Anvil default
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0));

        // Anvil's first default private key
        if (deployerPrivateKey == 0) {
            deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        }

        address deployer = vm.addr(deployerPrivateKey);

        // Fee configuration from environment
        // FEE_MANAGER=0x0 means free registrations (good for testing)
        // If FEE_MANAGER is set, FEE_RECIPIENT must also be set
        address feeManagerAddr = vm.envOr("FEE_MANAGER", address(0));
        address feeRecipientAddr = vm.envOr("FEE_RECIPIENT", address(0));

        // Select timing config based on chain
        (uint256 graceBlocks, uint256 deadlineBlocks) = _getTimingConfig();

        console2.log("=== FraudRegistryV2 Deployment ===");
        console2.log("Chain ID:", block.chainid);
        console2.log("Deployer:", deployer);
        console2.log("FeeManager:", feeManagerAddr);
        console2.log("FeeRecipient:", feeRecipientAddr);
        console2.log("Grace Blocks:", graceBlocks);
        console2.log("Deadline Blocks:", deadlineBlocks);
        console2.log("");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy OperatorRegistry
        OperatorRegistry operatorRegistry = new OperatorRegistry(deployer);
        console2.log("OperatorRegistry deployed:", address(operatorRegistry));

        // 2. Deploy FraudRegistryV2
        FraudRegistryV2 registry = new FraudRegistryV2(
            deployer, address(operatorRegistry), feeManagerAddr, feeRecipientAddr, graceBlocks, deadlineBlocks
        );
        console2.log("FraudRegistryV2 deployed:", address(registry));

        vm.stopBroadcast();

        // Output for frontend configuration
        console2.log("");
        console2.log("=== Frontend Configuration ===");
        console2.log("Add to apps/web/src/lib/contracts/addresses.ts:");
        console2.log("");
        _logFrontendConfig(address(registry), address(operatorRegistry));
    }

    function _getTimingConfig() internal view returns (uint256 graceBlocks, uint256 deadlineBlocks) {
        uint256 chainId = block.chainid;

        // Local Anvil
        if (chainId == 31_337) {
            return (ANVIL_GRACE_BLOCKS, ANVIL_DEADLINE_BLOCKS);
        }

        // Base Sepolia (84532) or Base Mainnet (8453)
        if (chainId == 84_532 || chainId == 8453) {
            return (L2_GRACE_BLOCKS, L2_DEADLINE_BLOCKS);
        }

        // Optimism Sepolia (11155420) or OP Mainnet (10)
        if (chainId == 11_155_420 || chainId == 10) {
            return (L2_GRACE_BLOCKS, L2_DEADLINE_BLOCKS);
        }

        // Default to L2 config
        return (L2_GRACE_BLOCKS, L2_DEADLINE_BLOCKS);
    }

    function _logFrontendConfig(address registry, address operatorReg) internal view {
        uint256 chainId = block.chainid;

        if (chainId == 31_337) {
            console2.log("// Local Anvil");
            console2.log("31337: {");
        } else if (chainId == 84_532) {
            console2.log("// Base Sepolia");
            console2.log("84532: {");
        } else if (chainId == 8453) {
            console2.log("// Base Mainnet");
            console2.log("8453: {");
        } else {
            console2.log("// Chain", chainId);
            console2.log(chainId, ": {");
        }

        console2.log("  fraudRegistryV2: '", registry, "',");
        console2.log("  operatorRegistry: '", operatorReg, "',");
        console2.log("},");
    }
}
