// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { OperatorSubmitter } from "../../src/v2/OperatorSubmitter.sol";
import { FraudRegistryV2 } from "../../src/v2/FraudRegistryV2.sol";
import { OperatorRegistry } from "../../src/OperatorRegistry.sol";
import { FeeManager } from "../../src/FeeManager.sol";
import { CAIP10 } from "../../src/v2/libraries/CAIP10.sol";

/// @title SeedOperatorDataV2
/// @notice Seeds operator data for V2 contracts: wallets, transactions, and contracts
/// @dev Run after deploying V2 contracts to populate dashboard test data
///
/// Usage:
/// ```bash
/// # Local (after deploy:crosschain:v2)
/// forge script script/v2/SeedOperatorDataV2.s.sol --rpc-url localhost --broadcast
/// ```
contract SeedOperatorDataV2 is Script {
    // ═══════════════════════════════════════════════════════════════════════════
    // V2 CONTRACT ADDRESSES (deployed by DeployV2.s.sol)
    // ═══════════════════════════════════════════════════════════════════════════
    // These addresses are deterministic based on deployer nonce
    // Update if deploy order changes

    address constant DEFAULT_OPERATOR_REGISTRY = 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0;
    address constant DEFAULT_FRAUD_REGISTRY_V2 = 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9;
    address constant DEFAULT_OPERATOR_SUBMITTER = 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9;
    address constant DEFAULT_FEE_MANAGER = 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512;

    // ═══════════════════════════════════════════════════════════════════════════
    // OPERATOR ACCOUNTS (Anvil Default Test Accounts)
    // ═══════════════════════════════════════════════════════════════════════════
    // SECURITY NOTE: These are well-known Anvil/Hardhat test private keys.
    // They are publicly documented and ONLY used for local development.
    //
    // Account 3 (Operator A - ALL capabilities: WALLET + TX + CONTRACT)
    uint256 constant OPERATOR_A_PRIVATE_KEY = 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6;
    address constant OPERATOR_A_ADDRESS = 0x90F79bf6EB2c4f870365E785982E1f101E93b906;

    // Account 4 (Operator B - CONTRACT only)
    uint256 constant OPERATOR_B_PRIVATE_KEY = 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a;
    address constant OPERATOR_B_ADDRESS = 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65;

    // ═══════════════════════════════════════════════════════════════════════════
    // CHAIN IDs (CAIP-2 hashes for EVM chains)
    // ═══════════════════════════════════════════════════════════════════════════
    // Pre-computed: keccak256(abi.encodePacked("eip155:", chainIdString))

    bytes32 constant CHAIN_ID_ETH_MAINNET = 0x38b2caf37cccf00b6fbc0feb1e534daf567950e4d48066d0e3669028fe5f83e6; // eip155:1
    bytes32 constant CHAIN_ID_BASE = 0x43b48883ef7be0f98fe7f98fafb2187e42caab4063697b32816f95e09d69b3ec; // eip155:8453
    bytes32 constant CHAIN_ID_ARBITRUM = 0x1fca116f439fa7af0604ced8c7a6239cdcabb5070838cbc80cdba0089733e472; // eip155:42161
    bytes32 constant CHAIN_ID_LOCAL = 0x318e51c37247d03bad135571413b06a083591bcc680967d80bf587ac928cf369; // eip155:31337

    // ═══════════════════════════════════════════════════════════════════════════
    // TEST DATA - STOLEN WALLETS
    // ═══════════════════════════════════════════════════════════════════════════
    address constant STOLEN_WALLET_1 = 0xAAaA000000000000000000000000000000000001;
    address constant STOLEN_WALLET_2 = 0xaaAa000000000000000000000000000000000002;
    address constant STOLEN_WALLET_3 = 0xAAaa000000000000000000000000000000000003;
    address constant STOLEN_WALLET_4 = 0xaAAA000000000000000000000000000000000004;

    // ═══════════════════════════════════════════════════════════════════════════
    // TEST DATA - STOLEN TRANSACTIONS
    // ═══════════════════════════════════════════════════════════════════════════
    bytes32 constant STOLEN_TX_1 = 0xbbbb000000000000000000000000000000000000000000000000000000000001;
    bytes32 constant STOLEN_TX_2 = 0xbbbb000000000000000000000000000000000000000000000000000000000002;
    bytes32 constant STOLEN_TX_3 = 0xbbbb000000000000000000000000000000000000000000000000000000000003;
    bytes32 constant STOLEN_TX_4 = 0xbbbb000000000000000000000000000000000000000000000000000000000004;

    // ═══════════════════════════════════════════════════════════════════════════
    // TEST DATA - FRAUDULENT CONTRACTS
    // ═══════════════════════════════════════════════════════════════════════════
    address constant SCAM_CONTRACT_1 = 0x1111111111111111111111111111111111111111;
    address constant SCAM_CONTRACT_2 = 0x2222222222222222222222222222222222222222;
    address constant SCAM_CONTRACT_3 = 0x3333333333333333333333333333333333333333;
    address constant SCAM_CONTRACT_4 = 0x4444444444444444444444444444444444444444;
    address constant SCAM_CONTRACT_5 = 0x5555555555555555555555555555555555555555;
    address constant SCAM_CONTRACT_6 = 0x6666666666666666666666666666666666666666;
    address constant SCAM_CONTRACT_7 = 0x7777777777777777777777777777777777777777;

    function run() external {
        // Guard: This script uses hardcoded anvil keys - only run on local chains
        if (block.chainid != 31_337 && block.chainid != 31_338) {
            console2.log("ERROR: SeedOperatorDataV2 uses hardcoded anvil keys.");
            console2.log("This script is only intended for local development (chain IDs 31337/31338).");
            console2.log("Current chain ID:", block.chainid);
            return;
        }

        // Load contract addresses (env vars or defaults)
        address operatorRegistryAddr = vm.envOr("OPERATOR_REGISTRY", DEFAULT_OPERATOR_REGISTRY);
        address fraudRegistryAddr = vm.envOr("FRAUD_REGISTRY_V2", DEFAULT_FRAUD_REGISTRY_V2);
        address operatorSubmitterAddr = vm.envOr("OPERATOR_SUBMITTER", DEFAULT_OPERATOR_SUBMITTER);
        address feeManagerAddr = vm.envOr("FEE_MANAGER", DEFAULT_FEE_MANAGER);

        console2.log("");
        console2.log("==========================================");
        console2.log("=== SEEDING V2 OPERATOR DATA ===");
        console2.log("==========================================");
        console2.log("");
        console2.log("Contracts:");
        console2.log("  OperatorRegistry:", operatorRegistryAddr);
        console2.log("  FraudRegistryV2:", fraudRegistryAddr);
        console2.log("  OperatorSubmitter:", operatorSubmitterAddr);
        console2.log("  FeeManager:", feeManagerAddr);
        console2.log("");
        console2.log("Operators:");
        console2.log("  Operator A (ALL caps):", OPERATOR_A_ADDRESS);
        console2.log("  Operator B (CONTRACT only):", OPERATOR_B_ADDRESS);
        console2.log("");

        // Instantiate contracts
        OperatorRegistry opRegistry = OperatorRegistry(operatorRegistryAddr);
        FraudRegistryV2 fraudRegistry = FraudRegistryV2(fraudRegistryAddr);
        OperatorSubmitter operatorSubmitter = OperatorSubmitter(operatorSubmitterAddr);
        FeeManager feeManager = FeeManager(feeManagerAddr);

        // Get batch fee (same for all batch types)
        uint256 batchFee = feeManager.operatorBatchFeeWei();
        console2.log("  Batch Fee:", batchFee, "wei");

        // Verify operators are approved
        console2.log("--- VERIFYING OPERATORS ---");
        bool opAApproved = opRegistry.isApproved(OPERATOR_A_ADDRESS);
        bool opBApproved = opRegistry.isApproved(OPERATOR_B_ADDRESS);
        console2.log("  Operator A approved:", opAApproved);
        console2.log("  Operator B approved:", opBApproved);

        if (!opAApproved || !opBApproved) {
            console2.log("");
            console2.log("ERROR: Operators not approved. Run deploy:crosschain:v2 first.");
            return;
        }

        // Check if already seeded (wallet 1 would be registered)
        if (fraudRegistry.isRegistered(STOLEN_WALLET_1)) {
            console2.log("");
            console2.log("V2 Operator data already seeded, skipping...");
            return;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // SUBMIT STOLEN WALLET BATCH (Operator A)
        // ═══════════════════════════════════════════════════════════════════════
        console2.log("");
        console2.log("--- STOLEN WALLET BATCH (Operator A) ---");
        _submitWalletBatch(operatorSubmitter, batchFee);

        // ═══════════════════════════════════════════════════════════════════════
        // SUBMIT STOLEN TRANSACTION BATCH (Operator A)
        // ═══════════════════════════════════════════════════════════════════════
        console2.log("");
        console2.log("--- STOLEN TRANSACTION BATCH (Operator A) ---");
        _submitTransactionBatch(operatorSubmitter, batchFee);

        // ═══════════════════════════════════════════════════════════════════════
        // SUBMIT FRAUDULENT CONTRACT BATCHES (Both operators)
        // ═══════════════════════════════════════════════════════════════════════
        console2.log("");
        console2.log("--- FRAUDULENT CONTRACT BATCH (Operator A) ---");
        _submitContractBatchA(operatorSubmitter, batchFee);

        console2.log("");
        console2.log("--- FRAUDULENT CONTRACT BATCH (Operator B) ---");
        _submitContractBatchB(operatorSubmitter, batchFee);

        // Summary
        console2.log("");
        console2.log("==========================================");
        console2.log("=== V2 SEEDING COMPLETE ===");
        console2.log("==========================================");
        console2.log("");
        console2.log("Summary:");
        console2.log("  Stolen Wallets: 4 wallets in 1 batch");
        console2.log("  Stolen Transactions: 4 txs in 1 batch");
        console2.log("  Fraudulent Contracts: 7 contracts in 2 batches");
        console2.log("");
        console2.log("Dashboard Test Data:");
        console2.log("  - Search for 0xaaaa...0001 (stolen wallet)");
        console2.log("  - Search for 0xbbbb...0001 (stolen transaction)");
        console2.log("  - Search for 0x1111...1111 (fraudulent contract)");
        console2.log("  - View operator activity in Operators Table");
        console2.log("");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WALLET BATCH SUBMISSION (Operator A)
    // ═══════════════════════════════════════════════════════════════════════════

    function _submitWalletBatch(OperatorSubmitter operatorSubmitter, uint256 batchFee) internal {
        vm.startBroadcast(OPERATOR_A_PRIVATE_KEY);

        // Build batch arrays
        bytes32[] memory namespaceHashes = new bytes32[](4);
        bytes32[] memory chainRefs = new bytes32[](4);
        bytes32[] memory identifiers = new bytes32[](4);
        bytes32[] memory reportedChainIds = new bytes32[](4);
        uint64[] memory incidentTimestamps = new uint64[](4);

        // All EVM wallets use same namespace hash
        bytes32 eip155Namespace = CAIP10.NAMESPACE_EIP155;

        // Wallet 1: Ethereum Mainnet
        namespaceHashes[0] = eip155Namespace;
        chainRefs[0] = bytes32(0); // Ignored for EVM
        identifiers[0] = bytes32(uint256(uint160(STOLEN_WALLET_1)));
        reportedChainIds[0] = CHAIN_ID_ETH_MAINNET;
        incidentTimestamps[0] = uint64(block.timestamp - 1 days);

        // Wallet 2: Base
        namespaceHashes[1] = eip155Namespace;
        chainRefs[1] = bytes32(0);
        identifiers[1] = bytes32(uint256(uint160(STOLEN_WALLET_2)));
        reportedChainIds[1] = CHAIN_ID_BASE;
        incidentTimestamps[1] = uint64(block.timestamp - 2 days);

        // Wallet 3: Arbitrum
        namespaceHashes[2] = eip155Namespace;
        chainRefs[2] = bytes32(0);
        identifiers[2] = bytes32(uint256(uint160(STOLEN_WALLET_3)));
        reportedChainIds[2] = CHAIN_ID_ARBITRUM;
        incidentTimestamps[2] = uint64(block.timestamp - 3 days);

        // Wallet 4: Local (same as hub for testing)
        namespaceHashes[3] = eip155Namespace;
        chainRefs[3] = bytes32(0);
        identifiers[3] = bytes32(uint256(uint160(STOLEN_WALLET_4)));
        reportedChainIds[3] = CHAIN_ID_LOCAL;
        incidentTimestamps[3] = uint64(block.timestamp - 4 days);

        console2.log("  Wallets: 4");
        console2.log("    - ", STOLEN_WALLET_1, " (Ethereum)");
        console2.log("    - ", STOLEN_WALLET_2, " (Base)");
        console2.log("    - ", STOLEN_WALLET_3, " (Arbitrum)");
        console2.log("    - ", STOLEN_WALLET_4, " (Local)");

        // Submit batch with fee (registerWalletsAsOperator returns void, not batchId)
        operatorSubmitter.registerWalletsAsOperator{ value: batchFee }(
            namespaceHashes, chainRefs, identifiers, reportedChainIds, incidentTimestamps
        );

        console2.log("  Status: REGISTERED");

        vm.stopBroadcast();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TRANSACTION BATCH SUBMISSION (Operator A)
    // ═══════════════════════════════════════════════════════════════════════════

    function _submitTransactionBatch(OperatorSubmitter operatorSubmitter, uint256 batchFee) internal {
        vm.startBroadcast(OPERATOR_A_PRIVATE_KEY);

        // Build batch arrays
        bytes32[] memory namespaceHashes = new bytes32[](4);
        bytes32[] memory chainRefs = new bytes32[](4);
        bytes32[] memory txHashes = new bytes32[](4);

        bytes32 eip155Namespace = CAIP10.NAMESPACE_EIP155;

        // All transactions use EIP155 namespace
        for (uint256 i = 0; i < 4; i++) {
            namespaceHashes[i] = eip155Namespace;
            chainRefs[i] = bytes32(0);
        }

        txHashes[0] = STOLEN_TX_1;
        txHashes[1] = STOLEN_TX_2;
        txHashes[2] = STOLEN_TX_3;
        txHashes[3] = STOLEN_TX_4;

        console2.log("  Transactions: 4");
        console2.log("    - ", vm.toString(STOLEN_TX_1));
        console2.log("    - ", vm.toString(STOLEN_TX_2));
        console2.log("    - ", vm.toString(STOLEN_TX_3));
        console2.log("    - ", vm.toString(STOLEN_TX_4));

        // Submit batch with fee
        operatorSubmitter.registerTransactionsAsOperator{ value: batchFee }(namespaceHashes, chainRefs, txHashes);

        console2.log("  Status: REGISTERED");

        vm.stopBroadcast();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONTRACT BATCH SUBMISSION (Operator A)
    // ═══════════════════════════════════════════════════════════════════════════

    function _submitContractBatchA(OperatorSubmitter operatorSubmitter, uint256 batchFee) internal {
        vm.startBroadcast(OPERATOR_A_PRIVATE_KEY);

        // Build batch arrays (5 contracts across different chains)
        bytes32[] memory namespaceHashes = new bytes32[](5);
        bytes32[] memory chainRefs = new bytes32[](5);
        bytes32[] memory contractIds = new bytes32[](5);

        bytes32 eip155Namespace = CAIP10.NAMESPACE_EIP155;

        for (uint256 i = 0; i < 5; i++) {
            namespaceHashes[i] = eip155Namespace;
            chainRefs[i] = bytes32(0);
        }

        contractIds[0] = bytes32(uint256(uint160(SCAM_CONTRACT_1)));
        contractIds[1] = bytes32(uint256(uint160(SCAM_CONTRACT_2)));
        contractIds[2] = bytes32(uint256(uint160(SCAM_CONTRACT_3)));
        contractIds[3] = bytes32(uint256(uint160(SCAM_CONTRACT_4)));
        contractIds[4] = bytes32(uint256(uint160(SCAM_CONTRACT_5)));

        console2.log("  Contracts: 5");
        console2.log("    - ", SCAM_CONTRACT_1);
        console2.log("    - ", SCAM_CONTRACT_2);
        console2.log("    - ", SCAM_CONTRACT_3);
        console2.log("    - ", SCAM_CONTRACT_4);
        console2.log("    - ", SCAM_CONTRACT_5);

        // Submit batch with fee
        operatorSubmitter.registerContractsAsOperator{ value: batchFee }(namespaceHashes, chainRefs, contractIds);

        console2.log("  Status: REGISTERED");

        vm.stopBroadcast();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONTRACT BATCH SUBMISSION (Operator B)
    // ═══════════════════════════════════════════════════════════════════════════

    function _submitContractBatchB(OperatorSubmitter operatorSubmitter, uint256 batchFee) internal {
        vm.startBroadcast(OPERATOR_B_PRIVATE_KEY);

        // Build batch arrays (2 contracts)
        bytes32[] memory namespaceHashes = new bytes32[](2);
        bytes32[] memory chainRefs = new bytes32[](2);
        bytes32[] memory contractIds = new bytes32[](2);

        bytes32 eip155Namespace = CAIP10.NAMESPACE_EIP155;

        namespaceHashes[0] = eip155Namespace;
        namespaceHashes[1] = eip155Namespace;
        chainRefs[0] = bytes32(0);
        chainRefs[1] = bytes32(0);

        contractIds[0] = bytes32(uint256(uint160(SCAM_CONTRACT_6)));
        contractIds[1] = bytes32(uint256(uint160(SCAM_CONTRACT_7)));

        console2.log("  Contracts: 2");
        console2.log("    - ", SCAM_CONTRACT_6);
        console2.log("    - ", SCAM_CONTRACT_7);

        // Submit batch with fee
        operatorSubmitter.registerContractsAsOperator{ value: batchFee }(namespaceHashes, chainRefs, contractIds);

        console2.log("  Status: REGISTERED");

        vm.stopBroadcast();
    }
}
