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
import { MockAggregator, Multicall3 } from "./DeployBase.s.sol";

// Timelock base (used by finalizeSetup/verifySetup to lock immediate setters)
import { TimelockOwnable } from "../src/libraries/TimelockOwnable.sol";

/// @notice Minimal Ownable2Step surface used by the DAO handover steps
/// @dev Declared here rather than importing OZ so the handover helpers work uniformly across
///      TimelockOwnable contracts and the plain Ownable2Step ones (TranslationRegistry,
///      SpokeSoulboundForwarder).
interface IOwnable2Step {
    function owner() external view returns (address);
    function pendingOwner() external view returns (address);
    function transferOwnership(address newOwner) external;
}

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
    // CALIBRATE TO THE RATE `block.number` ADVANCES — NOT to the chain's block time.
    // These are compared against `block.number` inside the registries. On most chains that
    // is the chain's own block counter, but not on Arbitrum (see below).
    // Target: ~30s grace for local, ~2 min grace for testnet/mainnet.

    // Local Anvil (13s blocks) - ~30s grace, ~10 min registration window
    uint256 constant ANVIL_GRACE_BLOCKS = 2; // ~30s
    uint256 constant ANVIL_DEADLINE_BLOCKS = 50; // ~10 min

    // Base/Optimism L2 (2s blocks; block.number is the L2 counter)
    uint256 constant L2_GRACE_BLOCKS = 60; // ~2 min
    uint256 constant L2_DEADLINE_BLOCKS = 300; // ~10 min

    // Arbitrum: `block.number` returns the **L1** block number (~12s), NOT the ~0.25s L2 rate.
    // Verified empirically 2026-07-30 against Arbitrum One mainnet:
    //   eth_blockNumber (RPC)      = 489,269,716  <- L2 block number
    //   block.number in a contract =  25,645,219  <- L1 block number
    //   ArbSys.arbBlockNumber()    = 489,269,728  <- L2 block number
    // So Arbitrum takes the SAME counts as Ethereum L1. The previous 480/2400 values assumed
    // the L2 rate and produced a ~96 MINUTE grace period and an ~8 HOUR registration window.
    // If an L2-rate clock is ever wanted, read ArbSys(0x64).arbBlockNumber() instead —
    // see TimingConfig's note on the matching blockhash caveat before doing so.
    uint256 constant ARBITRUM_GRACE_BLOCKS = 10; // ~2 min at L1 rate
    uint256 constant ARBITRUM_DEADLINE_BLOCKS = 50; // ~10 min at L1 rate

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
        // _getDeployerKey() reads block.chainid, so it must be called on the
        // first RPC target. The subsequent vm.createSelectFork() calls switch
        // chains but the key is already captured.
        deployerPrivateKey = _getDeployerKey();
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

        _deploySpokeContracts();

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
        deployerPrivateKey = _getDeployerKey();
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
        deployerPrivateKey = _getDeployerKey();
        deployer = vm.addr(deployerPrivateKey);
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

        _deploySpokeContracts();

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
        deployerPrivateKey = _getDeployerKey();
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
    // TIMELOCK FINALIZATION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Lock every TimelockOwnable contract's immediate setters, activating the timelock
    /// @dev MUST be the last deployment step. Until this runs, every `onlyDuringSetup` setter
    ///      (setWalletRegistry, setInbox, setTrustedSource, setAuthorizedMinter, …) is a
    ///      one-transaction owner call and the 2-day propose/activate path is optional — the
    ///      timelock provides no protection at all.
    ///
    ///      This is deliberately a separate entry point rather than a tail call inside the
    ///      deploy functions: on a hub/spoke deployment the inbox's trusted sources are wired
    ///      only after the spoke exists, so completing setup inside `deployHub()` would
    ///      permanently lock out `setTrustedSource` before it was ever called.
    ///
    ///      Irreversible. After this, trust-boundary changes require propose → 2 days → activate.
    ///
    ///      Usage:
    ///        forge script script/Deploy.s.sol:Deploy --sig "finalizeSetup()" \
    ///          --rpc-url $RPC --broadcast
    ///
    ///      Reads (all optional — a zero/unset address is skipped):
    ///        FRAUD_REGISTRY_HUB, CROSS_CHAIN_INBOX, OPERATOR_REGISTRY,
    ///        SOULBOUND_RECEIVER, WALLET_SOULBOUND, SUPPORT_SOULBOUND,
    ///        WALLET_REGISTRY, TRANSACTION_REGISTRY, CONTRACT_REGISTRY, OPERATOR_SUBMITTER
    function finalizeSetup() external {
        deployerPrivateKey = _getDeployerKey();
        deployer = vm.addr(deployerPrivateKey);

        console2.log("=== FINALIZING SETUP (activating timelock) ===");

        vm.startBroadcast(deployerPrivateKey);

        SetupTarget[] memory targets = _hubTargets();
        for (uint256 i = 0; i < targets.length; i++) {
            _completeSetupIfNeeded(targets[i].addr, targets[i].label);
        }

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== SETUP FINALIZED - timelock is now enforced ===");
    }

    /// @notice Lock the SPOKE-side TimelockOwnable contracts (run on the spoke chain)
    /// @dev {finalizeSetup} covers hub-chain contracts only. HyperlaneAdapter, SpokeRegistry and
    ///      SpokeSoulboundForwarder live on the SPOKE chain, so they need their own finalization
    ///      transaction against the spoke RPC — a hub-only finalize would leave the adapter's
    ///      `setAuthorizedSender` (the allowlist that closes the forged-registration
    ///      vulnerability) as a one-transaction owner call forever.
    ///
    ///      MUST run after the hub has been told to trust this spoke's adapter, for the same
    ///      ordering reason {finalizeSetup} documents.
    ///
    ///      Usage:
    ///        forge script script/Deploy.s.sol:Deploy --sig "finalizeSpokeSetup()" \
    ///          --rpc-url $SPOKE_RPC --broadcast
    ///
    ///      Reads (all optional — a zero/unset address is skipped):
    ///        HYPERLANE_ADAPTER, SPOKE_REGISTRY, SPOKE_SOULBOUND_FORWARDER, SPOKE_FEE_MANAGER
    function finalizeSpokeSetup() external {
        deployerPrivateKey = _getDeployerKey();
        deployer = vm.addr(deployerPrivateKey);

        console2.log("=== FINALIZING SPOKE SETUP (activating timelock) ===");

        vm.startBroadcast(deployerPrivateKey);

        SetupTarget[] memory targets = _spokeTargets();
        for (uint256 i = 0; i < targets.length; i++) {
            _completeSetupIfNeeded(targets[i].addr, targets[i].label);
        }

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== SPOKE SETUP FINALIZED - timelock is now enforced ===");
    }

    /// @notice Assert every configured spoke-side TimelockOwnable contract is locked
    /// @dev Same env vars as {finalizeSpokeSetup}. Run against the spoke RPC.
    function verifySpokeSetup() external view {
        SetupTarget[] memory targets = _spokeTargets();
        for (uint256 i = 0; i < targets.length; i++) {
            _requireSetupComplete(targets[i]);
        }
        console2.log("=== All configured spoke contracts have setupComplete == true ===");
    }

    /// @notice Assert every configured TimelockOwnable contract has setupComplete == true
    /// @dev Run as a post-deploy gate. Reverts if any contract still has immediate setters open,
    ///      so a forgotten `finalizeSetup()` fails the deployment instead of shipping silently.
    ///      Same env vars as {finalizeSetup}. Hub-side only — see {verifySpokeSetup}.
    function verifySetup() external view {
        SetupTarget[] memory targets = _hubTargets();
        for (uint256 i = 0; i < targets.length; i++) {
            _requireSetupComplete(targets[i]);
        }
        console2.log("=== All configured contracts have setupComplete == true ===");
    }

    /// @notice A TimelockOwnable contract that finalize/verify should act on
    /// @dev `envKey` is carried alongside the resolved address so {_requireSetupComplete} can name
    ///      the exact variable that was left unset, and derive the `SKIP_<envKey>` opt-out.
    struct SetupTarget {
        address addr;
        string label;
        string envKey;
    }

    /// @notice Hub-chain TimelockOwnable contracts, read from the deploy env
    /// @dev Single source for {finalizeSetup} and {verifySetup}. These were previously two
    ///      hand-maintained copies of the same ten entries, where forgetting one in the verify
    ///      copy would silently skip the check that a contract had actually been locked.
    function _hubTargets() internal view returns (SetupTarget[] memory targets) {
        targets = new SetupTarget[](11);
        targets[0] = _target("FRAUD_REGISTRY_HUB", "FraudRegistryHub");
        targets[1] = _target("CROSS_CHAIN_INBOX", "CrossChainInbox");
        targets[2] = _target("OPERATOR_REGISTRY", "OperatorRegistry");
        targets[3] = _target("SOULBOUND_RECEIVER", "SoulboundReceiver");
        targets[4] = _target("WALLET_SOULBOUND", "WalletSoulbound");
        targets[5] = _target("SUPPORT_SOULBOUND", "SupportSoulbound");
        targets[6] = _target("WALLET_REGISTRY", "WalletRegistry");
        targets[7] = _target("TRANSACTION_REGISTRY", "TransactionRegistry");
        targets[8] = _target("CONTRACT_REGISTRY", "ContractRegistry");
        targets[9] = _target("OPERATOR_SUBMITTER", "OperatorSubmitter");
        // FeeManager became TimelockOwnable (V11): its setters are on the critical path of every
        // fee-collecting registration, so it must be finalized like any other trust boundary.
        // Omitting it here would leave setBaseFee/setFallbackPrice as one-transaction owner calls.
        targets[10] = _target("FEE_MANAGER", "FeeManager");
    }

    /// @dev Resolve one target from its env var, keeping the key for error messages
    function _target(string memory envKey, string memory label) internal view returns (SetupTarget memory) {
        return SetupTarget(vm.envOr(envKey, address(0)), label, envKey);
    }

    /// @notice Spoke-chain TimelockOwnable contracts, read from the deploy env
    /// @dev Single source for {finalizeSpokeSetup} and {verifySpokeSetup}. SpokeSoulboundForwarder
    ///      became TimelockOwnable (C-5): `setHubConfig` repoints the hub receiver every paid mint
    ///      request is sent to, so it must be finalized like any other trust boundary. Leaving it
    ///      out would keep that a one-transaction owner call forever.
    ///
    ///      The spoke has its own FeeManager (SpokeRegistry.feeManager is immutable, so a
    ///      mispriced one cannot be swapped out) and it must be finalized here for the same
    ///      reason {_hubTargets} finalizes the hub's: an unfinalized FeeManager leaves
    ///      setBaseFee/setFallbackPrice as one-transaction owner calls that can price every
    ///      spoke registration out of reach. `SPOKE_FEE_MANAGER`, not `FEE_MANAGER` — hub and
    ///      spoke finalize share one env file, and the hub key must not leak into the spoke run.
    function _spokeTargets() internal view returns (SetupTarget[] memory targets) {
        targets = new SetupTarget[](4);
        targets[0] = _target("HYPERLANE_ADAPTER", "HyperlaneAdapter");
        targets[1] = _target("SPOKE_REGISTRY", "SpokeRegistry");
        targets[2] = _target("SPOKE_SOULBOUND_FORWARDER", "SpokeSoulboundForwarder");
        targets[3] = _target("SPOKE_FEE_MANAGER", "FeeManager (spoke)");
    }

    /// @dev Call completeSetup() unless the address is unset or already complete.
    ///      A skip here is NOT the safety net — {_requireSetupComplete} is. This only logs,
    ///      because finalize must stay re-runnable across a partially-configured environment;
    ///      run `verifySetup()` afterwards and it will refuse the same unset target.
    function _completeSetupIfNeeded(address target, string memory label) internal {
        if (target == address(0)) {
            console2.log("  !! SKIPPED, NOT CONFIGURED - verifySetup() will reject this:", label);
            return;
        }
        if (TimelockOwnable(target).setupComplete()) {
            console2.log("  already complete:", label);
            return;
        }
        TimelockOwnable(target).completeSetup();
        console2.log("  setup completed:", label, target);
    }

    /// @dev Revert unless the target has completed setup.
    ///
    ///      An UNSET env var also reverts, and that is the point. This used to `return` on
    ///      address(0), which meant a forgotten variable produced the exact silent pass the check
    ///      exists to prevent: {finalizeSetup} skips the same address for the same reason, so both
    ///      failures co-occur — the contract ships with its immediate setters open and
    ///      `verifySetup()` prints success and exits 0.
    ///
    ///      Genuinely-absent contracts (a hub-only deployment with no soulbounds, say) opt out
    ///      explicitly with `SKIP_<ENV_KEY>=true`, so the exclusion is a recorded decision in the
    ///      deploy environment rather than an omission nobody notices.
    function _requireSetupComplete(SetupTarget memory target) internal view {
        if (target.addr == address(0)) {
            require(
                vm.envOr(string.concat("SKIP_", target.envKey), false),
                string.concat(
                    target.label,
                    ": ",
                    target.envKey,
                    " is unset - set it to the deployed address, or set SKIP_",
                    target.envKey,
                    "=true to deliberately exclude this contract"
                )
            );
            return;
        }
        require(
            TimelockOwnable(target.addr).setupComplete(),
            string.concat(target.label, ": setupComplete is false - run finalizeSetup()")
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DAO HANDOVER
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Step 1 of 3: propose handing every hub contract to the DAO / multisig
    ///
    /// @dev Until this runs, ONE deployer EOA owns the hub, the inbox, the OperatorRegistry, the
    ///      OperatorSubmitter, all three registries, the FeeManager, the soulbounds and the
    ///      receiver. That single key can revoke every operator, un-trust every spoke, pause
    ///      everything and cancel every pending proposal in one transaction. The timelock on
    ///      individual setters does not help while one hot key holds all of them.
    ///
    ///      Run order (this matters, and getting it wrong is unrecoverable):
    ///
    ///        1. deployHub() / deploySpoke()      — deploy and wire
    ///        2. configureTrust*                  — trusted sources / forwarders
    ///        3. finalizeSetup()                  — locks immediate setters
    ///        4. proposeHandover()                — THIS (needs step 3: transferOwnership is
    ///                                              only immediate before completeSetup, and we
    ///                                              deliberately want the DAO handover itself to
    ///                                              go through the 2-day delay)
    ///        5. wait ACTIVATION_DELAY (2 days)
    ///        6. activateHandover()               — starts the Ownable2Step handshake
    ///        7. DAO calls acceptOwnership() on each contract
    ///        8. verifyOwnership()                — asserts the handover actually completed
    ///
    ///      Steps 4-6 are the timelocked path deliberately, not an inconvenience: the same delay
    ///      that protects every other trust-boundary change protects custody of the system.
    ///
    ///      Note on inherited proposals: `pendingActivations` is plain storage and survives the
    ///      handover, so a proposal armed by the deployer would become the DAO's problem. Since
    ///      `_proposeAction` now rejects proposals before `completeSetup()` and every proposal
    ///      expires after ACTIVATION_EXPIRY, the only inheritable proposals are ones armed in the
    ///      window between step 3 and step 7. Audit that window and `cancelAction` anything
    ///      unexpected before the DAO accepts.
    ///
    ///      Reads: DAO_OWNER (required), plus the same address env vars as {finalizeSetup} and
    ///      TRANSLATION_REGISTRY.
    ///
    ///      Usage:
    ///        forge script script/Deploy.s.sol:Deploy --sig "proposeHandover()" \
    ///          --rpc-url $RPC --broadcast
    function proposeHandover() external {
        deployerPrivateKey = _getDeployerKey();
        deployer = vm.addr(deployerPrivateKey);
        address dao = _requireDaoOwner();
        address translations = vm.envOr("TRANSLATION_REGISTRY", address(0));

        console2.log("=== PROPOSING DAO HANDOVER ===");
        console2.log("New owner (DAO):", dao);

        vm.startBroadcast(deployerPrivateKey);
        _proposeHandover(dao, _hubTargets(), translations);
        vm.stopBroadcast();

        console2.log("");
        console2.log("Next: wait 2 days, then run activateHandover()");
    }

    /// @dev Parameterized body of {proposeHandover}. Split out so the handover can be exercised in
    ///      forge tests: every `external` entry point here reads its inputs from `vm.envOr`, and
    ///      env vars are process-global while forge runs tests concurrently, so a test that used
    ///      `vm.setEnv` would race against every other test in the run. Taking the inputs as
    ///      arguments removes the shared mutable state entirely.
    /// @param dao The new owner (already validated by the caller)
    /// @param targets Timelocked contracts to hand over; address(0) entries are skipped
    /// @param translations Plain-Ownable2Step TranslationRegistry, or address(0) to skip
    function _proposeHandover(address dao, SetupTarget[] memory targets, address translations) internal {
        // A handover on a system whose immediate setters are still open hands the DAO a contract
        // it cannot lock down without another round trip, and leaves a window where the deployer
        // key still has one-transaction power over trust boundaries.
        for (uint256 i = 0; i < targets.length; i++) {
            _requireSetupComplete(targets[i]);
        }

        for (uint256 i = 0; i < targets.length; i++) {
            if (targets[i].addr == address(0)) {
                console2.log("  skipped (not configured):", targets[i].label);
                continue;
            }
            TimelockOwnable(targets[i].addr).proposeOwnershipTransfer(dao);
            console2.log("  proposed:", targets[i].label, targets[i].addr);
        }

        // TranslationRegistry is plain Ownable2Step (no timelock), so its transfer is immediate.
        // It holds only SVG translation strings — no trust boundary, no funds, no registry state.
        if (translations != address(0)) {
            IOwnable2Step(translations).transferOwnership(dao);
            console2.log("  transferred (immediate, plain Ownable2Step): TranslationRegistry", translations);
        }
    }

    /// @notice Step 2 of 3: activate the proposed handover after the 2-day delay
    /// @dev Only STARTS the Ownable2Step handshake — the DAO must still call `acceptOwnership()`
    ///      on each contract. Until it does, the deployer remains owner and can abort with
    ///      `transferOwnership(address(0))`.
    ///
    ///      Reverts with TimelockOwnable__Expired if more than ACTIVATION_EXPIRY has passed since
    ///      the proposal became activatable; re-run {proposeHandover} in that case.
    function activateHandover() external {
        deployerPrivateKey = _getDeployerKey();
        deployer = vm.addr(deployerPrivateKey);
        address dao = _requireDaoOwner();

        console2.log("=== ACTIVATING DAO HANDOVER ===");

        vm.startBroadcast(deployerPrivateKey);
        _activateHandover(dao, _hubTargets());
        vm.stopBroadcast();

        console2.log("");
        console2.log("Next: DAO must call acceptOwnership() on each contract, then verifyOwnership()");
    }

    /// @dev Parameterized body of {activateHandover} — see {_proposeHandover} for why.
    /// @param dao The new owner (already validated by the caller)
    /// @param targets Timelocked contracts to activate; address(0) entries are skipped
    function _activateHandover(address dao, SetupTarget[] memory targets) internal {
        for (uint256 i = 0; i < targets.length; i++) {
            if (targets[i].addr == address(0)) {
                console2.log("  skipped (not configured):", targets[i].label);
                continue;
            }
            TimelockOwnable(targets[i].addr).activateOwnershipTransfer(dao);
            console2.log("  pending owner set:", targets[i].label, targets[i].addr);
        }
    }

    /// @notice Step 3 of 3: assert every hub contract is now owned by the DAO
    /// @dev Run as a post-handover gate. Also asserts the deployer is no longer the pending owner
    ///      anywhere, so a half-finished handover fails loudly instead of shipping.
    function verifyOwnership() external view {
        _verifyOwnership(_requireDaoOwner(), _hubTargets(), vm.envOr("TRANSLATION_REGISTRY", address(0)));
    }

    /// @dev Parameterized body of {verifyOwnership} — see {_proposeHandover} for why.
    /// @param dao The expected owner
    /// @param targets Contracts that must be DAO-owned with no dangling pending transfer
    /// @param translations Plain-Ownable2Step TranslationRegistry, or address(0) to skip
    function _verifyOwnership(address dao, SetupTarget[] memory targets, address translations) internal view {
        for (uint256 i = 0; i < targets.length; i++) {
            if (targets[i].addr == address(0)) continue;
            require(
                IOwnable2Step(targets[i].addr).owner() == dao,
                string.concat(targets[i].label, ": owner is not DAO_OWNER - handover incomplete")
            );
            require(
                IOwnable2Step(targets[i].addr).pendingOwner() == address(0),
                string.concat(targets[i].label, ": a pending owner transfer is still open")
            );
        }
        if (translations != address(0)) {
            require(IOwnable2Step(translations).owner() == dao, "TranslationRegistry: owner is not DAO_OWNER");
        }
        console2.log("=== All configured hub contracts are owned by the DAO ===");
    }

    /// @notice Hand the SPOKE-side contracts to the DAO (run on the spoke chain)
    /// @dev Every spoke target is TimelockOwnable (SpokeSoulboundForwarder included, since C-5),
    ///      so they all take the same propose → 2 days → activate path; pass `activate = false`
    ///      for step 1 and `true` for step 2.
    /// @param activate False to propose, true to activate a previously proposed handover
    function handoverSpokeOwnership(bool activate) external {
        deployerPrivateKey = _getDeployerKey();
        deployer = vm.addr(deployerPrivateKey);
        address dao = _requireDaoOwner();

        console2.log(activate ? "=== ACTIVATING SPOKE HANDOVER ===" : "=== PROPOSING SPOKE HANDOVER ===");

        SetupTarget[] memory targets = _spokeTargets();
        if (!activate) {
            for (uint256 i = 0; i < targets.length; i++) {
                _requireSetupComplete(targets[i]);
            }
        }

        vm.startBroadcast(deployerPrivateKey);
        for (uint256 i = 0; i < targets.length; i++) {
            if (targets[i].addr == address(0)) {
                console2.log("  skipped (not configured):", targets[i].label);
                continue;
            }
            if (activate) {
                TimelockOwnable(targets[i].addr).activateOwnershipTransfer(dao);
            } else {
                TimelockOwnable(targets[i].addr).proposeOwnershipTransfer(dao);
            }
            console2.log("  done:", targets[i].label, targets[i].addr);
        }

        vm.stopBroadcast();
    }

    /// @dev Read and validate DAO_OWNER. Fails loudly rather than defaulting to the deployer —
    ///      a handover that silently no-ops is worse than one that never ran.
    function _requireDaoOwner() internal view returns (address dao) {
        dao = vm.envAddress("DAO_OWNER");
        _validateDao(dao, vm.addr(_getDeployerKey()));
    }

    /// @dev The two checks that make a handover a handover. Split from the env read so it is
    ///      reachable from tests without touching process-global environment state.
    /// @param dao Proposed new owner
    /// @param deployerAddr The deploying EOA
    function _validateDao(address dao, address deployerAddr) internal pure {
        require(dao != address(0), "DAO_OWNER env var is zero address");
        require(dao != deployerAddr, "DAO_OWNER equals the deployer EOA - that is not a handover");
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

    /// @notice Deploy ALL hub contracts for testnet/mainnet (core + FeeManager + soulbound)
    /// @dev Use for Base Sepolia, Base Mainnet, etc.
    ///      Required env vars: PRIVATE_KEY, HUB_HYPERLANE_MAILBOX
    ///      Optional: FEE_MANAGER (if set, uses that address; if not, deploys one with Chainlink feed)
    ///               FEE_RECIPIENT (defaults to deployer)
    function deployHub() external {
        uint256 privKey = _getDeployerKey();
        address _deployer = vm.addr(privKey);

        // Store in contract state to avoid stack depth issues
        _tempFeeManager = vm.envOr("FEE_MANAGER", address(0));
        _tempFeeRecipient = vm.envOr("FEE_RECIPIENT", _deployer);
        _tempMailbox = vm.envAddress("HUB_HYPERLANE_MAILBOX");
        require(_tempMailbox != address(0), "HUB_HYPERLANE_MAILBOX required");
        (_tempGraceBlocks, _tempDeadlineBlocks) = _getTimingConfig(block.chainid);

        console2.log("=== Hub Deployment (Core + FeeManager + Soulbound) ===");
        console2.log("Chain ID:", block.chainid);
        console2.log("Deployer:", _deployer);
        console2.log("FeeRecipient:", _tempFeeRecipient);
        console2.log("Hyperlane Mailbox:", _tempMailbox);
        console2.log("Grace Blocks:", _tempGraceBlocks);
        console2.log("Deadline Blocks:", _tempDeadlineBlocks);
        console2.log("");

        _ensureCreate2Factory();
        vm.startBroadcast(privKey);

        // ── FeeManager (deploy if not provided) ──────────────────────────────
        if (_tempFeeManager == address(0)) {
            address priceFeedAddr = _getChainlinkFeed(block.chainid);
            if (priceFeedAddr == address(0)) {
                priceFeedAddr = Create2Deployer.deploy(
                    Salts.MOCK_AGGREGATOR,
                    abi.encodePacked(type(MockAggregator).creationCode, abi.encode(int256(350_000_000_000)))
                );
                console2.log("1a. MockAggregator:", priceFeedAddr);
            } else {
                console2.log("1a. Chainlink Feed (existing):", priceFeedAddr);
            }
            _tempFeeManager = Create2Deployer.deploy(
                Salts.FEE_MANAGER, abi.encodePacked(type(FeeManager).creationCode, abi.encode(_deployer, priceFeedAddr))
            );
            console2.log("1b. FeeManager (deployed):", _tempFeeManager);
        } else {
            console2.log("1. FeeManager (provided):", _tempFeeManager);
        }

        // ── Core Contracts ───────────────────────────────────────────────────
        address operatorRegAddr = Create2Deployer.deploy(
            Salts.OPERATOR_REGISTRY, abi.encodePacked(type(OperatorRegistry).creationCode, abi.encode(_deployer))
        );
        console2.log("2. OperatorRegistry:", operatorRegAddr);

        address hubDeployedAddr = Create2Deployer.deploy(
            Salts.FRAUD_REGISTRY_HUB,
            abi.encodePacked(type(FraudRegistryHub).creationCode, abi.encode(_deployer, _tempFeeRecipient))
        );
        console2.log("3. FraudRegistryHub:", hubDeployedAddr);

        address walletRegAddr = Create2Deployer.deploy(
            Salts.WALLET_REGISTRY,
            abi.encodePacked(
                type(WalletRegistry).creationCode,
                abi.encode(_deployer, _tempFeeManager, _tempGraceBlocks, _tempDeadlineBlocks)
            )
        );
        console2.log("4. WalletRegistry:", walletRegAddr);

        address txRegAddr = Create2Deployer.deploy(
            Salts.TX_REGISTRY,
            abi.encodePacked(
                type(TransactionRegistry).creationCode,
                abi.encode(_deployer, _tempFeeManager, _tempGraceBlocks, _tempDeadlineBlocks)
            )
        );
        console2.log("5. TransactionRegistry:", txRegAddr);

        address contractRegAddr = Create2Deployer.deploy(
            Salts.CONTRACT_REGISTRY, abi.encodePacked(type(ContractRegistry).creationCode, abi.encode(_deployer))
        );
        console2.log("6. ContractRegistry:", contractRegAddr);

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
        console2.log("7. OperatorSubmitter:", opSubmitterAddr);

        address inboxAddr = Create2Deployer.deploy(
            Salts.CROSS_CHAIN_INBOX,
            abi.encodePacked(type(CrossChainInbox).creationCode, abi.encode(_tempMailbox, hubDeployedAddr, _deployer))
        );
        console2.log("8. CrossChainInbox:", inboxAddr);

        // ── Wire Core ────────────────────────────────────────────────────────
        FraudRegistryHub(payable(hubDeployedAddr)).setWalletRegistry(walletRegAddr);
        FraudRegistryHub(payable(hubDeployedAddr)).setTransactionRegistry(txRegAddr);
        FraudRegistryHub(payable(hubDeployedAddr)).setContractRegistry(contractRegAddr);
        FraudRegistryHub(payable(hubDeployedAddr)).setInbox(inboxAddr);
        console2.log("   -> Hub wired to registries and inbox");

        WalletRegistry(walletRegAddr).setHub(hubDeployedAddr);
        WalletRegistry(walletRegAddr).setOperatorSubmitter(opSubmitterAddr);
        TransactionRegistry(txRegAddr).setHub(hubDeployedAddr);
        TransactionRegistry(txRegAddr).setOperatorSubmitter(opSubmitterAddr);
        ContractRegistry(contractRegAddr).setOperatorSubmitter(opSubmitterAddr);
        console2.log("   -> Registries wired to Hub and OperatorSubmitter");

        // ── Soulbound Contracts (uses storage vars to avoid stack depth) ─────
        console2.log("");
        console2.log("--- Soulbound Contracts ---");

        translationRegistryAddr = Create2Deployer.deploy(
            Salts.TRANSLATION_REGISTRY, abi.encodePacked(type(TranslationRegistry).creationCode, abi.encode(_deployer))
        );
        console2.log("9. TranslationRegistry:", translationRegistryAddr);

        walletSoulboundAddr = Create2Deployer.deploy(
            Salts.WALLET_SOULBOUND,
            abi.encodePacked(
                type(WalletSoulbound).creationCode,
                abi.encode(walletRegAddr, translationRegistryAddr, _deployer, DEFAULT_DOMAIN, _deployer)
            )
        );
        console2.log("10. WalletSoulbound:", walletSoulboundAddr);

        supportSoulboundAddr = Create2Deployer.deploy(
            Salts.SUPPORT_SOULBOUND,
            abi.encodePacked(
                type(SupportSoulbound).creationCode,
                abi.encode(MIN_DONATION, translationRegistryAddr, _deployer, DEFAULT_DOMAIN, _deployer)
            )
        );
        console2.log("11. SupportSoulbound:", supportSoulboundAddr);

        soulboundReceiverAddr = Create2Deployer.deploy(
            Salts.SOULBOUND_RECEIVER,
            abi.encodePacked(
                type(SoulboundReceiver).creationCode,
                abi.encode(_deployer, _tempMailbox, walletSoulboundAddr, supportSoulboundAddr)
            )
        );
        console2.log("12. SoulboundReceiver:", soulboundReceiverAddr);

        SupportSoulbound(supportSoulboundAddr).setAuthorizedMinter(soulboundReceiverAddr, true);
        console2.log("    -> SoulboundReceiver authorized to mint SupportSoulbound");

        vm.stopBroadcast();

        // Output
        console2.log("");
        console2.log("=== Hub Deployment Complete ===");
        _logHubConfig(
            hubDeployedAddr, walletRegAddr, txRegAddr, contractRegAddr, operatorRegAddr, opSubmitterAddr, inboxAddr
        );
        console2.log("  FeeManager:             ", _tempFeeManager);
        console2.log("  TranslationRegistry:    ", translationRegistryAddr);
        console2.log("  WalletSoulbound:        ", walletSoulboundAddr);
        console2.log("  SupportSoulbound:       ", supportSoulboundAddr);
        console2.log("  SoulboundReceiver:      ", soulboundReceiverAddr);
        console2.log("");
        console2.log("Set SOULBOUND_RECEIVER in .env.testnet for spoke deployment:");
        console2.log("  ", soulboundReceiverAddr);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SINGLE-CHAIN SPOKE DEPLOYMENT (Testnet/Mainnet)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Deploy spoke contracts for testnet/mainnet
    /// @dev Use for Optimism Sepolia, Arbitrum Sepolia, etc.
    ///      Required env vars: PRIVATE_KEY, SPOKE_HYPERLANE_MAILBOX,
    ///                         HUB_CHAIN_ID, HUB_INBOX_ADDRESS
    ///      Optional: SPOKE_FEE_MANAGER (unset = free registrations on this spoke),
    ///                SOULBOUND_RECEIVER (unset = no SpokeSoulboundForwarder)
    function deploySpoke() external {
        uint256 privKey = _getDeployerKey();
        address _deployer = vm.addr(privKey);

        // Fee configuration (optional). SPOKE_FEE_MANAGER, not FEE_MANAGER: hub and spoke runs
        // share one env file, and FEE_MANAGER is the HUB's key (read by deployHub and by
        // _hubTargets). Reading it here wired the hub's FeeManager address — which has no code on
        // this chain — into SpokeRegistry.feeManager, which is immutable. Every fee-collecting
        // registration on the spoke would then revert on the extcodesize check with no way to
        // repoint it. Same key, same file, two chains: it has to be two names, matching the
        // SPOKE_FEE_MANAGER that {_spokeTargets} finalizes.
        address feeManagerAddr = vm.envOr("SPOKE_FEE_MANAGER", address(0));

        // Hyperlane configuration (required for spoke)
        address mailbox = vm.envAddress("SPOKE_HYPERLANE_MAILBOX");
        require(mailbox != address(0), "SPOKE_HYPERLANE_MAILBOX required");

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
            abi.encodePacked(type(HyperlaneAdapter).creationCode, abi.encode(_deployer, mailbox))
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

        // Authorize SpokeRegistry on the adapter. Without this every cross-chain
        // registration reverts with HyperlaneAdapter__UnauthorizedSender — the adapter's
        // sendMessage allowlist (the fix for the forged-registration vulnerability) gates
        // ALL dispatches, including legitimate ones.
        HyperlaneAdapter(adapterAddr).setAuthorizedSender(spokeAddr, true);
        console2.log("   -> SpokeRegistry authorized on adapter");

        // 4. Optionally deploy SpokeSoulboundForwarder (for cross-chain soulbound minting)
        address soulboundReceiver = vm.envOr("SOULBOUND_RECEIVER", address(0));
        address forwarderAddr;
        if (soulboundReceiver != address(0)) {
            bytes32 receiverBytes = _addressToBytes32(soulboundReceiver);
            forwarderAddr = Create2Deployer.deploy(
                Salts.SPOKE_SOULBOUND_FWD,
                abi.encodePacked(
                    type(SpokeSoulboundForwarder).creationCode,
                    abi.encode(_deployer, adapterAddr, hubChainId, receiverBytes, MIN_DONATION)
                )
            );
            console2.log("3. SpokeSoulboundForwarder:", forwarderAddr);

            HyperlaneAdapter(adapterAddr).setAuthorizedSender(forwarderAddr, true);
            console2.log("   -> SpokeSoulboundForwarder authorized on adapter");
        }

        vm.stopBroadcast();

        // Fail loudly if the authorization did not land — an unauthorized SpokeRegistry
        // means every cross-chain registration on this deployment is dead.
        require(
            HyperlaneAdapter(adapterAddr).authorizedSenders(spokeAddr),
            "SpokeRegistry not authorized on HyperlaneAdapter"
        );

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
        if (forwarderAddr != address(0)) {
            // Without this, every mint request from this spoke reverts UntrustedForwarder on the
            // hub, Hyperlane redelivers it forever, and once the hub is finalized the fix sits
            // behind the 2-day timelock. Takes the adapter ADDRESS (matching configureTrustLocal),
            // not the bytes32 form the inbox uses.
            console2.log("  soulboundReceiver.setTrustedForwarder(", block.chainid, ",", adapterAddr);
            console2.log("  )");
        }
        console2.log("");
        console2.log("=== THEN: lock the spoke timelock (LAST step, after hub trust is wired) ===");
        console2.log("  pnpm finalize:testnet:spoke   # then verify:setup:testnet:spoke");
        console2.log("  Until this runs, setAuthorizedSender is a one-transaction owner call.");
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

        // `vm.etch` only writes to the local simulation EVM — it cannot put code on a real
        // chain. Etching unconditionally meant that on a live chain WITHOUT the factory, the
        // dry run would succeed against the etched code while the actual broadcast had no
        // factory to call: a failed deployment that reports success. Fail loudly instead.
        require(
            block.chainid == 31_337 || block.chainid == 31_338,
            "CREATE2 factory (0x4e59b44847b379578588920cA78FbF26c0B4956C) is not deployed on this chain - deploy it first"
        );

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

        // Unknown chain — revert to force explicit configuration (aligned with DeployBase)
        revert("Deploy: unsupported chain ID - add timing config");
    }

    function _addressToBytes32(address addr) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(addr)));
    }

    /// @notice Deploy the full spoke-side contract set onto the currently selected fork
    /// @dev Shared by the local cross-chain deploy and the standalone spoke deploy, which
    ///      previously carried verbatim copies of this — including the two authorized-sender
    ///      calls, which had to be added to both. Reads `spokeMailbox`, `crossChainInboxAddr`
    ///      and `soulboundReceiverAddr`; writes the `spoke*` address fields. The caller owns
    ///      the surrounding broadcast.
    function _deploySpokeContracts() internal {
        (uint256 graceBlocks, uint256 deadlineBlocks) = _getTimingConfig(block.chainid);
        console2.log("Timing - Grace Blocks:", graceBlocks);
        console2.log("Timing - Deadline Blocks:", deadlineBlocks);

        // Spoke contracts (regular CREATE — nonce-based, bytecode-independent addresses)
        // No gas paymaster is deployed: from Hyperlane v3 the interchain gas payment is
        // collected by the mailbox's own default post-dispatch hook during dispatch().
        hyperlaneAdapterAddr = address(new HyperlaneAdapter(deployer, spokeMailbox));
        console2.log("1. HyperlaneAdapter:", hyperlaneAdapterAddr);

        HyperlaneAdapter(hyperlaneAdapterAddr).setDomainSupport(HUB_CHAIN_ID, true);
        console2.log("   -> Hub chain", HUB_CHAIN_ID, "enabled as destination");

        spokeMockAggregatorAddr = address(new MockAggregator(int256(350_000_000_000)));
        console2.log("2. MockAggregator (Spoke):", spokeMockAggregatorAddr);

        spokeFeeManagerAddr = address(new FeeManager(deployer, spokeMockAggregatorAddr));
        console2.log("3. FeeManager (Spoke):", spokeFeeManagerAddr);

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
        console2.log("4. SpokeRegistry:", spokeRegistryAddr);

        bytes32 soulboundReceiverBytes = _addressToBytes32(soulboundReceiverAddr);
        spokeSoulboundForwarderAddr = address(
            new SpokeSoulboundForwarder(
                deployer, hyperlaneAdapterAddr, HUB_CHAIN_ID, soulboundReceiverBytes, MIN_DONATION
            )
        );
        console2.log("5. SpokeSoulboundForwarder:", spokeSoulboundForwarderAddr);

        HyperlaneAdapter(hyperlaneAdapterAddr).setAuthorizedSender(spokeRegistryAddr, true);
        HyperlaneAdapter(hyperlaneAdapterAddr).setAuthorizedSender(spokeSoulboundForwarderAddr, true);
        console2.log("   -> Spoke contracts authorized to dispatch via adapter");

        spokeMulticall3Addr = _deployMulticall3(Salts.MULTICALL3_SPOKE);
        console2.log("6. Multicall3 (Spoke):", spokeMulticall3Addr);
    }

    /// @notice Get Chainlink ETH/USD feed address for known chains
    /// @dev Returns address(0) for unknown chains — caller should deploy MockAggregator
    function _getChainlinkFeed(uint256 chainId) internal pure returns (address) {
        if (chainId == 84_532) return 0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1; // Base Sepolia
        if (chainId == 8453) return 0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70; // Base Mainnet
        if (chainId == 11_155_420) return 0x61Ec26aA57019C486B10502285c5A3D4A4750AD7; // OP Sepolia
        if (chainId == 10) return 0x13e3Ee699D1909E989722E753853AE30b17e08c5; // OP Mainnet
        return address(0); // No feed — caller deploys MockAggregator
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
