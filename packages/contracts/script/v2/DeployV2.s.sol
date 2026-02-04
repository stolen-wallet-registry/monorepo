// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { IMulticall3 } from "forge-std/interfaces/IMulticall3.sol";

// V2 core contracts
import { FraudRegistryV2 } from "../../src/v2/FraudRegistryV2.sol";
import { OperatorSubmitter } from "../../src/v2/OperatorSubmitter.sol";
import { OperatorRegistry } from "../../src/OperatorRegistry.sol";
import { CrossChainInboxV2 } from "../../src/v2/CrossChainInboxV2.sol";
import { SpokeRegistryV2 } from "../../src/v2/SpokeRegistryV2.sol";
import { HyperlaneAdapter } from "../../src/crosschain/adapters/HyperlaneAdapter.sol";

// Fee infrastructure
import { FeeManager } from "../../src/FeeManager.sol";

// Soulbound contracts
import { TranslationRegistry } from "../../src/soulbound/TranslationRegistry.sol";
import { WalletSoulbound } from "../../src/soulbound/WalletSoulbound.sol";
import { SupportSoulbound } from "../../src/soulbound/SupportSoulbound.sol";
import { SoulboundReceiver } from "../../src/soulbound/SoulboundReceiver.sol";
import { SpokeSoulboundForwarder } from "../../src/spoke/SpokeSoulboundForwarder.sol";

// Mocks for local testing
import { MockInterchainGasPaymaster } from "../../test/mocks/MockInterchainGasPaymaster.sol";
import { MockAggregator, Multicall3 } from "../DeployBase.s.sol";

/// @title DeployV2
/// @notice Deployment script for FraudRegistryV2 hub and spoke contracts
/// @dev Run with: forge script script/v2/DeployV2.s.sol --tc DeployV2 --broadcast
///
/// Prerequisites (for crosschain):
///   1. Start anvil with Hyperlane state: pnpm anvil:crosschain
///   2. Hyperlane deployed by Account 9 (preserves Account 0 nonces)
///   3. Set HUB_MAILBOX and SPOKE_MAILBOX in packages/contracts/.env
///
/// Usage:
///
///   LOCAL CROSSCHAIN (Anvil):
///     forge script script/v2/DeployV2.s.sol:DeployV2 --sig "deployCrossChain()" --broadcast
///
///   BASIC DEPLOYMENT (single chain, no crosschain):
///     forge script script/v2/DeployV2.s.sol:DeployV2 --sig "run()" \
///       --rpc-url http://localhost:8545 --broadcast
///
///   TESTNET HUB (Base Sepolia):
///     forge script script/v2/DeployV2.s.sol:DeployV2 --sig "deployHub()" \
///       --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify
///
///   TESTNET SPOKE (Optimism Sepolia):
///     forge script script/v2/DeployV2.s.sol:DeployV2 --sig "deploySpoke()" \
///       --rpc-url $OP_SEPOLIA_RPC_URL --broadcast --verify
///
contract DeployV2 is Script {
    // ═══════════════════════════════════════════════════════════════════════════
    // CHAIN CONFIGURATION (Local Anvil)
    // ═══════════════════════════════════════════════════════════════════════════

    string constant HUB_RPC = "http://localhost:8545";
    string constant SPOKE_RPC = "http://localhost:8546";

    uint32 constant HUB_CHAIN_ID = 31_337;
    uint32 constant SPOKE_CHAIN_ID = 31_338;

    // ═══════════════════════════════════════════════════════════════════════════
    // TIMING CONFIGURATION
    // ═══════════════════════════════════════════════════════════════════════════
    // Block times: Anvil ~13s, Base/OP ~2s, Arbitrum ~0.25s
    // Target: ~30s grace for local, ~2 min grace for testnet/mainnet

    // Local Anvil (13s blocks) - fast iteration
    uint256 constant ANVIL_GRACE_BLOCKS = 2; // ~30s
    uint256 constant ANVIL_DEADLINE_BLOCKS = 12; // ~2.5 min

    // Base/Optimism L2 (2s blocks)
    uint256 constant L2_GRACE_BLOCKS = 60; // ~2 min
    uint256 constant L2_DEADLINE_BLOCKS = 300; // ~10 min

    // Arbitrum (0.25s blocks)
    uint256 constant ARBITRUM_GRACE_BLOCKS = 480; // ~2 min
    uint256 constant ARBITRUM_DEADLINE_BLOCKS = 2400; // ~10 min

    // ═══════════════════════════════════════════════════════════════════════════
    // BRIDGE CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    uint8 constant BRIDGE_ID_HYPERLANE = 1;

    // ═══════════════════════════════════════════════════════════════════════════
    // SOULBOUND CONFIGURATION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Minimum donation for SupportSoulbound (spam prevention)
    uint256 internal constant MIN_DONATION = 0.0001 ether;

    /// @notice Domain for soulbound SVG display
    string internal constant DEFAULT_DOMAIN = "stolenwallet.xyz";

    /// @notice Canonical Multicall3 address (pre-deployed on major chains)
    address internal constant CANONICAL_MULTICALL3 = 0xcA11bde05977b3631167028862bE2a173976CA11;

    // ═══════════════════════════════════════════════════════════════════════════
    // TEST OPERATORS (Anvil accounts 3 and 4)
    // ═══════════════════════════════════════════════════════════════════════════

    address constant OPERATOR_A = 0x90F79bf6EB2c4f870365E785982E1f101E93b906;
    address constant OPERATOR_B = 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65;

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE (stored to reduce stack depth in crosschain deploy)
    // ═══════════════════════════════════════════════════════════════════════════

    uint256 hubForkId;
    uint256 spokeForkId;
    uint256 deployerPrivateKey;
    address deployer;

    // Hyperlane infrastructure (from env)
    address hubMailbox;
    address spokeMailbox;

    // Hub deployed addresses - Core V2
    address mockAggregatorAddr;
    address feeManagerAddr;
    address operatorRegistryAddr;
    address fraudRegistryAddr;
    address operatorSubmitterAddr;
    address crossChainInboxAddr;
    address hubMulticall3Addr;

    // Hub deployed addresses - Soulbound
    address translationRegistryAddr;
    address walletSoulboundAddr;
    address supportSoulboundAddr;
    address soulboundReceiverAddr;

    // Spoke deployed addresses
    address spokeGasPaymaster;
    address hyperlaneAdapterAddr;
    address spokeMockAggregatorAddr;
    address spokeFeeManagerAddr;
    address spokeRegistryAddr;
    address spokeSoulboundForwarderAddr;
    address spokeMulticall3Addr;

    // ═══════════════════════════════════════════════════════════════════════════
    // CROSSCHAIN DEPLOYMENT (Local Anvil with real Hyperlane)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Deploy V2 contracts to local Anvil chains with real Hyperlane
    /// @dev Mirrors DeployCrossChain.s.sol pattern for V1 contracts
    function deployCrossChain() external {
        deployerPrivateKey =
            vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        deployer = vm.addr(deployerPrivateKey);

        // Read Hyperlane Mailbox addresses from environment (REQUIRED)
        hubMailbox = vm.envAddress("HUB_MAILBOX");
        require(hubMailbox != address(0), "HUB_MAILBOX env var must be set");
        spokeMailbox = vm.envAddress("SPOKE_MAILBOX");
        require(spokeMailbox != address(0), "SPOKE_MAILBOX env var must be set");

        console2.log("=== V2 CROSS-CHAIN DEPLOYMENT (Real Hyperlane) ===");
        console2.log("Deployer:", deployer);
        console2.log("Hub Mailbox (Hyperlane):", hubMailbox);
        console2.log("Spoke Mailbox (Hyperlane):", spokeMailbox);
        console2.log("");

        // Create forks
        hubForkId = vm.createFork(HUB_RPC);
        spokeForkId = vm.createFork(SPOKE_RPC);

        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE 1: DEPLOY TO HUB CHAIN (31337)
        // ═══════════════════════════════════════════════════════════════════════════

        console2.log("--- HUB CHAIN (31337) - Core Contracts ---");

        vm.selectFork(hubForkId);
        vm.startBroadcast(deployerPrivateKey);

        // Get timing config for hub chain
        (uint256 hubGraceBlocks, uint256 hubDeadlineBlocks) = _getTimingConfig(block.chainid);
        console2.log("Timing - Grace Blocks:", hubGraceBlocks);
        console2.log("Timing - Deadline Blocks:", hubDeadlineBlocks);

        // 1. Deploy MockAggregator (price feed for FeeManager)
        MockAggregator mockAggregator = new MockAggregator(350_000_000_000); // $3500 ETH
        mockAggregatorAddr = address(mockAggregator);
        console2.log("1. MockAggregator:", mockAggregatorAddr);

        // 2. Deploy FeeManager
        FeeManager feeManager = new FeeManager(deployer, mockAggregatorAddr);
        feeManagerAddr = address(feeManager);
        console2.log("2. FeeManager:", feeManagerAddr);

        // 3. Deploy OperatorRegistry
        OperatorRegistry operatorRegistry = new OperatorRegistry(deployer);
        operatorRegistryAddr = address(operatorRegistry);
        console2.log("3. OperatorRegistry:", operatorRegistryAddr);

        // 4. Deploy FraudRegistryV2 (with feeManager, feeRecipient = deployer for now)
        FraudRegistryV2 registry = new FraudRegistryV2(
            deployer, operatorRegistryAddr, feeManagerAddr, deployer, hubGraceBlocks, hubDeadlineBlocks
        );
        fraudRegistryAddr = address(registry);
        console2.log("4. FraudRegistryV2:", fraudRegistryAddr);

        // 5. Deploy OperatorSubmitter (with feeManager)
        OperatorSubmitter operatorSubmitter =
            new OperatorSubmitter(deployer, fraudRegistryAddr, operatorRegistryAddr, feeManagerAddr, deployer);
        operatorSubmitterAddr = address(operatorSubmitter);
        console2.log("5. OperatorSubmitter:", operatorSubmitterAddr);

        // 6. Link OperatorSubmitter to Registry
        registry.setOperatorSubmitter(operatorSubmitterAddr);
        console2.log("   -> OperatorSubmitter linked");

        // 7. Deploy CrossChainInboxV2
        CrossChainInboxV2 inbox = new CrossChainInboxV2(hubMailbox, fraudRegistryAddr, deployer);
        crossChainInboxAddr = address(inbox);
        console2.log("6. CrossChainInboxV2:", crossChainInboxAddr);

        // 8. Link CrossChainInbox to Registry
        registry.setCrossChainInbox(crossChainInboxAddr);
        console2.log("   -> CrossChainInboxV2 linked");

        // 9. Deploy Multicall3 (for local chains only)
        hubMulticall3Addr = _deployMulticall3();
        console2.log("7. Multicall3:", hubMulticall3Addr);

        console2.log("");
        console2.log("--- HUB CHAIN (31337) - Soulbound Contracts ---");

        // 10. Deploy TranslationRegistry
        TranslationRegistry translationRegistry = new TranslationRegistry();
        translationRegistryAddr = address(translationRegistry);
        console2.log("8. TranslationRegistry:", translationRegistryAddr);

        // 11. Deploy WalletSoulbound (gated by FraudRegistryV2)
        WalletSoulbound walletSoulbound =
            new WalletSoulbound(fraudRegistryAddr, translationRegistryAddr, deployer, DEFAULT_DOMAIN);
        walletSoulboundAddr = address(walletSoulbound);
        console2.log("9. WalletSoulbound:", walletSoulboundAddr);

        // 12. Deploy SupportSoulbound
        SupportSoulbound supportSoulbound =
            new SupportSoulbound(MIN_DONATION, translationRegistryAddr, deployer, DEFAULT_DOMAIN);
        supportSoulboundAddr = address(supportSoulbound);
        console2.log("10. SupportSoulbound:", supportSoulboundAddr);

        // 13. Deploy SoulboundReceiver
        SoulboundReceiver soulboundReceiver =
            new SoulboundReceiver(deployer, hubMailbox, walletSoulboundAddr, supportSoulboundAddr);
        soulboundReceiverAddr = address(soulboundReceiver);
        console2.log("11. SoulboundReceiver:", soulboundReceiverAddr);

        // 14. Authorize SoulboundReceiver to mint on SupportSoulbound
        supportSoulbound.setAuthorizedMinter(soulboundReceiverAddr, true);
        console2.log("    -> SoulboundReceiver authorized to mint SupportSoulbound");

        console2.log("");
        console2.log("--- HUB CHAIN (31337) - Operator Seeding ---");

        // 15. Approve test operators (Anvil accounts 3 and 4)
        operatorRegistry.approveOperator(OPERATOR_A, operatorRegistry.ALL_REGISTRIES(), "TestOperatorA-ALL");
        console2.log("12. Operator A (ALL):", OPERATOR_A);

        operatorRegistry.approveOperator(OPERATOR_B, operatorRegistry.CONTRACT_REGISTRY(), "TestOperatorB-CONTRACT");
        console2.log("13. Operator B (CONTRACT):", OPERATOR_B);
        console2.log("    Approved operator count:", operatorRegistry.approvedOperatorCount());

        vm.stopBroadcast();
        console2.log("");

        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE 2: DEPLOY TO SPOKE CHAIN (31338)
        // ═══════════════════════════════════════════════════════════════════════════

        console2.log("--- SPOKE CHAIN (31338) - Core Contracts ---");

        vm.selectFork(spokeForkId);
        vm.startBroadcast(deployerPrivateKey);

        // Get timing config for spoke chain
        (uint256 spokeGraceBlocks, uint256 spokeDeadlineBlocks) = _getTimingConfig(block.chainid);
        console2.log("Timing - Grace Blocks:", spokeGraceBlocks);
        console2.log("Timing - Deadline Blocks:", spokeDeadlineBlocks);

        // 1. Deploy MockInterchainGasPaymaster
        spokeGasPaymaster = address(new MockInterchainGasPaymaster());
        console2.log("1. MockInterchainGasPaymaster:", spokeGasPaymaster);

        // 2. Deploy HyperlaneAdapter
        HyperlaneAdapter adapter = new HyperlaneAdapter(deployer, spokeMailbox, spokeGasPaymaster);
        hyperlaneAdapterAddr = address(adapter);
        console2.log("2. HyperlaneAdapter:", hyperlaneAdapterAddr);

        // 3. Enable hub chain as destination
        adapter.setDomainSupport(HUB_CHAIN_ID, true);
        console2.log("   -> Hub chain", HUB_CHAIN_ID, "enabled as destination");

        // 4. Deploy MockAggregator for spoke (price feed)
        MockAggregator spokeMockAggregator = new MockAggregator(350_000_000_000); // $3500 ETH
        spokeMockAggregatorAddr = address(spokeMockAggregator);
        console2.log("3. MockAggregator (Spoke):", spokeMockAggregatorAddr);

        // 5. Deploy FeeManager for spoke
        FeeManager spokeFeeManager = new FeeManager(deployer, spokeMockAggregatorAddr);
        spokeFeeManagerAddr = address(spokeFeeManager);
        console2.log("4. FeeManager (Spoke):", spokeFeeManagerAddr);

        // 6. Deploy SpokeRegistryV2 (with feeManager)
        bytes32 inboxBytes = _addressToBytes32(crossChainInboxAddr);
        SpokeRegistryV2 spoke = new SpokeRegistryV2(
            deployer,
            hyperlaneAdapterAddr,
            spokeFeeManagerAddr,
            HUB_CHAIN_ID,
            inboxBytes,
            spokeGraceBlocks,
            spokeDeadlineBlocks,
            BRIDGE_ID_HYPERLANE
        );
        spokeRegistryAddr = address(spoke);
        console2.log("5. SpokeRegistryV2:", spokeRegistryAddr);

        // 7. Deploy SpokeSoulboundForwarder
        bytes32 soulboundReceiverBytes = _addressToBytes32(soulboundReceiverAddr);
        SpokeSoulboundForwarder spokeSoulboundForwarder = new SpokeSoulboundForwarder(
            deployer, hyperlaneAdapterAddr, HUB_CHAIN_ID, soulboundReceiverBytes, MIN_DONATION
        );
        spokeSoulboundForwarderAddr = address(spokeSoulboundForwarder);
        console2.log("6. SpokeSoulboundForwarder:", spokeSoulboundForwarderAddr);

        // 8. Deploy Multicall3 (for local chains only)
        spokeMulticall3Addr = _deployMulticall3();
        console2.log("7. Multicall3 (Spoke):", spokeMulticall3Addr);

        vm.stopBroadcast();
        console2.log("");

        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE 3: CONFIGURE TRUST RELATIONSHIPS
        // ═══════════════════════════════════════════════════════════════════════════

        console2.log("--- TRUST CONFIGURATION ---");

        vm.selectFork(hubForkId);
        vm.startBroadcast(deployerPrivateKey);

        // Trust the HyperlaneAdapter (NOT the SpokeRegistry)
        // When SpokeRegistry calls adapter.sendMessage(), the adapter calls mailbox.dispatch().
        // Hyperlane records `msg.sender` of dispatch() as origin sender = HyperlaneAdapter
        bytes32 adapterBytes = _addressToBytes32(hyperlaneAdapterAddr);
        CrossChainInboxV2(crossChainInboxAddr).setTrustedSource(SPOKE_CHAIN_ID, adapterBytes, true);
        console2.log("CrossChainInboxV2 trusts HyperlaneAdapter on chain", SPOKE_CHAIN_ID);
        console2.log("  Address:", hyperlaneAdapterAddr);

        // Configure SoulboundReceiver to trust HyperlaneAdapter
        // (Same pattern - adapter is the msg.sender to mailbox)
        SoulboundReceiver(soulboundReceiverAddr).setTrustedForwarder(SPOKE_CHAIN_ID, hyperlaneAdapterAddr);
        console2.log("SoulboundReceiver trusts HyperlaneAdapter on chain", SPOKE_CHAIN_ID);

        vm.stopBroadcast();

        // ═══════════════════════════════════════════════════════════════════════════
        // OUTPUT SUMMARY
        // ═══════════════════════════════════════════════════════════════════════════

        console2.log("");
        console2.log("=== V2 DEPLOYMENT COMPLETE ===");
        console2.log("");
        console2.log("Hyperlane Infrastructure (deployed by Account 9):");
        console2.log("  Hub Mailbox:   ", hubMailbox);
        console2.log("  Spoke Mailbox: ", spokeMailbox);
        console2.log("");
        console2.log("Hub Chain (31337) - http://localhost:8545:");
        console2.log("  MockAggregator:       ", mockAggregatorAddr);
        console2.log("  FeeManager:           ", feeManagerAddr);
        console2.log("  OperatorRegistry:     ", operatorRegistryAddr);
        console2.log("  FraudRegistryV2:      ", fraudRegistryAddr);
        console2.log("  OperatorSubmitter:    ", operatorSubmitterAddr);
        console2.log("  CrossChainInboxV2:    ", crossChainInboxAddr);
        console2.log("  Multicall3:           ", hubMulticall3Addr);
        console2.log("  TranslationRegistry:  ", translationRegistryAddr);
        console2.log("  WalletSoulbound:      ", walletSoulboundAddr);
        console2.log("  SupportSoulbound:     ", supportSoulboundAddr);
        console2.log("  SoulboundReceiver:    ", soulboundReceiverAddr);
        console2.log("");
        console2.log("Spoke Chain (31338) - http://localhost:8546:");
        console2.log("  MockGasPaymaster:         ", spokeGasPaymaster);
        console2.log("  HyperlaneAdapter:         ", hyperlaneAdapterAddr);
        console2.log("  MockAggregator:           ", spokeMockAggregatorAddr);
        console2.log("  FeeManager:               ", spokeFeeManagerAddr);
        console2.log("  SpokeRegistryV2:          ", spokeRegistryAddr);
        console2.log("  SpokeSoulboundForwarder:  ", spokeSoulboundForwarderAddr);
        console2.log("  Multicall3:               ", spokeMulticall3Addr);
        console2.log("");
        console2.log("Test Operators (Anvil Accounts):");
        console2.log("  Operator A (ALL):      ", OPERATOR_A);
        console2.log("  Operator B (CONTRACT): ", OPERATOR_B);
        console2.log("");
        console2.log("Trust Relationships:");
        console2.log("  CrossChainInboxV2 trusts HyperlaneAdapter from chain 31338");
        console2.log("  SoulboundReceiver trusts HyperlaneAdapter from chain 31338");
        console2.log("");
        console2.log("Next steps:");
        console2.log("  1. Start dev server: pnpm dev:crosschain");
        console2.log("  2. Hyperlane relayer auto-relays messages (running via anvil:crosschain)");
        console2.log("  3. Seed operator data: forge script script/v2/SeedOperatorDataV2.s.sol --broadcast");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SINGLE-CHAIN HUB DEPLOYMENT (Testnet/Mainnet)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Deploy hub contracts for testnet/mainnet (requires Hyperlane addresses in env)
    /// @dev Use for Base Sepolia, Base Mainnet, etc.
    ///      Required env vars: PRIVATE_KEY, HUB_HYPERLANE_MAILBOX, HUB_GAS_PAYMASTER
    function deployHub() external {
        uint256 privKey = _getDeployerKey();
        address _deployer = vm.addr(privKey);

        // Fee configuration (optional)
        address feeManagerAddr = vm.envOr("FEE_MANAGER", address(0));
        address feeRecipientAddr = vm.envOr("FEE_RECIPIENT", address(0));

        // Hyperlane configuration (required for hub)
        address mailbox = vm.envAddress("HUB_HYPERLANE_MAILBOX");
        require(mailbox != address(0), "HUB_HYPERLANE_MAILBOX required");
        address gasPaymaster = vm.envAddress("HUB_GAS_PAYMASTER");
        require(gasPaymaster != address(0), "HUB_GAS_PAYMASTER required");

        // Timing configuration
        (uint256 graceBlocks, uint256 deadlineBlocks) = _getTimingConfig(block.chainid);

        console2.log("=== FraudRegistryV2 Hub Deployment ===");
        console2.log("Chain ID:", block.chainid);
        console2.log("Deployer:", _deployer);
        console2.log("FeeManager:", feeManagerAddr);
        console2.log("FeeRecipient:", feeRecipientAddr);
        console2.log("Hyperlane Mailbox:", mailbox);
        console2.log("Gas Paymaster:", gasPaymaster);
        console2.log("Grace Blocks:", graceBlocks);
        console2.log("Deadline Blocks:", deadlineBlocks);
        console2.log("");

        vm.startBroadcast(privKey);

        // 1. Deploy OperatorRegistry
        OperatorRegistry operatorRegistry = new OperatorRegistry(_deployer);
        console2.log("1. OperatorRegistry:", address(operatorRegistry));

        // 2. Deploy FraudRegistryV2
        FraudRegistryV2 registry = new FraudRegistryV2(
            _deployer, address(operatorRegistry), feeManagerAddr, feeRecipientAddr, graceBlocks, deadlineBlocks
        );
        console2.log("2. FraudRegistryV2:", address(registry));

        // 3. Deploy OperatorSubmitter
        OperatorSubmitter operatorSubmitter = new OperatorSubmitter(
            _deployer, address(registry), address(operatorRegistry), feeManagerAddr, feeRecipientAddr
        );
        console2.log("3. OperatorSubmitter:", address(operatorSubmitter));

        // 4. Link OperatorSubmitter to Registry
        registry.setOperatorSubmitter(address(operatorSubmitter));
        console2.log("   -> OperatorSubmitter linked");

        // 5. Deploy CrossChainInboxV2
        CrossChainInboxV2 inbox = new CrossChainInboxV2(mailbox, address(registry), _deployer);
        console2.log("4. CrossChainInboxV2:", address(inbox));

        // 6. Link CrossChainInbox to Registry
        registry.setCrossChainInbox(address(inbox));
        console2.log("   -> CrossChainInboxV2 linked");

        vm.stopBroadcast();

        // Output for frontend config
        console2.log("");
        console2.log("=== Frontend Config ===");
        _logHubConfig(address(registry), address(operatorRegistry), address(operatorSubmitter), address(inbox));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SINGLE-CHAIN SPOKE DEPLOYMENT (Testnet/Mainnet)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Deploy spoke contracts for testnet/mainnet
    /// @dev Use for Optimism Sepolia, Arbitrum Sepolia, etc.
    ///      Required env vars: PRIVATE_KEY, SPOKE_HYPERLANE_MAILBOX, SPOKE_GAS_PAYMASTER,
    ///                         HUB_CHAIN_ID, HUB_INBOX_ADDRESS
    function deploySpoke() external {
        uint256 privKey = _getDeployerKey();
        address _deployer = vm.addr(privKey);

        // Fee configuration (optional)
        address feeManagerAddr = vm.envOr("FEE_MANAGER", address(0));

        // Hyperlane configuration (required for spoke)
        address mailbox = vm.envAddress("SPOKE_HYPERLANE_MAILBOX");
        require(mailbox != address(0), "SPOKE_HYPERLANE_MAILBOX required");
        address gasPaymaster = vm.envAddress("SPOKE_GAS_PAYMASTER");
        require(gasPaymaster != address(0), "SPOKE_GAS_PAYMASTER required");

        // Hub configuration (required)
        uint32 hubChainId = uint32(vm.envUint("HUB_CHAIN_ID"));
        require(hubChainId != 0, "HUB_CHAIN_ID required");
        bytes32 hubInboxAddress = vm.envBytes32("HUB_INBOX_ADDRESS");
        require(hubInboxAddress != bytes32(0), "HUB_INBOX_ADDRESS required");

        // Timing configuration
        (uint256 graceBlocks, uint256 deadlineBlocks) = _getTimingConfig(block.chainid);

        console2.log("=== SpokeRegistryV2 Deployment ===");
        console2.log("Chain ID:", block.chainid);
        console2.log("Deployer:", _deployer);
        console2.log("FeeManager:", feeManagerAddr);
        console2.log("Hyperlane Mailbox:", mailbox);
        console2.log("Gas Paymaster:", gasPaymaster);
        console2.log("Hub Chain ID:", hubChainId);
        console2.log("Hub Inbox Address:");
        console2.logBytes32(hubInboxAddress);
        console2.log("Grace Blocks:", graceBlocks);
        console2.log("Deadline Blocks:", deadlineBlocks);
        console2.log("");

        vm.startBroadcast(privKey);

        // 1. Deploy HyperlaneAdapter
        HyperlaneAdapter adapter = new HyperlaneAdapter(_deployer, mailbox, gasPaymaster);
        console2.log("1. HyperlaneAdapter:", address(adapter));

        // 2. Enable hub chain as destination
        adapter.setDomainSupport(hubChainId, true);
        console2.log("   -> Hub chain", hubChainId, "enabled");

        // 3. Deploy SpokeRegistryV2
        SpokeRegistryV2 spoke = new SpokeRegistryV2(
            _deployer,
            address(adapter),
            feeManagerAddr,
            hubChainId,
            hubInboxAddress,
            graceBlocks,
            deadlineBlocks,
            BRIDGE_ID_HYPERLANE
        );
        console2.log("2. SpokeRegistryV2:", address(spoke));

        vm.stopBroadcast();

        // Output for frontend config
        console2.log("");
        console2.log("=== Frontend Config ===");
        _logSpokeConfig(address(spoke), address(adapter), hubChainId);

        // Reminder about hub trust configuration
        console2.log("");
        console2.log("=== IMPORTANT: Hub Configuration Required ===");
        console2.log("On hub chain, call:");
        console2.log("  inbox.setTrustedSource(", block.chainid, ", adapterBytes32, true)");
        console2.log("  adapterBytes32:");
        console2.logBytes32(_addressToBytes32(address(adapter)));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BASIC DEPLOYMENT (no crosschain, backwards compatible)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Basic single-chain deployment without crosschain infrastructure
    /// @dev For testing or chains that don't need crosschain
    function run() external {
        uint256 privKey = _getDeployerKey();
        address _deployer = vm.addr(privKey);

        address feeManagerAddr = vm.envOr("FEE_MANAGER", address(0));
        address feeRecipientAddr = vm.envOr("FEE_RECIPIENT", address(0));

        (uint256 graceBlocks, uint256 deadlineBlocks) = _getTimingConfig(block.chainid);

        console2.log("=== FraudRegistryV2 Deployment (Basic) ===");
        console2.log("Chain ID:", block.chainid);
        console2.log("Deployer:", _deployer);
        console2.log("");

        vm.startBroadcast(privKey);

        OperatorRegistry operatorRegistry = new OperatorRegistry(_deployer);
        console2.log("OperatorRegistry:", address(operatorRegistry));

        FraudRegistryV2 registry = new FraudRegistryV2(
            _deployer, address(operatorRegistry), feeManagerAddr, feeRecipientAddr, graceBlocks, deadlineBlocks
        );
        console2.log("FraudRegistryV2:", address(registry));

        OperatorSubmitter operatorSubmitter = new OperatorSubmitter(
            _deployer, address(registry), address(operatorRegistry), feeManagerAddr, feeRecipientAddr
        );
        console2.log("OperatorSubmitter:", address(operatorSubmitter));

        registry.setOperatorSubmitter(address(operatorSubmitter));

        vm.stopBroadcast();

        console2.log("");
        _logFrontendConfig(address(registry), address(operatorRegistry), address(operatorSubmitter));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    function _getDeployerKey() internal view returns (uint256) {
        uint256 privKey = vm.envOr("PRIVATE_KEY", uint256(0));
        if (privKey == 0) {
            // Anvil's first default private key
            privKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        }
        return privKey;
    }

    function _getTimingConfig(uint256 chainId) internal pure returns (uint256 graceBlocks, uint256 deadlineBlocks) {
        // Local Anvil (both chains)
        if (chainId == 31_337 || chainId == 31_338) {
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

        // Arbitrum Sepolia (421614) or Arbitrum One (42161)
        if (chainId == 421_614 || chainId == 42_161) {
            return (ARBITRUM_GRACE_BLOCKS, ARBITRUM_DEADLINE_BLOCKS);
        }

        // Default to L2 config for unknown chains
        return (L2_GRACE_BLOCKS, L2_DEADLINE_BLOCKS);
    }

    function _addressToBytes32(address addr) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(addr)));
    }

    /// @notice Deploy Multicall3 for local chains (mainnet/testnets have it pre-deployed)
    /// @return multicall3 The deployed Multicall3 address
    function _deployMulticall3() internal returns (address multicall3) {
        // On mainnet/testnets, Multicall3 is deployed at canonical address
        // Only deploy for local chains
        if (block.chainid == 31_337 || block.chainid == 31_338) {
            multicall3 = address(new Multicall3());
        } else {
            multicall3 = CANONICAL_MULTICALL3;
        }
    }

    function _logHubConfig(address registry, address operatorReg, address operatorSubmitter, address inbox)
        internal
        view
    {
        console2.log("// Add to apps/web/src/lib/contracts/addresses.ts:");
        console2.log("//", block.chainid, ": {");
        console2.log("//   fraudRegistryV2: '", registry, "',");
        console2.log("//   operatorRegistry: '", operatorReg, "',");
        console2.log("//   operatorSubmitter: '", operatorSubmitter, "',");
        console2.log("//   crossChainInboxV2: '", inbox, "',");
        console2.log("// },");
    }

    function _logSpokeConfig(address spoke, address adapter, uint32 hubChainId) internal view {
        console2.log("// Add to apps/web/src/lib/contracts/addresses.ts:");
        console2.log("//", block.chainid, ": {");
        console2.log("//   spokeRegistryV2: '", spoke, "',");
        console2.log("//   hyperlaneAdapter: '", adapter, "',");
        console2.log("//   hubChainId:", hubChainId, ",");
        console2.log("// },");
    }

    function _logFrontendConfig(address registry, address operatorReg, address operatorSubmitter) internal view {
        uint256 chainId = block.chainid;

        if (chainId == 31_337) {
            console2.log("// Local Anvil");
        } else if (chainId == 84_532) {
            console2.log("// Base Sepolia");
        } else if (chainId == 8453) {
            console2.log("// Base Mainnet");
        } else {
            console2.log("// Chain", chainId);
        }

        console2.log(chainId, ": {");
        console2.log("  fraudRegistryV2: '", registry, "',");
        console2.log("  operatorRegistry: '", operatorReg, "',");
        console2.log("  operatorSubmitter: '", operatorSubmitter, "',");
        console2.log("},");
    }
}
