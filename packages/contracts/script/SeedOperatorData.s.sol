// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { FraudulentContractRegistry } from "../src/registries/FraudulentContractRegistry.sol";
import { OperatorRegistry } from "../src/OperatorRegistry.sol";
import { MerkleRootComputation } from "../src/libraries/MerkleRootComputation.sol";

/// @title SeedOperatorData
/// @notice Seeds operator data: fraudulent contract batches for testing
/// @dev Run after deploying contracts to populate dashboard test data
///
/// Usage:
/// ```bash
/// # Local (after deploy:crosschain)
/// pnpm seed:operators
///
/// # Or with custom addresses
/// OPERATOR_REGISTRY=0x... FRAUDULENT_CONTRACT_REGISTRY=0x... forge script script/SeedOperatorData.s.sol --rpc-url localhost --broadcast
/// ```
contract SeedOperatorData is Script {
    // Default local anvil addresses (from DeployCrossChain)
    address constant DEFAULT_OPERATOR_REGISTRY = 0x0B306BF915C4d645ff596e518fAf3F9669b97016;
    address constant DEFAULT_FRAUDULENT_CONTRACT_REGISTRY = 0x59b670e9fA9D0A427751Af201D676719a970857b;

    // Anvil test accounts
    // Account 3 (Operator A - ALL capabilities)
    uint256 constant OPERATOR_A_PRIVATE_KEY = 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6;
    address constant OPERATOR_A_ADDRESS = 0x90F79bf6EB2c4f870365E785982E1f101E93b906;

    // Account 4 (Operator B - CONTRACT only)
    uint256 constant OPERATOR_B_PRIVATE_KEY = 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a;
    address constant OPERATOR_B_ADDRESS = 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65;

    // Chain IDs (CAIP-2 format as bytes32)
    bytes32 constant CHAIN_ID_ETH_MAINNET = bytes32("eip155:1");
    bytes32 constant CHAIN_ID_BASE = bytes32("eip155:8453");
    bytes32 constant CHAIN_ID_ARBITRUM = bytes32("eip155:42161");
    bytes32 constant CHAIN_ID_LOCAL = bytes32("eip155:31337");

    // Example scam contract addresses (fake addresses for testing)
    address constant SCAM_CONTRACT_1 = 0x1111111111111111111111111111111111111111;
    address constant SCAM_CONTRACT_2 = 0x2222222222222222222222222222222222222222;
    address constant SCAM_CONTRACT_3 = 0x3333333333333333333333333333333333333333;
    address constant SCAM_CONTRACT_4 = 0x4444444444444444444444444444444444444444;
    address constant SCAM_CONTRACT_5 = 0x5555555555555555555555555555555555555555;
    address constant SCAM_CONTRACT_6 = 0x6666666666666666666666666666666666666666;
    address constant SCAM_CONTRACT_7 = 0x7777777777777777777777777777777777777777;

    function run() external {
        address operatorRegistryAddr = vm.envOr("OPERATOR_REGISTRY", DEFAULT_OPERATOR_REGISTRY);
        address fraudContractRegistryAddr =
            vm.envOr("FRAUDULENT_CONTRACT_REGISTRY", DEFAULT_FRAUDULENT_CONTRACT_REGISTRY);

        console2.log("");
        console2.log("==========================================");
        console2.log("=== SEEDING OPERATOR DATA ===");
        console2.log("==========================================");
        console2.log("");
        console2.log("Contracts:");
        console2.log("  OperatorRegistry:", operatorRegistryAddr);
        console2.log("  FraudulentContractRegistry:", fraudContractRegistryAddr);
        console2.log("");
        console2.log("Operators:");
        console2.log("  Operator A (ALL caps):", OPERATOR_A_ADDRESS);
        console2.log("  Operator B (CONTRACT):", OPERATOR_B_ADDRESS);
        console2.log("");

        OperatorRegistry opRegistry = OperatorRegistry(operatorRegistryAddr);
        FraudulentContractRegistry fcRegistry = FraudulentContractRegistry(fraudContractRegistryAddr);

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

        // Check if already seeded (batch 1 would exist)
        bytes32 checkBatchId =
            _computeBatchId(OPERATOR_A_ADDRESS, CHAIN_ID_ETH_MAINNET, SCAM_CONTRACT_1, SCAM_CONTRACT_2);
        if (fcRegistry.isBatchRegistered(checkBatchId)) {
            console2.log("");
            console2.log("Operator data already seeded, skipping...");
            return;
        }

        console2.log("");
        console2.log("--- OPERATOR A: Submitting Batches ---");
        _submitOperatorABatches(fcRegistry);

        console2.log("");
        console2.log("--- OPERATOR B: Submitting Batches ---");
        _submitOperatorBBatches(fcRegistry);

        console2.log("");
        console2.log("==========================================");
        console2.log("=== SEEDING COMPLETE ===");
        console2.log("==========================================");
        console2.log("");
        console2.log("Summary:");
        console2.log("  Operator A submitted: 2 batches (5 contracts total)");
        console2.log("  Operator B submitted: 1 batch (2 contracts)");
        console2.log("  Total fraudulent contracts seeded: 7");
        console2.log("");
        console2.log("Dashboard Test Data:");
        console2.log("  - Search for 0x1111...1111 (Ethereum mainnet scam)");
        console2.log("  - Search for 0x4444...4444 (Local chain scam)");
        console2.log("  - View operator activity in Operators Table");
        console2.log("");
    }

    function _submitOperatorABatches(FraudulentContractRegistry fcRegistry) internal {
        // Query the required fee once
        uint256 fee = fcRegistry.quoteRegistration();
        console2.log("  Registration fee per batch (wei):", fee);
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

            bytes32 merkleRoot = _computeMerkleRoot(contracts, chainIds);
            bytes32 batchId = fcRegistry.computeBatchId(merkleRoot, OPERATOR_A_ADDRESS, CHAIN_ID_ETH_MAINNET);

            console2.log("  Batch 1: Ethereum Mainnet Scams");
            console2.log("    Chain: eip155:1 (Ethereum)");
            console2.log("    Contracts: 2");
            console2.log("      - ", SCAM_CONTRACT_1);
            console2.log("      - ", SCAM_CONTRACT_2);
            console2.log("    MerkleRoot:", vm.toString(merkleRoot));
            console2.log("    BatchId:", vm.toString(batchId));

            fcRegistry.registerBatch{ value: fee }(merkleRoot, CHAIN_ID_ETH_MAINNET, contracts, chainIds);
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

            bytes32 merkleRoot = _computeMerkleRoot(contracts, chainIds);
            bytes32 batchId = fcRegistry.computeBatchId(merkleRoot, OPERATOR_A_ADDRESS, CHAIN_ID_BASE);

            console2.log("  Batch 2: Multi-Chain Scams");
            console2.log("    Primary Chain: eip155:8453 (Base)");
            console2.log("    Contracts: 3");
            console2.log("      - ", SCAM_CONTRACT_3, " (Base)");
            console2.log("      - ", SCAM_CONTRACT_4, " (Local)");
            console2.log("      - ", SCAM_CONTRACT_5, " (Arbitrum)");
            console2.log("    MerkleRoot:", vm.toString(merkleRoot));
            console2.log("    BatchId:", vm.toString(batchId));

            fcRegistry.registerBatch{ value: fee }(merkleRoot, CHAIN_ID_BASE, contracts, chainIds);
            console2.log("    Status: REGISTERED");
        }

        vm.stopBroadcast();
    }

    function _submitOperatorBBatches(FraudulentContractRegistry fcRegistry) internal {
        // Query the required fee once
        uint256 fee = fcRegistry.quoteRegistration();
        console2.log("  Registration fee per batch (wei):", fee);
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

            bytes32 merkleRoot = _computeMerkleRoot(contracts, chainIds);
            bytes32 batchId = fcRegistry.computeBatchId(merkleRoot, OPERATOR_B_ADDRESS, CHAIN_ID_ARBITRUM);

            console2.log("  Batch 1: Arbitrum Honeypots");
            console2.log("    Chain: eip155:42161 (Arbitrum)");
            console2.log("    Contracts: 2");
            console2.log("      - ", SCAM_CONTRACT_6);
            console2.log("      - ", SCAM_CONTRACT_7);
            console2.log("    MerkleRoot:", vm.toString(merkleRoot));
            console2.log("    BatchId:", vm.toString(batchId));

            fcRegistry.registerBatch{ value: fee }(merkleRoot, CHAIN_ID_ARBITRUM, contracts, chainIds);
            console2.log("    Status: REGISTERED");
        }

        vm.stopBroadcast();
    }

    /// @notice Compute merkle root for a batch (duplicates contract logic for script)
    function _computeMerkleRoot(address[] memory contractAddresses, bytes32[] memory chainIds)
        internal
        pure
        returns (bytes32)
    {
        uint256 length = contractAddresses.length;
        if (length == 0) return bytes32(0);

        bytes32[] memory leaves = new bytes32[](length);
        for (uint256 i = 0; i < length; i++) {
            leaves[i] = MerkleRootComputation.hashLeaf(contractAddresses[i], chainIds[i]);
        }

        return MerkleRootComputation.computeRoot(leaves);
    }

    /// @notice Compute batch ID for checking if already seeded
    function _computeBatchId(address operator, bytes32 reportedChainId, address contract1, address contract2)
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

        bytes32 merkleRoot = _computeMerkleRoot(contracts, chainIds);
        return keccak256(abi.encode(merkleRoot, operator, reportedChainId));
    }
}
