// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { StolenTransactionRegistry } from "../src/registries/StolenTransactionRegistry.sol";
import { IStolenTransactionRegistry } from "../src/interfaces/IStolenTransactionRegistry.sol";
import { OperatorRegistry } from "../src/OperatorRegistry.sol";
import { MerkleRootComputation } from "../src/libraries/MerkleRootComputation.sol";
import { CAIP2 } from "../src/libraries/CAIP2.sol";

/// @title StolenTransactionRegistryOperatorTest
/// @notice Tests for operator batch functionality in StolenTransactionRegistry
contract StolenTransactionRegistryOperatorTest is Test {
    StolenTransactionRegistry public registry;
    OperatorRegistry public operatorRegistry;

    address public dao;
    address public operator;
    address public nonOperator;

    uint256 internal constant GRACE_BLOCKS = 10;
    uint256 internal constant DEADLINE_BLOCKS = 50;
    uint8 internal constant TX_REGISTRY_CAPABILITY = 0x02;

    // Test transaction data
    bytes32 internal txHash1;
    bytes32 internal txHash2;
    bytes32 internal txHash3;
    bytes32 internal chainId;
    bytes32 internal merkleRoot;

    function setUp() public {
        dao = makeAddr("dao");
        operator = makeAddr("operator");
        nonOperator = makeAddr("nonOperator");

        vm.startPrank(dao);

        // Deploy operator registry
        operatorRegistry = new OperatorRegistry(dao);

        // Deploy transaction registry with dao as owner
        registry = new StolenTransactionRegistry(dao, address(0), address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);

        // Wire operator registry
        registry.setOperatorRegistry(address(operatorRegistry));

        // Approve operator for transaction registry capability
        operatorRegistry.approveOperator(operator, TX_REGISTRY_CAPABILITY, "Test Operator");

        vm.stopPrank();

        // Set up test transaction data
        txHash1 = keccak256("tx1");
        txHash2 = keccak256("tx2");
        txHash3 = keccak256("tx3");
        chainId = CAIP2.fromEIP155(8453); // Base mainnet

        // Compute merkle root for test transactions
        merkleRoot = _computeTestMerkleRoot();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Compute merkle root from test transactions (sorted by leaf hash)
    /// @dev Sorts leaves before computing to match contract's computeRootFromSorted
    function _computeTestMerkleRoot() internal view returns (bytes32) {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _getTestTransactions();
        return _computeRoot(txHashes, chainIds);
    }

    /// @notice Get test transactions sorted by their leaf hash
    /// @dev Returns transactions in the same order as merkle root computation expects
    function _getTestTransactions() internal view returns (bytes32[] memory txHashes, bytes32[] memory chainIds) {
        txHashes = new bytes32[](3);
        chainIds = new bytes32[](3);
        txHashes[0] = txHash1;
        txHashes[1] = txHash2;
        txHashes[2] = txHash3;
        chainIds[0] = chainId;
        chainIds[1] = chainId;
        chainIds[2] = chainId;

        // Sort by leaf hash (contract requires pre-sorted leaves)
        _sortByLeafHash(txHashes, chainIds);
    }

    /// @notice Compute merkle root and sort arrays in place
    function _computeRoot(bytes32[] memory txHashes, bytes32[] memory chainIds) internal pure returns (bytes32) {
        uint256 length = txHashes.length;
        if (length == 0) return bytes32(0);
        if (length == 1) {
            return MerkleRootComputation.hashLeaf(txHashes[0], chainIds[0]);
        }

        // Build leaves
        bytes32[] memory leaves = new bytes32[](length);
        for (uint256 i = 0; i < length; i++) {
            leaves[i] = MerkleRootComputation.hashLeaf(txHashes[i], chainIds[i]);
        }

        // Sort leaves AND txHashes/chainIds together
        for (uint256 i = 1; i < length; i++) {
            bytes32 keyLeaf = leaves[i];
            bytes32 keyTxHash = txHashes[i];
            bytes32 keyChainId = chainIds[i];
            uint256 j = i;
            while (j > 0 && leaves[j - 1] > keyLeaf) {
                leaves[j] = leaves[j - 1];
                txHashes[j] = txHashes[j - 1];
                chainIds[j] = chainIds[j - 1];
                j--;
            }
            leaves[j] = keyLeaf;
            txHashes[j] = keyTxHash;
            chainIds[j] = keyChainId;
        }

        return MerkleRootComputation.computeRootFromSorted(leaves);
    }

    /// @notice Sort txHashes and chainIds by their leaf hash
    function _sortByLeafHash(bytes32[] memory txHashes, bytes32[] memory chainIds) internal pure {
        uint256 length = txHashes.length;
        if (length <= 1) return;

        // Build leaves
        bytes32[] memory leaves = new bytes32[](length);
        for (uint256 i = 0; i < length; i++) {
            leaves[i] = MerkleRootComputation.hashLeaf(txHashes[i], chainIds[i]);
        }

        // Sort leaves AND txHashes/chainIds together
        for (uint256 i = 1; i < length; i++) {
            bytes32 keyLeaf = leaves[i];
            bytes32 keyTxHash = txHashes[i];
            bytes32 keyChainId = chainIds[i];
            uint256 j = i;
            while (j > 0 && leaves[j - 1] > keyLeaf) {
                leaves[j] = leaves[j - 1];
                txHashes[j] = txHashes[j - 1];
                chainIds[j] = chainIds[j - 1];
                j--;
            }
            leaves[j] = keyLeaf;
            txHashes[j] = keyTxHash;
            chainIds[j] = keyChainId;
        }
    }

    function _computeBatchId(bytes32 root, address op, bytes32 reportedChainId) internal pure returns (bytes32) {
        return keccak256(abi.encode(root, op, reportedChainId));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REGISTRATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Approved operators can register transaction batches without two-phase flow.
    function test_RegisterBatchAsOperator_Success() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _getTestTransactions();

        vm.prank(operator);
        registry.registerBatchAsOperator(merkleRoot, chainId, txHashes, chainIds);

        bytes32 batchId = _computeBatchId(merkleRoot, operator, chainId);
        assertTrue(registry.isOperatorBatchRegistered(batchId));

        IStolenTransactionRegistry.OperatorTransactionBatch memory batch = registry.getOperatorBatch(batchId);
        assertEq(batch.merkleRoot, merkleRoot);
        assertEq(batch.operator, operator);
        assertEq(batch.reportedChainId, chainId);
        assertEq(batch.transactionCount, 3);
        assertFalse(batch.invalidated);
    }

    // Registration should emit TransactionBatchRegisteredByOperator event.
    function test_RegisterBatchAsOperator_EmitsEvent() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _getTestTransactions();
        bytes32 batchId = _computeBatchId(merkleRoot, operator, chainId);

        vm.expectEmit(true, true, true, true);
        emit IStolenTransactionRegistry.TransactionBatchRegisteredByOperator(
            batchId, merkleRoot, operator, chainId, 3, txHashes, chainIds
        );

        vm.prank(operator);
        registry.registerBatchAsOperator(merkleRoot, chainId, txHashes, chainIds);
    }

    // Non-operators must be rejected.
    function test_RegisterBatchAsOperator_NotApprovedOperator_Reverts() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _getTestTransactions();

        vm.prank(nonOperator);
        vm.expectRevert(IStolenTransactionRegistry.StolenTransactionRegistry__NotApprovedOperator.selector);
        registry.registerBatchAsOperator(merkleRoot, chainId, txHashes, chainIds);
    }

    // Registration without operator registry set must fail.
    function test_RegisterBatchAsOperator_NoOperatorRegistry_Reverts() public {
        // Deploy a fresh registry without operator registry
        vm.prank(dao);
        StolenTransactionRegistry freshRegistry =
            new StolenTransactionRegistry(dao, address(0), address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);

        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _getTestTransactions();

        vm.prank(operator);
        vm.expectRevert(IStolenTransactionRegistry.StolenTransactionRegistry__NotApprovedOperator.selector);
        freshRegistry.registerBatchAsOperator(merkleRoot, chainId, txHashes, chainIds);
    }

    // Zero merkle root must be rejected.
    function test_RegisterBatchAsOperator_InvalidMerkleRoot_Reverts() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _getTestTransactions();

        vm.prank(operator);
        vm.expectRevert(IStolenTransactionRegistry.StolenTransactionRegistry__InvalidMerkleRoot.selector);
        registry.registerBatchAsOperator(bytes32(0), chainId, txHashes, chainIds);
    }

    // Zero chain ID must be rejected.
    function test_RegisterBatchAsOperator_InvalidChainId_Reverts() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _getTestTransactions();

        vm.prank(operator);
        vm.expectRevert(IStolenTransactionRegistry.InvalidChainId.selector);
        registry.registerBatchAsOperator(merkleRoot, bytes32(0), txHashes, chainIds);
    }

    // Empty transaction list must be rejected.
    function test_RegisterBatchAsOperator_EmptyBatch_Reverts() public {
        bytes32[] memory emptyTxHashes = new bytes32[](0);
        bytes32[] memory emptyChainIds = new bytes32[](0);

        vm.prank(operator);
        vm.expectRevert(IStolenTransactionRegistry.StolenTransactionRegistry__InvalidTransactionCount.selector);
        registry.registerBatchAsOperator(merkleRoot, chainId, emptyTxHashes, emptyChainIds);
    }

    // Array length mismatch must be rejected.
    function test_RegisterBatchAsOperator_ArrayLengthMismatch_Reverts() public {
        bytes32[] memory txHashes = new bytes32[](3);
        bytes32[] memory chainIds = new bytes32[](2); // Different length
        txHashes[0] = txHash1;
        txHashes[1] = txHash2;
        txHashes[2] = txHash3;
        chainIds[0] = chainId;
        chainIds[1] = chainId;

        vm.prank(operator);
        vm.expectRevert(IStolenTransactionRegistry.StolenTransactionRegistry__ArrayLengthMismatch.selector);
        registry.registerBatchAsOperator(merkleRoot, chainId, txHashes, chainIds);
    }

    // Zero transaction hash in batch must be rejected.
    function test_RegisterBatchAsOperator_ZeroTransactionHash_Reverts() public {
        bytes32[] memory txHashes = new bytes32[](3);
        bytes32[] memory chainIds = new bytes32[](3);
        txHashes[0] = txHash1;
        txHashes[1] = bytes32(0); // Invalid
        txHashes[2] = txHash3;
        chainIds[0] = chainId;
        chainIds[1] = chainId;
        chainIds[2] = chainId;

        vm.prank(operator);
        vm.expectRevert(IStolenTransactionRegistry.StolenTransactionRegistry__InvalidTransactionHash.selector);
        registry.registerBatchAsOperator(merkleRoot, chainId, txHashes, chainIds);
    }

    // Zero chain ID entry in batch must be rejected.
    function test_RegisterBatchAsOperator_ZeroChainIdEntry_Reverts() public {
        bytes32[] memory txHashes = new bytes32[](3);
        bytes32[] memory chainIds = new bytes32[](3);
        txHashes[0] = txHash1;
        txHashes[1] = txHash2;
        txHashes[2] = txHash3;
        chainIds[0] = chainId;
        chainIds[1] = bytes32(0); // Invalid
        chainIds[2] = chainId;

        vm.prank(operator);
        vm.expectRevert(IStolenTransactionRegistry.StolenTransactionRegistry__InvalidChainIdEntry.selector);
        registry.registerBatchAsOperator(merkleRoot, chainId, txHashes, chainIds);
    }

    // Merkle root mismatch must be rejected.
    function test_RegisterBatchAsOperator_MerkleRootMismatch_Reverts() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _getTestTransactions();
        bytes32 wrongRoot = keccak256("wrong");

        vm.prank(operator);
        vm.expectRevert(IStolenTransactionRegistry.StolenTransactionRegistry__MerkleRootMismatch.selector);
        registry.registerBatchAsOperator(wrongRoot, chainId, txHashes, chainIds);
    }

    // Duplicate batch registration must be rejected.
    function test_RegisterBatchAsOperator_AlreadyRegistered_Reverts() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _getTestTransactions();

        vm.prank(operator);
        registry.registerBatchAsOperator(merkleRoot, chainId, txHashes, chainIds);

        vm.prank(operator);
        vm.expectRevert(IStolenTransactionRegistry.StolenTransactionRegistry__BatchAlreadyRegistered.selector);
        registry.registerBatchAsOperator(merkleRoot, chainId, txHashes, chainIds);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BATCH INVALIDATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Owner can invalidate operator batches.
    function test_InvalidateTransactionBatch_Success() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _getTestTransactions();

        vm.prank(operator);
        registry.registerBatchAsOperator(merkleRoot, chainId, txHashes, chainIds);

        bytes32 batchId = _computeBatchId(merkleRoot, operator, chainId);

        vm.prank(dao);
        registry.invalidateTransactionBatch(batchId);

        IStolenTransactionRegistry.OperatorTransactionBatch memory batch = registry.getOperatorBatch(batchId);
        assertTrue(batch.invalidated);
    }

    // Batch invalidation should emit TransactionBatchInvalidated event.
    function test_InvalidateTransactionBatch_EmitsEvent() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _getTestTransactions();

        vm.prank(operator);
        registry.registerBatchAsOperator(merkleRoot, chainId, txHashes, chainIds);

        bytes32 batchId = _computeBatchId(merkleRoot, operator, chainId);

        vm.expectEmit(true, true, true, true);
        emit IStolenTransactionRegistry.TransactionBatchInvalidated(batchId);

        vm.prank(dao);
        registry.invalidateTransactionBatch(batchId);
    }

    // Non-owner cannot invalidate batches.
    function test_InvalidateTransactionBatch_NotOwner_Reverts() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _getTestTransactions();

        vm.prank(operator);
        registry.registerBatchAsOperator(merkleRoot, chainId, txHashes, chainIds);

        bytes32 batchId = _computeBatchId(merkleRoot, operator, chainId);

        vm.prank(nonOperator);
        vm.expectRevert();
        registry.invalidateTransactionBatch(batchId);
    }

    // Invalidating non-existent batch must fail.
    function test_InvalidateTransactionBatch_NotFound_Reverts() public {
        bytes32 fakeBatchId = keccak256("fake");

        vm.prank(dao);
        vm.expectRevert(IStolenTransactionRegistry.StolenTransactionRegistry__BatchNotFound.selector);
        registry.invalidateTransactionBatch(fakeBatchId);
    }

    // Double invalidation must fail.
    function test_InvalidateTransactionBatch_AlreadyInvalidated_Reverts() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _getTestTransactions();

        vm.prank(operator);
        registry.registerBatchAsOperator(merkleRoot, chainId, txHashes, chainIds);

        bytes32 batchId = _computeBatchId(merkleRoot, operator, chainId);

        vm.prank(dao);
        registry.invalidateTransactionBatch(batchId);

        vm.prank(dao);
        vm.expectRevert(IStolenTransactionRegistry.StolenTransactionRegistry__AlreadyInvalidated.selector);
        registry.invalidateTransactionBatch(batchId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ENTRY INVALIDATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Owner can invalidate individual transaction entries.
    function test_InvalidateTransactionEntry_Success() public {
        bytes32 entryHash = MerkleRootComputation.hashLeaf(txHash1, chainId);

        vm.prank(dao);
        registry.invalidateTransactionEntry(entryHash);

        assertTrue(registry.isTransactionEntryInvalidated(entryHash));
    }

    // Entry invalidation should emit TransactionEntryInvalidated event.
    function test_InvalidateTransactionEntry_EmitsEvent() public {
        bytes32 entryHash = MerkleRootComputation.hashLeaf(txHash1, chainId);

        vm.expectEmit(true, true, true, true);
        emit IStolenTransactionRegistry.TransactionEntryInvalidated(entryHash);

        vm.prank(dao);
        registry.invalidateTransactionEntry(entryHash);
    }

    // Non-owner cannot invalidate entries.
    function test_InvalidateTransactionEntry_NotOwner_Reverts() public {
        bytes32 entryHash = MerkleRootComputation.hashLeaf(txHash1, chainId);

        vm.prank(nonOperator);
        vm.expectRevert();
        registry.invalidateTransactionEntry(entryHash);
    }

    // Double entry invalidation must fail.
    function test_InvalidateTransactionEntry_AlreadyInvalidated_Reverts() public {
        bytes32 entryHash = MerkleRootComputation.hashLeaf(txHash1, chainId);

        vm.prank(dao);
        registry.invalidateTransactionEntry(entryHash);

        vm.prank(dao);
        vm.expectRevert(IStolenTransactionRegistry.StolenTransactionRegistry__AlreadyInvalidated.selector);
        registry.invalidateTransactionEntry(entryHash);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ENTRY REINSTATEMENT TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Owner can reinstate invalidated entries.
    function test_ReinstateTransactionEntry_Success() public {
        bytes32 entryHash = MerkleRootComputation.hashLeaf(txHash1, chainId);

        vm.prank(dao);
        registry.invalidateTransactionEntry(entryHash);
        assertTrue(registry.isTransactionEntryInvalidated(entryHash));

        vm.prank(dao);
        registry.reinstateTransactionEntry(entryHash);
        assertFalse(registry.isTransactionEntryInvalidated(entryHash));
    }

    // Entry reinstatement should emit TransactionEntryReinstated event.
    function test_ReinstateTransactionEntry_EmitsEvent() public {
        bytes32 entryHash = MerkleRootComputation.hashLeaf(txHash1, chainId);

        vm.prank(dao);
        registry.invalidateTransactionEntry(entryHash);

        vm.expectEmit(true, true, true, true);
        emit IStolenTransactionRegistry.TransactionEntryReinstated(entryHash);

        vm.prank(dao);
        registry.reinstateTransactionEntry(entryHash);
    }

    // Non-owner cannot reinstate entries.
    function test_ReinstateTransactionEntry_NotOwner_Reverts() public {
        bytes32 entryHash = MerkleRootComputation.hashLeaf(txHash1, chainId);

        vm.prank(dao);
        registry.invalidateTransactionEntry(entryHash);

        vm.prank(nonOperator);
        vm.expectRevert();
        registry.reinstateTransactionEntry(entryHash);
    }

    // Reinstating non-invalidated entry must fail.
    function test_ReinstateTransactionEntry_NotInvalidated_Reverts() public {
        bytes32 entryHash = MerkleRootComputation.hashLeaf(txHash1, chainId);

        vm.prank(dao);
        vm.expectRevert(IStolenTransactionRegistry.StolenTransactionRegistry__EntryNotInvalidated.selector);
        registry.reinstateTransactionEntry(entryHash);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // isOperatorBatchRegistered returns false for unregistered batches.
    function test_IsOperatorBatchRegistered_False() public view {
        bytes32 fakeBatchId = keccak256("fake");
        assertFalse(registry.isOperatorBatchRegistered(fakeBatchId));
    }

    // getOperatorBatch returns zeroed struct for unregistered batches.
    function test_GetOperatorBatch_Unregistered() public view {
        bytes32 fakeBatchId = keccak256("fake");
        IStolenTransactionRegistry.OperatorTransactionBatch memory batch = registry.getOperatorBatch(fakeBatchId);
        assertEq(batch.merkleRoot, bytes32(0));
        assertEq(batch.operator, address(0));
        assertEq(batch.registeredAt, 0);
    }

    // isTransactionEntryInvalidated returns false for non-invalidated entries.
    function test_IsTransactionEntryInvalidated_False() public view {
        bytes32 entryHash = MerkleRootComputation.hashLeaf(txHash1, chainId);
        assertFalse(registry.isTransactionEntryInvalidated(entryHash));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OPERATOR REGISTRY CONFIGURATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Owner can set operator registry.
    function test_SetOperatorRegistry_Success() public {
        address newRegistry = makeAddr("newRegistry");

        vm.prank(dao);
        registry.setOperatorRegistry(newRegistry);

        assertEq(registry.operatorRegistry(), newRegistry);
    }

    // setOperatorRegistry should emit OperatorRegistrySet event.
    function test_SetOperatorRegistry_EmitsEvent() public {
        address newRegistry = makeAddr("newRegistry");

        vm.expectEmit(true, true, true, true);
        emit IStolenTransactionRegistry.OperatorRegistrySet(address(operatorRegistry), newRegistry);

        vm.prank(dao);
        registry.setOperatorRegistry(newRegistry);
    }

    // Non-owner cannot set operator registry.
    function test_SetOperatorRegistry_NotOwner_Reverts() public {
        address newRegistry = makeAddr("newRegistry");

        vm.prank(nonOperator);
        vm.expectRevert();
        registry.setOperatorRegistry(newRegistry);
    }
}
