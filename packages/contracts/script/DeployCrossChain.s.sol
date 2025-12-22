// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";

// Hub contracts
import { RegistryHub } from "../src/RegistryHub.sol";
import { StolenWalletRegistry } from "../src/registries/StolenWalletRegistry.sol";
import { CrossChainInbox } from "../src/crosschain/CrossChainInbox.sol";

// Spoke contracts
import { SpokeRegistry } from "../src/spoke/SpokeRegistry.sol";
import { HyperlaneAdapter } from "../src/crosschain/adapters/HyperlaneAdapter.sol";

// Libraries
import { CrossChainMessage } from "../src/libraries/CrossChainMessage.sol";

// Mocks (for local development)
import { MockMailbox } from "../test/mocks/MockMailbox.sol";
import { MockInterchainGasPaymaster } from "../test/mocks/MockInterchainGasPaymaster.sol";

/// @title DeployCrossChain
/// @author Stolen Wallet Registry Team
/// @notice Deploy contracts to two local Anvil chains for cross-chain testing
/// @dev Run with: forge script script/DeployCrossChain.s.sol --tc DeployCrossChain --broadcast
///
/// Prerequisites:
///   1. Start two Anvil nodes:
///      - Hub: anvil -p 8545 --chain-id 31337 --block-time 1
///      - Spoke: anvil -p 8546 --chain-id 31338 --block-time 1
///   2. Set PRIVATE_KEY env var (or use default Anvil key)
///
/// This script deploys:
///   Hub Chain (31337):  MockMailbox, RegistryHub, StolenWalletRegistry, CrossChainInbox
///   Spoke Chain (31338): MockMailbox, MockInterchainGasPaymaster, HyperlaneAdapter, SpokeRegistry
///
/// After deployment, the Hyperlane relayer can relay messages between the two chains.
contract DeployCrossChain is Script {
    // Chain RPCs
    string constant HUB_RPC = "http://localhost:8545";
    string constant SPOKE_RPC = "http://localhost:8546";

    // Chain IDs / Hyperlane Domains (same for local anvil)
    uint32 constant HUB_CHAIN_ID = 31_337;
    uint32 constant SPOKE_CHAIN_ID = 31_338;

    // Fork IDs (for switching between chains)
    uint256 hubForkId;
    uint256 spokeForkId;

    // Deployed addresses (populated during run)
    // Hub
    address hubMailbox;
    address hubRegistry;
    address stolenWalletRegistry;
    address crossChainInbox;

    // Spoke
    address spokeMailbox;
    address spokeGasPaymaster;
    address hyperlaneAdapter;
    address spokeRegistry;

    function run() external {
        // Use default Anvil private key if not set
        uint256 deployerPrivateKey =
            vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));

        address deployer = vm.addr(deployerPrivateKey);

        console2.log("=== CROSS-CHAIN DEPLOYMENT ===");
        console2.log("Deployer:", deployer);
        console2.log("");

        // Create forks FIRST, then we can switch between them
        hubForkId = vm.createFork(HUB_RPC);
        spokeForkId = vm.createFork(SPOKE_RPC);

        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE 1: DEPLOY TO HUB CHAIN (31337)
        // ═══════════════════════════════════════════════════════════════════════════

        console2.log("--- HUB CHAIN (31337) ---");

        vm.selectFork(hubForkId);
        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy MockMailbox for local testing
        MockMailbox hubMockMailbox = new MockMailbox(HUB_CHAIN_ID);
        hubMailbox = address(hubMockMailbox);
        console2.log("MockMailbox (Hub):", hubMailbox);

        // 2. Deploy RegistryHub (no fee manager, no registry yet)
        RegistryHub hub = new RegistryHub(deployer, address(0), address(0));
        hubRegistry = address(hub);
        console2.log("RegistryHub:", hubRegistry);

        // 3. Deploy StolenWalletRegistry (feeManager=0, registryHub=hub)
        StolenWalletRegistry walletRegistry = new StolenWalletRegistry(address(0), address(hub));
        stolenWalletRegistry = address(walletRegistry);
        console2.log("StolenWalletRegistry:", stolenWalletRegistry);

        // 4. Wire registry to hub
        hub.setRegistry(hub.STOLEN_WALLET(), stolenWalletRegistry);

        // 5. Deploy CrossChainInbox (mailbox, registryHub, owner)
        CrossChainInbox inbox = new CrossChainInbox(hubMailbox, hubRegistry, deployer);
        crossChainInbox = address(inbox);
        console2.log("CrossChainInbox:", crossChainInbox);

        // 6. Wire inbox to hub
        hub.setCrossChainInbox(crossChainInbox);

        vm.stopBroadcast();

        console2.log("");

        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE 2: DEPLOY TO SPOKE CHAIN (31338)
        // ═══════════════════════════════════════════════════════════════════════════

        console2.log("--- SPOKE CHAIN (31338) ---");

        vm.selectFork(spokeForkId);
        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy MockMailbox for local testing
        MockMailbox spokeMockMailbox = new MockMailbox(SPOKE_CHAIN_ID);
        spokeMailbox = address(spokeMockMailbox);
        console2.log("MockMailbox (Spoke):", spokeMailbox);

        // 2. Deploy MockInterchainGasPaymaster
        MockInterchainGasPaymaster gasPaymaster = new MockInterchainGasPaymaster();
        spokeGasPaymaster = address(gasPaymaster);
        console2.log("MockInterchainGasPaymaster:", spokeGasPaymaster);

        // 3. Deploy HyperlaneAdapter (owner, mailbox, gasPaymaster)
        HyperlaneAdapter adapter = new HyperlaneAdapter(deployer, spokeMailbox, spokeGasPaymaster);
        hyperlaneAdapter = address(adapter);
        console2.log("HyperlaneAdapter:", hyperlaneAdapter);

        // 4. Enable hub domain on adapter
        adapter.setDomainSupport(HUB_CHAIN_ID, true);

        // 5. Deploy SpokeRegistry (owner, bridgeAdapter, feeManager, hubChainId, hubInbox)
        bytes32 hubInboxBytes = CrossChainMessage.addressToBytes32(crossChainInbox);
        SpokeRegistry spoke = new SpokeRegistry(deployer, hyperlaneAdapter, address(0), HUB_CHAIN_ID, hubInboxBytes);
        spokeRegistry = address(spoke);
        console2.log("SpokeRegistry:", spokeRegistry);

        vm.stopBroadcast();

        console2.log("");

        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE 3: CONFIGURE TRUST RELATIONSHIPS (back on hub)
        // ═══════════════════════════════════════════════════════════════════════════

        console2.log("--- TRUST CONFIGURATION ---");

        // Switch back to hub fork (same fork, not a new one)
        vm.selectFork(hubForkId);
        vm.startBroadcast(deployerPrivateKey);

        // Configure inbox to trust spoke registry
        bytes32 spokeRegistryBytes = CrossChainMessage.addressToBytes32(spokeRegistry);
        CrossChainInbox(crossChainInbox).setTrustedSource(SPOKE_CHAIN_ID, spokeRegistryBytes, true);
        console2.log("Trusted source configured: SpokeRegistry on chain", SPOKE_CHAIN_ID);

        vm.stopBroadcast();

        // ═══════════════════════════════════════════════════════════════════════════
        // OUTPUT SUMMARY
        // ═══════════════════════════════════════════════════════════════════════════

        console2.log("");
        console2.log("=== DEPLOYMENT COMPLETE ===");
        console2.log("");
        console2.log("Hub Chain (31337) - http://localhost:8545:");
        console2.log("  MockMailbox:          ", hubMailbox);
        console2.log("  RegistryHub:          ", hubRegistry);
        console2.log("  StolenWalletRegistry: ", stolenWalletRegistry);
        console2.log("  CrossChainInbox:      ", crossChainInbox);
        console2.log("");
        console2.log("Spoke Chain (31338) - http://localhost:8546:");
        console2.log("  MockMailbox:              ", spokeMailbox);
        console2.log("  MockInterchainGasPaymaster:", spokeGasPaymaster);
        console2.log("  HyperlaneAdapter:         ", hyperlaneAdapter);
        console2.log("  SpokeRegistry:            ", spokeRegistry);
        console2.log("");
        console2.log("Trust Relationships:");
        console2.log("  CrossChainInbox trusts SpokeRegistry from chain 31338");
        console2.log("");
        console2.log("Next steps:");
        console2.log("  1. Update frontend cross-chain addresses");
        console2.log("  2. Start dev server: pnpm dev:crosschain");
        console2.log("  3. Connect wallet and test registration flow");
    }
}
