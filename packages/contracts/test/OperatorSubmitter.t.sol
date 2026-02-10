// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { OperatorSubmitter } from "../src/OperatorSubmitter.sol";
import { OperatorRegistry } from "../src/OperatorRegistry.sol";
import { WalletRegistry } from "../src/registries/WalletRegistry.sol";
import { TransactionRegistry } from "../src/registries/TransactionRegistry.sol";
import { ContractRegistry } from "../src/registries/ContractRegistry.sol";
import { IWalletRegistry } from "../src/interfaces/IWalletRegistry.sol";
import { ITransactionRegistry } from "../src/interfaces/ITransactionRegistry.sol";
import { IContractRegistry } from "../src/interfaces/IContractRegistry.sol";
import { FeeManager } from "../src/FeeManager.sol";
import { MockAggregator } from "./mocks/MockAggregator.sol";
import { CAIP10Evm } from "../src/libraries/CAIP10Evm.sol";

/// @title OperatorSubmitterTest
/// @notice Comprehensive tests for OperatorSubmitter batch submission and admin functions
contract OperatorSubmitterTest is Test {
    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    OperatorSubmitter public submitter;
    OperatorRegistry public operatorRegistry;
    WalletRegistry public walletRegistry;
    TransactionRegistry public transactionRegistry;
    ContractRegistry public contractRegistry;

    // Test accounts
    address public owner;
    address public approvedOperator;
    address public unapprovedOperator;
    address public nonOwner;
    address public feeRecipientAddr;

    // Constants
    uint256 constant GRACE_BLOCKS = 10;
    uint256 constant DEADLINE_BLOCKS = 50;
    uint8 constant ALL_REGISTRIES = 0x07;
    int256 constant ORACLE_PRICE_3000 = 300_000_000_000; // $3,000 with 8 decimals

    // Events (mirrored from OperatorSubmitter for vm.expectEmit)
    event BatchSubmitted(address indexed operator, address indexed registry, uint256 batchId, uint32 entryCount);
    event WalletRegistrySet(address indexed walletRegistry);
    event TransactionRegistrySet(address indexed transactionRegistry);
    event ContractRegistrySet(address indexed contractRegistry);
    event OperatorRegistrySet(address indexed operatorRegistry);
    event FeeManagerSet(address indexed feeManager);
    event FeeRecipientSet(address indexed feeRecipient);

    // ═══════════════════════════════════════════════════════════════════════════
    // SETUP
    // ═══════════════════════════════════════════════════════════════════════════

    function setUp() public {
        owner = makeAddr("owner");
        approvedOperator = makeAddr("approvedOperator");
        unapprovedOperator = makeAddr("unapprovedOperator");
        nonOwner = makeAddr("nonOwner");
        feeRecipientAddr = makeAddr("feeRecipient");

        // Warp to realistic timestamp so incidentTimestamp calculations don't hit the
        // block.timestamp < 1 hours fallback (Forge default timestamp is 1)
        vm.warp(block.timestamp + 2 hours);

        vm.startPrank(owner);

        // Deploy registries (no FeeManager for base setup — free registrations)
        walletRegistry = new WalletRegistry(owner, address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);
        transactionRegistry = new TransactionRegistry(owner, address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);
        contractRegistry = new ContractRegistry(owner);

        // Deploy operator registry
        operatorRegistry = new OperatorRegistry(owner);

        // Deploy operator submitter (no fee manager)
        submitter = new OperatorSubmitter(
            owner,
            address(walletRegistry),
            address(transactionRegistry),
            address(contractRegistry),
            address(operatorRegistry),
            address(0), // feeManager
            address(0) // feeRecipient
        );

        // Wire up: set OperatorSubmitter on each registry
        walletRegistry.setOperatorSubmitter(address(submitter));
        transactionRegistry.setOperatorSubmitter(address(submitter));
        contractRegistry.setOperatorSubmitter(address(submitter));

        // Approve test operator with ALL_REGISTRIES capability (0x07)
        operatorRegistry.approveOperator(approvedOperator, ALL_REGISTRIES, "TestOperator");

        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Build a batch of wallet identifiers for testing
    function _buildWalletBatch(uint256 count)
        internal
        view
        returns (bytes32[] memory identifiers, bytes32[] memory chainIds, uint64[] memory timestamps)
    {
        identifiers = new bytes32[](count);
        chainIds = new bytes32[](count);
        timestamps = new uint64[](count);

        bytes32 baseChainId = CAIP10Evm.caip2Hash(8453); // Base

        for (uint256 i = 0; i < count; i++) {
            identifiers[i] = bytes32(uint256(uint160(address(uint160(i + 100)))));
            chainIds[i] = baseChainId;
            timestamps[i] = uint64(block.timestamp > 1 hours ? block.timestamp - 1 hours : 1);
        }
    }

    /// @dev Build a batch of transaction hashes for testing
    function _buildTxBatch(uint256 count) internal pure returns (bytes32[] memory txHashes, bytes32[] memory chainIds) {
        txHashes = new bytes32[](count);
        chainIds = new bytes32[](count);

        bytes32 baseChainId = CAIP10Evm.caip2Hash(8453);

        for (uint256 i = 0; i < count; i++) {
            txHashes[i] = keccak256(abi.encodePacked("tx", i));
            chainIds[i] = baseChainId;
        }
    }

    /// @dev Build a batch of contract identifiers for testing
    function _buildContractBatch(uint256 count)
        internal
        pure
        returns (bytes32[] memory identifiers, bytes32[] memory chainIds)
    {
        identifiers = new bytes32[](count);
        chainIds = new bytes32[](count);

        bytes32 baseChainId = CAIP10Evm.caip2Hash(8453);

        for (uint256 i = 0; i < count; i++) {
            identifiers[i] = bytes32(uint256(uint160(address(uint160(i + 500)))));
            chainIds[i] = baseChainId;
        }
    }

    /// @dev Deploy a FeeManager + OperatorSubmitter with fee config, wiring a given registry
    function _deployFeeSubmitter() internal returns (OperatorSubmitter feeSubmitter, FeeManager fm) {
        MockAggregator oracle = new MockAggregator(ORACLE_PRICE_3000);
        vm.startPrank(owner);
        fm = new FeeManager(owner, address(oracle));
        feeSubmitter = new OperatorSubmitter(
            owner,
            address(walletRegistry),
            address(transactionRegistry),
            address(contractRegistry),
            address(operatorRegistry),
            address(fm),
            feeRecipientAddr
        );
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WALLET BATCH REGISTRATION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Approved operator can register a batch of wallets, emitting BatchSubmitted
    /// and persisting entries in the WalletRegistry.
    function test_RegisterWallets_Success() public {
        (bytes32[] memory ids, bytes32[] memory chainIds, uint64[] memory timestamps) = _buildWalletBatch(3);

        vm.expectEmit(true, true, false, true);
        emit BatchSubmitted(approvedOperator, address(walletRegistry), 1, 3);

        vm.prank(approvedOperator);
        submitter.registerWalletsAsOperator(ids, chainIds, timestamps);

        // Verify wallets stored in WalletRegistry
        for (uint256 i = 0; i < 3; i++) {
            address wallet = address(uint160(uint256(ids[i])));
            assertTrue(walletRegistry.isWalletRegistered(wallet));
        }

        // Verify batch metadata
        IWalletRegistry.Batch memory batch = walletRegistry.getBatch(1);
        assertEq(batch.operatorId, bytes32(uint256(uint160(approvedOperator))));
        assertEq(batch.walletCount, 3);
    }

    /// @notice Unapproved operator is rejected with NotApprovedOperator.
    function test_RegisterWallets_RejectsUnapprovedOperator() public {
        (bytes32[] memory ids, bytes32[] memory chainIds, uint64[] memory timestamps) = _buildWalletBatch(1);

        vm.prank(unapprovedOperator);
        vm.expectRevert(OperatorSubmitter.OperatorSubmitter__NotApprovedOperator.selector);
        submitter.registerWalletsAsOperator(ids, chainIds, timestamps);
    }

    /// @notice Empty batch is rejected with EmptyBatch.
    function test_RegisterWallets_RejectsEmptyBatch() public {
        bytes32[] memory empty = new bytes32[](0);
        uint64[] memory emptyTs = new uint64[](0);

        vm.prank(approvedOperator);
        vm.expectRevert(OperatorSubmitter.OperatorSubmitter__EmptyBatch.selector);
        submitter.registerWalletsAsOperator(empty, empty, emptyTs);
    }

    /// @notice Mismatched array lengths are rejected with ArrayLengthMismatch.
    function test_RegisterWallets_RejectsArrayMismatch() public {
        bytes32[] memory ids = new bytes32[](2);
        bytes32[] memory chainIds = new bytes32[](3);
        uint64[] memory timestamps = new uint64[](2);

        ids[0] = bytes32(uint256(1));
        ids[1] = bytes32(uint256(2));
        chainIds[0] = bytes32(uint256(10));
        chainIds[1] = bytes32(uint256(11));
        chainIds[2] = bytes32(uint256(12));
        timestamps[0] = uint64(block.timestamp);
        timestamps[1] = uint64(block.timestamp);

        vm.prank(approvedOperator);
        vm.expectRevert(OperatorSubmitter.OperatorSubmitter__ArrayLengthMismatch.selector);
        submitter.registerWalletsAsOperator(ids, chainIds, timestamps);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TRANSACTION BATCH REGISTRATION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Approved operator can register a batch of transactions, emitting BatchSubmitted
    /// and persisting entries in the TransactionRegistry.
    function test_RegisterTransactions_Success() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _buildTxBatch(2);

        vm.expectEmit(true, true, false, true);
        emit BatchSubmitted(approvedOperator, address(transactionRegistry), 1, 2);

        vm.prank(approvedOperator);
        submitter.registerTransactionsAsOperator(txHashes, chainIds);

        // Verify transactions stored in TransactionRegistry
        for (uint256 i = 0; i < 2; i++) {
            assertTrue(transactionRegistry.isTransactionRegistered(txHashes[i], chainIds[i]));
        }
    }

    /// @notice Unapproved operator is rejected for transaction batches.
    function test_RegisterTransactions_RejectsUnapprovedOperator() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _buildTxBatch(1);

        vm.prank(unapprovedOperator);
        vm.expectRevert(OperatorSubmitter.OperatorSubmitter__NotApprovedOperator.selector);
        submitter.registerTransactionsAsOperator(txHashes, chainIds);
    }

    /// @notice Empty transaction batch is rejected.
    function test_RegisterTransactions_RejectsEmptyBatch() public {
        bytes32[] memory empty = new bytes32[](0);

        vm.prank(approvedOperator);
        vm.expectRevert(OperatorSubmitter.OperatorSubmitter__EmptyBatch.selector);
        submitter.registerTransactionsAsOperator(empty, empty);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONTRACT BATCH REGISTRATION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Approved operator can register a batch of malicious contracts, emitting BatchSubmitted
    /// and persisting entries in the ContractRegistry.
    function test_RegisterContracts_Success() public {
        (bytes32[] memory ids, bytes32[] memory chainIds) = _buildContractBatch(2);

        vm.expectEmit(true, true, false, true);
        emit BatchSubmitted(approvedOperator, address(contractRegistry), 1, 2);

        vm.prank(approvedOperator);
        submitter.registerContractsAsOperator(ids, chainIds);

        // Verify contracts stored in ContractRegistry
        for (uint256 i = 0; i < 2; i++) {
            address contractAddr = address(uint160(uint256(ids[i])));
            assertTrue(contractRegistry.isContractRegistered(contractAddr, chainIds[i]));
        }
    }

    /// @notice Unapproved operator is rejected for contract batches.
    function test_RegisterContracts_RejectsUnapprovedOperator() public {
        (bytes32[] memory ids, bytes32[] memory chainIds) = _buildContractBatch(1);

        vm.prank(unapprovedOperator);
        vm.expectRevert(OperatorSubmitter.OperatorSubmitter__NotApprovedOperator.selector);
        submitter.registerContractsAsOperator(ids, chainIds);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PAUSE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Paused contract rejects wallet registrations with EnforcedPause.
    function test_RegisterWallets_RejectsWhenPaused() public {
        vm.prank(owner);
        submitter.pause();

        (bytes32[] memory ids, bytes32[] memory chainIds, uint64[] memory timestamps) = _buildWalletBatch(1);

        vm.prank(approvedOperator);
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        submitter.registerWalletsAsOperator(ids, chainIds, timestamps);
    }

    /// @notice Only owner can pause; non-owner reverts.
    function test_Pause_OnlyOwner() public {
        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", nonOwner));
        submitter.pause();
    }

    /// @notice Only owner can unpause; non-owner reverts.
    function test_Unpause_OnlyOwner() public {
        vm.prank(owner);
        submitter.pause();

        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", nonOwner));
        submitter.unpause();
    }

    /// @notice Paused contract rejects transaction registrations with EnforcedPause.
    function test_RegisterTransactions_RejectsWhenPaused() public {
        vm.prank(owner);
        submitter.pause();

        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _buildTxBatch(1);

        vm.prank(approvedOperator);
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        submitter.registerTransactionsAsOperator(txHashes, chainIds);
    }

    /// @notice Paused contract rejects contract registrations with EnforcedPause.
    function test_RegisterContracts_RejectsWhenPaused() public {
        vm.prank(owner);
        submitter.pause();

        (bytes32[] memory ids, bytes32[] memory chainIds) = _buildContractBatch(1);

        vm.prank(approvedOperator);
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        submitter.registerContractsAsOperator(ids, chainIds);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE COLLECTION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice When FeeManager is configured, operator must send required fee which is forwarded
    /// to the feeRecipient.
    function test_RegisterWallets_WithFees() public {
        (OperatorSubmitter feeSubmitter, FeeManager fm) = _deployFeeSubmitter();
        vm.prank(owner);
        walletRegistry.setOperatorSubmitter(address(feeSubmitter));

        // Get required fee
        uint256 requiredFee = fm.operatorBatchFeeWei();
        assertTrue(requiredFee > 0, "Fee should be non-zero");

        // Fund operator
        vm.deal(approvedOperator, 10 ether);

        // Record feeRecipient balance before
        uint256 recipientBalanceBefore = feeRecipientAddr.balance;

        // Submit batch with fee
        (bytes32[] memory ids, bytes32[] memory chainIds, uint64[] memory timestamps) = _buildWalletBatch(2);

        vm.prank(approvedOperator);
        feeSubmitter.registerWalletsAsOperator{ value: requiredFee }(ids, chainIds, timestamps);

        // Verify fee forwarded to recipient
        uint256 recipientBalanceAfter = feeRecipientAddr.balance;
        assertEq(recipientBalanceAfter - recipientBalanceBefore, requiredFee);

        // Verify wallets still registered
        for (uint256 i = 0; i < 2; i++) {
            address wallet = address(uint160(uint256(ids[i])));
            assertTrue(walletRegistry.isWalletRegistered(wallet));
        }
    }

    /// @notice InsufficientFee when msg.value is below required fee.
    function test_RegisterWallets_InsufficientFee() public {
        (OperatorSubmitter feeSubmitter, FeeManager fm) = _deployFeeSubmitter();
        vm.prank(owner);
        walletRegistry.setOperatorSubmitter(address(feeSubmitter));

        uint256 requiredFee = fm.operatorBatchFeeWei();
        vm.deal(approvedOperator, 10 ether);

        (bytes32[] memory ids, bytes32[] memory chainIds, uint64[] memory timestamps) = _buildWalletBatch(1);

        vm.prank(approvedOperator);
        vm.expectRevert(OperatorSubmitter.OperatorSubmitter__InsufficientFee.selector);
        feeSubmitter.registerWalletsAsOperator{ value: requiredFee - 1 }(ids, chainIds, timestamps);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN SETTERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Owner can update walletRegistry, emitting WalletRegistrySet.
    function test_SetWalletRegistry_Success() public {
        address newRegistry = makeAddr("newWalletRegistry");

        vm.expectEmit(true, false, false, false);
        emit WalletRegistrySet(newRegistry);

        vm.prank(owner);
        submitter.setWalletRegistry(newRegistry);

        assertEq(submitter.walletRegistry(), newRegistry);
    }

    /// @notice setWalletRegistry reverts with ZeroAddress when address(0) is passed.
    function test_SetWalletRegistry_RejectsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(OperatorSubmitter.OperatorSubmitter__ZeroAddress.selector);
        submitter.setWalletRegistry(address(0));
    }

    /// @notice setWalletRegistry reverts for non-owner.
    function test_SetWalletRegistry_RejectsNonOwner() public {
        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", nonOwner));
        submitter.setWalletRegistry(makeAddr("newRegistry"));
    }

    /// @notice setFeeConfig atomically sets both feeManager and feeRecipient, emitting both events.
    function test_SetFeeConfig_Atomically() public {
        address newFm = makeAddr("newFeeManager");
        address newRecipient = makeAddr("newRecipient");

        vm.expectEmit(true, false, false, false);
        emit FeeManagerSet(newFm);
        vm.expectEmit(true, false, false, false);
        emit FeeRecipientSet(newRecipient);

        vm.prank(owner);
        submitter.setFeeConfig(newFm, newRecipient);

        assertEq(submitter.feeManager(), newFm);
        assertEq(submitter.feeRecipient(), newRecipient);
    }

    /// @notice setFeeManager reverts with InvalidFeeConfig when feeManager is non-zero but
    /// feeRecipient is currently zero.
    function test_SetFeeManager_RejectsWithoutRecipient() public {
        // submitter was deployed with feeRecipient = address(0)
        address newFm = makeAddr("newFeeManager");

        vm.prank(owner);
        vm.expectRevert(OperatorSubmitter.OperatorSubmitter__InvalidFeeConfig.selector);
        submitter.setFeeManager(newFm);
    }

    /// @notice setTransactionRegistry works for owner, emits event.
    function test_SetTransactionRegistry_Success() public {
        address newRegistry = makeAddr("newTxRegistry");

        vm.expectEmit(true, false, false, false);
        emit TransactionRegistrySet(newRegistry);

        vm.prank(owner);
        submitter.setTransactionRegistry(newRegistry);

        assertEq(submitter.transactionRegistry(), newRegistry);
    }

    /// @notice setContractRegistry works for owner, emits event.
    function test_SetContractRegistry_Success() public {
        address newRegistry = makeAddr("newContractRegistry");

        vm.expectEmit(true, false, false, false);
        emit ContractRegistrySet(newRegistry);

        vm.prank(owner);
        submitter.setContractRegistry(newRegistry);

        assertEq(submitter.contractRegistry(), newRegistry);
    }

    /// @notice setOperatorRegistry works for owner, emits event.
    function test_SetOperatorRegistry_Success() public {
        address newRegistry = makeAddr("newOperatorRegistry");

        vm.expectEmit(true, false, false, false);
        emit OperatorRegistrySet(newRegistry);

        vm.prank(owner);
        submitter.setOperatorRegistry(newRegistry);

        assertEq(submitter.operatorRegistry(), newRegistry);
    }

    /// @notice setFeeRecipient reverts with InvalidFeeConfig when feeManager is non-zero
    /// and new recipient is zero.
    function test_SetFeeRecipient_RejectsZeroWhenFeeManagerActive() public {
        // First set up a valid fee config
        address fm = makeAddr("fm");
        address recip = makeAddr("recip");
        vm.prank(owner);
        submitter.setFeeConfig(fm, recip);

        // Now try to set recipient to zero while feeManager is active
        vm.prank(owner);
        vm.expectRevert(OperatorSubmitter.OperatorSubmitter__InvalidFeeConfig.selector);
        submitter.setFeeRecipient(address(0));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Constructor reverts ZeroAddress for each of the first 5 required params.
    /// Note: Zero owner triggers OZ OwnableInvalidOwner before our custom check;
    /// remaining params trigger OperatorSubmitter__ZeroAddress.
    function test_Constructor_RejectsZeroAddress() public {
        // Zero owner — OZ Ownable reverts before our check
        vm.expectRevert(abi.encodeWithSignature("OwnableInvalidOwner(address)", address(0)));
        new OperatorSubmitter(
            address(0),
            address(walletRegistry),
            address(transactionRegistry),
            address(contractRegistry),
            address(operatorRegistry),
            address(0),
            address(0)
        );

        // Zero walletRegistry
        vm.expectRevert(OperatorSubmitter.OperatorSubmitter__ZeroAddress.selector);
        new OperatorSubmitter(
            owner,
            address(0),
            address(transactionRegistry),
            address(contractRegistry),
            address(operatorRegistry),
            address(0),
            address(0)
        );

        // Zero transactionRegistry
        vm.expectRevert(OperatorSubmitter.OperatorSubmitter__ZeroAddress.selector);
        new OperatorSubmitter(
            owner,
            address(walletRegistry),
            address(0),
            address(contractRegistry),
            address(operatorRegistry),
            address(0),
            address(0)
        );

        // Zero contractRegistry
        vm.expectRevert(OperatorSubmitter.OperatorSubmitter__ZeroAddress.selector);
        new OperatorSubmitter(
            owner,
            address(walletRegistry),
            address(transactionRegistry),
            address(0),
            address(operatorRegistry),
            address(0),
            address(0)
        );

        // Zero operatorRegistry
        vm.expectRevert(OperatorSubmitter.OperatorSubmitter__ZeroAddress.selector);
        new OperatorSubmitter(
            owner,
            address(walletRegistry),
            address(transactionRegistry),
            address(contractRegistry),
            address(0),
            address(0),
            address(0)
        );
    }

    /// @notice Constructor reverts InvalidFeeConfig when feeManager is set but feeRecipient is zero.
    function test_Constructor_RejectsFeeManagerWithoutRecipient() public {
        address someFeeManager = makeAddr("someFeeManager");

        vm.expectRevert(OperatorSubmitter.OperatorSubmitter__InvalidFeeConfig.selector);
        new OperatorSubmitter(
            owner,
            address(walletRegistry),
            address(transactionRegistry),
            address(contractRegistry),
            address(operatorRegistry),
            someFeeManager,
            address(0) // feeRecipient is zero while feeManager is non-zero
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice quoteBatchFee returns 0 when no FeeManager is configured.
    function test_QuoteBatchFee_ZeroWhenNoFeeManager() public view {
        assertEq(submitter.quoteBatchFee(), 0);
    }

    /// @notice quoteBatchFee returns the FeeManager's operatorBatchFeeWei when configured.
    function test_QuoteBatchFee_ReturnsCorrectFee() public {
        (OperatorSubmitter feeSubmitter, FeeManager fm) = _deployFeeSubmitter();

        uint256 expectedFee = fm.operatorBatchFeeWei();
        assertEq(feeSubmitter.quoteBatchFee(), expectedFee);
        assertTrue(expectedFee > 0);
    }

    /// @notice isApprovedOperator returns true for approved operator with matching capability
    /// and false for unapproved or wrong capability.
    function test_IsApprovedOperator() public view {
        // Approved operator with ALL_REGISTRIES should pass all checks
        assertTrue(submitter.isApprovedOperator(approvedOperator, 0x01)); // wallet
        assertTrue(submitter.isApprovedOperator(approvedOperator, 0x02)); // tx
        assertTrue(submitter.isApprovedOperator(approvedOperator, 0x04)); // contract
        assertTrue(submitter.isApprovedOperator(approvedOperator, ALL_REGISTRIES)); // all

        // Unapproved operator should fail
        assertFalse(submitter.isApprovedOperator(unapprovedOperator, 0x01));
        assertFalse(submitter.isApprovedOperator(unapprovedOperator, ALL_REGISTRIES));

        // Non-existent address should fail
        assertFalse(submitter.isApprovedOperator(address(0xdead), 0x01));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TRANSACTION BATCH — ARRAY LENGTH MISMATCH
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice registerTransactionsAsOperator reverts ArrayLengthMismatch when
    /// transactionHashes.length != chainIds.length.
    function test_RegisterTransactions_RejectsArrayMismatch() public {
        bytes32[] memory txHashes = new bytes32[](2);
        bytes32[] memory chainIds = new bytes32[](3);

        txHashes[0] = keccak256("tx0");
        txHashes[1] = keccak256("tx1");
        chainIds[0] = CAIP10Evm.caip2Hash(8453);
        chainIds[1] = CAIP10Evm.caip2Hash(8453);
        chainIds[2] = CAIP10Evm.caip2Hash(8453);

        vm.prank(approvedOperator);
        vm.expectRevert(OperatorSubmitter.OperatorSubmitter__ArrayLengthMismatch.selector);
        submitter.registerTransactionsAsOperator(txHashes, chainIds);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONTRACT BATCH — EMPTY + ARRAY LENGTH MISMATCH
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice registerContractsAsOperator reverts EmptyBatch when length == 0.
    function test_RegisterContracts_RejectsEmptyBatch() public {
        bytes32[] memory empty = new bytes32[](0);

        vm.prank(approvedOperator);
        vm.expectRevert(OperatorSubmitter.OperatorSubmitter__EmptyBatch.selector);
        submitter.registerContractsAsOperator(empty, empty);
    }

    /// @notice registerContractsAsOperator reverts ArrayLengthMismatch when
    /// identifiers.length != reportedChainIds.length.
    function test_RegisterContracts_RejectsArrayMismatch() public {
        bytes32[] memory ids = new bytes32[](2);
        bytes32[] memory chainIds = new bytes32[](1);

        ids[0] = bytes32(uint256(uint160(address(uint160(600)))));
        ids[1] = bytes32(uint256(uint160(address(uint160(601)))));
        chainIds[0] = CAIP10Evm.caip2Hash(8453);

        vm.prank(approvedOperator);
        vm.expectRevert(OperatorSubmitter.OperatorSubmitter__ArrayLengthMismatch.selector);
        submitter.registerContractsAsOperator(ids, chainIds);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE COLLECTION — INSUFFICIENT FEE (TRANSACTION + CONTRACT PATHS)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice InsufficientFee for transaction batch when msg.value < required.
    function test_RegisterTransactions_InsufficientFee() public {
        (OperatorSubmitter feeSubmitter, FeeManager fm) = _deployFeeSubmitter();
        vm.prank(owner);
        transactionRegistry.setOperatorSubmitter(address(feeSubmitter));

        uint256 requiredFee = fm.operatorBatchFeeWei();
        vm.deal(approvedOperator, 10 ether);

        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _buildTxBatch(1);

        vm.prank(approvedOperator);
        vm.expectRevert(OperatorSubmitter.OperatorSubmitter__InsufficientFee.selector);
        feeSubmitter.registerTransactionsAsOperator{ value: requiredFee - 1 }(txHashes, chainIds);
    }

    /// @notice InsufficientFee for contract batch when msg.value < required.
    function test_RegisterContracts_InsufficientFee() public {
        (OperatorSubmitter feeSubmitter, FeeManager fm) = _deployFeeSubmitter();
        vm.prank(owner);
        contractRegistry.setOperatorSubmitter(address(feeSubmitter));

        uint256 requiredFee = fm.operatorBatchFeeWei();
        vm.deal(approvedOperator, 10 ether);

        (bytes32[] memory ids, bytes32[] memory chainIds) = _buildContractBatch(1);

        vm.prank(approvedOperator);
        vm.expectRevert(OperatorSubmitter.OperatorSubmitter__InsufficientFee.selector);
        feeSubmitter.registerContractsAsOperator{ value: requiredFee - 1 }(ids, chainIds);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE COLLECTION — FEE FORWARD FAILED (REVERTING RECEIVER)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice FeeForwardFailed when feeRecipient.call{value} reverts.
    /// Uses a helper contract whose receive() always reverts.
    function test_RegisterWallets_FeeForwardFailed() public {
        RevertingReceiver badReceiver = new RevertingReceiver();

        MockAggregator oracle = new MockAggregator(ORACLE_PRICE_3000);
        vm.startPrank(owner);
        FeeManager fm = new FeeManager(owner, address(oracle));
        OperatorSubmitter feeSubmitter = new OperatorSubmitter(
            owner,
            address(walletRegistry),
            address(transactionRegistry),
            address(contractRegistry),
            address(operatorRegistry),
            address(fm),
            address(badReceiver)
        );
        walletRegistry.setOperatorSubmitter(address(feeSubmitter));
        vm.stopPrank();

        uint256 requiredFee = fm.operatorBatchFeeWei();
        vm.deal(approvedOperator, 10 ether);

        (bytes32[] memory ids, bytes32[] memory chainIds, uint64[] memory timestamps) = _buildWalletBatch(1);

        vm.prank(approvedOperator);
        vm.expectRevert(OperatorSubmitter.OperatorSubmitter__FeeForwardFailed.selector);
        feeSubmitter.registerWalletsAsOperator{ value: requiredFee }(ids, chainIds, timestamps);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN SETTERS — ZERO ADDRESS CHECKS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice setTransactionRegistry reverts ZeroAddress when address(0) is passed.
    function test_SetTransactionRegistry_RejectsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(OperatorSubmitter.OperatorSubmitter__ZeroAddress.selector);
        submitter.setTransactionRegistry(address(0));
    }

    /// @notice setContractRegistry reverts ZeroAddress when address(0) is passed.
    function test_SetContractRegistry_RejectsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(OperatorSubmitter.OperatorSubmitter__ZeroAddress.selector);
        submitter.setContractRegistry(address(0));
    }

    /// @notice setOperatorRegistry reverts ZeroAddress when address(0) is passed.
    function test_SetOperatorRegistry_RejectsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(OperatorSubmitter.OperatorSubmitter__ZeroAddress.selector);
        submitter.setOperatorRegistry(address(0));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE CONFIG — DISABLE FEES + INVALID CONFIG
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice setFeeConfig(address(0), address(0)) succeeds and clears both fee fields.
    function test_SetFeeConfig_DisableFees() public {
        // First set up a valid fee config
        address fm = makeAddr("fm");
        address recip = makeAddr("recip");
        vm.prank(owner);
        submitter.setFeeConfig(fm, recip);
        assertEq(submitter.feeManager(), fm);
        assertEq(submitter.feeRecipient(), recip);

        // Now disable fees by setting both to zero
        vm.expectEmit(true, false, false, false);
        emit FeeManagerSet(address(0));
        vm.expectEmit(true, false, false, false);
        emit FeeRecipientSet(address(0));

        vm.prank(owner);
        submitter.setFeeConfig(address(0), address(0));

        assertEq(submitter.feeManager(), address(0));
        assertEq(submitter.feeRecipient(), address(0));
    }

    /// @notice setFeeConfig reverts InvalidFeeConfig when feeManager is non-zero
    /// but feeRecipient is zero.
    function test_SetFeeConfig_RejectsManagerWithoutRecipient() public {
        address fm = makeAddr("fm");

        vm.prank(owner);
        vm.expectRevert(OperatorSubmitter.OperatorSubmitter__InvalidFeeConfig.selector);
        submitter.setFeeConfig(fm, address(0));
    }
}

/// @dev Helper contract whose receive() always reverts, used to trigger FeeForwardFailed.
contract RevertingReceiver {
    receive() external payable {
        revert("no thanks");
    }
}
