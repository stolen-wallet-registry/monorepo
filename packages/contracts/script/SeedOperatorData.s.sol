// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { FraudulentContractRegistry } from "../src/registries/FraudulentContractRegistry.sol";
import { StolenWalletRegistry } from "../src/registries/StolenWalletRegistry.sol";
import { StolenTransactionRegistry } from "../src/registries/StolenTransactionRegistry.sol";
import { OperatorRegistry } from "../src/OperatorRegistry.sol";
import { FeeManager } from "../src/FeeManager.sol";
import { MerkleRootComputation } from "../src/libraries/MerkleRootComputation.sol";

/// @title SeedOperatorData
/// @notice Seeds operator data: batches for all three registries (wallets, transactions, contracts)
/// @dev Run after deploying contracts to populate dashboard test data
///
/// Usage:
/// ```bash
/// # Local (after deploy:crosschain)
/// pnpm seed:operators
///
/// # Or with custom addresses
/// OPERATOR_REGISTRY=0x... forge script script/SeedOperatorData.s.sol --rpc-url localhost --broadcast
/// ```
contract SeedOperatorData is Script {
    // ═══════════════════════════════════════════════════════════════════════════
    // CONTRACT ADDRESSES
    // ═══════════════════════════════════════════════════════════════════════════
    // Source of truth: packages/chains/src/networks/anvil-hub.ts
    // Keep in sync with @swr/chains hubContracts
    address constant DEFAULT_OPERATOR_REGISTRY = 0x0B306BF915C4d645ff596e518fAf3F9669b97016;
    address constant DEFAULT_STOLEN_WALLET_REGISTRY = 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9;
    address constant DEFAULT_STOLEN_TX_REGISTRY = 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9;
    address constant DEFAULT_FRAUDULENT_CONTRACT_REGISTRY = 0x59b670e9fA9D0A427751Af201D676719a970857b;
    address constant DEFAULT_FEE_MANAGER = 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512;

    // ═══════════════════════════════════════════════════════════════════════════
    // OPERATOR ACCOUNTS
    // ═══════════════════════════════════════════════════════════════════════════
    // Account 3 (Operator A - ALL capabilities: WALLET + TX + CONTRACT)
    uint256 constant OPERATOR_A_PRIVATE_KEY = 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6;
    address constant OPERATOR_A_ADDRESS = 0x90F79bf6EB2c4f870365E785982E1f101E93b906;

    // Account 4 (Operator B - CONTRACT only)
    uint256 constant OPERATOR_B_PRIVATE_KEY = 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a;
    address constant OPERATOR_B_ADDRESS = 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65;

    // ═══════════════════════════════════════════════════════════════════════════
    // CHAIN IDS (CAIP-2 format as bytes32)
    // ═══════════════════════════════════════════════════════════════════════════
    bytes32 constant CHAIN_ID_ETH_MAINNET = bytes32("eip155:1");
    bytes32 constant CHAIN_ID_BASE = bytes32("eip155:8453");
    bytes32 constant CHAIN_ID_ARBITRUM = bytes32("eip155:42161");
    bytes32 constant CHAIN_ID_LOCAL = bytes32("eip155:31337");

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

    function run() external {
        // Load contract addresses (env vars or defaults)
        address operatorRegistryAddr = vm.envOr("OPERATOR_REGISTRY", DEFAULT_OPERATOR_REGISTRY);
        address walletRegistryAddr = vm.envOr("STOLEN_WALLET_REGISTRY", DEFAULT_STOLEN_WALLET_REGISTRY);
        address txRegistryAddr = vm.envOr("STOLEN_TX_REGISTRY", DEFAULT_STOLEN_TX_REGISTRY);
        address contractRegistryAddr = vm.envOr("FRAUDULENT_CONTRACT_REGISTRY", DEFAULT_FRAUDULENT_CONTRACT_REGISTRY);

        console2.log("");
        console2.log("==========================================");
        console2.log("=== SEEDING OPERATOR DATA ===");
        console2.log("==========================================");
        console2.log("");
        console2.log("Contracts:");
        console2.log("  OperatorRegistry:", operatorRegistryAddr);
        console2.log("  StolenWalletRegistry:", walletRegistryAddr);
        console2.log("  StolenTransactionRegistry:", txRegistryAddr);
        console2.log("  FraudulentContractRegistry:", contractRegistryAddr);
        console2.log("");
        console2.log("Operators:");
        console2.log("  Operator A (ALL caps):", OPERATOR_A_ADDRESS);
        console2.log("  Operator B (CONTRACT only):", OPERATOR_B_ADDRESS);
        console2.log("");

        // Instantiate contracts
        OperatorRegistry opRegistry = OperatorRegistry(operatorRegistryAddr);
        StolenWalletRegistry walletRegistry = StolenWalletRegistry(walletRegistryAddr);
        StolenTransactionRegistry txRegistry = StolenTransactionRegistry(txRegistryAddr);
        FraudulentContractRegistry contractRegistry = FraudulentContractRegistry(contractRegistryAddr);

        // Verify operators are approved
        console2.log("--- VERIFYING OPERATORS ---");
        bool opAApproved = opRegistry.isApproved(OPERATOR_A_ADDRESS);
        bool opBApproved = opRegistry.isApproved(OPERATOR_B_ADDRESS);
        console2.log("  Operator A approved:", opAApproved);
        console2.log("  Operator B approved:", opBApproved);

        if (!opAApproved || !opBApproved) {
            console2.log("");
            console2.log("ERROR: Operators not approved. Run deploy:crosschain first.");
            return;
        }

        // Check if already seeded (contract batch 1 would exist)
        bytes32 checkBatchId =
            _computeContractBatchId(OPERATOR_A_ADDRESS, CHAIN_ID_ETH_MAINNET, SCAM_CONTRACT_1, SCAM_CONTRACT_2);
        if (contractRegistry.isBatchRegistered(checkBatchId)) {
            console2.log("");
            console2.log("Operator data already seeded, skipping...");
            return;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // SUBMIT STOLEN WALLET BATCHES (Operator A only - has WALLET permission)
        // ═══════════════════════════════════════════════════════════════════════
        console2.log("");
        console2.log("--- STOLEN WALLET BATCHES (Operator A) ---");
        _submitWalletBatches(walletRegistry);

        // ═══════════════════════════════════════════════════════════════════════
        // SUBMIT STOLEN TRANSACTION BATCHES (Operator A only - has TX permission)
        // ═══════════════════════════════════════════════════════════════════════
        console2.log("");
        console2.log("--- STOLEN TRANSACTION BATCHES (Operator A) ---");
        _submitTransactionBatches(txRegistry);

        // ═══════════════════════════════════════════════════════════════════════
        // SUBMIT FRAUDULENT CONTRACT BATCHES (Both operators)
        // ═══════════════════════════════════════════════════════════════════════
        console2.log("");
        console2.log("--- FRAUDULENT CONTRACT BATCHES (Operator A) ---");
        _submitOperatorAContractBatches(contractRegistry);

        console2.log("");
        console2.log("--- FRAUDULENT CONTRACT BATCHES (Operator B) ---");
        _submitOperatorBContractBatches(contractRegistry);

        // Summary
        console2.log("");
        console2.log("==========================================");
        console2.log("=== SEEDING COMPLETE ===");
        console2.log("==========================================");
        console2.log("");
        console2.log("Summary:");
        console2.log("  Stolen Wallets: 4 wallets in 1 batch");
        console2.log("  Stolen Transactions: 4 txs in 1 batch");
        console2.log("  Fraudulent Contracts: 7 contracts in 3 batches");
        console2.log("");
        console2.log("Dashboard Test Data:");
        console2.log("  - Search for 0xaaaa...0001 (stolen wallet)");
        console2.log("  - Search for 0xbbbb...0001 (stolen transaction)");
        console2.log("  - Search for 0x1111...1111 (fraudulent contract)");
        console2.log("  - View operator activity in Operators Table");
        console2.log("");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WALLET BATCH SUBMISSION
    // ═══════════════════════════════════════════════════════════════════════════

    function _submitWalletBatches(StolenWalletRegistry walletRegistry) internal {
        // Use operator batch fee, not individual registration fee
        uint256 fee = walletRegistry.quoteOperatorBatchRegistration();
        console2.log("  Operator batch fee (wei):", fee);
        console2.log("");

        vm.startBroadcast(OPERATOR_A_PRIVATE_KEY);

        // Batch: 4 stolen wallets across different chains
        {
            address[] memory wallets = new address[](4);
            bytes32[] memory chainIds = new bytes32[](4);

            wallets[0] = STOLEN_WALLET_1;
            wallets[1] = STOLEN_WALLET_2;
            wallets[2] = STOLEN_WALLET_3;
            wallets[3] = STOLEN_WALLET_4;
            chainIds[0] = CHAIN_ID_ETH_MAINNET;
            chainIds[1] = CHAIN_ID_BASE;
            chainIds[2] = CHAIN_ID_ARBITRUM;
            chainIds[3] = CHAIN_ID_LOCAL;

            bytes32 merkleRoot = _computeAddressMerkleRoot(wallets, chainIds);

            console2.log("  Batch: Stolen Wallets");
            console2.log("    Wallets: 4");
            console2.log("      - ", STOLEN_WALLET_1, " (Ethereum)");
            console2.log("      - ", STOLEN_WALLET_2, " (Base)");
            console2.log("      - ", STOLEN_WALLET_3, " (Arbitrum)");
            console2.log("      - ", STOLEN_WALLET_4, " (Local)");
            console2.log("    MerkleRoot:", vm.toString(merkleRoot));

            walletRegistry.registerBatchAsOperator{ value: fee }(merkleRoot, CHAIN_ID_ETH_MAINNET, wallets, chainIds);
            console2.log("    Status: REGISTERED");
        }

        vm.stopBroadcast();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TRANSACTION BATCH SUBMISSION
    // ═══════════════════════════════════════════════════════════════════════════

    function _submitTransactionBatches(StolenTransactionRegistry txRegistry) internal {
        // Use operator batch fee from FeeManager (StolenTransactionRegistry doesn't have dedicated method)
        FeeManager feeManager = FeeManager(DEFAULT_FEE_MANAGER);
        uint256 fee = feeManager.operatorBatchFeeWei();
        console2.log("  Operator batch fee (wei):", fee);
        console2.log("");

        vm.startBroadcast(OPERATOR_A_PRIVATE_KEY);

        // Batch: 4 stolen transactions across different chains
        {
            bytes32[] memory txHashes = new bytes32[](4);
            bytes32[] memory chainIds = new bytes32[](4);

            txHashes[0] = STOLEN_TX_1;
            txHashes[1] = STOLEN_TX_2;
            txHashes[2] = STOLEN_TX_3;
            txHashes[3] = STOLEN_TX_4;
            chainIds[0] = CHAIN_ID_ETH_MAINNET;
            chainIds[1] = CHAIN_ID_BASE;
            chainIds[2] = CHAIN_ID_ARBITRUM;
            chainIds[3] = CHAIN_ID_LOCAL;

            bytes32 merkleRoot = _computeTxMerkleRoot(txHashes, chainIds);

            console2.log("  Batch: Stolen Transactions");
            console2.log("    Transactions: 4");
            console2.log("    MerkleRoot:", vm.toString(merkleRoot));

            txRegistry.registerBatchAsOperator{ value: fee }(merkleRoot, CHAIN_ID_ETH_MAINNET, txHashes, chainIds);
            console2.log("    Status: REGISTERED");
        }

        vm.stopBroadcast();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONTRACT BATCH SUBMISSION
    // ═══════════════════════════════════════════════════════════════════════════

    function _submitOperatorAContractBatches(FraudulentContractRegistry contractRegistry) internal {
        uint256 fee = contractRegistry.quoteRegistration();
        console2.log("  Operator batch fee (wei):", fee);
        console2.log("");

        vm.startBroadcast(OPERATOR_A_PRIVATE_KEY);

        // Batch 1: Ethereum mainnet scam contracts (2 contracts)
        {
            address[] memory contracts = new address[](2);
            bytes32[] memory chainIds = new bytes32[](2);

            contracts[0] = SCAM_CONTRACT_1;
            contracts[1] = SCAM_CONTRACT_2;
            chainIds[0] = CHAIN_ID_ETH_MAINNET;
            chainIds[1] = CHAIN_ID_ETH_MAINNET;

            bytes32 merkleRoot = _computeAddressMerkleRoot(contracts, chainIds);
            bytes32 batchId = contractRegistry.computeBatchId(merkleRoot, OPERATOR_A_ADDRESS, CHAIN_ID_ETH_MAINNET);

            console2.log("  Batch 1: Ethereum Mainnet Scams");
            console2.log("    Chain: eip155:1 (Ethereum)");
            console2.log("    Contracts: 2");
            console2.log("      - ", SCAM_CONTRACT_1);
            console2.log("      - ", SCAM_CONTRACT_2);
            console2.log("    MerkleRoot:", vm.toString(merkleRoot));
            console2.log("    BatchId:", vm.toString(batchId));

            contractRegistry.registerBatch{ value: fee }(merkleRoot, CHAIN_ID_ETH_MAINNET, contracts, chainIds);
            console2.log("    Status: REGISTERED");
            console2.log("");
        }

        // Batch 2: Multi-chain scam contracts (3 contracts across different chains)
        {
            address[] memory contracts = new address[](3);
            bytes32[] memory chainIds = new bytes32[](3);

            contracts[0] = SCAM_CONTRACT_3;
            contracts[1] = SCAM_CONTRACT_4;
            contracts[2] = SCAM_CONTRACT_5;
            chainIds[0] = CHAIN_ID_BASE;
            chainIds[1] = CHAIN_ID_LOCAL;
            chainIds[2] = CHAIN_ID_ARBITRUM;

            bytes32 merkleRoot = _computeAddressMerkleRoot(contracts, chainIds);
            bytes32 batchId = contractRegistry.computeBatchId(merkleRoot, OPERATOR_A_ADDRESS, CHAIN_ID_BASE);

            console2.log("  Batch 2: Multi-Chain Scams");
            console2.log("    Primary Chain: eip155:8453 (Base)");
            console2.log("    Contracts: 3");
            console2.log("      - ", SCAM_CONTRACT_3, " (Base)");
            console2.log("      - ", SCAM_CONTRACT_4, " (Local)");
            console2.log("      - ", SCAM_CONTRACT_5, " (Arbitrum)");
            console2.log("    MerkleRoot:", vm.toString(merkleRoot));
            console2.log("    BatchId:", vm.toString(batchId));

            contractRegistry.registerBatch{ value: fee }(merkleRoot, CHAIN_ID_BASE, contracts, chainIds);
            console2.log("    Status: REGISTERED");
        }

        vm.stopBroadcast();
    }

    function _submitOperatorBContractBatches(FraudulentContractRegistry contractRegistry) internal {
        uint256 fee = contractRegistry.quoteRegistration();
        console2.log("  Operator batch fee (wei):", fee);
        console2.log("");

        vm.startBroadcast(OPERATOR_B_PRIVATE_KEY);

        // Batch 1: Arbitrum honeypot contracts (2 contracts)
        {
            address[] memory contracts = new address[](2);
            bytes32[] memory chainIds = new bytes32[](2);

            contracts[0] = SCAM_CONTRACT_6;
            contracts[1] = SCAM_CONTRACT_7;
            chainIds[0] = CHAIN_ID_ARBITRUM;
            chainIds[1] = CHAIN_ID_ARBITRUM;

            bytes32 merkleRoot = _computeAddressMerkleRoot(contracts, chainIds);
            bytes32 batchId = contractRegistry.computeBatchId(merkleRoot, OPERATOR_B_ADDRESS, CHAIN_ID_ARBITRUM);

            console2.log("  Batch 1: Arbitrum Honeypots");
            console2.log("    Chain: eip155:42161 (Arbitrum)");
            console2.log("    Contracts: 2");
            console2.log("      - ", SCAM_CONTRACT_6);
            console2.log("      - ", SCAM_CONTRACT_7);
            console2.log("    MerkleRoot:", vm.toString(merkleRoot));
            console2.log("    BatchId:", vm.toString(batchId));

            contractRegistry.registerBatch{ value: fee }(merkleRoot, CHAIN_ID_ARBITRUM, contracts, chainIds);
            console2.log("    Status: REGISTERED");
        }

        vm.stopBroadcast();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MERKLE ROOT COMPUTATION HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Compute merkle root for address-based entries (wallets, contracts)
    function _computeAddressMerkleRoot(address[] memory addresses, bytes32[] memory chainIds)
        internal
        pure
        returns (bytes32)
    {
        uint256 length = addresses.length;
        if (length == 0) return bytes32(0);

        bytes32[] memory leaves = new bytes32[](length);
        for (uint256 i = 0; i < length; i++) {
            leaves[i] = MerkleRootComputation.hashLeaf(addresses[i], chainIds[i]);
        }

        return MerkleRootComputation.computeRoot(leaves);
    }

    /// @notice Compute merkle root for transaction hash entries
    function _computeTxMerkleRoot(bytes32[] memory txHashes, bytes32[] memory chainIds)
        internal
        pure
        returns (bytes32)
    {
        uint256 length = txHashes.length;
        if (length == 0) return bytes32(0);

        bytes32[] memory leaves = new bytes32[](length);
        for (uint256 i = 0; i < length; i++) {
            leaves[i] = MerkleRootComputation.hashLeaf(txHashes[i], chainIds[i]);
        }

        return MerkleRootComputation.computeRoot(leaves);
    }

    /// @notice Compute batch ID for contract registry (for seeding check)
    function _computeContractBatchId(address operator, bytes32 reportedChainId, address contract1, address contract2)
        internal
        pure
        returns (bytes32)
    {
        address[] memory contracts = new address[](2);
        bytes32[] memory chainIds = new bytes32[](2);
        contracts[0] = contract1;
        contracts[1] = contract2;
        chainIds[0] = reportedChainId;
        chainIds[1] = reportedChainId;

        bytes32 merkleRoot = _computeAddressMerkleRoot(contracts, chainIds);
        return keccak256(abi.encode(merkleRoot, operator, reportedChainId));
    }
}
