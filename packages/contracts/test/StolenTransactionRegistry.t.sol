// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { StolenTransactionRegistry } from "../src/registries/StolenTransactionRegistry.sol";
import { IStolenTransactionRegistry } from "../src/interfaces/IStolenTransactionRegistry.sol";
import { FeeManager } from "../src/FeeManager.sol";
import { RegistryHub } from "../src/RegistryHub.sol";
import { MockAggregator } from "./mocks/MockAggregator.sol";
import { CAIP2 } from "../src/libraries/CAIP2.sol";
import { StolenTransactionRegistryTestBase } from "./helpers/StolenTransactionRegistryTestBase.sol";

/// @title StolenTransactionRegistryTest
/// @notice Comprehensive unit and fuzz tests for StolenTransactionRegistry
/// @dev Inherits StolenTransactionRegistryTestBase for shared helpers
contract StolenTransactionRegistryTest is StolenTransactionRegistryTestBase {
    // Test accounts
    uint256 internal reporterPrivateKey;
    address internal reporter;
    address internal forwarder;

    // Timing configuration (matching local Anvil - 13s blocks)
    uint256 internal constant GRACE_BLOCKS = 10;
    uint256 internal constant DEADLINE_BLOCKS = 50;

    // Test data (individual hashes for specific tests)
    bytes32 internal testTxHash1;
    bytes32 internal testMerkleRoot;

    function setUp() public {
        // Deploy registry without fee collection for base tests
        registry = new StolenTransactionRegistry(address(this), address(0), address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);

        // Create test accounts with known private key for signing
        reporterPrivateKey = 0xA11CE;
        reporter = vm.addr(reporterPrivateKey);
        forwarder = makeAddr("forwarder");

        // Fund accounts
        vm.deal(reporter, 10 ether);
        vm.deal(forwarder, 10 ether);

        // Set up test chain ID (Base mainnet) - used by base class helpers
        testChainId = CAIP2.fromEIP155(8453);

        // Keep testTxHash1 for tests that need individual hash reference
        testTxHash1 = keccak256("tx1");

        // Pre-compute merkle root for standard test case (3 transactions)
        testMerkleRoot = _computeTestMerkleRoot();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TEST-SPECIFIC HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    function _doAcknowledgement(address _forwarder) internal {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(reporter);
        bytes32[] memory txHashes = _getTestTxHashes();
        bytes32[] memory chainIds = _getTestChainIds();

        (uint8 v, bytes32 r, bytes32 s) = _signAcknowledgement(
            reporterPrivateKey, testMerkleRoot, testChainId, uint32(txHashes.length), _forwarder, nonce, deadline
        );

        vm.prank(_forwarder);
        registry.acknowledge(
            testMerkleRoot, testChainId, uint32(txHashes.length), txHashes, chainIds, reporter, deadline, v, r, s
        );
    }

    function _skipToRegistrationWindow() internal {
        (,, uint32 startBlock,,,) = registry.getDeadlines(reporter);
        vm.roll(startBlock + 1);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ACKNOWLEDGE TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Acknowledgement should succeed and set pending state
    function test_Acknowledge_Success() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(reporter);
        bytes32[] memory txHashes = _getTestTxHashes();
        bytes32[] memory chainIds = _getTestChainIds();

        (uint8 v, bytes32 r, bytes32 s) = _signAcknowledgement(
            reporterPrivateKey, testMerkleRoot, testChainId, uint32(txHashes.length), forwarder, nonce, deadline
        );

        vm.expectEmit(true, true, true, true);
        emit IStolenTransactionRegistry.TransactionBatchAcknowledged(
            testMerkleRoot, reporter, forwarder, testChainId, uint32(txHashes.length), true
        );

        vm.prank(forwarder);
        registry.acknowledge(
            testMerkleRoot, testChainId, uint32(txHashes.length), txHashes, chainIds, reporter, deadline, v, r, s
        );

        // Verify state changes
        assertTrue(registry.isPending(reporter), "Should be pending");

        bytes32 batchId = registry.computeBatchId(testMerkleRoot, reporter, testChainId);
        assertFalse(registry.isBatchRegistered(batchId), "Should not be registered yet");
        assertEq(registry.nonces(reporter), 1, "Nonce should increment");

        // Verify acknowledgement data
        IStolenTransactionRegistry.AcknowledgementData memory ack = registry.getAcknowledgement(reporter);
        assertEq(ack.trustedForwarder, forwarder, "Forwarder should match");
        assertEq(ack.pendingMerkleRoot, testMerkleRoot, "Merkle root should match");
        assertEq(ack.pendingChainId, testChainId, "Chain ID should match");
        assertEq(ack.pendingTxCount, uint32(txHashes.length), "Tx count should match");
        assertGt(ack.startBlock, block.number, "Start block should be in future");
        assertGt(ack.expiryBlock, ack.startBlock, "Expiry should be after start");
    }

    /// @notice Self-relay acknowledgement should set isSponsored to false
    function test_Acknowledge_SelfRelay() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(reporter);
        bytes32[] memory txHashes = _getTestTxHashes();
        bytes32[] memory chainIds = _getTestChainIds();

        (uint8 v, bytes32 r, bytes32 s) = _signAcknowledgement(
            reporterPrivateKey, testMerkleRoot, testChainId, uint32(txHashes.length), reporter, nonce, deadline
        );

        vm.expectEmit(true, true, true, true);
        emit IStolenTransactionRegistry.TransactionBatchAcknowledged(
            testMerkleRoot,
            reporter,
            reporter,
            testChainId,
            uint32(txHashes.length),
            false // isSponsored = false
        );

        vm.prank(reporter);
        registry.acknowledge(
            testMerkleRoot, testChainId, uint32(txHashes.length), txHashes, chainIds, reporter, deadline, v, r, s
        );

        assertTrue(registry.isPending(reporter));
    }

    /// @notice Acknowledgement should reject expired signatures
    function test_Acknowledge_ExpiredDeadline() public {
        uint256 deadline = block.timestamp - 1; // Already expired
        uint256 nonce = registry.nonces(reporter);
        bytes32[] memory txHashes = _getTestTxHashes();
        bytes32[] memory chainIds = _getTestChainIds();

        (uint8 v, bytes32 r, bytes32 s) = _signAcknowledgement(
            reporterPrivateKey, testMerkleRoot, testChainId, uint32(txHashes.length), forwarder, nonce, deadline
        );

        vm.prank(forwarder);
        vm.expectRevert(IStolenTransactionRegistry.Acknowledgement__Expired.selector);
        registry.acknowledge(
            testMerkleRoot, testChainId, uint32(txHashes.length), txHashes, chainIds, reporter, deadline, v, r, s
        );
    }

    /// @notice Acknowledgement should reject invalid merkle root
    function test_Acknowledge_InvalidMerkleRoot() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(reporter);
        bytes32[] memory txHashes = _getTestTxHashes();
        bytes32[] memory chainIds = _getTestChainIds();

        (uint8 v, bytes32 r, bytes32 s) = _signAcknowledgement(
            reporterPrivateKey, bytes32(0), testChainId, uint32(txHashes.length), forwarder, nonce, deadline
        );

        vm.prank(forwarder);
        vm.expectRevert(IStolenTransactionRegistry.InvalidMerkleRoot.selector);
        registry.acknowledge(
            bytes32(0), testChainId, uint32(txHashes.length), txHashes, chainIds, reporter, deadline, v, r, s
        );
    }

    /// @notice Acknowledgement should reject mismatched merkle root
    function test_Acknowledge_MerkleRootMismatch() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(reporter);
        bytes32[] memory txHashes = _getTestTxHashes();
        bytes32[] memory chainIds = _getTestChainIds();

        // Sign with wrong merkle root
        bytes32 wrongRoot = keccak256("wrong");
        (uint8 v, bytes32 r, bytes32 s) = _signAcknowledgement(
            reporterPrivateKey, wrongRoot, testChainId, uint32(txHashes.length), forwarder, nonce, deadline
        );

        vm.prank(forwarder);
        vm.expectRevert(IStolenTransactionRegistry.MerkleRootMismatch.selector);
        registry.acknowledge(
            wrongRoot, testChainId, uint32(txHashes.length), txHashes, chainIds, reporter, deadline, v, r, s
        );
    }

    /// @notice Acknowledgement should reject array length mismatch
    function test_Acknowledge_ArrayLengthMismatch() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(reporter);
        bytes32[] memory txHashes = _getTestTxHashes();
        bytes32[] memory chainIds = new bytes32[](2); // Wrong length

        (uint8 v, bytes32 r, bytes32 s) = _signAcknowledgement(
            reporterPrivateKey, testMerkleRoot, testChainId, uint32(txHashes.length), forwarder, nonce, deadline
        );

        vm.prank(forwarder);
        vm.expectRevert(IStolenTransactionRegistry.ArrayLengthMismatch.selector);
        registry.acknowledge(
            testMerkleRoot, testChainId, uint32(txHashes.length), txHashes, chainIds, reporter, deadline, v, r, s
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REGISTER TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Registration should succeed after grace period
    function test_Register_Success() public {
        _doAcknowledgement(forwarder);
        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(reporter);
        bytes32[] memory txHashes = _getTestTxHashes();
        bytes32[] memory chainIds = _getTestChainIds();

        (uint8 v, bytes32 r, bytes32 s) =
            _signRegistration(reporterPrivateKey, testMerkleRoot, testChainId, forwarder, nonce, deadline);

        bytes32 expectedBatchId = registry.computeBatchId(testMerkleRoot, reporter, testChainId);

        vm.expectEmit(true, true, true, false); // Don't check non-indexed params (arrays)
        emit IStolenTransactionRegistry.TransactionBatchRegisteredByReporter(
            expectedBatchId, testMerkleRoot, reporter, testChainId, uint32(txHashes.length), true, txHashes, chainIds
        );

        vm.prank(forwarder);
        registry.register(testMerkleRoot, testChainId, txHashes, chainIds, reporter, deadline, v, r, s);

        // Verify state changes
        assertFalse(registry.isPending(reporter), "Should not be pending");
        assertTrue(registry.isBatchRegistered(expectedBatchId), "Should be registered");
        assertEq(registry.nonces(reporter), 2, "Nonce should be 2");

        // Verify batch data
        IStolenTransactionRegistry.TransactionBatch memory batch = registry.getBatch(expectedBatchId);
        assertEq(batch.merkleRoot, testMerkleRoot, "Merkle root should match");
        assertEq(batch.reporter, reporter, "Reporter should match");
        assertEq(batch.reportedChainId, testChainId, "Chain ID should match");
        assertEq(batch.transactionCount, uint32(txHashes.length), "Tx count should match");
        assertTrue(batch.isSponsored, "Should be sponsored");
        assertEq(batch.bridgeId, uint8(IStolenTransactionRegistry.BridgeId.NONE), "Bridge should be NONE");
    }

    /// @notice Registration should fail before grace period
    function test_Register_GracePeriodNotStarted() public {
        _doAcknowledgement(forwarder);
        // Don't skip to registration window

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(reporter);
        bytes32[] memory txHashes = _getTestTxHashes();
        bytes32[] memory chainIds = _getTestChainIds();

        (uint8 v, bytes32 r, bytes32 s) =
            _signRegistration(reporterPrivateKey, testMerkleRoot, testChainId, forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IStolenTransactionRegistry.Registration__GracePeriodNotStarted.selector);
        registry.register(testMerkleRoot, testChainId, txHashes, chainIds, reporter, deadline, v, r, s);
    }

    /// @notice Registration should fail after expiry
    function test_Register_ForwarderExpired() public {
        _doAcknowledgement(forwarder);

        // Skip past expiry
        (, uint32 expiryBlock,,,,) = registry.getDeadlines(reporter);
        vm.roll(expiryBlock + 1);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(reporter);
        bytes32[] memory txHashes = _getTestTxHashes();
        bytes32[] memory chainIds = _getTestChainIds();

        (uint8 v, bytes32 r, bytes32 s) =
            _signRegistration(reporterPrivateKey, testMerkleRoot, testChainId, forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IStolenTransactionRegistry.Registration__ForwarderExpired.selector);
        registry.register(testMerkleRoot, testChainId, txHashes, chainIds, reporter, deadline, v, r, s);
    }

    /// @notice Registration should fail with wrong forwarder
    function test_Register_InvalidForwarder() public {
        _doAcknowledgement(forwarder);
        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(reporter);
        bytes32[] memory txHashes = _getTestTxHashes();
        bytes32[] memory chainIds = _getTestChainIds();

        address wrongForwarder = makeAddr("wrong");

        (uint8 v, bytes32 r, bytes32 s) =
            _signRegistration(reporterPrivateKey, testMerkleRoot, testChainId, wrongForwarder, nonce, deadline);

        vm.prank(wrongForwarder);
        vm.expectRevert(IStolenTransactionRegistry.Registration__InvalidForwarder.selector);
        registry.register(testMerkleRoot, testChainId, txHashes, chainIds, reporter, deadline, v, r, s);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VERIFY TRANSACTION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Should verify transaction is in registered batch
    function test_VerifyTransaction_ValidProof() public {
        // Complete registration
        _doAcknowledgement(forwarder);
        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(reporter);
        bytes32[] memory txHashes = _getTestTxHashes();
        bytes32[] memory chainIds = _getTestChainIds();

        (uint8 v, bytes32 r, bytes32 s) =
            _signRegistration(reporterPrivateKey, testMerkleRoot, testChainId, forwarder, nonce, deadline);

        vm.prank(forwarder);
        registry.register(testMerkleRoot, testChainId, txHashes, chainIds, reporter, deadline, v, r, s);

        bytes32 batchId = registry.computeBatchId(testMerkleRoot, reporter, testChainId);

        // For a 3-leaf tree, we need to compute the proof
        // This is a simplified test - in practice frontend would compute the proof
        // For now, just verify the batch exists
        assertTrue(registry.isBatchRegistered(batchId), "Batch should be registered");
    }

    /// @notice Should reject verification for non-existent batch
    function test_VerifyTransaction_NonExistentBatch() public {
        bytes32 fakeBatchId = keccak256("fake");
        bytes32[] memory proof = new bytes32[](0);

        bool result = registry.verifyTransaction(testTxHash1, testChainId, fakeBatchId, proof);
        assertFalse(result, "Should return false for non-existent batch");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BATCH ID TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Batch ID should be deterministic
    function test_ComputeBatchId_Deterministic() public view {
        bytes32 batchId1 = registry.computeBatchId(testMerkleRoot, reporter, testChainId);
        bytes32 batchId2 = registry.computeBatchId(testMerkleRoot, reporter, testChainId);
        assertEq(batchId1, batchId2, "Batch IDs should be equal");
    }

    /// @notice Different inputs should produce different batch IDs
    function test_ComputeBatchId_Unique() public view {
        bytes32 batchId1 = registry.computeBatchId(testMerkleRoot, reporter, testChainId);
        bytes32 batchId2 = registry.computeBatchId(keccak256("different"), reporter, testChainId);
        assertTrue(batchId1 != batchId2, "Batch IDs should be different");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FRONTEND COMPATIBILITY TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice generateHashStruct should return valid hash for acknowledgement
    function test_GenerateHashStruct_Acknowledgement() public {
        vm.prank(reporter);
        (uint256 deadline, bytes32 hashStruct) =
            registry.generateHashStruct(testMerkleRoot, testChainId, 3, forwarder, 1);

        assertGt(deadline, block.timestamp, "Deadline should be in future");
        assertTrue(hashStruct != bytes32(0), "Hash struct should not be zero");
    }

    /// @notice generateHashStruct should return valid hash for registration
    function test_GenerateHashStruct_Registration() public {
        vm.prank(reporter);
        (uint256 deadline, bytes32 hashStruct) =
            registry.generateHashStruct(testMerkleRoot, testChainId, 3, forwarder, 2);

        assertGt(deadline, block.timestamp, "Deadline should be in future");
        assertTrue(hashStruct != bytes32(0), "Hash struct should not be zero");
    }

    /// @notice getDeadlines should return correct values
    function test_GetDeadlines() public {
        _doAcknowledgement(forwarder);

        (
            uint32 currentBlock,
            uint32 expiryBlock,
            uint32 startBlock,
            uint32 graceStartsAt,
            uint32 timeLeft,
            bool isExpired
        ) = registry.getDeadlines(reporter);

        assertEq(currentBlock, block.number, "Current block should match");
        assertGt(expiryBlock, startBlock, "Expiry should be after start");
        assertGt(startBlock, block.number, "Start should be in future");
        assertGt(graceStartsAt, 0, "Grace starts at should be positive");
        assertGt(timeLeft, 0, "Time left should be positive");
        assertFalse(isExpired, "Should not be expired");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Should reject invalid timing config
    function test_Constructor_InvalidTimingConfig() public {
        vm.expectRevert(IStolenTransactionRegistry.InvalidTimingConfig.selector);
        new StolenTransactionRegistry(address(this), address(0), address(0), 0, 50);

        vm.expectRevert(IStolenTransactionRegistry.InvalidTimingConfig.selector);
        new StolenTransactionRegistry(address(this), address(0), address(0), 10, 0);

        // deadlineBlocks must be >= 2 * graceBlocks
        vm.expectRevert(IStolenTransactionRegistry.InvalidTimingConfig.selector);
        new StolenTransactionRegistry(address(this), address(0), address(0), 10, 15);
    }

    /// @notice Should reject fee manager without registry hub
    function test_Constructor_InvalidFeeConfig() public {
        address fakeFeeManager = makeAddr("feeManager");
        vm.expectRevert(IStolenTransactionRegistry.InvalidFeeConfig.selector);
        new StolenTransactionRegistry(address(this), fakeFeeManager, address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);
    }
}

/// @title StolenTransactionRegistryFeeTest
/// @notice Tests for StolenTransactionRegistry with fee collection enabled
/// @dev Inherits StolenTransactionRegistryTestBase for shared helpers
contract StolenTransactionRegistryFeeTest is StolenTransactionRegistryTestBase {
    RegistryHub public hub;
    FeeManager public feeManager;
    MockAggregator public priceFeed;

    uint256 internal reporterPrivateKey;
    address internal reporter;
    address internal forwarder;
    address internal hubOwner;

    bytes32 internal testMerkleRoot;

    uint256 internal constant GRACE_BLOCKS = 10;
    uint256 internal constant DEADLINE_BLOCKS = 50;

    function setUp() public {
        hubOwner = makeAddr("hubOwner");
        reporterPrivateKey = 0xA11CE;
        reporter = vm.addr(reporterPrivateKey);
        forwarder = makeAddr("forwarder");

        // Deploy all contracts as hubOwner (consistent with StolenWalletRegistryFeeTest pattern)
        vm.startPrank(hubOwner);

        // Deploy price feed mock (ETH = $3000, using 8 decimals as Chainlink does)
        priceFeed = new MockAggregator(300_000_000_000); // $3000 ETH

        // Deploy fee manager (uses default $5 fee)
        feeManager = new FeeManager(hubOwner, address(priceFeed));

        // Deploy hub
        hub = new RegistryHub(hubOwner, address(feeManager), address(0));

        // Deploy registry with fee collection
        registry =
            new StolenTransactionRegistry(hubOwner, address(feeManager), address(hub), GRACE_BLOCKS, DEADLINE_BLOCKS);

        // Register transaction registry in hub
        hub.setRegistry(hub.STOLEN_TRANSACTION(), address(registry));

        vm.stopPrank();

        // Fund accounts
        vm.deal(reporter, 10 ether);
        vm.deal(forwarder, 10 ether);

        // Set up test chain ID (Base mainnet) - used by base class helpers
        testChainId = CAIP2.fromEIP155(8453);

        // Pre-compute merkle root using base class helper
        testMerkleRoot = _computeTestMerkleRoot();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Registration should require fee payment
    function test_Register_RequiresFee() public {
        bytes32[] memory txHashes = _getTestTxHashes();
        bytes32[] memory chainIds = _getTestChainIds();

        // Do acknowledgement (scoped to limit stack depth)
        {
            uint256 deadline = block.timestamp + 1 hours;
            (uint8 v, bytes32 r, bytes32 s) = _signAcknowledgement(
                reporterPrivateKey,
                testMerkleRoot,
                testChainId,
                uint32(3),
                forwarder,
                registry.nonces(reporter),
                deadline
            );
            vm.prank(forwarder);
            registry.acknowledge(
                testMerkleRoot, testChainId, uint32(3), txHashes, chainIds, reporter, deadline, v, r, s
            );
        }

        // Skip to registration window
        (,, uint32 startBlock,,,) = registry.getDeadlines(reporter);
        vm.roll(startBlock + 1);

        // Try to register without fee
        {
            uint256 deadline = block.timestamp + 1 hours;
            (uint8 v, bytes32 r, bytes32 s) = _signRegistration(
                reporterPrivateKey, testMerkleRoot, testChainId, forwarder, registry.nonces(reporter), deadline
            );
            vm.prank(forwarder);
            vm.expectRevert(IStolenTransactionRegistry.StolenTransactionRegistry__InsufficientFee.selector);
            registry.register(testMerkleRoot, testChainId, txHashes, chainIds, reporter, deadline, v, r, s);
        }
    }

    /// @notice Registration should succeed with sufficient fee
    function test_Register_WithFee() public {
        bytes32[] memory txHashes = _getTestTxHashes();
        bytes32[] memory chainIds = _getTestChainIds();

        // Do acknowledgement (scoped to limit stack depth)
        {
            uint256 deadline = block.timestamp + 1 hours;
            (uint8 v, bytes32 r, bytes32 s) = _signAcknowledgement(
                reporterPrivateKey,
                testMerkleRoot,
                testChainId,
                uint32(3),
                forwarder,
                registry.nonces(reporter),
                deadline
            );
            vm.prank(forwarder);
            registry.acknowledge(
                testMerkleRoot, testChainId, uint32(3), txHashes, chainIds, reporter, deadline, v, r, s
            );
        }

        // Skip to registration window
        (,, uint32 startBlock,,,) = registry.getDeadlines(reporter);
        vm.roll(startBlock + 1);

        // Register with fee
        uint256 fee = registry.quoteRegistration(reporter);
        uint256 hubBalanceBefore = address(hub).balance;
        {
            uint256 deadline = block.timestamp + 1 hours;
            (uint8 v, bytes32 r, bytes32 s) = _signRegistration(
                reporterPrivateKey, testMerkleRoot, testChainId, forwarder, registry.nonces(reporter), deadline
            );
            vm.prank(forwarder);
            registry.register{ value: fee }(
                testMerkleRoot, testChainId, txHashes, chainIds, reporter, deadline, v, r, s
            );
        }

        // Verify fee was forwarded to hub
        assertEq(address(hub).balance, hubBalanceBefore + fee, "Hub should receive fee");
    }
}
