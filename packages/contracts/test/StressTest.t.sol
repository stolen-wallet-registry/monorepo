// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { StolenWalletRegistry } from "../src/registries/StolenWalletRegistry.sol";
import { StolenTransactionRegistry } from "../src/registries/StolenTransactionRegistry.sol";
import { FraudulentContractRegistry } from "../src/registries/FraudulentContractRegistry.sol";
import { OperatorRegistry } from "../src/OperatorRegistry.sol";
import { MerkleRootComputation } from "../src/libraries/MerkleRootComputation.sol";
import { MerkleTestHelper } from "./helpers/MerkleTestHelper.sol";
import { CAIP2 } from "../src/libraries/CAIP2.sol";

/// @title BatchSubmissionStressTest
/// @notice Stress tests for batch submissions on Base L2 (25M gas limit)
/// @dev All test setup uses vm.pauseGasMetering() to measure only contract execution
contract BatchSubmissionStressTest is Test {
    StolenWalletRegistry public walletRegistry;
    StolenTransactionRegistry public txRegistry;
    FraudulentContractRegistry public contractRegistry;
    OperatorRegistry public operatorRegistry;

    address public dao;
    address public operator;
    bytes32 public chainId;

    uint256 internal constant GRACE_BLOCKS = 10;
    uint256 internal constant DEADLINE_BLOCKS = 50;
    uint256 internal constant BASE_GAS_LIMIT = 25_000_000;

    function setUp() public {
        dao = makeAddr("dao");
        operator = makeAddr("operator");
        chainId = CAIP2.fromEIP155(8453);

        vm.startPrank(dao);

        operatorRegistry = new OperatorRegistry(dao);
        walletRegistry = new StolenWalletRegistry(dao, address(0), address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);
        txRegistry = new StolenTransactionRegistry(dao, address(0), address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);
        contractRegistry = new FraudulentContractRegistry(dao, address(operatorRegistry), address(0), address(0));

        walletRegistry.setOperatorRegistry(address(operatorRegistry));
        txRegistry.setOperatorRegistry(address(operatorRegistry));
        operatorRegistry.approveOperator(operator, 0x07, "StressTestOperator");

        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MAX CAPACITY TESTS - One large batch per registry
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice 1500 wallet batch - validates batch scaling
    /// @dev At ~3,700 gas/entry, theoretical max is ~5,000-6,000 entries per tx
    function testWalletBatch1500() public {
        vm.pauseGasMetering();
        (address[] memory wallets, bytes32[] memory walletChainIds) = _generateWallets(1500);
        bytes32 merkleRoot = MerkleTestHelper.computeAddressRoot(wallets, walletChainIds);
        vm.resumeGasMetering();

        uint256 gasBefore = gasleft();
        vm.prank(operator);
        walletRegistry.registerBatchAsOperator(merkleRoot, chainId, wallets, walletChainIds);
        uint256 gasUsed = gasBefore - gasleft();

        assertTrue(gasUsed < 10_000_000, "Should be under 10M");
    }

    /// @notice 1500 transaction batch
    function testTxBatch1500() public {
        vm.pauseGasMetering();
        (bytes32[] memory txHashes, bytes32[] memory txChainIds) = _generateTxHashes(1500);
        bytes32 merkleRoot = MerkleTestHelper.computeBytes32Root(txHashes, txChainIds);
        vm.resumeGasMetering();

        uint256 gasBefore = gasleft();
        vm.prank(operator);
        txRegistry.registerBatchAsOperator(merkleRoot, chainId, txHashes, txChainIds);
        uint256 gasUsed = gasBefore - gasleft();

        assertTrue(gasUsed < 10_000_000, "Should be under 10M");
    }

    /// @notice 1500 contract batch
    function testContractBatch1500() public {
        vm.pauseGasMetering();
        (address[] memory contracts, bytes32[] memory contractChainIds) = _generateContracts(1500);
        bytes32 merkleRoot = MerkleTestHelper.computeAddressRoot(contracts, contractChainIds);
        vm.resumeGasMetering();

        uint256 gasBefore = gasleft();
        vm.prank(operator);
        contractRegistry.registerBatch(merkleRoot, chainId, contracts, contractChainIds);
        uint256 gasUsed = gasBefore - gasleft();

        assertTrue(gasUsed < 10_000_000, "Should be under 10M");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VALIDATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Unsorted input must revert - uses deterministic unsorted order
    function testUnsortedInputReverts() public {
        // Generate wallets and sort them to know the correct order
        address[] memory wallets = new address[](3);
        bytes32[] memory walletChainIds = new bytes32[](3);

        wallets[0] = makeAddr("a");
        wallets[1] = makeAddr("b");
        wallets[2] = makeAddr("c");
        walletChainIds[0] = chainId;
        walletChainIds[1] = chainId;
        walletChainIds[2] = chainId;

        // Make copies for sorting to get valid root
        address[] memory sortedWallets = new address[](3);
        bytes32[] memory sortedChainIds = new bytes32[](3);
        for (uint256 i = 0; i < 3; i++) {
            sortedWallets[i] = wallets[i];
            sortedChainIds[i] = walletChainIds[i];
        }

        // Get valid root from sorted data
        bytes32 merkleRoot = MerkleTestHelper.computeAddressRoot(sortedWallets, sortedChainIds);

        // Reverse the sorted order to guarantee unsorted submission
        (wallets[0], wallets[2]) = (sortedWallets[2], sortedWallets[0]);
        (walletChainIds[0], walletChainIds[2]) = (sortedChainIds[2], sortedChainIds[0]);

        vm.prank(operator);
        vm.expectRevert(MerkleRootComputation.LeavesNotSorted.selector);
        walletRegistry.registerBatchAsOperator(merkleRoot, chainId, wallets, walletChainIds);
    }

    /// @notice Old 1000 limit removed from contract registry
    function testContractRegistryNoLimit() public {
        vm.pauseGasMetering();
        (address[] memory contracts, bytes32[] memory contractChainIds) = _generateContracts(1500);
        bytes32 merkleRoot = MerkleTestHelper.computeAddressRoot(contracts, contractChainIds);
        vm.resumeGasMetering();

        vm.prank(operator);
        contractRegistry.registerBatch(merkleRoot, chainId, contracts, contractChainIds);

        bytes32 batchId = contractRegistry.computeBatchId(merkleRoot, operator, chainId);
        assertTrue(contractRegistry.isBatchRegistered(batchId));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPERS - Data Generation Only
    // ═══════════════════════════════════════════════════════════════════════════

    function _generateWallets(uint256 count) internal pure returns (address[] memory, bytes32[] memory) {
        address[] memory wallets = new address[](count);
        bytes32[] memory ids = new bytes32[](count);
        bytes32 cid = CAIP2.fromEIP155(8453);
        for (uint256 i = 0; i < count; i++) {
            wallets[i] = address(uint160(uint256(keccak256(abi.encodePacked("w", i)))));
            ids[i] = cid;
        }
        return (wallets, ids);
    }

    function _generateTxHashes(uint256 count) internal pure returns (bytes32[] memory, bytes32[] memory) {
        bytes32[] memory hashes = new bytes32[](count);
        bytes32[] memory ids = new bytes32[](count);
        bytes32 cid = CAIP2.fromEIP155(8453);
        for (uint256 i = 0; i < count; i++) {
            hashes[i] = keccak256(abi.encodePacked("t", i));
            ids[i] = cid;
        }
        return (hashes, ids);
    }

    function _generateContracts(uint256 count) internal pure returns (address[] memory, bytes32[] memory) {
        address[] memory contracts = new address[](count);
        bytes32[] memory ids = new bytes32[](count);
        bytes32 cid = CAIP2.fromEIP155(8453);
        for (uint256 i = 0; i < count; i++) {
            contracts[i] = address(uint160(uint256(keccak256(abi.encodePacked("c", i)))));
            ids[i] = cid;
        }
        return (contracts, ids);
    }
}
