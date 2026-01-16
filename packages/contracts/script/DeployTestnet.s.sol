// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { console2 } from "forge-std/Script.sol";
import { DeployBase, MockAggregator } from "./DeployBase.s.sol";

// Hub contracts
import { RegistryHub } from "../src/RegistryHub.sol";
import { CrossChainInbox } from "../src/crosschain/CrossChainInbox.sol";

// Spoke contracts
import { SpokeRegistry } from "../src/spoke/SpokeRegistry.sol";
import { HyperlaneAdapter } from "../src/crosschain/adapters/HyperlaneAdapter.sol";
import { FeeManager } from "../src/FeeManager.sol";

// Libraries
import { CrossChainMessage } from "../src/libraries/CrossChainMessage.sol";

/// @title DeployTestnet
/// @notice Deploy SWR contracts to Base Sepolia (hub) + Optimism Sepolia (spoke)
/// @dev Run with separate commands for each chain:
///
///   Hub (Base Sepolia):
///     forge script script/DeployTestnet.s.sol:DeployTestnetHub \
///       --rpc-url $BASE_SEPOLIA_RPC \
///       --broadcast --verify \
///       --etherscan-api-key $BASESCAN_API_KEY
///
///   Spoke (Optimism Sepolia):
///     forge script script/DeployTestnet.s.sol:DeployTestnetSpoke \
///       --rpc-url $OPTIMISM_SEPOLIA_RPC \
///       --broadcast --verify \
///       --etherscan-api-key $OPTIMISM_ETHERSCAN_API_KEY
///
/// Prerequisites:
///   1. Set environment variables in packages/contracts/.env.testnet
///   2. Fund deployer wallet on both chains
///   3. Deploy hub first, then spoke (spoke needs CrossChainInbox address)

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

abstract contract TestnetConstants {
    // Chain IDs (also Hyperlane domain IDs for EVM)
    uint32 constant BASE_SEPOLIA_CHAIN_ID = 84_532;
    uint32 constant OPTIMISM_SEPOLIA_CHAIN_ID = 11_155_420;

    // Hyperlane official deployments (same on both chains - CREATE2)
    // Source: https://github.com/hyperlane-xyz/hyperlane-registry
    address constant HYPERLANE_MAILBOX = 0x6966b0E55883d49BFB24539356a2f8A673E02039;
    address constant HYPERLANE_IGP = 0x28B02B97a850872C4D33C3E024fab6499ad96564;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HUB DEPLOYMENT (Base Sepolia)
// ═══════════════════════════════════════════════════════════════════════════════

/// @notice Deploy hub contracts to Base Sepolia
/// @dev Run first - outputs CrossChainInbox address needed for spoke deployment
contract DeployTestnetHub is DeployBase, TestnetConstants {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        require(block.chainid == BASE_SEPOLIA_CHAIN_ID, "Must deploy to Base Sepolia (84532)");

        console2.log("=== HUB DEPLOYMENT (Base Sepolia) ===");
        console2.log("Chain ID:", block.chainid);
        console2.log("Deployer:", deployer);
        console2.log("Hyperlane Mailbox:", HYPERLANE_MAILBOX);
        console2.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy core contracts (CrossChainInbox set later)
        (address priceFeed, address feeManager, address payable hub, address walletRegistry, address txRegistry) =
            deployCore(deployer, address(0));

        // Deploy CrossChainInbox
        CrossChainInbox inbox = new CrossChainInbox(HYPERLANE_MAILBOX, hub, deployer);
        address crossChainInbox = address(inbox);
        console2.log("CrossChainInbox:", crossChainInbox);

        // Wire CrossChainInbox to hub
        RegistryHub(hub).setCrossChainInbox(crossChainInbox);

        vm.stopBroadcast();

        // Output for spoke deployment
        console2.log("");
        console2.log("=== HUB DEPLOYMENT COMPLETE ===");
        console2.log("");
        console2.log("Add to .env.testnet for spoke deployment:");
        console2.log("  HUB_CROSS_CHAIN_INBOX=", crossChainInbox);
        console2.log("");
        console2.log("Contract Addresses:");
        console2.log("  RegistryHub:", hub);
        console2.log("  StolenWalletRegistry:", walletRegistry);
        console2.log("  StolenTransactionRegistry:", txRegistry);
        console2.log("  FeeManager:", feeManager);
        console2.log("  CrossChainInbox:", crossChainInbox);
        console2.log("  PriceFeed:", priceFeed);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPOKE DEPLOYMENT (Optimism Sepolia)
// ═══════════════════════════════════════════════════════════════════════════════

/// @notice Deploy spoke contracts to Optimism Sepolia
/// @dev Run after hub deployment - requires HUB_CROSS_CHAIN_INBOX env var
contract DeployTestnetSpoke is DeployBase, TestnetConstants {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Read hub's CrossChainInbox address from environment
        address hubCrossChainInbox = vm.envAddress("HUB_CROSS_CHAIN_INBOX");
        require(hubCrossChainInbox != address(0), "HUB_CROSS_CHAIN_INBOX must be set");

        require(block.chainid == OPTIMISM_SEPOLIA_CHAIN_ID, "Must deploy to Optimism Sepolia (11155420)");

        console2.log("=== SPOKE DEPLOYMENT (Optimism Sepolia) ===");
        console2.log("Chain ID:", block.chainid);
        console2.log("Deployer:", deployer);
        console2.log("Hyperlane Mailbox:", HYPERLANE_MAILBOX);
        console2.log("Hub CrossChainInbox:", hubCrossChainInbox);
        console2.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy HyperlaneAdapter (uses real IGP on testnet)
        HyperlaneAdapter adapter = new HyperlaneAdapter(deployer, HYPERLANE_MAILBOX, HYPERLANE_IGP);
        address hyperlaneAdapter = address(adapter);
        console2.log("HyperlaneAdapter:", hyperlaneAdapter);

        // Enable hub domain
        adapter.setDomainSupport(BASE_SEPOLIA_CHAIN_ID, true);

        // Deploy MockAggregator (no Chainlink feed on Optimism Sepolia)
        address priceFeed = address(new MockAggregator(350_000_000_000)); // $3500 ETH
        console2.log("MockAggregator:", priceFeed);

        // Deploy FeeManager
        address feeManager = address(new FeeManager(deployer, priceFeed));
        console2.log("FeeManager:", feeManager);

        // Deploy SpokeRegistry (with chain-specific timing)
        bytes32 hubInboxBytes = CrossChainMessage.addressToBytes32(hubCrossChainInbox);
        (uint256 graceBlocks, uint256 deadlineBlocks) = getTimingConfig(block.chainid);
        console2.log("Timing Config - Grace Blocks:", graceBlocks);
        console2.log("Timing Config - Deadline Blocks:", deadlineBlocks);
        SpokeRegistry spoke = new SpokeRegistry(
            deployer, hyperlaneAdapter, feeManager, BASE_SEPOLIA_CHAIN_ID, hubInboxBytes, graceBlocks, deadlineBlocks
        );
        address spokeRegistry = address(spoke);
        console2.log("SpokeRegistry:", spokeRegistry);

        vm.stopBroadcast();

        // Output for hub trust configuration
        console2.log("");
        console2.log("=== SPOKE DEPLOYMENT COMPLETE ===");
        console2.log("");
        console2.log("Add to .env.testnet:");
        console2.log("  SPOKE_HYPERLANE_ADAPTER=", hyperlaneAdapter);
        console2.log("");
        console2.log("Contract Addresses:");
        console2.log("  SpokeRegistry:", spokeRegistry);
        console2.log("  HyperlaneAdapter:", hyperlaneAdapter);
        console2.log("  FeeManager:", feeManager);
        console2.log("  PriceFeed:", priceFeed);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRUST CONFIGURATION (Run after both deployments)
// ═══════════════════════════════════════════════════════════════════════════════

/// @notice Configure trust relationship on hub
/// @dev Run on Base Sepolia after spoke deployment
contract ConfigureTestnetTrust is DeployBase, TestnetConstants {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        // Read addresses from environment
        address crossChainInbox = vm.envAddress("HUB_CROSS_CHAIN_INBOX");
        address hyperlaneAdapter = vm.envAddress("SPOKE_HYPERLANE_ADAPTER");

        require(crossChainInbox != address(0), "HUB_CROSS_CHAIN_INBOX must be set");
        require(hyperlaneAdapter != address(0), "SPOKE_HYPERLANE_ADAPTER must be set");
        require(block.chainid == BASE_SEPOLIA_CHAIN_ID, "Must run on Base Sepolia");

        console2.log("=== TRUST CONFIGURATION ===");
        console2.log("CrossChainInbox:", crossChainInbox);
        console2.log("Trusting HyperlaneAdapter:", hyperlaneAdapter);
        console2.log("From chain:", OPTIMISM_SEPOLIA_CHAIN_ID);

        vm.startBroadcast(deployerPrivateKey);

        bytes32 adapterBytes = CrossChainMessage.addressToBytes32(hyperlaneAdapter);
        CrossChainInbox(crossChainInbox).setTrustedSource(OPTIMISM_SEPOLIA_CHAIN_ID, adapterBytes, true);

        vm.stopBroadcast();

        console2.log("");
        console2.log("Trust configured successfully!");
    }
}
