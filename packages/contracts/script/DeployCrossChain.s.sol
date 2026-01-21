// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { console2 } from "forge-std/Script.sol";
import { DeployBase, MockAggregator } from "./DeployBase.s.sol";

// Hub contracts
import { RegistryHub } from "../src/RegistryHub.sol";
import { CrossChainInbox } from "../src/crosschain/CrossChainInbox.sol";
import { SoulboundReceiver } from "../src/soulbound/SoulboundReceiver.sol";
import { SupportSoulbound } from "../src/soulbound/SupportSoulbound.sol";
import { OperatorRegistry } from "../src/OperatorRegistry.sol";
import { StolenWalletRegistry } from "../src/registries/StolenWalletRegistry.sol";
import { StolenTransactionRegistry } from "../src/registries/StolenTransactionRegistry.sol";
import { FraudulentContractRegistry } from "../src/registries/FraudulentContractRegistry.sol";

// Spoke contracts
import { SpokeRegistry } from "../src/spoke/SpokeRegistry.sol";
import { SpokeTransactionRegistry } from "../src/spoke/SpokeTransactionRegistry.sol";
import { SpokeSoulboundForwarder } from "../src/spoke/SpokeSoulboundForwarder.sol";
import { HyperlaneAdapter } from "../src/crosschain/adapters/HyperlaneAdapter.sol";
import { FeeManager } from "../src/FeeManager.sol";

// Libraries
import { CrossChainMessage } from "../src/libraries/CrossChainMessage.sol";

// Mocks
import { MockInterchainGasPaymaster } from "../test/mocks/MockInterchainGasPaymaster.sol";

/// @title DeployCrossChain
/// @notice Deploy SWR contracts to local Anvil chains with REAL Hyperlane infrastructure
/// @dev Run with: forge script script/DeployCrossChain.s.sol --tc DeployCrossChain --broadcast
///
/// Prerequisites:
///   1. Start anvil with Hyperlane state: pnpm anvil:crosschain
///   2. Hyperlane deployed by Account 9 (preserves Account 0 nonces)
///   3. Set HUB_MAILBOX and SPOKE_MAILBOX in packages/contracts/.env
///
/// Account Strategy:
///   - Account 0 (0xf39F...): OUR contracts (deterministic addresses)
///   - Account 9 (0xa0Ee...): Hyperlane infrastructure (separate nonce space)
///
/// Hub deployment order (Account 0 nonces):
///   0: MockAggregator            → 0x5FbDB2315678afecb367f032d93F642f64180aa3
///   1: FeeManager                → 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
///   2: RegistryHub               → 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
///   3: StolenWalletRegistry      → 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
///   4: StolenTransactionRegistry → 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
///   5-6: (setRegistry txs)
///   7: CrossChainInbox           → 0xa513E6E4b8f2a923D98304ec87F64353C4D5C853
///   8: (setCrossChainInbox tx)
///   9: Multicall3                → 0x8A791620dd6260079BF849Dc5567aDC3F2FdC318
///  10: TranslationRegistry       → 0x610178dA211FEF7D417bC0e6FeD39F05609AD788
///  11: WalletSoulbound           → 0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e
///  12: SupportSoulbound          → 0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0
///  13: SoulboundReceiver         → 0x9A9f2CCfdE556A7E9Ff0848998Aa4a0CFD8863AE
///  14: (setAuthorizedMinter tx)
///  15: OperatorRegistry          → 0x0B306BF915C4d645ff596e518fAf3F9669b97016
///  16: (setOperatorRegistry to hub tx)
///  17-18: (setOperatorRegistry to wallet/tx registries)
///  19-20: (approveOperator txs for test operators)
///  21: FraudulentContractRegistry → 0x3Aa5ebB10DC797CAC828524e59A333d0A371443c
///  22: (setFraudulentContractRegistry tx)
///
/// Language seeding runs separately via SeedLanguages.s.sol (doesn't affect addresses)
///
/// Spoke deployment order (Account 0 nonces):
///   0: MockGasPaymaster          → 0x5FbDB2315678afecb367f032d93F642f64180aa3
///   1: HyperlaneAdapter          → 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
///   2: (setDomainSupport tx)
///   3: MockAggregator            → 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
///   4: FeeManager                → 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
///   5: SpokeRegistry             → 0x5FC8d32690cc91D4c39d9d3abcBD16989F875707
///   6: SpokeTransactionRegistry  → 0x0165878A594ca255338adfa4d48449f69242Eb8F
///   7: SpokeSoulboundForwarder   → 0xa513E6E4b8f2a923D98304ec87F64353C4D5C853
///   8: Multicall3                → 0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6
contract DeployCrossChain is DeployBase {
    // Chain RPCs
    string constant HUB_RPC = "http://localhost:8545";
    string constant SPOKE_RPC = "http://localhost:8546";

    // Chain IDs / Hyperlane Domains
    uint32 constant HUB_CHAIN_ID = 31_337;
    uint32 constant SPOKE_CHAIN_ID = 31_338;

    // Test operator addresses (Anvil accounts 3 and 4)
    address constant OPERATOR_A = 0x90F79bf6EB2c4f870365E785982E1f101E93b906;
    address constant OPERATOR_B = 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65;

    // Fork IDs
    uint256 hubForkId;
    uint256 spokeForkId;

    // Deployer info (stored to reduce stack depth)
    uint256 deployerPrivateKey;
    address deployer;

    // Deployed addresses - Hub
    address priceFeed;
    address feeManager;
    address payable hubRegistry;
    address stolenWalletRegistry;
    address stolenTransactionRegistry;
    address crossChainInbox;
    address hubMulticall3;
    // Soulbound addresses (Hub only)
    address translationRegistry;
    address walletSoulbound;
    address supportSoulbound;
    address payable soulboundReceiver;
    // Operator Registry (Hub only)
    address operatorRegistry;
    // Fraudulent Contract Registry (Hub only)
    address fraudulentContractRegistry;
    // Hyperlane Mailbox addresses (stored to avoid stack too deep)
    address hubMailbox;
    address spokeMailbox;
    // Deployed addresses - Spoke
    address spokeGasPaymaster;
    address hyperlaneAdapter;
    address spokeRegistry;
    address spokeTransactionRegistry;
    address spokeSoulboundForwarder;
    address spokeMulticall3;

    function run() external {
        deployerPrivateKey =
            vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));

        deployer = vm.addr(deployerPrivateKey);

        // Read Hyperlane Mailbox addresses from environment
        // These must be set in packages/contracts/.env after running hyperlane:deploy
        hubMailbox = vm.envAddress("HUB_MAILBOX");
        require(hubMailbox != address(0), "HUB_MAILBOX env var must be set to a non-zero address");
        spokeMailbox = vm.envAddress("SPOKE_MAILBOX");
        require(spokeMailbox != address(0), "SPOKE_MAILBOX env var must be set to a non-zero address");

        console2.log("=== CROSS-CHAIN DEPLOYMENT (Real Hyperlane) ===");
        console2.log("Deployer:", deployer);
        console2.log("Hub Mailbox (Hyperlane):", hubMailbox);
        console2.log("Spoke Mailbox (Hyperlane):", spokeMailbox);
        console2.log("");

        // Create forks
        hubForkId = vm.createFork(HUB_RPC);
        spokeForkId = vm.createFork(SPOKE_RPC);

        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE 1: DEPLOY CORE CONTRACTS TO HUB (uses shared DeployBase logic)
        // ═══════════════════════════════════════════════════════════════════════════

        console2.log("--- HUB CHAIN (31337) - Core Contracts ---");

        vm.selectFork(hubForkId);
        vm.startBroadcast(deployerPrivateKey);

        // Deploy core contracts (CrossChainInbox set to address(0) initially, updated after)
        (priceFeed, feeManager, hubRegistry, stolenWalletRegistry, stolenTransactionRegistry) =
            deployCore(deployer, address(0));

        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE 1b: DEPLOY CROSS-CHAIN INBOX TO HUB
        // ═══════════════════════════════════════════════════════════════════════════

        console2.log("");
        console2.log("--- HUB CHAIN (31337) - Cross-Chain Contracts ---");

        // nonce 7: Deploy CrossChainInbox
        CrossChainInbox inbox = new CrossChainInbox(hubMailbox, hubRegistry, deployer);
        crossChainInbox = address(inbox);
        console2.log("CrossChainInbox:", crossChainInbox);

        // nonce 8: Wire CrossChainInbox to hub
        RegistryHub(hubRegistry).setCrossChainInbox(crossChainInbox);

        // nonce 9: Deploy Multicall3 for local development (viem/wagmi batch calls)
        hubMulticall3 = deployMulticall3();

        // nonces 10-12: Deploy soulbound contracts (fee collector = hub for unified treasury)
        (translationRegistry, walletSoulbound, supportSoulbound) = deploySoulbound(stolenWalletRegistry, hubRegistry);

        // nonce 13: Deploy SoulboundReceiver (receives cross-chain mint requests)
        SoulboundReceiver receiver = new SoulboundReceiver(deployer, hubMailbox, walletSoulbound, supportSoulbound);
        soulboundReceiver = payable(address(receiver));
        console2.log("SoulboundReceiver:", soulboundReceiver);

        // nonce 14: Authorize SoulboundReceiver to call mintTo on SupportSoulbound
        SupportSoulbound(supportSoulbound).setAuthorizedMinter(soulboundReceiver, true);
        console2.log("SoulboundReceiver authorized to mint on SupportSoulbound");

        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE 1c: DEPLOY OPERATOR REGISTRY TO HUB
        // ═══════════════════════════════════════════════════════════════════════════

        console2.log("");
        console2.log("--- HUB CHAIN (31337) - Operator Registry ---");

        // nonce 15: Deploy OperatorRegistry
        OperatorRegistry opReg = new OperatorRegistry(deployer);
        operatorRegistry = address(opReg);
        console2.log("OperatorRegistry:", operatorRegistry);

        // nonce 16: Wire OperatorRegistry to hub
        RegistryHub(hubRegistry).setOperatorRegistry(operatorRegistry);
        console2.log("OperatorRegistry wired to RegistryHub");

        // nonces 17-18: Wire OperatorRegistry to individual registries (for operator batch paths)
        StolenWalletRegistry(stolenWalletRegistry).setOperatorRegistry(operatorRegistry);
        StolenTransactionRegistry(stolenTransactionRegistry).setOperatorRegistry(operatorRegistry);
        console2.log("OperatorRegistry wired to StolenWalletRegistry and StolenTransactionRegistry");

        // nonces 19-20: Seed test operators (Anvil accounts 3 and 4)
        // Account 3: Operator A with ALL capabilities (0x07)
        opReg.approveOperator(OPERATOR_A, opReg.ALL_REGISTRIES(), "TestOperatorA-ALL");
        console2.log("Operator A (ALL):", OPERATOR_A);

        // Account 4: Operator B with CONTRACT_REGISTRY only (0x04)
        opReg.approveOperator(OPERATOR_B, opReg.CONTRACT_REGISTRY(), "TestOperatorB-CONTRACT");
        console2.log("Operator B (CONTRACT):", OPERATOR_B);

        console2.log("Approved operator count:", opReg.approvedOperatorCount());

        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE 1d: DEPLOY FRAUDULENT CONTRACT REGISTRY TO HUB
        // ═══════════════════════════════════════════════════════════════════════════

        console2.log("");
        console2.log("--- HUB CHAIN (31337) - Fraudulent Contract Registry ---");

        // nonce 21: Deploy FraudulentContractRegistry
        FraudulentContractRegistry fcReg =
            new FraudulentContractRegistry(deployer, operatorRegistry, feeManager, hubRegistry);
        fraudulentContractRegistry = address(fcReg);
        console2.log("FraudulentContractRegistry:", fraudulentContractRegistry);

        // nonce 22: Wire FraudulentContractRegistry to hub
        RegistryHub(hubRegistry).setFraudulentContractRegistry(fraudulentContractRegistry);
        console2.log("FraudulentContractRegistry wired to RegistryHub");

        vm.stopBroadcast();

        console2.log("");

        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE 2: DEPLOY TO SPOKE CHAIN
        // ═══════════════════════════════════════════════════════════════════════════

        console2.log("--- SPOKE CHAIN (31338) ---");

        vm.selectFork(spokeForkId);
        vm.startBroadcast(deployerPrivateKey);

        // nonce 0: Deploy MockInterchainGasPaymaster
        spokeGasPaymaster = address(new MockInterchainGasPaymaster());
        console2.log("MockInterchainGasPaymaster:", spokeGasPaymaster);

        // nonce 1: Deploy HyperlaneAdapter
        HyperlaneAdapter adapter = new HyperlaneAdapter(deployer, spokeMailbox, spokeGasPaymaster);
        hyperlaneAdapter = address(adapter);
        console2.log("HyperlaneAdapter:", hyperlaneAdapter);

        // nonce 2: Enable hub domain
        adapter.setDomainSupport(HUB_CHAIN_ID, true);

        // nonce 3: Deploy MockAggregator for spoke
        address spokePriceFeed = address(new MockAggregator(350_000_000_000));
        console2.log("MockAggregator (Spoke):", spokePriceFeed);

        // nonce 4: Deploy FeeManager for spoke
        address spokeFeeManager = address(new FeeManager(deployer, spokePriceFeed));
        console2.log("FeeManager (Spoke):", spokeFeeManager);

        // nonce 5: Deploy SpokeRegistry (with chain-specific timing)
        bytes32 hubInboxBytes = CrossChainMessage.addressToBytes32(crossChainInbox);
        // Use block.chainid to ensure timing matches the actual chain we're deploying to
        (uint256 spokeGraceBlocks, uint256 spokeDeadlineBlocks) = getTimingConfig(block.chainid);
        console2.log("Timing Config - Grace Blocks:", spokeGraceBlocks);
        console2.log("Timing Config - Deadline Blocks:", spokeDeadlineBlocks);
        spokeRegistry = address(
            new SpokeRegistry(
                deployer,
                hyperlaneAdapter,
                spokeFeeManager,
                HUB_CHAIN_ID,
                hubInboxBytes,
                spokeGraceBlocks,
                spokeDeadlineBlocks
            )
        );
        console2.log("SpokeRegistry:", spokeRegistry);

        // nonce 6: Deploy SpokeTransactionRegistry (same timing config as SpokeRegistry)
        spokeTransactionRegistry = address(
            new SpokeTransactionRegistry(
                deployer,
                hyperlaneAdapter,
                spokeFeeManager,
                HUB_CHAIN_ID,
                hubInboxBytes,
                spokeGraceBlocks,
                spokeDeadlineBlocks
            )
        );
        console2.log("SpokeTransactionRegistry:", spokeTransactionRegistry);

        // nonce 7: Deploy SpokeSoulboundForwarder for cross-chain soulbound minting
        // Note: hubReceiver will be updated after we know SoulboundReceiver address
        bytes32 soulboundReceiverBytes = CrossChainMessage.addressToBytes32(soulboundReceiver);
        SpokeSoulboundForwarder forwarder = new SpokeSoulboundForwarder(
            deployer,
            hyperlaneAdapter,
            HUB_CHAIN_ID,
            soulboundReceiverBytes,
            MIN_DONATION // Same minimum donation as hub
        );
        spokeSoulboundForwarder = address(forwarder);
        console2.log("SpokeSoulboundForwarder:", spokeSoulboundForwarder);

        // nonce 8: Deploy Multicall3 for local development (viem/wagmi batch calls)
        spokeMulticall3 = deployMulticall3();

        vm.stopBroadcast();

        console2.log("");

        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE 3: CONFIGURE TRUST RELATIONSHIPS
        // ═══════════════════════════════════════════════════════════════════════════

        console2.log("--- TRUST CONFIGURATION ---");

        vm.selectFork(hubForkId);
        vm.startBroadcast(deployerPrivateKey);

        // IMPORTANT: Trust the HyperlaneAdapter, NOT the SpokeRegistry!
        // When SpokeRegistry calls adapter.sendMessage(), the adapter calls mailbox.dispatch().
        // Hyperlane records the `msg.sender` of dispatch() as the origin sender.
        // So from the hub's perspective, messages come FROM the HyperlaneAdapter address.
        bytes32 hyperlaneAdapterBytes = CrossChainMessage.addressToBytes32(hyperlaneAdapter);
        CrossChainInbox(crossChainInbox).setTrustedSource(SPOKE_CHAIN_ID, hyperlaneAdapterBytes, true);
        console2.log("Trusted source configured: HyperlaneAdapter on chain", SPOKE_CHAIN_ID);
        console2.log("  HyperlaneAdapter address:", hyperlaneAdapter);

        // Configure SoulboundReceiver to trust HyperlaneAdapter
        // NOTE: Like CrossChainInbox, we trust the HyperlaneAdapter (the msg.sender to mailbox)
        // When SpokeSoulboundForwarder calls adapter.sendMessage(), the adapter calls mailbox.dispatch().
        // Hyperlane records `msg.sender` (HyperlaneAdapter) as the origin sender in the message.
        // SoulboundReceiver.handle() receives this sender bytes32, so we must trust the adapter address.
        SoulboundReceiver(soulboundReceiver).setTrustedForwarder(SPOKE_CHAIN_ID, hyperlaneAdapter);
        console2.log("SoulboundReceiver trusted forwarder: HyperlaneAdapter on chain", SPOKE_CHAIN_ID);
        console2.log("  HyperlaneAdapter address:", hyperlaneAdapter);

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
        console2.log("  MockAggregator:            ", priceFeed);
        console2.log("  FeeManager:                ", feeManager);
        console2.log("  RegistryHub:               ", hubRegistry);
        console2.log("  StolenWalletRegistry:      ", stolenWalletRegistry);
        console2.log("  StolenTransactionRegistry: ", stolenTransactionRegistry);
        console2.log("  CrossChainInbox:           ", crossChainInbox);
        console2.log("  Multicall3:                ", hubMulticall3);
        console2.log("  TranslationRegistry:       ", translationRegistry);
        console2.log("  WalletSoulbound:           ", walletSoulbound);
        console2.log("  SupportSoulbound:          ", supportSoulbound);
        console2.log("  SoulboundReceiver:         ", soulboundReceiver);
        console2.log("  OperatorRegistry:          ", operatorRegistry);
        console2.log("  FraudulentContractRegistry:", fraudulentContractRegistry);
        console2.log("");
        console2.log("Spoke Chain (31338) - http://localhost:8546:");
        console2.log("  MockInterchainGasPaymaster:", spokeGasPaymaster);
        console2.log("  HyperlaneAdapter:          ", hyperlaneAdapter);
        console2.log("  MockAggregator:            ", spokePriceFeed);
        console2.log("  FeeManager:                ", spokeFeeManager);
        console2.log("  SpokeRegistry:             ", spokeRegistry);
        console2.log("  SpokeTransactionRegistry:  ", spokeTransactionRegistry);
        console2.log("  SpokeSoulboundForwarder:   ", spokeSoulboundForwarder);
        console2.log("  Multicall3:                ", spokeMulticall3);
        console2.log("");
        console2.log("Trust Relationships:");
        console2.log("  CrossChainInbox trusts HyperlaneAdapter from chain 31338");
        console2.log("  SoulboundReceiver trusts HyperlaneAdapter from chain 31338");
        console2.log("");
        console2.log("Next steps:");
        console2.log("  1. Start dev server: pnpm dev:crosschain");
        console2.log("  2. Hyperlane relayer auto-relays messages (running via anvil:crosschain)");
    }
}
