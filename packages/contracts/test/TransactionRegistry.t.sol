// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { TransactionRegistry } from "../src/registries/TransactionRegistry.sol";
import { ITransactionRegistry } from "../src/interfaces/ITransactionRegistry.sol";
import { FraudRegistryHub } from "../src/FraudRegistryHub.sol";
import { CAIP10 } from "../src/libraries/CAIP10.sol";
import { CAIP10Evm } from "../src/libraries/CAIP10Evm.sol";
import { EIP712TestHelper } from "./helpers/EIP712TestHelper.sol";
import { FeeManager } from "../src/FeeManager.sol";
import { MockAggregator } from "./mocks/MockAggregator.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

/// @title TransactionRegistryTest
/// @notice Comprehensive tests for TransactionRegistry two-phase batch registration
/// @dev The TransactionRegistry contract uses EIP712("StolenWalletRegistry", "4") as its domain,
///      and statement strings from EIP712Constants (which differ from EIP712TestHelper's TX_ statements).
///      We build signatures manually using the correct domain separator and statement hashes.
contract TransactionRegistryTest is EIP712TestHelper {
    using Strings for uint256;

    TransactionRegistry public txRegistry;
    FraudRegistryHub public hub;

    // Test accounts
    uint256 internal reporterPrivateKey;
    address internal reporter;
    address internal forwarder;
    address internal operatorSubmitter;
    address internal owner;

    // Timing configuration
    uint256 internal constant GRACE_BLOCKS = 10;
    uint256 internal constant DEADLINE_BLOCKS = 50;

    // ═══════════════════════════════════════════════════════════════════════════
    // PRODUCTION EIP-712 CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    // The TransactionRegistry contract uses "StolenWalletRegistry" as its EIP-712 domain name
    // (shared domain across wallet + transaction registries).
    string internal constant DOMAIN_NAME = "StolenWalletRegistry";

    // Statement strings must match EIP712Constants.sol exactly
    string internal constant PROD_TX_ACK_STATEMENT =
        "This signature acknowledges the intent to report stolen transactions to the Stolen Wallet Registry.";

    string internal constant PROD_TX_REG_STATEMENT =
        "This signature confirms permanent registration of stolen transactions in the Stolen Wallet Registry. This action is irreversible.";

    // Typehashes (matching EIP712Constants.sol)
    bytes32 internal constant PROD_TX_ACK_TYPEHASH = keccak256(
        "TransactionBatchAcknowledgement(string statement,address reporter,address trustedForwarder,bytes32 dataHash,bytes32 reportedChainId,uint32 transactionCount,uint256 nonce,uint256 deadline)"
    );

    bytes32 internal constant PROD_TX_REG_TYPEHASH = keccak256(
        "TransactionBatchRegistration(string statement,address reporter,address trustedForwarder,bytes32 dataHash,bytes32 reportedChainId,uint32 transactionCount,uint256 nonce,uint256 deadline)"
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS (must re-declare for vm.expectEmit)
    // ═══════════════════════════════════════════════════════════════════════════

    event TransactionBatchAcknowledged(
        address indexed reporter, address indexed trustedForwarder, bytes32 dataHash, bool isSponsored
    );
    event TransactionRegistered(
        bytes32 indexed txHash, bytes32 indexed chainId, address indexed reporter, bool isSponsored
    );
    event TransactionBatchRegistered(
        uint256 indexed batchId,
        address indexed reporter,
        bytes32 indexed dataHash,
        uint32 transactionCount,
        bool isSponsored
    );
    event CrossChainTransactionRegistered(
        bytes32 indexed identifier, bytes32 indexed sourceChainId, uint8 bridgeId, bytes32 messageId
    );
    event TransactionBatchCreated(uint256 indexed batchId, bytes32 indexed operatorId, uint32 transactionCount);
    event HubUpdated(address oldHub, address newHub);
    event OperatorSubmitterUpdated(address oldOperatorSubmitter, address newOperatorSubmitter);

    // ═══════════════════════════════════════════════════════════════════════════
    // SETUP
    // ═══════════════════════════════════════════════════════════════════════════

    function setUp() public {
        vm.warp(1_704_067_200);

        owner = makeAddr("owner");
        reporterPrivateKey = 0xA11CE;
        reporter = vm.addr(reporterPrivateKey);
        forwarder = makeAddr("forwarder");
        operatorSubmitter = makeAddr("operatorSubmitter");

        vm.startPrank(owner);

        txRegistry = new TransactionRegistry(owner, address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);
        hub = new FraudRegistryHub(owner, owner);

        txRegistry.setHub(address(hub));
        hub.setTransactionRegistry(address(txRegistry));
        txRegistry.setOperatorSubmitter(operatorSubmitter);

        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Compute domain separator matching the TransactionRegistry's EIP-712 domain
    /// @dev Uses "StolenWalletRegistry" as domain name (matches contract constructor)
    function _prodDomainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_TYPE_HASH,
                keccak256(bytes(DOMAIN_NAME)),
                keccak256(bytes(DOMAIN_VERSION)),
                block.chainid,
                address(txRegistry)
            )
        );
    }

    /// @notice Sign a transaction batch acknowledgement using production constants
    function _signProdTxAck(
        uint256 privateKey,
        address _reporter,
        address _forwarder,
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint32 transactionCount,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(
            abi.encode(
                PROD_TX_ACK_TYPEHASH,
                keccak256(bytes(PROD_TX_ACK_STATEMENT)),
                _reporter,
                _forwarder,
                dataHash,
                reportedChainId,
                transactionCount,
                nonce,
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _prodDomainSeparator(), structHash));
        (v, r, s) = vm.sign(privateKey, digest);
    }

    /// @notice Sign a transaction batch registration using production constants
    function _signProdTxReg(
        uint256 privateKey,
        address _reporter,
        address _forwarder,
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint32 transactionCount,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(
            abi.encode(
                PROD_TX_REG_TYPEHASH,
                keccak256(bytes(PROD_TX_REG_STATEMENT)),
                _reporter,
                _forwarder,
                dataHash,
                reportedChainId,
                transactionCount,
                nonce,
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _prodDomainSeparator(), structHash));
        (v, r, s) = vm.sign(privateKey, digest);
    }

    /// @notice Create a sample 3-transaction batch for testing
    function _createSampleBatch() internal pure returns (bytes32[] memory txHashes, bytes32[] memory chainIds) {
        txHashes = new bytes32[](3);
        chainIds = new bytes32[](3);
        txHashes[0] = keccak256("tx1");
        txHashes[1] = keccak256("tx2");
        txHashes[2] = keccak256("tx3");
        bytes32 chainId = CAIP10Evm.caip2Hash(uint64(1)); // mainnet
        chainIds[0] = chainId;
        chainIds[1] = chainId;
        chainIds[2] = chainId;
    }

    /// @notice Compute the dataHash for a batch of transactions
    function _computeDataHash(bytes32[] memory txH, bytes32[] memory cIds) internal pure returns (bytes32) {
        return keccak256(abi.encode(txH, cIds));
    }

    /// @notice Execute a full acknowledgement with valid defaults
    /// @dev Pranks as forwarder for the msg.sender context
    function _doAcknowledge(address _forwarder, bytes32[] memory txHashes, bytes32[] memory chainIds) internal {
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint256 nonce = txRegistry.nonces(reporter);
        uint256 deadline = block.timestamp + 3600;

        (uint8 v, bytes32 r, bytes32 s) = _signProdTxAck(
            reporterPrivateKey,
            reporter,
            _forwarder,
            dataHash,
            reportedChainId,
            uint32(txHashes.length),
            nonce,
            deadline
        );

        vm.prank(_forwarder);
        txRegistry.acknowledgeTransactions(
            reporter, _forwarder, deadline, dataHash, reportedChainId, uint32(txHashes.length), v, r, s
        );
    }

    /// @notice Execute a full registration after acknowledgement
    /// @dev Advances past grace period, pranks as forwarder
    function _doRegister(address _forwarder, bytes32[] memory txHashes, bytes32[] memory chainIds) internal {
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint256 nonce = txRegistry.nonces(reporter);
        uint256 deadline = block.timestamp + 3600;

        // Advance past grace period
        ITransactionRegistry.TransactionAcknowledgementData memory ack =
            txRegistry.getTransactionAcknowledgementData(reporter);
        vm.roll(ack.gracePeriodStart + 1);

        (uint8 v, bytes32 r, bytes32 s) = _signProdTxReg(
            reporterPrivateKey,
            reporter,
            _forwarder,
            dataHash,
            reportedChainId,
            uint32(txHashes.length),
            nonce,
            deadline
        );

        vm.prank(_forwarder);
        txRegistry.registerTransactions(reporter, deadline, txHashes, chainIds, v, r, s);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ACKNOWLEDGE PHASE TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Valid acknowledgement stores pending data and emits event
    function test_TxAck_Success() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint256 nonce = 0;
        uint256 deadline = block.timestamp + 3600;

        (uint8 v, bytes32 r, bytes32 s) =
            _signProdTxAck(reporterPrivateKey, reporter, forwarder, dataHash, reportedChainId, 3, nonce, deadline);

        vm.expectEmit(true, true, false, true, address(txRegistry));
        emit TransactionBatchAcknowledged(reporter, forwarder, dataHash, true);

        vm.prank(forwarder);
        txRegistry.acknowledgeTransactions(reporter, forwarder, deadline, dataHash, reportedChainId, 3, v, r, s);

        // Verify pending state
        assertTrue(txRegistry.isTransactionPending(reporter));
        assertEq(txRegistry.nonces(reporter), 1, "Nonce should increment after ack");

        // Verify stored ack data
        ITransactionRegistry.TransactionAcknowledgementData memory ack =
            txRegistry.getTransactionAcknowledgementData(reporter);
        assertEq(ack.trustedForwarder, forwarder);
        assertEq(ack.dataHash, dataHash);
        assertEq(ack.reportedChainId, reportedChainId);
        assertEq(ack.transactionCount, 3);
        assertTrue(ack.isSponsored, "Should be sponsored when reporter != forwarder");
    }

    /// @notice When reporter == forwarder, isSponsored should be false
    function test_TxAck_SelfRelay() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint256 nonce = 0;
        uint256 deadline = block.timestamp + 3600;

        // Reporter is also the forwarder (standard registration)
        (uint8 v, bytes32 r, bytes32 s) =
            _signProdTxAck(reporterPrivateKey, reporter, reporter, dataHash, reportedChainId, 3, nonce, deadline);

        vm.expectEmit(true, true, false, true, address(txRegistry));
        emit TransactionBatchAcknowledged(reporter, reporter, dataHash, false);

        vm.prank(reporter);
        txRegistry.acknowledgeTransactions(reporter, reporter, deadline, dataHash, reportedChainId, 3, v, r, s);

        ITransactionRegistry.TransactionAcknowledgementData memory ack =
            txRegistry.getTransactionAcknowledgementData(reporter);
        assertFalse(ack.isSponsored, "Self-relay should not be sponsored");
    }

    /// @notice Reverts when reporter is address(0)
    function test_TxAck_RejectsZeroReporter() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint256 deadline = block.timestamp + 3600;

        vm.expectRevert(ITransactionRegistry.TransactionRegistry__ZeroAddress.selector);
        vm.prank(forwarder);
        txRegistry.acknowledgeTransactions(
            address(0), forwarder, deadline, dataHash, reportedChainId, 3, 27, bytes32(0), bytes32(0)
        );
    }

    /// @notice Reverts when forwarder is address(0)
    function test_TxAck_RejectsZeroForwarder() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint256 deadline = block.timestamp + 3600;

        vm.expectRevert(ITransactionRegistry.TransactionRegistry__ZeroAddress.selector);
        vm.prank(forwarder);
        txRegistry.acknowledgeTransactions(
            reporter, address(0), deadline, dataHash, reportedChainId, 3, 27, bytes32(0), bytes32(0)
        );
    }

    /// @notice Reverts when deadline is in the past or at current timestamp
    function test_TxAck_RejectsExpiredDeadline() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint256 deadline = block.timestamp; // exactly now, should fail (deadline <= block.timestamp)

        vm.expectRevert(ITransactionRegistry.TransactionRegistry__DeadlineExpired.selector);
        vm.prank(forwarder);
        txRegistry.acknowledgeTransactions(
            reporter, forwarder, deadline, dataHash, reportedChainId, 3, 27, bytes32(0), bytes32(0)
        );
    }

    /// @notice Reverts when dataHash is bytes32(0)
    function test_TxAck_RejectsZeroDataHash() public {
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint256 deadline = block.timestamp + 3600;

        vm.expectRevert(ITransactionRegistry.TransactionRegistry__DataHashMismatch.selector);
        vm.prank(forwarder);
        txRegistry.acknowledgeTransactions(
            reporter, forwarder, deadline, bytes32(0), reportedChainId, 3, 27, bytes32(0), bytes32(0)
        );
    }

    /// @notice Reverts when transactionCount is 0
    function test_TxAck_RejectsEmptyBatch() public {
        bytes32 dataHash = keccak256("some data");
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint256 deadline = block.timestamp + 3600;

        vm.expectRevert(ITransactionRegistry.TransactionRegistry__EmptyBatch.selector);
        vm.prank(forwarder);
        txRegistry.acknowledgeTransactions(
            reporter, forwarder, deadline, dataHash, reportedChainId, 0, 27, bytes32(0), bytes32(0)
        );
    }

    /// @notice Reverts when reporter already has a pending acknowledgement
    function test_TxAck_RejectsAlreadyAcknowledged() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        _doAcknowledge(forwarder, txHashes, chainIds);

        // Try to acknowledge again while still pending
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint256 nonce = txRegistry.nonces(reporter);
        uint256 deadline = block.timestamp + 3600;

        (uint8 v, bytes32 r, bytes32 s) =
            _signProdTxAck(reporterPrivateKey, reporter, forwarder, dataHash, reportedChainId, 3, nonce, deadline);

        vm.expectRevert(ITransactionRegistry.TransactionRegistry__AlreadyAcknowledged.selector);
        vm.prank(forwarder);
        txRegistry.acknowledgeTransactions(reporter, forwarder, deadline, dataHash, reportedChainId, 3, v, r, s);
    }

    /// @notice Reverts when signature is from wrong key
    function test_TxAck_RejectsInvalidSignature() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint256 nonce = 0;
        uint256 deadline = block.timestamp + 3600;

        uint256 wrongKey = 0xBAD;
        (uint8 v, bytes32 r, bytes32 s) =
            _signProdTxAck(wrongKey, reporter, forwarder, dataHash, reportedChainId, 3, nonce, deadline);

        vm.expectRevert(ITransactionRegistry.TransactionRegistry__InvalidSignature.selector);
        vm.prank(forwarder);
        txRegistry.acknowledgeTransactions(reporter, forwarder, deadline, dataHash, reportedChainId, 3, v, r, s);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REGISTER PHASE TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Full two-phase flow: acknowledge -> grace period -> register
    /// Verifies per-tx events, batch event, state cleanup, and transaction lookup
    function test_TxReg_Success() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));

        // Phase 1: Acknowledge
        _doAcknowledge(forwarder, txHashes, chainIds);

        // Advance past grace period
        ITransactionRegistry.TransactionAcknowledgementData memory ack =
            txRegistry.getTransactionAcknowledgementData(reporter);
        vm.roll(ack.gracePeriodStart + 1);

        // Prepare registration signature
        uint256 nonce = txRegistry.nonces(reporter);
        uint256 deadline = block.timestamp + 3600;
        (uint8 v, bytes32 r, bytes32 s) =
            _signProdTxReg(reporterPrivateKey, reporter, forwarder, dataHash, reportedChainId, 3, nonce, deadline);

        // Expect per-transaction events
        for (uint256 i = 0; i < txHashes.length; i++) {
            vm.expectEmit(true, true, true, true, address(txRegistry));
            emit TransactionRegistered(txHashes[i], chainIds[i], reporter, true);
        }

        // Expect batch event (batchId = 1)
        vm.expectEmit(true, true, true, true, address(txRegistry));
        emit TransactionBatchRegistered(1, reporter, dataHash, 3, true);

        // Phase 2: Register
        vm.prank(forwarder);
        txRegistry.registerTransactions(reporter, deadline, txHashes, chainIds, v, r, s);

        // Verify transactions are registered
        for (uint256 i = 0; i < txHashes.length; i++) {
            assertTrue(txRegistry.isTransactionRegistered(txHashes[i], chainIds[i]), "Transaction should be registered");
        }

        // Verify pending state cleared
        assertFalse(txRegistry.isTransactionPending(reporter), "Pending should be cleared after registration");

        // Verify nonce incremented (ack used nonce 0, reg used nonce 1)
        assertEq(txRegistry.nonces(reporter), 2, "Nonce should be 2 after ack + reg");

        // Verify batch metadata
        ITransactionRegistry.TransactionBatch memory batch = txRegistry.getTransactionBatch(1);
        assertEq(batch.reporter, reporter);
        assertEq(batch.dataHash, dataHash);
        assertEq(batch.transactionCount, 3);
        assertEq(batch.operatorId, bytes32(0), "Individual batch should have zero operatorId");
        assertEq(txRegistry.transactionBatchCount(), 1);
    }

    /// @notice Reverts when registration attempted before grace period starts
    function test_TxReg_RejectsBeforeGracePeriod() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));

        _doAcknowledge(forwarder, txHashes, chainIds);

        // Do NOT advance blocks — still in grace period
        uint256 nonce = txRegistry.nonces(reporter);
        uint256 deadline = block.timestamp + 3600;
        (uint8 v, bytes32 r, bytes32 s) =
            _signProdTxReg(reporterPrivateKey, reporter, forwarder, dataHash, reportedChainId, 3, nonce, deadline);

        vm.expectRevert(ITransactionRegistry.TransactionRegistry__GracePeriodNotStarted.selector);
        vm.prank(forwarder);
        txRegistry.registerTransactions(reporter, deadline, txHashes, chainIds, v, r, s);
    }

    /// @notice Reverts when registration attempted after deadline expires
    function test_TxReg_RejectsAfterExpiry() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));

        _doAcknowledge(forwarder, txHashes, chainIds);

        // Advance well past deadline
        ITransactionRegistry.TransactionAcknowledgementData memory ack =
            txRegistry.getTransactionAcknowledgementData(reporter);
        vm.roll(ack.deadline + 1);

        uint256 nonce = txRegistry.nonces(reporter);
        uint256 deadline = block.timestamp + 3600;
        (uint8 v, bytes32 r, bytes32 s) =
            _signProdTxReg(reporterPrivateKey, reporter, forwarder, dataHash, reportedChainId, 3, nonce, deadline);

        vm.expectRevert(ITransactionRegistry.TransactionRegistry__DeadlineExpired.selector);
        vm.prank(forwarder);
        txRegistry.registerTransactions(reporter, deadline, txHashes, chainIds, v, r, s);
    }

    /// @notice Reverts when msg.sender is not the authorized forwarder
    function test_TxReg_RejectsWrongForwarder() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));

        _doAcknowledge(forwarder, txHashes, chainIds);

        // Advance past grace period
        ITransactionRegistry.TransactionAcknowledgementData memory ack =
            txRegistry.getTransactionAcknowledgementData(reporter);
        vm.roll(ack.gracePeriodStart + 1);

        address wrongForwarder = makeAddr("wrongForwarder");
        uint256 nonce = txRegistry.nonces(reporter);
        uint256 deadline = block.timestamp + 3600;

        // Sign with wrongForwarder as the forwarder in the sig (matching msg.sender)
        (uint8 v, bytes32 r, bytes32 s) = _signProdTxReg(
            reporterPrivateKey, reporter, wrongForwarder, dataHash, reportedChainId, 3, nonce, deadline
        );

        vm.expectRevert(ITransactionRegistry.TransactionRegistry__InvalidForwarder.selector);
        vm.prank(wrongForwarder);
        txRegistry.registerTransactions(reporter, deadline, txHashes, chainIds, v, r, s);
    }

    /// @notice Reverts when submitted transaction data does not match acknowledged dataHash
    function test_TxReg_RejectsDataHashMismatch() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));

        _doAcknowledge(forwarder, txHashes, chainIds);

        // Advance past grace period
        ITransactionRegistry.TransactionAcknowledgementData memory ack =
            txRegistry.getTransactionAcknowledgementData(reporter);
        vm.roll(ack.gracePeriodStart + 1);

        // Tamper with the data — different tx hashes than acknowledged
        bytes32[] memory differentTxHashes = new bytes32[](3);
        differentTxHashes[0] = keccak256("tampered1");
        differentTxHashes[1] = keccak256("tampered2");
        differentTxHashes[2] = keccak256("tampered3");

        bytes32 differentDataHash = _computeDataHash(differentTxHashes, chainIds);
        uint256 nonce = txRegistry.nonces(reporter);
        uint256 deadline = block.timestamp + 3600;

        (uint8 v, bytes32 r, bytes32 s) = _signProdTxReg(
            reporterPrivateKey, reporter, forwarder, differentDataHash, reportedChainId, 3, nonce, deadline
        );

        vm.expectRevert(ITransactionRegistry.TransactionRegistry__DataHashMismatch.selector);
        vm.prank(forwarder);
        txRegistry.registerTransactions(reporter, deadline, differentTxHashes, chainIds, v, r, s);
    }

    /// @notice Reverts when submitted arrays differ from what was acknowledged.
    /// @dev The contract computes dataHash from submitted arrays. Changing the array
    ///      length changes the dataHash, so DataHashMismatch fires before the
    ///      transactionCount check (ArrayLengthMismatch). This is the correct
    ///      defense-in-depth: any data tampering is caught by the hash commitment.
    function test_TxReg_RejectsCountMismatch() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();

        // Acknowledge with 3 transactions
        _doAcknowledge(forwarder, txHashes, chainIds);

        // Advance past grace period
        ITransactionRegistry.TransactionAcknowledgementData memory ack =
            txRegistry.getTransactionAcknowledgementData(reporter);
        vm.roll(ack.gracePeriodStart + 1);

        // Submit only 2 transactions (count mismatch → dataHash mismatch)
        bytes32[] memory fewerTxHashes = new bytes32[](2);
        bytes32[] memory fewerChainIds = new bytes32[](2);
        fewerTxHashes[0] = txHashes[0];
        fewerTxHashes[1] = txHashes[1];
        fewerChainIds[0] = chainIds[0];
        fewerChainIds[1] = chainIds[1];

        bytes32 dataHash = _computeDataHash(fewerTxHashes, fewerChainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint256 nonce = txRegistry.nonces(reporter);
        uint256 deadline = block.timestamp + 3600;

        (uint8 v, bytes32 r, bytes32 s) =
            _signProdTxReg(reporterPrivateKey, reporter, forwarder, dataHash, reportedChainId, 2, nonce, deadline);

        // DataHashMismatch fires first because keccak256(abi.encode(2 items)) != keccak256(abi.encode(3 items))
        vm.expectRevert(ITransactionRegistry.TransactionRegistry__DataHashMismatch.selector);
        vm.prank(forwarder);
        txRegistry.registerTransactions(reporter, deadline, fewerTxHashes, fewerChainIds, v, r, s);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CROSS-CHAIN REGISTRATION FROM HUB
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Hub can register transactions directly (bypasses two-phase)
    function test_TxRegFromHub_Success() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(10)); // Optimism
        bytes32 sourceChainId = CAIP10Evm.caip2Hash(uint64(10));
        bytes32 messageId = keccak256("msg1");

        // Expect per-transaction events
        for (uint256 i = 0; i < txHashes.length; i++) {
            vm.expectEmit(true, true, true, true, address(txRegistry));
            emit TransactionRegistered(txHashes[i], chainIds[i], reporter, true);

            vm.expectEmit(true, true, false, true, address(txRegistry));
            emit CrossChainTransactionRegistered(txHashes[i], sourceChainId, 1, messageId);
        }

        vm.expectEmit(true, true, true, true, address(txRegistry));
        emit TransactionBatchRegistered(1, reporter, dataHash, 3, true);

        vm.prank(address(hub));
        txRegistry.registerTransactionsFromHub(
            reporter, dataHash, reportedChainId, sourceChainId, true, txHashes, chainIds, 1, messageId
        );

        // Verify transactions registered
        for (uint256 i = 0; i < txHashes.length; i++) {
            assertTrue(txRegistry.isTransactionRegistered(txHashes[i], chainIds[i]));

            ITransactionRegistry.TransactionEntry memory entry =
                txRegistry.getTransactionEntry(txHashes[i], chainIds[i]);
            assertEq(entry.reporter, reporter);
            assertEq(entry.reportedChainId, reportedChainId);
            assertEq(entry.sourceChainId, sourceChainId);
            assertEq(entry.bridgeId, 1);
            assertEq(entry.messageId, messageId);
            assertTrue(entry.isSponsored);
        }
    }

    /// @notice Non-hub callers are rejected
    function test_TxRegFromHub_RejectsNonHub() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        bytes32 sourceChainId = CAIP10Evm.caip2Hash(uint64(10));

        vm.expectRevert(ITransactionRegistry.TransactionRegistry__OnlyHub.selector);
        vm.prank(makeAddr("randomCaller"));
        txRegistry.registerTransactionsFromHub(
            reporter, dataHash, reportedChainId, sourceChainId, false, txHashes, chainIds, 0, bytes32(0)
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OPERATOR BATCH REGISTRATION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Operator submitter can batch register transactions
    function test_TxRegFromOperator_Success() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 operatorId = keccak256("operator1");

        // Expect per-transaction events (reporter = address(0) for operator submissions)
        for (uint256 i = 0; i < txHashes.length; i++) {
            vm.expectEmit(true, true, true, true, address(txRegistry));
            emit TransactionRegistered(txHashes[i], chainIds[i], address(0), false);
        }

        vm.expectEmit(true, true, false, true, address(txRegistry));
        emit TransactionBatchCreated(1, operatorId, 3);

        vm.prank(operatorSubmitter);
        uint256 batchId = txRegistry.registerTransactionsFromOperator(operatorId, txHashes, chainIds);

        assertEq(batchId, 1, "First batch should have ID 1");

        // Verify transactions registered
        for (uint256 i = 0; i < txHashes.length; i++) {
            assertTrue(txRegistry.isTransactionRegistered(txHashes[i], chainIds[i]));

            ITransactionRegistry.TransactionEntry memory entry =
                txRegistry.getTransactionEntry(txHashes[i], chainIds[i]);
            assertEq(entry.reporter, address(0), "Operator submissions have no reporter");
            assertFalse(entry.isSponsored);
        }

        // Verify batch metadata
        ITransactionRegistry.TransactionBatch memory batch = txRegistry.getTransactionBatch(batchId);
        assertEq(batch.operatorId, operatorId);
        assertEq(batch.transactionCount, 3);
        assertEq(batch.reporter, address(0));
        assertEq(batch.dataHash, bytes32(0), "Operator batches have no dataHash");
    }

    /// @notice Non-operator submitter callers are rejected
    function test_TxRegFromOperator_RejectsNonSubmitter() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 operatorId = keccak256("operator1");

        vm.expectRevert(ITransactionRegistry.TransactionRegistry__OnlyOperatorSubmitter.selector);
        vm.prank(makeAddr("randomCaller"));
        txRegistry.registerTransactionsFromOperator(operatorId, txHashes, chainIds);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice generateTransactionHashStruct returns valid structs for step 1 and step 2
    function test_GenerateTransactionHashStruct() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));

        // Step 1: Acknowledgement
        vm.prank(reporter);
        (uint256 deadline1, bytes32 hashStruct1) =
            txRegistry.generateTransactionHashStruct(dataHash, reportedChainId, 3, forwarder, 1);

        assertTrue(deadline1 > block.timestamp, "Deadline should be in the future");
        assertTrue(hashStruct1 != bytes32(0), "HashStruct should not be zero");

        // Step 2: Registration
        vm.prank(reporter);
        (uint256 deadline2, bytes32 hashStruct2) =
            txRegistry.generateTransactionHashStruct(dataHash, reportedChainId, 3, forwarder, 2);

        assertTrue(deadline2 > block.timestamp, "Deadline should be in the future");
        assertTrue(hashStruct2 != bytes32(0), "HashStruct should not be zero");

        // Step 1 and step 2 should produce different hash structs (different typehashes)
        assertTrue(hashStruct1 != hashStruct2, "ACK and REG hash structs should differ");
    }

    /// @notice generateTransactionHashStruct reverts for invalid step values
    function test_GenerateTransactionHashStruct_RejectsInvalidStep() public {
        bytes32 dataHash = keccak256("data");
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));

        // Step 0 is invalid
        vm.expectRevert(ITransactionRegistry.TransactionRegistry__InvalidStep.selector);
        vm.prank(reporter);
        txRegistry.generateTransactionHashStruct(dataHash, reportedChainId, 3, forwarder, 0);

        // Step 3 is invalid
        vm.expectRevert(ITransactionRegistry.TransactionRegistry__InvalidStep.selector);
        vm.prank(reporter);
        txRegistry.generateTransactionHashStruct(dataHash, reportedChainId, 3, forwarder, 3);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Owner can set hub address; emits event
    function test_SetHub_Success() public {
        address newHub = makeAddr("newHub");
        address oldHub = address(hub);

        vm.expectEmit(false, false, false, true, address(txRegistry));
        emit HubUpdated(oldHub, newHub);

        vm.prank(owner);
        txRegistry.setHub(newHub);

        assertEq(txRegistry.hub(), newHub);
    }

    /// @notice Owner can set operator submitter; emits event
    function test_SetOperatorSubmitter_Success() public {
        address newSubmitter = makeAddr("newSubmitter");
        address oldSubmitter = operatorSubmitter;

        vm.expectEmit(false, false, false, true, address(txRegistry));
        emit OperatorSubmitterUpdated(oldSubmitter, newSubmitter);

        vm.prank(owner);
        txRegistry.setOperatorSubmitter(newSubmitter);

        assertEq(txRegistry.operatorSubmitter(), newSubmitter);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Constructor rejects invalid timing: graceBlocks=0, deadlineBlocks=0, or deadline < 2*grace
    function test_Constructor_RejectsInvalidTiming() public {
        // graceBlocks = 0
        vm.expectRevert(ITransactionRegistry.TransactionRegistry__DeadlineInPast.selector);
        new TransactionRegistry(owner, address(0), 0, 50);

        // deadlineBlocks = 0
        vm.expectRevert(ITransactionRegistry.TransactionRegistry__DeadlineInPast.selector);
        new TransactionRegistry(owner, address(0), 10, 0);

        // deadlineBlocks < 2 * graceBlocks
        vm.expectRevert(ITransactionRegistry.TransactionRegistry__DeadlineInPast.selector);
        new TransactionRegistry(owner, address(0), 10, 15);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STRING INTERFACE HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Convert bytes32 to lowercase hex string with 0x prefix (66 chars total)
    function _bytes32ToHexString(bytes32 value) internal pure returns (string memory) {
        bytes memory buffer = new bytes(66);
        buffer[0] = "0";
        buffer[1] = "x";
        bytes memory alphabet = "0123456789abcdef";
        for (uint256 i = 0; i < 32; i++) {
            buffer[2 + i * 2] = alphabet[uint8(value[i]) >> 4];
            buffer[3 + i * 2] = alphabet[uint8(value[i]) & 0x0f];
        }
        return string(buffer);
    }

    /// @dev Build chain-qualified reference: "eip155:{chainId}:0x{txhash}"
    function _buildTxRef(bytes32 txHash, uint64 chainId) internal pure returns (string memory) {
        return string(abi.encodePacked("eip155:", uint256(chainId).toString(), ":", _bytes32ToHexString(txHash)));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE COLLECTION HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Deploy a TransactionRegistry backed by a real FeeManager + MockAggregator.
    ///      Returns the registry, the fee manager, and the mock aggregator.
    ///      ETH/USD price set to $3000 (8 decimals → 3000_00000000).
    ///      Base fee = $5 (500 cents). Expected fee = (500 * 1e18) / 300_000 wei.
    function _deployWithFeeManager()
        internal
        returns (TransactionRegistry feeRegistry, FeeManager fm, MockAggregator agg)
    {
        agg = new MockAggregator(300_000_000_000); // $3000
        fm = new FeeManager(owner, address(agg));
        feeRegistry = new TransactionRegistry(owner, address(fm), GRACE_BLOCKS, DEADLINE_BLOCKS);

        vm.startPrank(owner);
        feeRegistry.setHub(address(hub));
        feeRegistry.setOperatorSubmitter(operatorSubmitter);
        vm.stopPrank();
    }

    /// @dev Compute domain separator for a specific TransactionRegistry instance
    function _prodDomainSeparatorFor(address registry) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_TYPE_HASH,
                keccak256(bytes(DOMAIN_NAME)),
                keccak256(bytes(DOMAIN_VERSION)),
                block.chainid,
                registry
            )
        );
    }

    /// @dev Sign ack for a specific registry instance.
    ///      Uses state vars (reporter, forwarder, reporterPrivateKey) instead of params
    ///      to reduce stack pressure — the EVM's 16-slot stack limit is easily exceeded
    ///      when 9-param signing helpers are called from functions with their own locals.
    function _signProdTxAckFor(
        address registry,
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint32 transactionCount,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(
            abi.encode(
                PROD_TX_ACK_TYPEHASH,
                keccak256(bytes(PROD_TX_ACK_STATEMENT)),
                reporter,
                forwarder,
                dataHash,
                reportedChainId,
                transactionCount,
                nonce,
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _prodDomainSeparatorFor(registry), structHash));
        (v, r, s) = vm.sign(reporterPrivateKey, digest);
    }

    /// @dev Sign reg for a specific registry instance.
    ///      Uses state vars (reporter, forwarder, reporterPrivateKey) instead of params
    ///      to reduce stack pressure — see _signProdTxAckFor comment for rationale.
    function _signProdTxRegFor(
        address registry,
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint32 transactionCount,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(
            abi.encode(
                PROD_TX_REG_TYPEHASH,
                keccak256(bytes(PROD_TX_REG_STATEMENT)),
                reporter,
                forwarder,
                dataHash,
                reportedChainId,
                transactionCount,
                nonce,
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _prodDomainSeparatorFor(registry), structHash));
        (v, r, s) = vm.sign(reporterPrivateKey, digest);
    }

    /// @dev Full ack+reg flow on a given registry. Returns the required fee for the register call.
    function _doFullFlowOnRegistry(TransactionRegistry reg, bytes32[] memory txHashes, bytes32[] memory chainIds)
        internal
        returns (uint256 fee)
    {
        _doFullFlowAck(reg, txHashes, chainIds);

        // Advance past grace
        ITransactionRegistry.TransactionAcknowledgementData memory ack = reg.getTransactionAcknowledgementData(reporter);
        vm.roll(ack.gracePeriodStart + 1);

        fee = reg.quoteRegistration(reporter);
        vm.deal(forwarder, fee);
        _doFullFlowReg(reg, txHashes, chainIds, fee);
    }

    function _doFullFlowAck(TransactionRegistry reg, bytes32[] memory txHashes, bytes32[] memory chainIds) internal {
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint32 txCount = uint32(txHashes.length);
        uint256 deadline0 = block.timestamp + 3600;
        (uint8 v0, bytes32 r0, bytes32 s0) =
            _signProdTxAckFor(address(reg), dataHash, reportedChainId, txCount, reg.nonces(reporter), deadline0);
        vm.prank(forwarder);
        reg.acknowledgeTransactions(reporter, forwarder, deadline0, dataHash, reportedChainId, txCount, v0, r0, s0);
    }

    function _doFullFlowReg(
        TransactionRegistry reg,
        bytes32[] memory txHashes,
        bytes32[] memory chainIds,
        uint256 sendValue
    ) internal {
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint32 txCount = uint32(txHashes.length);
        uint256 deadline1 = block.timestamp + 3600;
        (uint8 v1, bytes32 r1, bytes32 s1) =
            _signProdTxRegFor(address(reg), dataHash, reportedChainId, txCount, reg.nonces(reporter), deadline1);
        vm.prank(forwarder);
        reg.registerTransactions{ value: sendValue }(reporter, deadline1, txHashes, chainIds, v1, r1, s1);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE COLLECTION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Full ack+reg with FeeManager: fee forwarded to hub
    function test_RegisterTransactions_CollectsFee() public {
        (TransactionRegistry feeRegistry,,) = _deployWithFeeManager();
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();

        uint256 hubBalanceBefore = address(hub).balance;
        uint256 fee = _doFullFlowOnRegistry(feeRegistry, txHashes, chainIds);

        assertTrue(fee > 0, "Fee should be non-zero");
        assertEq(address(hub).balance - hubBalanceBefore, fee, "Hub should have received the fee");
    }

    /// @notice Register with insufficient fee reverts InsufficientFee
    function test_RegisterTransactions_RejectsInsufficientFee() public {
        (TransactionRegistry feeRegistry,,) = _deployWithFeeManager();
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();

        _doFullFlowAck(feeRegistry, txHashes, chainIds);

        // Advance past grace
        ITransactionRegistry.TransactionAcknowledgementData memory ack =
            feeRegistry.getTransactionAcknowledgementData(reporter);
        vm.roll(ack.gracePeriodStart + 1);

        // Pre-compute nonce and signature before vm.expectRevert
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint32 txCount = uint32(txHashes.length);
        uint256 deadline1 = block.timestamp + 3600;
        (uint8 v1, bytes32 r1, bytes32 s1) = _signProdTxRegFor(
            address(feeRegistry), dataHash, reportedChainId, txCount, feeRegistry.nonces(reporter), deadline1
        );

        vm.expectRevert(ITransactionRegistry.TransactionRegistry__InsufficientFee.selector);
        vm.prank(forwarder);
        feeRegistry.registerTransactions{ value: 0 }(reporter, deadline1, txHashes, chainIds, v1, r1, s1);
    }

    /// @notice Excess ETH above the required fee is refunded to msg.sender
    function test_RegisterTransactions_RefundsExcess() public {
        (TransactionRegistry feeRegistry,,) = _deployWithFeeManager();
        _doFullFlowRefundsExcess(feeRegistry);
    }

    /// @dev Extracted to a separate function to avoid stack-too-deep in the test body
    function _doFullFlowRefundsExcess(TransactionRegistry feeRegistry) internal {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();

        _doFullFlowAck(feeRegistry, txHashes, chainIds);

        // Advance past grace
        ITransactionRegistry.TransactionAcknowledgementData memory ack =
            feeRegistry.getTransactionAcknowledgementData(reporter);
        vm.roll(ack.gracePeriodStart + 1);

        uint256 fee = feeRegistry.quoteRegistration(reporter);
        uint256 overpayment = 1 ether;

        vm.deal(forwarder, fee + overpayment);
        uint256 balBefore = forwarder.balance;

        _doFullFlowReg(feeRegistry, txHashes, chainIds, fee + overpayment);

        assertEq(balBefore - forwarder.balance, fee, "Forwarder should only pay the exact fee");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WITHDRAW COLLECTED FEES TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Owner can withdraw collected fees held in the contract
    function test_WithdrawCollectedFees_Success() public {
        uint256 depositAmount = 1 ether;
        vm.deal(address(txRegistry), depositAmount);

        uint256 ownerBalanceBefore = owner.balance;

        vm.prank(owner);
        txRegistry.withdrawCollectedFees();

        assertEq(address(txRegistry).balance, 0, "Registry balance should be zero after withdrawal");
        assertEq(owner.balance - ownerBalanceBefore, depositAmount, "Owner should receive the full balance");
    }

    /// @notice withdrawCollectedFees is a no-op when balance is zero (no revert)
    function test_WithdrawCollectedFees_NoopWhenEmpty() public {
        assertEq(address(txRegistry).balance, 0, "Precondition: balance should be zero");

        // Should not revert
        vm.prank(owner);
        txRegistry.withdrawCollectedFees();

        assertEq(address(txRegistry).balance, 0);
    }

    /// @notice Non-owner cannot call withdrawCollectedFees
    function test_WithdrawCollectedFees_RejectsNonOwner() public {
        address nonOwner = makeAddr("nonOwner");
        vm.deal(address(txRegistry), 1 ether);

        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", nonOwner));
        vm.prank(nonOwner);
        txRegistry.withdrawCollectedFees();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DUPLICATE / ZERO HASH HANDLING TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Operator batch skips zero hashes; batch count reflects only valid entries
    function test_TxRegFromOperator_SkipsZeroHashes() public {
        bytes32[] memory txHashes = new bytes32[](4);
        bytes32[] memory chainIds = new bytes32[](4);
        bytes32 chainId = CAIP10Evm.caip2Hash(uint64(1));

        txHashes[0] = keccak256("tx1");
        txHashes[1] = bytes32(0); // should be skipped
        txHashes[2] = keccak256("tx3");
        txHashes[3] = bytes32(0); // should be skipped
        chainIds[0] = chainId;
        chainIds[1] = chainId;
        chainIds[2] = chainId;
        chainIds[3] = chainId;

        vm.prank(operatorSubmitter);
        uint256 batchId = txRegistry.registerTransactionsFromOperator(keccak256("op1"), txHashes, chainIds);

        ITransactionRegistry.TransactionBatch memory batch = txRegistry.getTransactionBatch(batchId);
        assertEq(batch.transactionCount, 2, "Only 2 non-zero hashes should be counted");
        assertTrue(txRegistry.isTransactionRegistered(txHashes[0], chainId));
        assertTrue(txRegistry.isTransactionRegistered(txHashes[2], chainId));
    }

    /// @notice Operator batch skips already-registered transactions silently
    function test_TxRegFromOperator_SkipsDuplicates() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();

        // First batch: register all 3
        vm.prank(operatorSubmitter);
        txRegistry.registerTransactionsFromOperator(keccak256("op1"), txHashes, chainIds);

        // Second batch: same txHashes, should all be skipped
        vm.prank(operatorSubmitter);
        uint256 batchId2 = txRegistry.registerTransactionsFromOperator(keccak256("op2"), txHashes, chainIds);

        ITransactionRegistry.TransactionBatch memory batch2 = txRegistry.getTransactionBatch(batchId2);
        assertEq(batch2.transactionCount, 0, "All duplicates should be skipped");
    }

    /// @notice Two-phase registration skips zero hashes in the txHashes array
    function test_TxReg_SkipsZeroHashesInTwoPhase() public {
        // Build batch with a zero hash mixed in
        bytes32[] memory txHashes = new bytes32[](3);
        bytes32[] memory chainIds = new bytes32[](3);
        bytes32 chainId = CAIP10Evm.caip2Hash(uint64(1));

        txHashes[0] = keccak256("txA");
        txHashes[1] = bytes32(0); // zero hash — should be skipped
        txHashes[2] = keccak256("txC");
        chainIds[0] = chainId;
        chainIds[1] = chainId;
        chainIds[2] = chainId;

        _doAcknowledge(forwarder, txHashes, chainIds);
        _doRegister(forwarder, txHashes, chainIds);

        // Verify batch count reflects only non-zero entries
        ITransactionRegistry.TransactionBatch memory batch = txRegistry.getTransactionBatch(1);
        assertEq(batch.transactionCount, 2, "Zero hashes should be skipped in two-phase");
        assertTrue(txRegistry.isTransactionRegistered(txHashes[0], chainId));
        assertTrue(txRegistry.isTransactionRegistered(txHashes[2], chainId));
    }

    /// @notice Two-phase registration skips already-registered transactions
    function test_TxReg_SkipsDuplicatesInTwoPhase() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();

        // Register first via operator
        vm.prank(operatorSubmitter);
        txRegistry.registerTransactionsFromOperator(keccak256("op1"), txHashes, chainIds);

        // Now attempt two-phase registration of the same hashes
        _doAcknowledge(forwarder, txHashes, chainIds);
        _doRegister(forwarder, txHashes, chainIds);

        // Batch 2 should report 0 actual registrations (all duplicates)
        ITransactionRegistry.TransactionBatch memory batch = txRegistry.getTransactionBatch(2);
        assertEq(batch.transactionCount, 0, "All duplicates should be skipped in two-phase");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STRING-BASED CAIP-10 INTERFACE TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice isTransactionRegistered(string) returns true for a registered tx
    function test_IsTransactionRegistered_String() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();

        // Register via operator for simplicity
        vm.prank(operatorSubmitter);
        txRegistry.registerTransactionsFromOperator(keccak256("op1"), txHashes, chainIds);

        // Build chain-qualified reference for first tx (chain 1 = mainnet)
        string memory ref = _buildTxRef(txHashes[0], uint64(1));
        assertTrue(txRegistry.isTransactionRegistered(ref), "String lookup should find registered tx");

        // Unregistered tx should return false
        string memory unregisteredRef = _buildTxRef(keccak256("nonexistent"), uint64(1));
        assertFalse(txRegistry.isTransactionRegistered(unregisteredRef), "Unregistered tx should return false");
    }

    /// @notice getTransactionEntry(string) returns correct entry data
    function test_GetTransactionEntry_String() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();

        // Register via two-phase for a real reporter
        _doAcknowledge(forwarder, txHashes, chainIds);
        _doRegister(forwarder, txHashes, chainIds);

        string memory ref = _buildTxRef(txHashes[0], uint64(1));
        ITransactionRegistry.TransactionEntry memory entry = txRegistry.getTransactionEntry(ref);

        assertEq(entry.reporter, reporter, "Reporter should match");
        assertTrue(entry.registeredAt > 0, "registeredAt should be set");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN ZERO-ADDRESS CHECKS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice setHub rejects zero address
    function test_SetHub_RejectsZeroAddress() public {
        vm.expectRevert(ITransactionRegistry.TransactionRegistry__ZeroAddress.selector);
        vm.prank(owner);
        txRegistry.setHub(address(0));
    }

    /// @notice setOperatorSubmitter rejects zero address
    function test_SetOperatorSubmitter_RejectsZeroAddress() public {
        vm.expectRevert(ITransactionRegistry.TransactionRegistry__ZeroAddress.selector);
        vm.prank(owner);
        txRegistry.setOperatorSubmitter(address(0));
    }

    /// @notice setHub rejects non-owner
    function test_SetHub_RejectsNonOwner() public {
        address nonOwner = makeAddr("nonOwner");
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", nonOwner));
        vm.prank(nonOwner);
        txRegistry.setHub(makeAddr("newHub"));
    }

    /// @notice setOperatorSubmitter rejects non-owner
    function test_SetOperatorSubmitter_RejectsNonOwner() public {
        address nonOwner = makeAddr("nonOwner");
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", nonOwner));
        vm.prank(nonOwner);
        txRegistry.setOperatorSubmitter(makeAddr("newSub"));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MODIFIER EDGE CASES
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice When hub == address(0), registerTransactionsFromHub reverts OnlyHub
    function test_RegisterFromHub_RejectsWhenHubNotSet() public {
        // Deploy fresh registry with no hub set
        TransactionRegistry noHubRegistry = new TransactionRegistry(owner, address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);

        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));

        vm.expectRevert(ITransactionRegistry.TransactionRegistry__OnlyHub.selector);
        vm.prank(makeAddr("anyone"));
        noHubRegistry.registerTransactionsFromHub(
            reporter, dataHash, reportedChainId, reportedChainId, false, txHashes, chainIds, 0, bytes32(0)
        );
    }

    /// @notice When operatorSubmitter == address(0), registerTransactionsFromOperator reverts OnlyOperatorSubmitter
    function test_RegisterFromOperator_RejectsWhenSubmitterNotSet() public {
        // Deploy fresh registry with no operatorSubmitter set
        TransactionRegistry noSubRegistry = new TransactionRegistry(owner, address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);

        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 operatorId = keccak256("op1");

        vm.expectRevert(ITransactionRegistry.TransactionRegistry__OnlyOperatorSubmitter.selector);
        vm.prank(makeAddr("anyone"));
        noSubRegistry.registerTransactionsFromOperator(operatorId, txHashes, chainIds);
    }
}
