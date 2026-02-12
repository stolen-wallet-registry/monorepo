// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { IMulticall3 } from "forge-std/interfaces/IMulticall3.sol";

// Core contracts - Hub + Registries architecture
import { FraudRegistryHub } from "../src/FraudRegistryHub.sol";
import { WalletRegistry } from "../src/registries/WalletRegistry.sol";
import { TransactionRegistry } from "../src/registries/TransactionRegistry.sol";
import { ContractRegistry } from "../src/registries/ContractRegistry.sol";
import { OperatorSubmitter } from "../src/OperatorSubmitter.sol";
import { OperatorRegistry } from "../src/OperatorRegistry.sol";
import { CrossChainInbox } from "../src/CrossChainInbox.sol";
import { SpokeRegistry } from "../src/spoke/SpokeRegistry.sol";
import { HyperlaneAdapter } from "../src/crosschain/adapters/HyperlaneAdapter.sol";

// Fee infrastructure
import { FeeManager } from "../src/FeeManager.sol";

// Soulbound contracts
import { TranslationRegistry } from "../src/soulbound/TranslationRegistry.sol";
import { WalletSoulbound } from "../src/soulbound/WalletSoulbound.sol";
import { SupportSoulbound } from "../src/soulbound/SupportSoulbound.sol";
import { SoulboundReceiver } from "../src/soulbound/SoulboundReceiver.sol";
import { SpokeSoulboundForwarder } from "../src/spoke/SpokeSoulboundForwarder.sol";

// Mocks for local testing
import { MockInterchainGasPaymaster } from "../test/mocks/MockInterchainGasPaymaster.sol";
import { MockAggregator, Multicall3 } from "./DeployBase.s.sol";

// CREATE2 deterministic deployment
import { Create2Deployer } from "./Create2Deployer.sol";
import { Salts } from "./Salts.sol";

/// @title Deploy
/// @notice Deployment script for FraudRegistryHub hub and spoke contracts
/// @dev Run with: forge script script/Deploy.s.sol --tc Deploy --broadcast
///
/// Prerequisites (for crosschain):
///   1. Start anvil with Hyperlane state: pnpm anvil:crosschain
///   2. Hyperlane deployed by Account 9 (preserves Account 0 nonces)
///   3. Set HUB_MAILBOX and SPOKE_MAILBOX in packages/contracts/.env
///
/// Usage:
///
///   LOCAL CROSSCHAIN (Anvil):
///     forge script script/Deploy.s.sol:Deploy --sig "deployCrossChain()" --broadcast
///
///   BASIC DEPLOYMENT (single chain, no crosschain):
///     forge script script/Deploy.s.sol:Deploy --sig "run()" \
///       --rpc-url http://localhost:8545 --broadcast
///
///   TESTNET HUB (Base Sepolia):
///     forge script script/Deploy.s.sol:Deploy --sig "deployHub()" \
///       --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify
///
///   TESTNET SPOKE (Optimism Sepolia):
///     forge script script/Deploy.s.sol:Deploy --sig "deploySpoke()" \
///       --rpc-url $OP_SEPOLIA_RPC_URL --broadcast --verify
///
contract Deploy is Script {
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

    // Hub deployed addresses - Core (Hub + Registries architecture)
    address hubMockAggregatorAddr;
    address hubFeeManagerAddr;
    address hubOperatorRegistryAddr;
    address hubAddr;
    address walletRegistryAddr;
    address transactionRegistryAddr;
    address contractRegistryAddr;
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

    /// @notice Deploy contracts to local Anvil chains with real Hyperlane
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

        console2.log("=== CROSS-CHAIN DEPLOYMENT (Real Hyperlane) ===");
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

        // Core contracts (regular CREATE — nonce-based, bytecode-independent addresses)
        hubMockAggregatorAddr = address(new MockAggregator(int256(350_000_000_000)));
        console2.log("1. MockAggregator:", hubMockAggregatorAddr);

        hubFeeManagerAddr = address(new FeeManager(deployer, hubMockAggregatorAddr));
        console2.log("2. FeeManager:", hubFeeManagerAddr);

        hubOperatorRegistryAddr = address(new OperatorRegistry(deployer));
        console2.log("3. OperatorRegistry:", hubOperatorRegistryAddr);

        hubAddr = address(new FraudRegistryHub(deployer, deployer));
        console2.log("4. FraudRegistryHub:", hubAddr);

        walletRegistryAddr = address(new WalletRegistry(deployer, hubFeeManagerAddr, hubGraceBlocks, hubDeadlineBlocks));
        console2.log("5. WalletRegistry:", walletRegistryAddr);

        transactionRegistryAddr =
            address(new TransactionRegistry(deployer, hubFeeManagerAddr, hubGraceBlocks, hubDeadlineBlocks));
        console2.log("6. TransactionRegistry:", transactionRegistryAddr);

        contractRegistryAddr = address(new ContractRegistry(deployer));
        console2.log("7. ContractRegistry:", contractRegistryAddr);

        operatorSubmitterAddr = address(
            new OperatorSubmitter(
                deployer,
                walletRegistryAddr,
                transactionRegistryAddr,
                contractRegistryAddr,
                hubOperatorRegistryAddr,
                hubFeeManagerAddr,
                deployer
            )
        );
        console2.log("8. OperatorSubmitter:", operatorSubmitterAddr);

        crossChainInboxAddr = address(new CrossChainInbox(hubMailbox, hubAddr, deployer));
        console2.log("9. CrossChainInbox:", crossChainInboxAddr);

        // 10. Wire Hub to registries
        FraudRegistryHub(payable(hubAddr)).setWalletRegistry(walletRegistryAddr);
        FraudRegistryHub(payable(hubAddr)).setTransactionRegistry(transactionRegistryAddr);
        FraudRegistryHub(payable(hubAddr)).setContractRegistry(contractRegistryAddr);
        FraudRegistryHub(payable(hubAddr)).setInbox(crossChainInboxAddr);
        console2.log("   -> Hub wired to registries and inbox");

        // 11. Wire registries to Hub and OperatorSubmitter
        WalletRegistry(walletRegistryAddr).setHub(hubAddr);
        WalletRegistry(walletRegistryAddr).setOperatorSubmitter(operatorSubmitterAddr);
        TransactionRegistry(transactionRegistryAddr).setHub(hubAddr);
        TransactionRegistry(transactionRegistryAddr).setOperatorSubmitter(operatorSubmitterAddr);
        ContractRegistry(contractRegistryAddr).setOperatorSubmitter(operatorSubmitterAddr);
        console2.log("   -> Registries wired to Hub and OperatorSubmitter");

        // 12. Deploy Multicall3 (for local chains only)
        hubMulticall3Addr = _deployMulticall3(Salts.MULTICALL3);
        console2.log("10. Multicall3:", hubMulticall3Addr);

        console2.log("");
        console2.log("--- HUB CHAIN (31337) - Soulbound Contracts ---");

        translationRegistryAddr = address(new TranslationRegistry(deployer));
        console2.log("11. TranslationRegistry:", translationRegistryAddr);

        walletSoulboundAddr = address(
            new WalletSoulbound(walletRegistryAddr, translationRegistryAddr, deployer, DEFAULT_DOMAIN, deployer)
        );
        console2.log("12. WalletSoulbound:", walletSoulboundAddr);

        supportSoulboundAddr =
            address(new SupportSoulbound(MIN_DONATION, translationRegistryAddr, deployer, DEFAULT_DOMAIN, deployer));
        console2.log("13. SupportSoulbound:", supportSoulboundAddr);

        soulboundReceiverAddr =
            address(new SoulboundReceiver(deployer, hubMailbox, walletSoulboundAddr, supportSoulboundAddr));
        console2.log("14. SoulboundReceiver:", soulboundReceiverAddr);

        // 17. Authorize SoulboundReceiver to mint on SupportSoulbound
        SupportSoulbound(supportSoulboundAddr).setAuthorizedMinter(soulboundReceiverAddr, true);
        console2.log("    -> SoulboundReceiver authorized to mint SupportSoulbound");

        console2.log("");
        console2.log("--- HUB CHAIN (31337) - Operator Seeding ---");

        // 18. Approve test operators (Anvil accounts 3 and 4)
        OperatorRegistry(hubOperatorRegistryAddr)
            .approveOperator(
                OPERATOR_A, OperatorRegistry(hubOperatorRegistryAddr).ALL_REGISTRIES(), "TestOperatorA-ALL"
            );
        console2.log("15. Operator A (ALL):", OPERATOR_A);

        OperatorRegistry(hubOperatorRegistryAddr)
            .approveOperator(
                OPERATOR_B, OperatorRegistry(hubOperatorRegistryAddr).CONTRACT_REGISTRY(), "TestOperatorB-CONTRACT"
            );
        console2.log("16. Operator B (CONTRACT):", OPERATOR_B);
        console2.log("    Approved operator count:", OperatorRegistry(hubOperatorRegistryAddr).approvedOperatorCount());

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

        // Spoke contracts (regular CREATE — nonce-based, bytecode-independent addresses)
        spokeGasPaymaster = address(new MockInterchainGasPaymaster());
        console2.log("1. MockInterchainGasPaymaster:", spokeGasPaymaster);

        hyperlaneAdapterAddr = address(new HyperlaneAdapter(deployer, spokeMailbox, spokeGasPaymaster));
        console2.log("2. HyperlaneAdapter:", hyperlaneAdapterAddr);

        HyperlaneAdapter(hyperlaneAdapterAddr).setDomainSupport(HUB_CHAIN_ID, true);
        console2.log("   -> Hub chain", HUB_CHAIN_ID, "enabled as destination");

        spokeMockAggregatorAddr = address(new MockAggregator(int256(350_000_000_000)));
        console2.log("3. MockAggregator (Spoke):", spokeMockAggregatorAddr);

        spokeFeeManagerAddr = address(new FeeManager(deployer, spokeMockAggregatorAddr));
        console2.log("4. FeeManager (Spoke):", spokeFeeManagerAddr);

        bytes32 inboxBytes = _addressToBytes32(crossChainInboxAddr);
        spokeRegistryAddr = address(
            new SpokeRegistry(
                deployer,
                hyperlaneAdapterAddr,
                spokeFeeManagerAddr,
                HUB_CHAIN_ID,
                inboxBytes,
                spokeGraceBlocks,
                spokeDeadlineBlocks,
                BRIDGE_ID_HYPERLANE
            )
        );
        console2.log("5. SpokeRegistry:", spokeRegistryAddr);

        bytes32 soulboundReceiverBytes = _addressToBytes32(soulboundReceiverAddr);
        spokeSoulboundForwarderAddr = address(
            new SpokeSoulboundForwarder(
                deployer, hyperlaneAdapterAddr, HUB_CHAIN_ID, soulboundReceiverBytes, MIN_DONATION
            )
        );
        console2.log("6. SpokeSoulboundForwarder:", spokeSoulboundForwarderAddr);

        spokeMulticall3Addr = _deployMulticall3(Salts.MULTICALL3_SPOKE);
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
        CrossChainInbox(crossChainInboxAddr).setTrustedSource(SPOKE_CHAIN_ID, adapterBytes, true);
        console2.log("CrossChainInbox trusts HyperlaneAdapter on chain", SPOKE_CHAIN_ID);
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
        console2.log("=== DEPLOYMENT COMPLETE ===");
        console2.log("");
        console2.log("Hyperlane Infrastructure (deployed by Account 9):");
        console2.log("  Hub Mailbox:   ", hubMailbox);
        console2.log("  Spoke Mailbox: ", spokeMailbox);
        console2.log("");
        console2.log("Hub Chain (31337) - http://localhost:8545:");
        console2.log("  MockAggregator:         ", hubMockAggregatorAddr);
        console2.log("  FeeManager:             ", hubFeeManagerAddr);
        console2.log("  OperatorRegistry:       ", hubOperatorRegistryAddr);
        console2.log("  FraudRegistryHub:     ", hubAddr);
        console2.log("  WalletRegistry:       ", walletRegistryAddr);
        console2.log("  TransactionRegistry:  ", transactionRegistryAddr);
        console2.log("  ContractRegistry:     ", contractRegistryAddr);
        console2.log("  OperatorSubmitter:    ", operatorSubmitterAddr);
        console2.log("  CrossChainInbox:      ", crossChainInboxAddr);
        console2.log("  Multicall3:             ", hubMulticall3Addr);
        console2.log("  TranslationRegistry:    ", translationRegistryAddr);
        console2.log("  WalletSoulbound:        ", walletSoulboundAddr);
        console2.log("  SupportSoulbound:       ", supportSoulboundAddr);
        console2.log("  SoulboundReceiver:      ", soulboundReceiverAddr);
        console2.log("");
        console2.log("Spoke Chain (31338) - http://localhost:8546:");
        console2.log("  MockGasPaymaster:         ", spokeGasPaymaster);
        console2.log("  HyperlaneAdapter:         ", hyperlaneAdapterAddr);
        console2.log("  MockAggregator:           ", spokeMockAggregatorAddr);
        console2.log("  FeeManager:               ", spokeFeeManagerAddr);
        console2.log("  SpokeRegistry:          ", spokeRegistryAddr);
        console2.log("  SpokeSoulboundForwarder:  ", spokeSoulboundForwarderAddr);
        console2.log("  Multicall3:               ", spokeMulticall3Addr);
        console2.log("");
        console2.log("Test Operators (Anvil Accounts):");
        console2.log("  Operator A (ALL):      ", OPERATOR_A);
        console2.log("  Operator B (CONTRACT): ", OPERATOR_B);
        console2.log("");
        console2.log("Trust Relationships:");
        console2.log("  CrossChainInbox trusts HyperlaneAdapter from chain 31338");
        console2.log("  SoulboundReceiver trusts HyperlaneAdapter from chain 31338");
        console2.log("");
        console2.log("Next steps:");
        console2.log("  1. Start dev server: pnpm dev:crosschain");
        console2.log("  2. Hyperlane relayer auto-relays messages (running via anvil:crosschain)");
        console2.log("  3. Seed operator data: forge script script/SeedOperatorData.s.sol --broadcast");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SPLIT LOCAL DEPLOYMENT (Single-chain mode, avoids multi-chain broadcast bug)
    // ═══════════════════════════════════════════════════════════════════════════
    // Usage: pnpm deploy:crosschain (runs hub → spoke → trust → seed sequentially)
    //
    // Why split? Forge's multi-chain broadcast (vm.createFork + vm.selectFork)
    // drops transactions from anvil's mempool when used with --block-time.
    // Single-chain mode (--rpc-url) sends all txs to one chain reliably.
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Deploy hub contracts only (single-chain mode)
    /// @dev Run with: forge script Deploy --sig 'deployHubLocal()' --rpc-url http://localhost:8545 --broadcast
    function deployHubLocal() external {
        deployerPrivateKey =
            vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        deployer = vm.addr(deployerPrivateKey);
        hubMailbox = vm.envAddress("HUB_MAILBOX");
        require(hubMailbox != address(0), "HUB_MAILBOX env var must be set");

        console2.log("=== HUB LOCAL DEPLOYMENT (Single-Chain) ===");
        console2.log("Deployer:", deployer);
        console2.log("Hub Mailbox:", hubMailbox);

        vm.startBroadcast(deployerPrivateKey);

        (uint256 graceBlocks, uint256 deadlineBlocks) = _getTimingConfig(block.chainid);
        console2.log("Timing - Grace Blocks:", graceBlocks);
        console2.log("Timing - Deadline Blocks:", deadlineBlocks);

        // Core contracts (regular CREATE — nonce-based, bytecode-independent addresses)
        hubMockAggregatorAddr = address(new MockAggregator(int256(350_000_000_000)));
        console2.log("1. MockAggregator:", hubMockAggregatorAddr);

        hubFeeManagerAddr = address(new FeeManager(deployer, hubMockAggregatorAddr));
        console2.log("2. FeeManager:", hubFeeManagerAddr);

        hubOperatorRegistryAddr = address(new OperatorRegistry(deployer));
        console2.log("3. OperatorRegistry:", hubOperatorRegistryAddr);

        hubAddr = address(new FraudRegistryHub(deployer, deployer));
        console2.log("4. FraudRegistryHub:", hubAddr);

        walletRegistryAddr = address(new WalletRegistry(deployer, hubFeeManagerAddr, graceBlocks, deadlineBlocks));
        console2.log("5. WalletRegistry:", walletRegistryAddr);

        transactionRegistryAddr =
            address(new TransactionRegistry(deployer, hubFeeManagerAddr, graceBlocks, deadlineBlocks));
        console2.log("6. TransactionRegistry:", transactionRegistryAddr);

        contractRegistryAddr = address(new ContractRegistry(deployer));
        console2.log("7. ContractRegistry:", contractRegistryAddr);

        operatorSubmitterAddr = address(
            new OperatorSubmitter(
                deployer,
                walletRegistryAddr,
                transactionRegistryAddr,
                contractRegistryAddr,
                hubOperatorRegistryAddr,
                hubFeeManagerAddr,
                deployer
            )
        );
        console2.log("8. OperatorSubmitter:", operatorSubmitterAddr);

        crossChainInboxAddr = address(new CrossChainInbox(hubMailbox, hubAddr, deployer));
        console2.log("9. CrossChainInbox:", crossChainInboxAddr);

        // Wire hub to registries
        FraudRegistryHub(payable(hubAddr)).setWalletRegistry(walletRegistryAddr);
        FraudRegistryHub(payable(hubAddr)).setTransactionRegistry(transactionRegistryAddr);
        FraudRegistryHub(payable(hubAddr)).setContractRegistry(contractRegistryAddr);
        FraudRegistryHub(payable(hubAddr)).setInbox(crossChainInboxAddr);
        console2.log("   -> Hub wired to registries and inbox");

        WalletRegistry(walletRegistryAddr).setHub(hubAddr);
        WalletRegistry(walletRegistryAddr).setOperatorSubmitter(operatorSubmitterAddr);
        TransactionRegistry(transactionRegistryAddr).setHub(hubAddr);
        TransactionRegistry(transactionRegistryAddr).setOperatorSubmitter(operatorSubmitterAddr);
        ContractRegistry(contractRegistryAddr).setOperatorSubmitter(operatorSubmitterAddr);
        console2.log("   -> Registries wired to Hub and OperatorSubmitter");

        hubMulticall3Addr = _deployMulticall3(Salts.MULTICALL3);
        console2.log("10. Multicall3:", hubMulticall3Addr);

        // Soulbound contracts
        translationRegistryAddr = address(new TranslationRegistry(deployer));
        console2.log("11. TranslationRegistry:", translationRegistryAddr);

        walletSoulboundAddr = address(
            new WalletSoulbound(walletRegistryAddr, translationRegistryAddr, deployer, DEFAULT_DOMAIN, deployer)
        );
        console2.log("12. WalletSoulbound:", walletSoulboundAddr);

        supportSoulboundAddr =
            address(new SupportSoulbound(MIN_DONATION, translationRegistryAddr, deployer, DEFAULT_DOMAIN, deployer));
        console2.log("13. SupportSoulbound:", supportSoulboundAddr);

        soulboundReceiverAddr =
            address(new SoulboundReceiver(deployer, hubMailbox, walletSoulboundAddr, supportSoulboundAddr));
        console2.log("14. SoulboundReceiver:", soulboundReceiverAddr);

        SupportSoulbound(supportSoulboundAddr).setAuthorizedMinter(soulboundReceiverAddr, true);
        console2.log("    -> SoulboundReceiver authorized to mint SupportSoulbound");

        // Operators
        OperatorRegistry(hubOperatorRegistryAddr)
            .approveOperator(
                OPERATOR_A, OperatorRegistry(hubOperatorRegistryAddr).ALL_REGISTRIES(), "TestOperatorA-ALL"
            );
        console2.log("15. Operator A (ALL):", OPERATOR_A);

        OperatorRegistry(hubOperatorRegistryAddr)
            .approveOperator(
                OPERATOR_B, OperatorRegistry(hubOperatorRegistryAddr).CONTRACT_REGISTRY(), "TestOperatorB-CONTRACT"
            );
        console2.log("16. Operator B (CONTRACT):", OPERATOR_B);

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== HUB DEPLOYMENT COMPLETE ===");
        console2.log("CrossChainInbox:", crossChainInboxAddr);
        console2.log("SoulboundReceiver:", soulboundReceiverAddr);
    }

    /// @notice Deploy spoke contracts only (single-chain mode)
    /// @dev Run with: forge script Deploy --sig 'deploySpokeLocal()' --rpc-url http://localhost:8546 --broadcast
    function deploySpokeLocal() external {
        deployerPrivateKey =
            vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        deployer = vm.addr(deployerPrivateKey);
        hubMailbox = vm.envAddress("HUB_MAILBOX");
        require(hubMailbox != address(0), "HUB_MAILBOX env var must be set");
        spokeMailbox = vm.envAddress("SPOKE_MAILBOX");
        require(spokeMailbox != address(0), "SPOKE_MAILBOX env var must be set");

        console2.log("=== SPOKE LOCAL DEPLOYMENT (Single-Chain) ===");
        console2.log("Deployer:", deployer);

        // Read hub addresses from env (set by deploy:crosschain script after deployHubLocal)
        crossChainInboxAddr = vm.envAddress("CROSS_CHAIN_INBOX");
        require(crossChainInboxAddr != address(0), "CROSS_CHAIN_INBOX env var is zero address");
        soulboundReceiverAddr = vm.envAddress("SOULBOUND_RECEIVER");
        require(soulboundReceiverAddr != address(0), "SOULBOUND_RECEIVER env var is zero address");
        console2.log("CrossChainInbox (hub):", crossChainInboxAddr);
        console2.log("SoulboundReceiver (hub):", soulboundReceiverAddr);

        vm.startBroadcast(deployerPrivateKey);

        (uint256 graceBlocks, uint256 deadlineBlocks) = _getTimingConfig(block.chainid);
        console2.log("Timing - Grace Blocks:", graceBlocks);
        console2.log("Timing - Deadline Blocks:", deadlineBlocks);

        // Spoke contracts (regular CREATE — nonce-based, bytecode-independent addresses)
        spokeGasPaymaster = address(new MockInterchainGasPaymaster());
        console2.log("1. MockInterchainGasPaymaster:", spokeGasPaymaster);

        hyperlaneAdapterAddr = address(new HyperlaneAdapter(deployer, spokeMailbox, spokeGasPaymaster));
        console2.log("2. HyperlaneAdapter:", hyperlaneAdapterAddr);

        HyperlaneAdapter(hyperlaneAdapterAddr).setDomainSupport(HUB_CHAIN_ID, true);
        console2.log("   -> Hub chain", HUB_CHAIN_ID, "enabled as destination");

        spokeMockAggregatorAddr = address(new MockAggregator(int256(350_000_000_000)));
        console2.log("3. MockAggregator (Spoke):", spokeMockAggregatorAddr);

        spokeFeeManagerAddr = address(new FeeManager(deployer, spokeMockAggregatorAddr));
        console2.log("4. FeeManager (Spoke):", spokeFeeManagerAddr);

        bytes32 inboxBytes = _addressToBytes32(crossChainInboxAddr);
        spokeRegistryAddr = address(
            new SpokeRegistry(
                deployer,
                hyperlaneAdapterAddr,
                spokeFeeManagerAddr,
                HUB_CHAIN_ID,
                inboxBytes,
                graceBlocks,
                deadlineBlocks,
                BRIDGE_ID_HYPERLANE
            )
        );
        console2.log("5. SpokeRegistry:", spokeRegistryAddr);

        bytes32 soulboundReceiverBytes = _addressToBytes32(soulboundReceiverAddr);
        spokeSoulboundForwarderAddr = address(
            new SpokeSoulboundForwarder(
                deployer, hyperlaneAdapterAddr, HUB_CHAIN_ID, soulboundReceiverBytes, MIN_DONATION
            )
        );
        console2.log("6. SpokeSoulboundForwarder:", spokeSoulboundForwarderAddr);

        spokeMulticall3Addr = _deployMulticall3(Salts.MULTICALL3_SPOKE);
        console2.log("7. Multicall3 (Spoke):", spokeMulticall3Addr);

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== SPOKE DEPLOYMENT COMPLETE ===");
        console2.log("HyperlaneAdapter:", hyperlaneAdapterAddr);
        console2.log("");
        // Machine-readable export lines for deploy:crosschain script piping
        console2.log(string.concat("EXPORT_HYPERLANE_ADAPTER=", vm.toString(hyperlaneAdapterAddr)));
        console2.log("Next: pnpm deploy:crosschain:trust");
    }

    /// @notice Configure trust relationships on hub (single-chain mode)
    /// @dev Run with: forge script Deploy --sig 'configureTrustLocal()' --rpc-url http://localhost:8545 --broadcast
    function configureTrustLocal() external {
        deployerPrivateKey =
            vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        deployer = vm.addr(deployerPrivateKey);

        // Read deployed addresses from env (set by deploy:crosschain script)
        crossChainInboxAddr = vm.envAddress("CROSS_CHAIN_INBOX");
        require(crossChainInboxAddr != address(0), "CROSS_CHAIN_INBOX env var is zero address");
        soulboundReceiverAddr = vm.envAddress("SOULBOUND_RECEIVER");
        require(soulboundReceiverAddr != address(0), "SOULBOUND_RECEIVER env var is zero address");
        hyperlaneAdapterAddr = vm.envAddress("HYPERLANE_ADAPTER");
        require(hyperlaneAdapterAddr != address(0), "HYPERLANE_ADAPTER env var is zero address");

        console2.log("=== TRUST CONFIGURATION (Single-Chain) ===");
        console2.log("CrossChainInbox:", crossChainInboxAddr);
        console2.log("SoulboundReceiver:", soulboundReceiverAddr);
        console2.log("HyperlaneAdapter (spoke):", hyperlaneAdapterAddr);

        vm.startBroadcast(deployerPrivateKey);

        bytes32 adapterBytes = _addressToBytes32(hyperlaneAdapterAddr);
        CrossChainInbox(crossChainInboxAddr).setTrustedSource(SPOKE_CHAIN_ID, adapterBytes, true);
        console2.log("CrossChainInbox trusts HyperlaneAdapter on chain", SPOKE_CHAIN_ID);

        SoulboundReceiver(soulboundReceiverAddr).setTrustedForwarder(SPOKE_CHAIN_ID, hyperlaneAdapterAddr);
        console2.log("SoulboundReceiver trusts HyperlaneAdapter on chain", SPOKE_CHAIN_ID);

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== TRUST CONFIGURATION COMPLETE ===");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CREATE2 ADDRESS PREDICTION HELPERS (for split deployment)
    // ═══════════════════════════════════════════════════════════════════════════

    function _predictCrossChainInbox() internal view returns (address) {
        address predictedHub = Create2Deployer.predict(
            Salts.FRAUD_REGISTRY_HUB,
            abi.encodePacked(type(FraudRegistryHub).creationCode, abi.encode(deployer, deployer))
        );
        return Create2Deployer.predict(
            Salts.CROSS_CHAIN_INBOX,
            abi.encodePacked(type(CrossChainInbox).creationCode, abi.encode(hubMailbox, predictedHub, deployer))
        );
    }

    function _predictSoulboundReceiver() internal view returns (address) {
        address predictedWalletRegistry = _predictWalletRegistry();
        address predictedTranslationRegistry = Create2Deployer.predict(
            Salts.TRANSLATION_REGISTRY, abi.encodePacked(type(TranslationRegistry).creationCode, abi.encode(deployer))
        );
        address predictedWalletSoulbound = Create2Deployer.predict(
            Salts.WALLET_SOULBOUND,
            abi.encodePacked(
                type(WalletSoulbound).creationCode,
                abi.encode(predictedWalletRegistry, predictedTranslationRegistry, deployer, DEFAULT_DOMAIN, deployer)
            )
        );
        address predictedSupportSoulbound = Create2Deployer.predict(
            Salts.SUPPORT_SOULBOUND,
            abi.encodePacked(
                type(SupportSoulbound).creationCode,
                abi.encode(MIN_DONATION, predictedTranslationRegistry, deployer, DEFAULT_DOMAIN, deployer)
            )
        );
        return Create2Deployer.predict(
            Salts.SOULBOUND_RECEIVER,
            abi.encodePacked(
                type(SoulboundReceiver).creationCode,
                abi.encode(deployer, hubMailbox, predictedWalletSoulbound, predictedSupportSoulbound)
            )
        );
    }

    function _predictWalletRegistry() internal pure returns (address) {
        address predictedMockAggregator = Create2Deployer.predict(
            Salts.MOCK_AGGREGATOR,
            abi.encodePacked(type(MockAggregator).creationCode, abi.encode(int256(350_000_000_000)))
        );
        address predictedDeployer = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266; // Anvil account 0
        address predictedFeeManager = Create2Deployer.predict(
            Salts.FEE_MANAGER,
            abi.encodePacked(type(FeeManager).creationCode, abi.encode(predictedDeployer, predictedMockAggregator))
        );
        return Create2Deployer.predict(
            Salts.WALLET_REGISTRY,
            abi.encodePacked(
                type(WalletRegistry).creationCode,
                abi.encode(predictedDeployer, predictedFeeManager, ANVIL_GRACE_BLOCKS, ANVIL_DEADLINE_BLOCKS)
            )
        );
    }

    function _predictHyperlaneAdapter() internal view returns (address) {
        address predictedGasPaymaster =
            Create2Deployer.predict(Salts.MOCK_GAS_PAYMASTER, type(MockInterchainGasPaymaster).creationCode);
        return Create2Deployer.predict(
            Salts.HYPERLANE_ADAPTER,
            abi.encodePacked(
                type(HyperlaneAdapter).creationCode, abi.encode(deployer, spokeMailbox, predictedGasPaymaster)
            )
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SINGLE-CHAIN HUB DEPLOYMENT (Testnet/Mainnet)
    // ═══════════════════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════════════════
    // TEMPORARY STATE FOR DEPLOYMENT (avoids stack depth issues)
    // ═══════════════════════════════════════════════════════════════════════════

    address private _tempFeeManager;
    address private _tempFeeRecipient;
    address private _tempMailbox;
    uint256 private _tempGraceBlocks;
    uint256 private _tempDeadlineBlocks;

    /// @notice Deploy hub contracts for testnet/mainnet (requires Hyperlane addresses in env)
    /// @dev Use for Base Sepolia, Base Mainnet, etc.
    ///      Required env vars: PRIVATE_KEY, HUB_HYPERLANE_MAILBOX, HUB_GAS_PAYMASTER
    function deployHub() external {
        uint256 privKey = _getDeployerKey();
        address _deployer = vm.addr(privKey);

        // Store in contract state to avoid stack depth issues
        _tempFeeManager = vm.envOr("FEE_MANAGER", address(0));
        _tempFeeRecipient = vm.envOr("FEE_RECIPIENT", _deployer);
        _tempMailbox = vm.envAddress("HUB_HYPERLANE_MAILBOX");
        require(_tempMailbox != address(0), "HUB_HYPERLANE_MAILBOX required");
        (_tempGraceBlocks, _tempDeadlineBlocks) = _getTimingConfig(block.chainid);

        console2.log("=== FraudRegistryHub Deployment ===");
        console2.log("Chain ID:", block.chainid);
        console2.log("Deployer:", _deployer);
        console2.log("FeeManager:", _tempFeeManager);
        console2.log("FeeRecipient:", _tempFeeRecipient);
        console2.log("Hyperlane Mailbox:", _tempMailbox);
        console2.log("Grace Blocks:", _tempGraceBlocks);
        console2.log("Deadline Blocks:", _tempDeadlineBlocks);
        console2.log("");

        _ensureCreate2Factory();
        vm.startBroadcast(privKey);

        // 1. Deploy OperatorRegistry
        address operatorRegAddr = Create2Deployer.deploy(
            Salts.OPERATOR_REGISTRY, abi.encodePacked(type(OperatorRegistry).creationCode, abi.encode(_deployer))
        );
        console2.log("1. OperatorRegistry:", operatorRegAddr);

        // 2. Deploy FraudRegistryHub
        address hubDeployedAddr = Create2Deployer.deploy(
            Salts.FRAUD_REGISTRY_HUB,
            abi.encodePacked(type(FraudRegistryHub).creationCode, abi.encode(_deployer, _tempFeeRecipient))
        );
        console2.log("2. FraudRegistryHub:", hubDeployedAddr);

        // 3. Deploy WalletRegistry
        address walletRegAddr = Create2Deployer.deploy(
            Salts.WALLET_REGISTRY,
            abi.encodePacked(
                type(WalletRegistry).creationCode,
                abi.encode(_deployer, _tempFeeManager, _tempGraceBlocks, _tempDeadlineBlocks)
            )
        );
        console2.log("3. WalletRegistry:", walletRegAddr);

        // 4. Deploy TransactionRegistry
        address txRegAddr = Create2Deployer.deploy(
            Salts.TX_REGISTRY,
            abi.encodePacked(
                type(TransactionRegistry).creationCode,
                abi.encode(_deployer, _tempFeeManager, _tempGraceBlocks, _tempDeadlineBlocks)
            )
        );
        console2.log("4. TransactionRegistry:", txRegAddr);

        // 5. Deploy ContractRegistry
        address contractRegAddr = Create2Deployer.deploy(
            Salts.CONTRACT_REGISTRY, abi.encodePacked(type(ContractRegistry).creationCode, abi.encode(_deployer))
        );
        console2.log("5. ContractRegistry:", contractRegAddr);

        // 6. Deploy OperatorSubmitter
        address opSubmitterAddr = Create2Deployer.deploy(
            Salts.OPERATOR_SUBMITTER,
            abi.encodePacked(
                type(OperatorSubmitter).creationCode,
                abi.encode(
                    _deployer,
                    walletRegAddr,
                    txRegAddr,
                    contractRegAddr,
                    operatorRegAddr,
                    _tempFeeManager,
                    _tempFeeRecipient
                )
            )
        );
        console2.log("6. OperatorSubmitter:", opSubmitterAddr);

        // 7. Deploy CrossChainInbox
        address inboxAddr = Create2Deployer.deploy(
            Salts.CROSS_CHAIN_INBOX,
            abi.encodePacked(type(CrossChainInbox).creationCode, abi.encode(_tempMailbox, hubDeployedAddr, _deployer))
        );
        console2.log("7. CrossChainInbox:", inboxAddr);

        // 8. Wire Hub to registries and inbox
        FraudRegistryHub(payable(hubDeployedAddr)).setWalletRegistry(walletRegAddr);
        FraudRegistryHub(payable(hubDeployedAddr)).setTransactionRegistry(txRegAddr);
        FraudRegistryHub(payable(hubDeployedAddr)).setContractRegistry(contractRegAddr);
        FraudRegistryHub(payable(hubDeployedAddr)).setInbox(inboxAddr);
        console2.log("   -> Hub wired to registries and inbox");

        // 9. Wire registries to Hub and OperatorSubmitter
        WalletRegistry(walletRegAddr).setHub(hubDeployedAddr);
        WalletRegistry(walletRegAddr).setOperatorSubmitter(opSubmitterAddr);
        TransactionRegistry(txRegAddr).setHub(hubDeployedAddr);
        TransactionRegistry(txRegAddr).setOperatorSubmitter(opSubmitterAddr);
        ContractRegistry(contractRegAddr).setOperatorSubmitter(opSubmitterAddr);
        console2.log("   -> Registries wired to Hub and OperatorSubmitter");

        vm.stopBroadcast();

        // Output for frontend config
        console2.log("");
        console2.log("=== Frontend Config ===");
        _logHubConfig(
            hubDeployedAddr, walletRegAddr, txRegAddr, contractRegAddr, operatorRegAddr, opSubmitterAddr, inboxAddr
        );
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

        console2.log("=== SpokeRegistry Deployment ===");
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

        _ensureCreate2Factory();
        vm.startBroadcast(privKey);

        // 1. Deploy HyperlaneAdapter
        address adapterAddr = Create2Deployer.deploy(
            Salts.HYPERLANE_ADAPTER,
            abi.encodePacked(type(HyperlaneAdapter).creationCode, abi.encode(_deployer, mailbox, gasPaymaster))
        );
        console2.log("1. HyperlaneAdapter:", adapterAddr);

        // 2. Enable hub chain as destination
        HyperlaneAdapter(adapterAddr).setDomainSupport(hubChainId, true);
        console2.log("   -> Hub chain", hubChainId, "enabled");

        // 3. Deploy SpokeRegistry
        address spokeAddr = Create2Deployer.deploy(
            Salts.SPOKE_REGISTRY,
            abi.encodePacked(
                type(SpokeRegistry).creationCode,
                abi.encode(
                    _deployer,
                    adapterAddr,
                    feeManagerAddr,
                    hubChainId,
                    hubInboxAddress,
                    graceBlocks,
                    deadlineBlocks,
                    BRIDGE_ID_HYPERLANE
                )
            )
        );
        console2.log("2. SpokeRegistry:", spokeAddr);

        vm.stopBroadcast();

        // Output for frontend config
        console2.log("");
        console2.log("=== Frontend Config ===");
        _logSpokeConfig(spokeAddr, adapterAddr, hubChainId);

        // Reminder about hub trust configuration
        console2.log("");
        console2.log("=== IMPORTANT: Hub Configuration Required ===");
        console2.log("On hub chain, call:");
        console2.log("  inbox.setTrustedSource(", block.chainid, ", adapterBytes32, true)");
        console2.log("  adapterBytes32:");
        console2.logBytes32(_addressToBytes32(adapterAddr));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BASIC DEPLOYMENT (no crosschain, backwards compatible)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Basic single-chain deployment without crosschain infrastructure
    /// @dev For testing or chains that don't need crosschain
    function run() external {
        uint256 privKey = _getDeployerKey();
        address _deployer = vm.addr(privKey);

        // Store in contract state to avoid stack depth issues
        _tempFeeManager = vm.envOr("FEE_MANAGER", address(0));
        _tempFeeRecipient = vm.envOr("FEE_RECIPIENT", _deployer);
        (_tempGraceBlocks, _tempDeadlineBlocks) = _getTimingConfig(block.chainid);

        console2.log("=== FraudRegistryHub Deployment (Basic) ===");
        console2.log("Chain ID:", block.chainid);
        console2.log("Deployer:", _deployer);
        console2.log("");

        vm.startBroadcast(privKey);

        // Regular CREATE for local dev (nonce-based, bytecode-independent addresses)
        address operatorRegAddr = address(new OperatorRegistry(_deployer));
        console2.log("OperatorRegistry:", operatorRegAddr);

        address hubDeployedAddr = address(new FraudRegistryHub(_deployer, _tempFeeRecipient));
        console2.log("FraudRegistryHub:", hubDeployedAddr);

        address walletRegAddr =
            address(new WalletRegistry(_deployer, _tempFeeManager, _tempGraceBlocks, _tempDeadlineBlocks));
        console2.log("WalletRegistry:", walletRegAddr);

        address txRegAddr =
            address(new TransactionRegistry(_deployer, _tempFeeManager, _tempGraceBlocks, _tempDeadlineBlocks));
        console2.log("TransactionRegistry:", txRegAddr);

        address contractRegAddr = address(new ContractRegistry(_deployer));
        console2.log("ContractRegistry:", contractRegAddr);

        address opSubmitterAddr = address(
            new OperatorSubmitter(
                _deployer,
                walletRegAddr,
                txRegAddr,
                contractRegAddr,
                operatorRegAddr,
                _tempFeeManager,
                _tempFeeRecipient
            )
        );
        console2.log("OperatorSubmitter:", opSubmitterAddr);

        // 7. Wire Hub to registries
        FraudRegistryHub(payable(hubDeployedAddr)).setWalletRegistry(walletRegAddr);
        FraudRegistryHub(payable(hubDeployedAddr)).setTransactionRegistry(txRegAddr);
        FraudRegistryHub(payable(hubDeployedAddr)).setContractRegistry(contractRegAddr);

        // 8. Wire registries to Hub and OperatorSubmitter
        WalletRegistry(walletRegAddr).setHub(hubDeployedAddr);
        WalletRegistry(walletRegAddr).setOperatorSubmitter(opSubmitterAddr);
        TransactionRegistry(txRegAddr).setHub(hubDeployedAddr);
        TransactionRegistry(txRegAddr).setOperatorSubmitter(opSubmitterAddr);
        ContractRegistry(contractRegAddr).setOperatorSubmitter(opSubmitterAddr);

        vm.stopBroadcast();

        console2.log("");
        _logFrontendConfig(hubDeployedAddr, walletRegAddr, txRegAddr, contractRegAddr, operatorRegAddr, opSubmitterAddr);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Ensure the canonical CREATE2 factory exists (fresh Anvil instances lack it)
    function _ensureCreate2Factory() internal {
        if (Create2Deployer.FACTORY.code.length > 0) return;
        // Nick Johnson's keyless-deployment factory runtime bytecode
        bytes memory factoryCode =
            hex"7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3";
        vm.etch(Create2Deployer.FACTORY, factoryCode);
    }

    function _getDeployerKey() internal view returns (uint256) {
        uint256 privKey = vm.envOr("PRIVATE_KEY", uint256(0));
        if (privKey == 0) {
            // Only fall back to Anvil key on local chains
            require(
                block.chainid == 31_337 || block.chainid == 31_338, "PRIVATE_KEY required for non-local deployments"
            );
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
    /// @param salt Unused (retained for call-site compatibility). Local uses regular CREATE.
    /// @return multicall3 The deployed Multicall3 address
    function _deployMulticall3(bytes32 salt) internal returns (address multicall3) {
        salt; // silence unused param warning
        // On mainnet/testnets, Multicall3 is deployed at canonical address
        // Only deploy for local chains (regular CREATE — nonce-based)
        if (block.chainid == 31_337 || block.chainid == 31_338) {
            multicall3 = address(new Multicall3());
        } else {
            multicall3 = CANONICAL_MULTICALL3;
        }
    }

    function _logHubConfig(
        address hub,
        address walletReg,
        address txReg,
        address contractReg,
        address operatorReg,
        address operatorSubmitter,
        address inbox
    ) internal view {
        console2.log("// Add to apps/web/src/lib/contracts/addresses.ts:");
        console2.log("//", block.chainid, ": {");
        console2.log("//   fraudRegistryHub: '", hub, "',");
        console2.log("//   walletRegistry: '", walletReg, "',");
        console2.log("//   transactionRegistry: '", txReg, "',");
        console2.log("//   contractRegistry: '", contractReg, "',");
        console2.log("//   operatorRegistry: '", operatorReg, "',");
        console2.log("//   operatorSubmitter: '", operatorSubmitter, "',");
        console2.log("//   crossChainInbox: '", inbox, "',");
        console2.log("// },");
    }

    function _logSpokeConfig(address spoke, address adapter, uint32 hubChainId) internal view {
        console2.log("// Add to apps/web/src/lib/contracts/addresses.ts:");
        console2.log("//", block.chainid, ": {");
        console2.log("//   spokeRegistry: '", spoke, "',");
        console2.log("//   hyperlaneAdapter: '", adapter, "',");
        console2.log("//   hubChainId:", hubChainId, ",");
        console2.log("// },");
    }

    function _logFrontendConfig(
        address hub,
        address walletReg,
        address txReg,
        address contractReg,
        address operatorReg,
        address operatorSubmitter
    ) internal view {
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
        console2.log("  fraudRegistryHub: '", hub, "',");
        console2.log("  walletRegistry: '", walletReg, "',");
        console2.log("  transactionRegistry: '", txReg, "',");
        console2.log("  contractRegistry: '", contractReg, "',");
        console2.log("  operatorRegistry: '", operatorReg, "',");
        console2.log("  operatorSubmitter: '", operatorSubmitter, "',");
        console2.log("},");
    }
}
