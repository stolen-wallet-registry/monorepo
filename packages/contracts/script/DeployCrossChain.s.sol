// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";

// Hub contracts
import { RegistryHub } from "../src/RegistryHub.sol";
import { StolenWalletRegistry } from "../src/registries/StolenWalletRegistry.sol";
import { FeeManager } from "../src/FeeManager.sol";
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
/// Hub deployment matches Deploy.s.sol order for address consistency:
///   0: MockAggregator    → 0x5FbDB2315678afecb367f032d93F642f64180aa3
///   1: FeeManager        → 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
///   2: RegistryHub       → 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
///   3: StolenWalletReg   → 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
///   4: (setRegistry tx)
///   5: MockMailbox       → 0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6
///   6: CrossChainInbox   → 0x8A791620dd6260079BF849Dc5567aDC3F2FdC318
///   7: (setCrossChainInbox tx)
///
/// This ensures `pnpm deploy:dev` and `pnpm deploy:crosschain` produce
/// identical addresses for core contracts (FeeManager, RegistryHub, StolenWalletRegistry).
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
    // Hub - core (same as Deploy.s.sol)
    address feeManager;
    address payable hubRegistry;
    address stolenWalletRegistry;
    // Hub - cross-chain specific
    address hubMailbox;
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
        // PHASE 1: DEPLOY CORE CONTRACTS TO HUB (same order as Deploy.s.sol)
        // ═══════════════════════════════════════════════════════════════════════════

        console2.log("--- HUB CHAIN (31337) - Core Contracts ---");

        vm.selectFork(hubForkId);
        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy MockAggregator (nonce 0) - same as Deploy.s.sol
        address priceFeed = address(new MockAggregatorForCrossChain(350_000_000_000)); // $3500 ETH
        console2.log("MockAggregator:", priceFeed);

        // 2. Deploy FeeManager (nonce 1) - same as Deploy.s.sol
        feeManager = address(new FeeManager(deployer, priceFeed));
        console2.log("FeeManager:", feeManager);

        // 3-5. Deploy RegistryHub, StolenWalletRegistry, and wire them
        {
            RegistryHub hub = new RegistryHub(deployer, feeManager, address(0));
            hubRegistry = payable(address(hub));
            console2.log("RegistryHub:", hubRegistry);

            stolenWalletRegistry = address(new StolenWalletRegistry(feeManager, address(hub)));
            console2.log("StolenWalletRegistry:", stolenWalletRegistry);

            hub.setRegistry(hub.STOLEN_WALLET(), stolenWalletRegistry);
        }

        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE 1b: DEPLOY CROSS-CHAIN CONTRACTS TO HUB (after core)
        // ═══════════════════════════════════════════════════════════════════════════

        console2.log("");
        console2.log("--- HUB CHAIN (31337) - Cross-Chain Contracts ---");

        // 6. Deploy MockMailbox (nonce 5)
        hubMailbox = address(new MockMailbox(HUB_CHAIN_ID));
        console2.log("MockMailbox (Hub):", hubMailbox);

        // 7-8. Deploy CrossChainInbox and wire to hub
        {
            CrossChainInbox inbox = new CrossChainInbox(hubMailbox, hubRegistry, deployer);
            crossChainInbox = address(inbox);
            console2.log("CrossChainInbox:", crossChainInbox);

            RegistryHub(hubRegistry).setCrossChainInbox(crossChainInbox);
        }

        vm.stopBroadcast();

        console2.log("");

        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE 2: DEPLOY TO SPOKE CHAIN (31338)
        // ═══════════════════════════════════════════════════════════════════════════

        console2.log("--- SPOKE CHAIN (31338) ---");

        vm.selectFork(spokeForkId);
        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy MockMailbox for local testing
        spokeMailbox = address(new MockMailbox(SPOKE_CHAIN_ID));
        console2.log("MockMailbox (Spoke):", spokeMailbox);

        // 2. Deploy MockInterchainGasPaymaster
        spokeGasPaymaster = address(new MockInterchainGasPaymaster());
        console2.log("MockInterchainGasPaymaster:", spokeGasPaymaster);

        // 3. Deploy HyperlaneAdapter (owner, mailbox, gasPaymaster)
        {
            HyperlaneAdapter adapter = new HyperlaneAdapter(deployer, spokeMailbox, spokeGasPaymaster);
            hyperlaneAdapter = address(adapter);
            console2.log("HyperlaneAdapter:", hyperlaneAdapter);
            // 4. Enable hub domain on adapter
            adapter.setDomainSupport(HUB_CHAIN_ID, true);
        }

        // 5. Deploy MockAggregator for spoke fee manager
        address spokePriceFeed = address(new MockAggregatorForCrossChain(350_000_000_000));
        console2.log("MockAggregator (Spoke):", spokePriceFeed);

        // 6. Deploy FeeManager for spoke (for bridge + registration fees)
        address spokeFeeManager = address(new FeeManager(deployer, spokePriceFeed));
        console2.log("FeeManager (Spoke):", spokeFeeManager);

        // 7. Deploy SpokeRegistry (owner, bridgeAdapter, feeManager, hubChainId, hubInbox)
        {
            bytes32 hubInboxBytes = CrossChainMessage.addressToBytes32(crossChainInbox);
            spokeRegistry = address(
                new SpokeRegistry(deployer, hyperlaneAdapter, spokeFeeManager, HUB_CHAIN_ID, hubInboxBytes)
            );
            console2.log("SpokeRegistry:", spokeRegistry);
        }

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
        console2.log("  FeeManager:           ", feeManager);
        console2.log("  RegistryHub:          ", hubRegistry);
        console2.log("  StolenWalletRegistry: ", stolenWalletRegistry);
        console2.log("  MockMailbox:          ", hubMailbox);
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
        console2.log("Core contract addresses match Deploy.s.sol:");
        console2.log("  FeeManager:           0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512");
        console2.log("  RegistryHub:          0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0");
        console2.log("  StolenWalletRegistry: 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9");
        console2.log("");
        console2.log("Next steps:");
        console2.log("  1. Start dev server: pnpm dev:crosschain");
        console2.log("  2. Connect wallet and test registration flow");
        console2.log("  3. Use 'cast' to relay messages between chains (see docs)");
    }
}

/// @notice Minimal mock aggregator for local deployment
/// @dev Only used when deploying to local Anvil chain
contract MockAggregatorForCrossChain {
    int256 public price;
    uint256 public updatedAt;

    constructor(int256 _price) {
        price = _price;
        updatedAt = block.timestamp;
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 _updatedAt, uint80 answeredInRound)
    {
        return (0, price, 0, updatedAt, 0);
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function description() external pure returns (string memory) {
        return "ETH / USD (Mock)";
    }

    function version() external pure returns (uint256) {
        return 1;
    }

    function getRoundData(uint80)
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 _updatedAt, uint80 answeredInRound)
    {
        return (0, price, 0, updatedAt, 0);
    }
}
