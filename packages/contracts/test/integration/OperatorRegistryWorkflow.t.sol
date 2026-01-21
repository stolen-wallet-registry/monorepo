// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { OperatorRegistry } from "../../src/OperatorRegistry.sol";
import { StolenWalletRegistry } from "../../src/registries/StolenWalletRegistry.sol";
import { StolenTransactionRegistry } from "../../src/registries/StolenTransactionRegistry.sol";
import { FraudulentContractRegistry } from "../../src/registries/FraudulentContractRegistry.sol";
import { IStolenWalletRegistry } from "../../src/interfaces/IStolenWalletRegistry.sol";
import { IStolenTransactionRegistry } from "../../src/interfaces/IStolenTransactionRegistry.sol";
import { IFraudulentContractRegistry } from "../../src/interfaces/IFraudulentContractRegistry.sol";
import { MerkleRootComputation } from "../../src/libraries/MerkleRootComputation.sol";
import { CAIP2 } from "../../src/libraries/CAIP2.sol";

/// @title OperatorRegistryWorkflowTest
/// @notice Integration tests for operator batch registration across all registries
contract OperatorRegistryWorkflowTest is Test {
    OperatorRegistry public operatorRegistry;
    StolenWalletRegistry public walletRegistry;
    StolenTransactionRegistry public txRegistry;
    FraudulentContractRegistry public contractRegistry;

    address public dao;
    address public walletOperator;
    address public txOperator;
    address public contractOperator;
    address public fullOperator;

    uint256 internal constant GRACE_BLOCKS = 10;
    uint256 internal constant DEADLINE_BLOCKS = 50;

    // Capability constants
    uint8 internal constant WALLET_CAPABILITY = 0x01;
    uint8 internal constant TX_CAPABILITY = 0x02;
    uint8 internal constant CONTRACT_CAPABILITY = 0x04;
    uint8 internal constant ALL_CAPABILITIES = 0x07;

    bytes32 internal chainId;

    function setUp() public {
        dao = makeAddr("dao");
        walletOperator = makeAddr("walletOperator");
        txOperator = makeAddr("txOperator");
        contractOperator = makeAddr("contractOperator");
        fullOperator = makeAddr("fullOperator");

        chainId = CAIP2.fromEIP155(8453); // Base mainnet

        vm.startPrank(dao);

        // Deploy operator registry
        operatorRegistry = new OperatorRegistry(dao);

        // Deploy registries
        walletRegistry = new StolenWalletRegistry(dao, address(0), address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);
        txRegistry = new StolenTransactionRegistry(dao, address(0), address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);
        contractRegistry = new FraudulentContractRegistry(dao, address(operatorRegistry), address(0), address(0));

        // Wire operator registry to registries
        walletRegistry.setOperatorRegistry(address(operatorRegistry));
        txRegistry.setOperatorRegistry(address(operatorRegistry));

        // Approve operators with specific capabilities
        operatorRegistry.approveOperator(walletOperator, WALLET_CAPABILITY, "Wallet Security Inc");
        operatorRegistry.approveOperator(txOperator, TX_CAPABILITY, "Transaction Monitor LLC");
        operatorRegistry.approveOperator(contractOperator, CONTRACT_CAPABILITY, "Contract Auditor Corp");
        operatorRegistry.approveOperator(fullOperator, ALL_CAPABILITIES, "Full Security Suite");

        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CROSS-REGISTRY WORKFLOW TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // An operator with wallet capability can register wallet batches but not others.
    function test_WalletOperator_CanOnlyRegisterWallets() public {
        // Create wallet batch data
        address[] memory wallets = new address[](2);
        bytes32[] memory walletChainIds = new bytes32[](2);
        wallets[0] = makeAddr("stolenWallet1");
        wallets[1] = makeAddr("stolenWallet2");
        walletChainIds[0] = chainId;
        walletChainIds[1] = chainId;

        bytes32[] memory leaves = new bytes32[](2);
        leaves[0] = MerkleRootComputation.hashLeaf(wallets[0], walletChainIds[0]);
        leaves[1] = MerkleRootComputation.hashLeaf(wallets[1], walletChainIds[1]);
        bytes32 walletMerkleRoot = MerkleRootComputation.computeRoot(leaves);

        // Wallet operator CAN register wallet batches
        vm.prank(walletOperator);
        walletRegistry.registerBatchAsOperator(walletMerkleRoot, chainId, wallets, walletChainIds);

        bytes32 walletBatchId = keccak256(abi.encode(walletMerkleRoot, walletOperator, chainId));
        assertTrue(walletRegistry.isWalletBatchRegistered(walletBatchId));

        // Wallet operator CANNOT register transaction batches
        bytes32[] memory txHashes = new bytes32[](2);
        bytes32[] memory txChainIds = new bytes32[](2);
        txHashes[0] = keccak256("tx1");
        txHashes[1] = keccak256("tx2");
        txChainIds[0] = chainId;
        txChainIds[1] = chainId;

        bytes32[] memory txLeaves = new bytes32[](2);
        txLeaves[0] = MerkleRootComputation.hashLeaf(txHashes[0], txChainIds[0]);
        txLeaves[1] = MerkleRootComputation.hashLeaf(txHashes[1], txChainIds[1]);
        bytes32 txMerkleRoot = MerkleRootComputation.computeRoot(txLeaves);

        vm.prank(walletOperator);
        vm.expectRevert(IStolenTransactionRegistry.StolenTransactionRegistry__NotApprovedOperator.selector);
        txRegistry.registerBatchAsOperator(txMerkleRoot, chainId, txHashes, txChainIds);

        // Wallet operator CANNOT register contract batches
        address[] memory contracts = new address[](2);
        bytes32[] memory contractChainIds = new bytes32[](2);
        contracts[0] = makeAddr("scamContract1");
        contracts[1] = makeAddr("scamContract2");
        contractChainIds[0] = chainId;
        contractChainIds[1] = chainId;

        bytes32[] memory contractLeaves = new bytes32[](2);
        contractLeaves[0] = MerkleRootComputation.hashLeaf(contracts[0], contractChainIds[0]);
        contractLeaves[1] = MerkleRootComputation.hashLeaf(contracts[1], contractChainIds[1]);
        bytes32 contractMerkleRoot = MerkleRootComputation.computeRoot(contractLeaves);

        vm.prank(walletOperator);
        vm.expectRevert(IFraudulentContractRegistry.FraudulentContractRegistry__NotApprovedOperator.selector);
        contractRegistry.registerBatch(contractMerkleRoot, chainId, contracts, contractChainIds);
    }

    // An operator with all capabilities can register to all registries.
    function test_FullOperator_CanRegisterToAllRegistries() public {
        // Register wallet batch
        address[] memory wallets = new address[](1);
        bytes32[] memory walletChainIds = new bytes32[](1);
        wallets[0] = makeAddr("stolenWallet");
        walletChainIds[0] = chainId;

        bytes32[] memory walletLeaves = new bytes32[](1);
        walletLeaves[0] = MerkleRootComputation.hashLeaf(wallets[0], walletChainIds[0]);
        bytes32 walletMerkleRoot = MerkleRootComputation.computeRoot(walletLeaves);

        vm.prank(fullOperator);
        walletRegistry.registerBatchAsOperator(walletMerkleRoot, chainId, wallets, walletChainIds);
        assertTrue(
            walletRegistry.isWalletBatchRegistered(keccak256(abi.encode(walletMerkleRoot, fullOperator, chainId)))
        );

        // Register transaction batch
        bytes32[] memory txHashes = new bytes32[](1);
        bytes32[] memory txChainIds = new bytes32[](1);
        txHashes[0] = keccak256("tx1");
        txChainIds[0] = chainId;

        bytes32[] memory txLeaves = new bytes32[](1);
        txLeaves[0] = MerkleRootComputation.hashLeaf(txHashes[0], txChainIds[0]);
        bytes32 txMerkleRoot = MerkleRootComputation.computeRoot(txLeaves);

        vm.prank(fullOperator);
        txRegistry.registerBatchAsOperator(txMerkleRoot, chainId, txHashes, txChainIds);
        assertTrue(txRegistry.isOperatorBatchRegistered(keccak256(abi.encode(txMerkleRoot, fullOperator, chainId))));

        // Register contract batch
        address[] memory contracts = new address[](1);
        bytes32[] memory contractChainIds = new bytes32[](1);
        contracts[0] = makeAddr("scamContract");
        contractChainIds[0] = chainId;

        bytes32[] memory contractLeaves = new bytes32[](1);
        contractLeaves[0] = MerkleRootComputation.hashLeaf(contracts[0], contractChainIds[0]);
        bytes32 contractMerkleRoot = MerkleRootComputation.computeRoot(contractLeaves);

        vm.prank(fullOperator);
        contractRegistry.registerBatch(contractMerkleRoot, chainId, contracts, contractChainIds);
        assertTrue(contractRegistry.isBatchRegistered(keccak256(abi.encode(contractMerkleRoot, fullOperator, chainId))));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OPERATOR LIFECYCLE TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Revoking operator should prevent further registrations.
    function test_RevokedOperator_CannotRegister() public {
        // Create wallet batch data
        address[] memory wallets = new address[](1);
        bytes32[] memory walletChainIds = new bytes32[](1);
        wallets[0] = makeAddr("stolenWallet");
        walletChainIds[0] = chainId;

        bytes32[] memory leaves = new bytes32[](1);
        leaves[0] = MerkleRootComputation.hashLeaf(wallets[0], walletChainIds[0]);
        bytes32 merkleRoot = MerkleRootComputation.computeRoot(leaves);

        // Operator can register before revocation
        vm.prank(walletOperator);
        walletRegistry.registerBatchAsOperator(merkleRoot, chainId, wallets, walletChainIds);

        // Revoke operator
        vm.prank(dao);
        operatorRegistry.revokeOperator(walletOperator);

        // Create new batch data
        wallets[0] = makeAddr("stolenWallet2");
        leaves[0] = MerkleRootComputation.hashLeaf(wallets[0], walletChainIds[0]);
        bytes32 newMerkleRoot = MerkleRootComputation.computeRoot(leaves);

        // Operator CANNOT register after revocation
        vm.prank(walletOperator);
        vm.expectRevert(IStolenWalletRegistry.StolenWalletRegistry__NotApprovedOperator.selector);
        walletRegistry.registerBatchAsOperator(newMerkleRoot, chainId, wallets, walletChainIds);
    }

    // Updating operator capabilities should reflect in registration permissions.
    function test_UpdatedCapabilities_ReflectInPermissions() public {
        // Transaction operator initially cannot register wallets
        address[] memory wallets = new address[](1);
        bytes32[] memory walletChainIds = new bytes32[](1);
        wallets[0] = makeAddr("stolenWallet");
        walletChainIds[0] = chainId;

        bytes32[] memory leaves = new bytes32[](1);
        leaves[0] = MerkleRootComputation.hashLeaf(wallets[0], walletChainIds[0]);
        bytes32 merkleRoot = MerkleRootComputation.computeRoot(leaves);

        vm.prank(txOperator);
        vm.expectRevert(IStolenWalletRegistry.StolenWalletRegistry__NotApprovedOperator.selector);
        walletRegistry.registerBatchAsOperator(merkleRoot, chainId, wallets, walletChainIds);

        // Grant wallet capability to tx operator
        vm.prank(dao);
        operatorRegistry.updateCapabilities(txOperator, TX_CAPABILITY | WALLET_CAPABILITY);

        // Now tx operator CAN register wallets
        vm.prank(txOperator);
        walletRegistry.registerBatchAsOperator(merkleRoot, chainId, wallets, walletChainIds);
        assertTrue(walletRegistry.isWalletBatchRegistered(keccak256(abi.encode(merkleRoot, txOperator, chainId))));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INVALIDATION WORKFLOW TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // DAO can invalidate batches across all registries.
    function test_DAO_CanInvalidateAcrossRegistries() public {
        // Register batches in all registries
        address[] memory wallets = new address[](1);
        bytes32[] memory walletChainIds = new bytes32[](1);
        wallets[0] = makeAddr("stolenWallet");
        walletChainIds[0] = chainId;
        bytes32[] memory walletLeaves = new bytes32[](1);
        walletLeaves[0] = MerkleRootComputation.hashLeaf(wallets[0], walletChainIds[0]);
        bytes32 walletMerkleRoot = MerkleRootComputation.computeRoot(walletLeaves);

        vm.prank(fullOperator);
        walletRegistry.registerBatchAsOperator(walletMerkleRoot, chainId, wallets, walletChainIds);
        bytes32 walletBatchId = keccak256(abi.encode(walletMerkleRoot, fullOperator, chainId));

        bytes32[] memory txHashes = new bytes32[](1);
        bytes32[] memory txChainIds = new bytes32[](1);
        txHashes[0] = keccak256("tx1");
        txChainIds[0] = chainId;
        bytes32[] memory txLeaves = new bytes32[](1);
        txLeaves[0] = MerkleRootComputation.hashLeaf(txHashes[0], txChainIds[0]);
        bytes32 txMerkleRoot = MerkleRootComputation.computeRoot(txLeaves);

        vm.prank(fullOperator);
        txRegistry.registerBatchAsOperator(txMerkleRoot, chainId, txHashes, txChainIds);
        bytes32 txBatchId = keccak256(abi.encode(txMerkleRoot, fullOperator, chainId));

        address[] memory contracts = new address[](1);
        bytes32[] memory contractChainIds = new bytes32[](1);
        contracts[0] = makeAddr("scamContract");
        contractChainIds[0] = chainId;
        bytes32[] memory contractLeaves = new bytes32[](1);
        contractLeaves[0] = MerkleRootComputation.hashLeaf(contracts[0], contractChainIds[0]);
        bytes32 contractMerkleRoot = MerkleRootComputation.computeRoot(contractLeaves);

        vm.prank(fullOperator);
        contractRegistry.registerBatch(contractMerkleRoot, chainId, contracts, contractChainIds);
        bytes32 contractBatchId = keccak256(abi.encode(contractMerkleRoot, fullOperator, chainId));

        // Verify all batches exist
        assertTrue(walletRegistry.isWalletBatchRegistered(walletBatchId));
        assertTrue(txRegistry.isOperatorBatchRegistered(txBatchId));
        assertTrue(contractRegistry.isBatchRegistered(contractBatchId));

        // DAO invalidates all batches
        vm.startPrank(dao);
        walletRegistry.invalidateWalletBatch(walletBatchId);
        txRegistry.invalidateTransactionBatch(txBatchId);
        contractRegistry.invalidateBatch(contractBatchId);
        vm.stopPrank();

        // Verify all batches are invalidated
        assertTrue(walletRegistry.getWalletBatch(walletBatchId).invalidated);
        assertTrue(txRegistry.getOperatorBatch(txBatchId).invalidated);
        assertTrue(contractRegistry.getBatch(contractBatchId).invalidated);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MULTI-OPERATOR SCENARIO TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Multiple operators can register non-overlapping batches.
    function test_MultipleOperators_IndependentBatches() public {
        // Wallet operator registers wallet batch
        address[] memory wallets1 = new address[](1);
        bytes32[] memory chainIds1 = new bytes32[](1);
        wallets1[0] = makeAddr("wallet1");
        chainIds1[0] = chainId;
        bytes32[] memory leaves1 = new bytes32[](1);
        leaves1[0] = MerkleRootComputation.hashLeaf(wallets1[0], chainIds1[0]);
        bytes32 root1 = MerkleRootComputation.computeRoot(leaves1);

        vm.prank(walletOperator);
        walletRegistry.registerBatchAsOperator(root1, chainId, wallets1, chainIds1);

        // Full operator registers different wallet batch
        address[] memory wallets2 = new address[](1);
        bytes32[] memory chainIds2 = new bytes32[](1);
        wallets2[0] = makeAddr("wallet2");
        chainIds2[0] = chainId;
        bytes32[] memory leaves2 = new bytes32[](1);
        leaves2[0] = MerkleRootComputation.hashLeaf(wallets2[0], chainIds2[0]);
        bytes32 root2 = MerkleRootComputation.computeRoot(leaves2);

        vm.prank(fullOperator);
        walletRegistry.registerBatchAsOperator(root2, chainId, wallets2, chainIds2);

        // Both batches should exist independently
        bytes32 batchId1 = keccak256(abi.encode(root1, walletOperator, chainId));
        bytes32 batchId2 = keccak256(abi.encode(root2, fullOperator, chainId));

        assertTrue(walletRegistry.isWalletBatchRegistered(batchId1));
        assertTrue(walletRegistry.isWalletBatchRegistered(batchId2));

        // Verify operator addresses are correctly stored
        assertEq(walletRegistry.getWalletBatch(batchId1).operator, walletOperator);
        assertEq(walletRegistry.getWalletBatch(batchId2).operator, fullOperator);
    }
}
