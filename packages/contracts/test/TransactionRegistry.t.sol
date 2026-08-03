// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, Vm } from "forge-std/Test.sol";
import { TransactionRegistry } from "../src/registries/TransactionRegistry.sol";
import { ITransactionRegistry } from "../src/interfaces/ITransactionRegistry.sol";
import { FraudRegistryHub } from "../src/FraudRegistryHub.sol";
import { CAIP10 } from "../src/libraries/CAIP10.sol";
import { CAIP10Evm } from "../src/libraries/CAIP10Evm.sol";
import { EIP712TestHelper } from "./helpers/EIP712TestHelper.sol";
import { TimingConfig } from "../src/libraries/TimingConfig.sol";
import { FeeManager } from "../src/FeeManager.sol";
import { MockAggregator } from "./mocks/MockAggregator.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

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

    // NOTE: the registration typehash commits to `windowBlockHash` — the hash of a block at or
    // after `gracePeriodStart`. That block does not exist at acknowledgement time, so the
    // registration signature is unproducible in the same sitting (anti-phishing, V1 fix).
    bytes32 internal constant PROD_TX_REG_TYPEHASH = keccak256(
        "TransactionBatchRegistration(string statement,address reporter,address trustedForwarder,bytes32 dataHash,bytes32 reportedChainId,uint32 transactionCount,uint256 nonce,uint256 deadline,bytes32 windowBlockHash)"
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

    /// @notice Block whose hash the next registration signature commits to.
    /// @dev Passed via state rather than as an extra parameter to the registration signing
    ///      helpers. The registration struct now encodes 9 fields, and these helpers are called
    ///      from test bodies that already carry many locals; an additional parameter pushes the
    ///      call over the EVM's 16-slot stack limit (this project builds WITHOUT via-ir).
    ///      Callers set `_sigWindowBlock = windowBlock;` immediately before signing.
    uint256 internal _sigWindowBlock;

    /// @notice Sign a transaction batch registration using production constants
    /// @dev Commits to `blockhash(_sigWindowBlock)` — see {_sigWindowBlock}.
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
                deadline,
                blockhash(_sigWindowBlock)
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

        // Advance past grace period. _rollToWindow rolls to gracePeriodStart + 1 and returns
        // gracePeriodStart, which satisfies both windowBlock >= graceStart and windowBlock < block.number.
        uint256 windowBlock = _rollToWindow(txRegistry.getTransactionAcknowledgementData(reporter).gracePeriodStart);

        _sigWindowBlock = windowBlock;
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
        txRegistry.registerTransactions(reporter, deadline, txHashes, chainIds, windowBlock, v, r, s);
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
    /// @dev Expects `__InvalidDataHash` (a CALLER BUG — nothing has been acknowledged yet, so
    ///      there is nothing to have tampered with), NOT `__DataHashMismatch`, which is reserved
    ///      for a phase-2 batch that differs from the acknowledged one.
    function test_TxAck_RejectsZeroDataHash() public {
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint256 deadline = block.timestamp + 3600;

        vm.expectRevert(ITransactionRegistry.TransactionRegistry__InvalidDataHash.selector);
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
        uint256 windowBlock = _rollToWindow(txRegistry.getTransactionAcknowledgementData(reporter).gracePeriodStart);

        // Prepare registration signature
        uint256 nonce = txRegistry.nonces(reporter);
        uint256 deadline = block.timestamp + 3600;
        _sigWindowBlock = windowBlock;
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
        txRegistry.registerTransactions(reporter, deadline, txHashes, chainIds, windowBlock, v, r, s);

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

        // Do NOT advance blocks — still in grace period. The grace-period check fires before
        // the window-block resolution, so any already-mined windowBlock is fine here.
        uint256 nonce = txRegistry.nonces(reporter);
        uint256 deadline = block.timestamp + 3600;
        uint256 windowBlock = block.number - 1;
        _sigWindowBlock = windowBlock;
        (uint8 v, bytes32 r, bytes32 s) =
            _signProdTxReg(reporterPrivateKey, reporter, forwarder, dataHash, reportedChainId, 3, nonce, deadline);

        vm.expectRevert(ITransactionRegistry.TransactionRegistry__GracePeriodNotStarted.selector);
        vm.prank(forwarder);
        txRegistry.registerTransactions(reporter, deadline, txHashes, chainIds, windowBlock, v, r, s);
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
        // Block-based expiry is checked before window-block resolution, so gracePeriodStart
        // remains a valid windowBlock choice here.
        uint256 windowBlock = ack.gracePeriodStart;
        _sigWindowBlock = windowBlock;
        (uint8 v, bytes32 r, bytes32 s) =
            _signProdTxReg(reporterPrivateKey, reporter, forwarder, dataHash, reportedChainId, 3, nonce, deadline);

        vm.expectRevert(ITransactionRegistry.TransactionRegistry__DeadlineExpired.selector);
        vm.prank(forwarder);
        txRegistry.registerTransactions(reporter, deadline, txHashes, chainIds, windowBlock, v, r, s);
    }

    /// @notice Reverts when msg.sender is not the authorized forwarder
    function test_TxReg_RejectsWrongForwarder() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));

        _doAcknowledge(forwarder, txHashes, chainIds);

        // Advance past grace period
        uint256 windowBlock = _rollToWindow(txRegistry.getTransactionAcknowledgementData(reporter).gracePeriodStart);

        address wrongForwarder = makeAddr("wrongForwarder");
        uint256 nonce = txRegistry.nonces(reporter);
        uint256 deadline = block.timestamp + 3600;

        // Sign with wrongForwarder as the forwarder in the sig (matching msg.sender)
        _sigWindowBlock = windowBlock;
        (uint8 v, bytes32 r, bytes32 s) = _signProdTxReg(
            reporterPrivateKey, reporter, wrongForwarder, dataHash, reportedChainId, 3, nonce, deadline
        );

        vm.expectRevert(ITransactionRegistry.TransactionRegistry__InvalidForwarder.selector);
        vm.prank(wrongForwarder);
        txRegistry.registerTransactions(reporter, deadline, txHashes, chainIds, windowBlock, v, r, s);
    }

    /// @notice Reverts when submitted transaction data does not match acknowledged dataHash
    function test_TxReg_RejectsDataHashMismatch() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));

        _doAcknowledge(forwarder, txHashes, chainIds);

        // Advance past grace period
        uint256 windowBlock = _rollToWindow(txRegistry.getTransactionAcknowledgementData(reporter).gracePeriodStart);

        // Tamper with the data — different tx hashes than acknowledged
        bytes32[] memory differentTxHashes = new bytes32[](3);
        differentTxHashes[0] = keccak256("tampered1");
        differentTxHashes[1] = keccak256("tampered2");
        differentTxHashes[2] = keccak256("tampered3");

        bytes32 differentDataHash = _computeDataHash(differentTxHashes, chainIds);
        uint256 nonce = txRegistry.nonces(reporter);
        uint256 deadline = block.timestamp + 3600;

        _sigWindowBlock = windowBlock;
        (uint8 v, bytes32 r, bytes32 s) = _signProdTxReg(
            reporterPrivateKey, reporter, forwarder, differentDataHash, reportedChainId, 3, nonce, deadline
        );

        vm.expectRevert(ITransactionRegistry.TransactionRegistry__DataHashMismatch.selector);
        vm.prank(forwarder);
        txRegistry.registerTransactions(reporter, deadline, differentTxHashes, chainIds, windowBlock, v, r, s);
    }

    /// @notice Reverts when submitted arrays differ from what was acknowledged.
    /// @dev The contract computes dataHash from submitted arrays. Changing the array
    ///      length changes the dataHash, so DataHashMismatch fires before the
    ///      transactionCount check (BatchCountMismatch). This is the correct
    ///      defense-in-depth: any data tampering is caught by the hash commitment.
    function test_TxReg_RejectsCountMismatch() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();

        // Acknowledge with 3 transactions
        _doAcknowledge(forwarder, txHashes, chainIds);

        // Advance past grace period
        uint256 windowBlock = _rollToWindow(txRegistry.getTransactionAcknowledgementData(reporter).gracePeriodStart);

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

        _sigWindowBlock = windowBlock;
        (uint8 v, bytes32 r, bytes32 s) =
            _signProdTxReg(reporterPrivateKey, reporter, forwarder, dataHash, reportedChainId, 2, nonce, deadline);

        // DataHashMismatch fires first because keccak256(abi.encode(2 items)) != keccak256(abi.encode(3 items))
        vm.expectRevert(ITransactionRegistry.TransactionRegistry__DataHashMismatch.selector);
        vm.prank(forwarder);
        txRegistry.registerTransactions(reporter, deadline, fewerTxHashes, fewerChainIds, windowBlock, v, r, s);
    }

    /// @notice A pure count discrepancy reverts with `__BatchCountMismatch`, NOT `__DataHashMismatch`.
    /// @dev This is the discrimination test for the error split, and the only way to reach the
    ///      count check at all. Phase 1 accepts `dataHash` and `transactionCount` as independent
    ///      arguments, so an acknowledgement can commit the hash of the real 3-item batch while
    ///      committing a count of 2. Phase 2 then submits the genuine arrays: the hash commitment
    ///      is satisfied — proving DataHashMismatch is not what fires — and the count is the only
    ///      thing wrong. Without the split, the frontend would see one error here and at
    ///      {test_TxReg_RejectsCountMismatch} and could not tell the two apart.
    function test_TxReg_CountMismatchIsDistinctFromDataHashMismatch() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);

        // Acknowledge the REAL dataHash but a WRONG transactionCount (2, not 3).
        {
            uint256 ackNonce = txRegistry.nonces(reporter);
            uint256 ackDeadline = block.timestamp + 3600;
            (uint8 av, bytes32 ar, bytes32 ass) = _signProdTxAck(
                reporterPrivateKey, reporter, forwarder, dataHash, reportedChainId, 2, ackNonce, ackDeadline
            );
            vm.prank(forwarder);
            txRegistry.acknowledgeTransactions(
                reporter, forwarder, ackDeadline, dataHash, reportedChainId, 2, av, ar, ass
            );
        }

        uint256 windowBlock = _rollToWindow(txRegistry.getTransactionAcknowledgementData(reporter).gracePeriodStart);
        uint256 nonce = txRegistry.nonces(reporter);
        uint256 deadline = block.timestamp + 3600;

        _sigWindowBlock = windowBlock;
        (uint8 v, bytes32 r, bytes32 s) =
            _signProdTxReg(reporterPrivateKey, reporter, forwarder, dataHash, reportedChainId, 3, nonce, deadline);

        // The submitted arrays hash to exactly the acknowledged dataHash, so the hash check passes
        // and only the count check can be responsible for this revert.
        vm.expectRevert(ITransactionRegistry.TransactionRegistry__BatchCountMismatch.selector);
        vm.prank(forwarder);
        txRegistry.registerTransactions(reporter, deadline, txHashes, chainIds, windowBlock, v, r, s);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ANTI-PHISHING: WINDOW BLOCK COMMITMENT
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice A registration signature committing to a block BEFORE the grace period is rejected.
    /// @dev This is the core anti-phishing control. A block older than `gracePeriodStart` already
    ///      existed when the victim acknowledged, so its hash was knowable then — a phisher could
    ///      have harvested both signatures in one sitting. Only a block at or after the grace
    ///      period proves the second signature was produced in a genuinely later interaction.
    function test_registerTransactions_revertsIfWindowBlockBeforeGracePeriod() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));

        _doAcknowledge(forwarder, txHashes, chainIds);

        uint256 graceStart = txRegistry.getTransactionAcknowledgementData(reporter).gracePeriodStart;
        _rollToWindow(graceStart);

        // One block too early — mined and hash-available, but pre-dates the grace period
        uint256 windowBlock = graceStart - 1;
        uint256 nonce = txRegistry.nonces(reporter);
        uint256 deadline = block.timestamp + 3600;
        _sigWindowBlock = windowBlock;
        (uint8 v, bytes32 r, bytes32 s) =
            _signProdTxReg(reporterPrivateKey, reporter, forwarder, dataHash, reportedChainId, 3, nonce, deadline);

        vm.expectRevert(TimingConfig.TimingConfig__WindowBlockBeforeGracePeriod.selector);
        vm.prank(forwarder);
        txRegistry.registerTransactions(reporter, deadline, txHashes, chainIds, windowBlock, v, r, s);
    }

    /// @notice A registration signature referencing the current (unmined) block is rejected.
    /// @dev `blockhash(block.number)` is 0 in the EVM. Without this bound an attacker could
    ///      commit to bytes32(0) for a block that does not exist yet and sidestep the freshness
    ///      requirement entirely.
    function test_registerTransactions_revertsIfWindowBlockNotMined() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));

        _doAcknowledge(forwarder, txHashes, chainIds);

        _rollToWindow(txRegistry.getTransactionAcknowledgementData(reporter).gracePeriodStart);

        // The current block is not yet mined, so its hash is unavailable
        uint256 windowBlock = block.number;
        uint256 nonce = txRegistry.nonces(reporter);
        uint256 deadline = block.timestamp + 3600;
        _sigWindowBlock = windowBlock;
        (uint8 v, bytes32 r, bytes32 s) =
            _signProdTxReg(reporterPrivateKey, reporter, forwarder, dataHash, reportedChainId, 3, nonce, deadline);

        vm.expectRevert(TimingConfig.TimingConfig__WindowBlockNotMined.selector);
        vm.prank(forwarder);
        txRegistry.registerTransactions(reporter, deadline, txHashes, chainIds, windowBlock, v, r, s);
    }

    /// @notice A window block exactly at the edge of the `blockhash` horizon (age 255) is accepted.
    /// @dev Pins the lower half of the boundary the source flags at
    ///      {TimingConfig.resolveWindowBlockHash}: the check is `>= MAX_WINDOW_BLOCK_AGE`, so age
    ///      255 must still work. Without this, tightening the bound by one would pass CI while
    ///      silently shortening the window a P2P relay has to get the signature on-chain.
    function test_registerTransactions_acceptsWindowBlockAtMaxAge() public {
        TransactionRegistry reg = _deployLongWindowRegistry();
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();

        _doFullFlowAck(reg, txHashes, chainIds);

        _sigWindowBlock = reg.getTransactionAcknowledgementData(reporter).gracePeriodStart;
        vm.roll(_sigWindowBlock + TimingConfig.MAX_WINDOW_BLOCK_AGE - 1);
        assertEq(block.number - _sigWindowBlock, 255, "Precondition: window block age must be exactly 255");

        _doFullFlowReg(reg, txHashes, chainIds, 0);

        assertTrue(reg.isTransactionRegistered(txHashes[0], chainIds[0]), "Age-255 window block must be accepted");
    }

    /// @notice A window block one past the `blockhash` horizon (age 256) is rejected.
    /// @dev The upper half of the same boundary. Previously asserted only on the WalletRegistry
    ///      path, so a regression that dropped this bound from the transaction path — where it
    ///      would let a caller commit to `bytes32(0)` for an unreachable block — passed CI.
    function test_registerTransactions_revertsIfWindowBlockTooOld() public {
        TransactionRegistry reg = _deployLongWindowRegistry();
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();

        _doFullFlowAck(reg, txHashes, chainIds);

        uint256 windowBlock = reg.getTransactionAcknowledgementData(reporter).gracePeriodStart;
        _sigWindowBlock = windowBlock;
        vm.roll(windowBlock + TimingConfig.MAX_WINDOW_BLOCK_AGE);
        assertEq(block.number - windowBlock, 256, "Precondition: window block age must be exactly 256");

        // Precomputed BEFORE vm.expectRevert: the cheatcode applies to the next external call,
        // and `nonces()` is one.
        uint256 deadline = block.timestamp + 3600;
        (uint8 v, bytes32 r, bytes32 s) = _signProdTxRegFor(
            address(reg),
            _computeDataHash(txHashes, chainIds),
            CAIP10Evm.caip2Hash(uint64(1)),
            uint32(txHashes.length),
            reg.nonces(reporter),
            deadline
        );

        vm.expectRevert(TimingConfig.TimingConfig__WindowBlockTooOld.selector);
        vm.prank(forwarder);
        reg.registerTransactions(reporter, deadline, txHashes, chainIds, windowBlock, v, r, s);
    }

    /// @dev A registry whose registration window is long enough that the 256-block `blockhash`
    ///      horizon — not the acknowledgement expiry — is the binding constraint. With the shared
    ///      DEADLINE_BLOCKS of 50 the acknowledgement expires ~100 blocks in, so the horizon is
    ///      unreachable and neither boundary above can be exercised.
    function _deployLongWindowRegistry() internal returns (TransactionRegistry reg) {
        reg = new TransactionRegistry(owner, address(0), GRACE_BLOCKS, 400);
        vm.prank(owner);
        reg.setHub(address(hub));
    }

    /// @notice Only the forwarder named in the acknowledgement signature may submit phase 1.
    /// @dev Signature is valid and names `forwarder`, but a third party submits it. Letting anyone
    ///      relay the acknowledgement would let an attacker burn the reporter's nonce and grind the
    ///      randomized timing window by choosing when to open it.
    function test_acknowledgeTransactions_revertsIfSenderIsNotForwarder() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint256 nonce = txRegistry.nonces(reporter);
        uint256 deadline = block.timestamp + 3600;

        (uint8 v, bytes32 r, bytes32 s) =
            _signProdTxAck(reporterPrivateKey, reporter, forwarder, dataHash, reportedChainId, 3, nonce, deadline);

        vm.expectRevert(ITransactionRegistry.TransactionRegistry__InvalidForwarder.selector);
        vm.prank(makeAddr("thirdParty"));
        txRegistry.acknowledgeTransactions(reporter, forwarder, deadline, dataHash, reportedChainId, 3, v, r, s);
    }

    /// @notice A registration deadline beyond MAX_SIGNATURE_LIFETIME is rejected.
    /// @dev Bounds how long a harvested signature stays usable. Without it a hostile frontend
    ///      could set an effectively infinite deadline and submit months later.
    ///      The check fires before signature recovery, so a dummy signature suffices.
    function test_registerTransactions_revertsIfDeadlineTooFarInFuture() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();

        _doAcknowledge(forwarder, txHashes, chainIds);

        uint256 windowBlock = _rollToWindow(txRegistry.getTransactionAcknowledgementData(reporter).gracePeriodStart);
        uint256 tooFar = block.timestamp + TimingConfig.MAX_SIGNATURE_LIFETIME + 1;

        vm.expectRevert(ITransactionRegistry.TransactionRegistry__DeadlineTooFarInFuture.selector);
        vm.prank(forwarder);
        txRegistry.registerTransactions(reporter, tooFar, txHashes, chainIds, windowBlock, 27, bytes32(0), bytes32(0));
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
            assertEq(entry.bridgeId, 1);
            assertTrue(entry.isSponsored);
        }
    }

    /// @notice A cross-chain batch whose entries were all already registered writes no batch.
    /// @dev SECURITY/DATA-INTEGRITY (C-2). The cross-chain path used to increment `_nextBatchId`
    ///      unconditionally and emit `TransactionBatchRegistered(..., 0, ...)` even when every
    ///      entry was skipped. The indexer joins entries to their batch on the shared transaction
    ///      hash, so a batch row with no per-entry events beside it is a permanent orphan, and the
    ///      consumed ID is a hole in the sequence. The local path (`_executeTxBatchRegistration`)
    ///      already got this right; this asserts the cross-chain path matches it.
    ///
    ///      It must NOT revert: Hyperlane redelivers a reverting `handle` indefinitely, so the
    ///      duplicate delivery has to succeed as a no-op.
    function test_TxRegFromHub_AllAlreadyRegistered_WritesNoBatch() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 chainRef = CAIP10Evm.caip2Hash(uint64(10));

        // First delivery lands normally and takes batch ID 1.
        vm.prank(address(hub));
        txRegistry.registerTransactionsFromHub(
            reporter, dataHash, chainRef, chainRef, true, txHashes, chainIds, 1, keccak256("msg1")
        );
        assertEq(txRegistry.getTransactionBatch(1).transactionCount, 3, "First delivery should write batch 1");

        // Second delivery of the same hashes: every entry is skipped.
        vm.recordLogs();
        vm.prank(address(hub));
        txRegistry.registerTransactionsFromHub(
            reporter, dataHash, chainRef, chainRef, true, txHashes, chainIds, 1, keccak256("msg2")
        );

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 batchTopic = keccak256("TransactionBatchRegistered(uint256,address,bytes32,uint32,bool)");
        for (uint256 i = 0; i < logs.length; i++) {
            assertTrue(logs[i].topics[0] != batchTopic, "Zero-entry delivery must not emit a batch event");
        }

        // Nothing was written at ID 2 ...
        assertEq(txRegistry.getTransactionBatch(2).timestamp, 0, "No batch row should exist at ID 2");

        // ... and the ID was not consumed: the next real batch takes 2, not 3.
        bytes32[] memory freshHashes = new bytes32[](1);
        bytes32[] memory freshChains = new bytes32[](1);
        freshHashes[0] = keccak256("tx-fresh");
        freshChains[0] = chainIds[0];

        vm.prank(address(hub));
        txRegistry.registerTransactionsFromHub(
            reporter,
            _computeDataHash(freshHashes, freshChains),
            chainRef,
            chainRef,
            true,
            freshHashes,
            freshChains,
            1,
            keccak256("msg3")
        );
        assertEq(txRegistry.getTransactionBatch(2).transactionCount, 1, "Next real batch must reuse ID 2");
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

    /// @notice getTransactionSignatureDeadline returns a usable deadline for both phases
    function test_GetTransactionSignatureDeadline() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));

        // Deadline only — the function no longer returns a hash struct, because the
        // registration typehash commits to a `windowBlockHash` that is unknowable here.
        vm.prank(reporter);
        uint256 deadline1 = txRegistry.getTransactionSignatureDeadline(dataHash, reportedChainId, 3, forwarder, 1);
        assertTrue(deadline1 > block.timestamp, "Deadline should be in the future");

        vm.prank(reporter);
        uint256 deadline2 = txRegistry.getTransactionSignatureDeadline(dataHash, reportedChainId, 3, forwarder, 2);
        assertTrue(deadline2 > block.timestamp, "Deadline should be in the future");
    }

    /// @notice getTransactionSignatureDeadline reverts for invalid step values
    function test_GetTransactionSignatureDeadline_RejectsInvalidStep() public {
        bytes32 dataHash = keccak256("data");
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));

        // Step 0 is invalid
        vm.expectRevert(ITransactionRegistry.TransactionRegistry__InvalidStep.selector);
        vm.prank(reporter);
        txRegistry.getTransactionSignatureDeadline(dataHash, reportedChainId, 3, forwarder, 0);

        // Step 3 is invalid
        vm.expectRevert(ITransactionRegistry.TransactionRegistry__InvalidStep.selector);
        vm.prank(reporter);
        txRegistry.getTransactionSignatureDeadline(dataHash, reportedChainId, 3, forwarder, 3);
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

    /// @notice Constructor rejects `deadlineBlocks == 2 * graceBlocks` — the exact boundary.
    /// @dev The case the old `< 2 * graceBlocks` bound wrongly ACCEPTED. `getGracePeriodEndBlock`
    ///      can return `bn + 2g - 1` while `getDeadlineBlock` can return `bn + 2g`, and
    ///      `resolveWindowBlockHash` requires `gracePeriodStart <= windowBlock < block.number` — so
    ///      the earliest usable registration block is `gracePeriodStart + 1`, already at/past the
    ///      deadline on that draw. A reporter acknowledging under such a config burns a nonce and
    ///      the acknowledgement gas on a batch that can never be registered, and cannot
    ///      re-acknowledge until the window expires. See {WalletRegistry} for the full derivation.
    function test_Constructor_RejectsDeadlineExactlyTwiceGrace() public {
        vm.expectRevert(ITransactionRegistry.TransactionRegistry__DeadlineInPast.selector);
        new TransactionRegistry(owner, address(0), 10, 20);
    }

    /// @notice Constructor accepts `deadlineBlocks == 2 * graceBlocks + 1` — the smallest config
    ///         that guarantees a usable registration block for every randomised draw.
    function test_Constructor_AcceptsDeadlineTwiceGracePlusOne() public {
        TransactionRegistry reg = new TransactionRegistry(owner, address(0), 10, 21);
        assertEq(reg.graceBlocks(), 10);
        assertEq(reg.deadlineBlocks(), 21);
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
                deadline,
                blockhash(_sigWindowBlock)
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

        // Advance past grace and pick the window block the reg signature will commit to
        _sigWindowBlock = _rollToWindow(reg.getTransactionAcknowledgementData(reporter).gracePeriodStart);

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

    /// @dev Reads the window block from `_sigWindowBlock` (set by the caller via _rollToWindow)
    ///      rather than taking it as a parameter — an extra param here overflows the stack.
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
        reg.registerTransactions{ value: sendValue }(
            reporter, deadline1, txHashes, chainIds, _sigWindowBlock, v1, r1, s1
        );
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
        uint256 windowBlock = _rollToWindow(feeRegistry.getTransactionAcknowledgementData(reporter).gracePeriodStart);

        // Pre-compute nonce and signature before vm.expectRevert
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint32 txCount = uint32(txHashes.length);
        uint256 deadline1 = block.timestamp + 3600;
        _sigWindowBlock = windowBlock;
        (uint8 v1, bytes32 r1, bytes32 s1) = _signProdTxRegFor(
            address(feeRegistry), dataHash, reportedChainId, txCount, feeRegistry.nonces(reporter), deadline1
        );

        vm.expectRevert(ITransactionRegistry.TransactionRegistry__InsufficientFee.selector);
        vm.prank(forwarder);
        feeRegistry.registerTransactions{ value: 0 }(reporter, deadline1, txHashes, chainIds, windowBlock, v1, r1, s1);
    }

    /// @notice Excess ETH above the required fee is refunded to msg.sender
    function test_RegisterTransactions_RefundsExcess() public {
        (TransactionRegistry feeRegistry,,) = _deployWithFeeManager();
        _doFullFlowRefundsExcess(feeRegistry);
    }

    /// @notice Free-registration mode (feeManager == address(0)) refunds everything the caller sent.
    /// @dev `_collectFee` used to `return` on its first line in this mode, BEFORE the excess-refund
    ///      branch, so any `msg.value` was silently retained and recoverable only by the owner.
    ///      `feeManager == address(0)` is a documented, supported deployment shape (it is what this
    ///      suite's own `setUp` uses), and every other fee mode refunds the overpayment — including
    ///      the zero-effective-entry path just below, which already returned the full amount. The
    ///      free path must not be the one mode that keeps the most.
    function test_RegisterTransactions_FreeMode_RefundsEntireMsgValue() public {
        // The suite registry is deployed with feeManager == address(0).
        assertEq(txRegistry.quoteRegistration(reporter), 0, "Precondition: registrations are free");

        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        _doFullFlowAck(txRegistry, txHashes, chainIds);
        _sigWindowBlock = _rollToWindow(txRegistry.getTransactionAcknowledgementData(reporter).gracePeriodStart);

        uint256 sent = 1 ether;
        vm.deal(forwarder, sent);
        uint256 registryBefore = address(txRegistry).balance;

        _doFullFlowReg(txRegistry, txHashes, chainIds, sent);

        assertTrue(txRegistry.isTransactionRegistered(txHashes[0], chainIds[0]), "Registration must still succeed");
        assertEq(forwarder.balance, sent, "Caller must get the full amount back");
        assertEq(address(txRegistry).balance, registryBefore, "Registry must retain nothing");
    }

    /// @notice Free-registration mode with msg.value == 0 is unaffected (the refund is a no-op).
    function test_RegisterTransactions_FreeMode_ZeroValueIsNoOp() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        _doFullFlowAck(txRegistry, txHashes, chainIds);
        _sigWindowBlock = _rollToWindow(txRegistry.getTransactionAcknowledgementData(reporter).gracePeriodStart);

        _doFullFlowReg(txRegistry, txHashes, chainIds, 0);

        assertTrue(txRegistry.isTransactionRegistered(txHashes[0], chainIds[0]));
        assertEq(address(txRegistry).balance, 0);
    }

    /// @dev Extracted to a separate function to avoid stack-too-deep in the test body
    function _doFullFlowRefundsExcess(TransactionRegistry feeRegistry) internal {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();

        _doFullFlowAck(feeRegistry, txHashes, chainIds);

        // Advance past grace
        _sigWindowBlock = _rollToWindow(feeRegistry.getTransactionAcknowledgementData(reporter).gracePeriodStart);

        uint256 fee = feeRegistry.quoteRegistration(reporter);
        uint256 overpayment = 1 ether;

        vm.deal(forwarder, fee + overpayment);
        uint256 balBefore = forwarder.balance;

        _doFullFlowReg(feeRegistry, txHashes, chainIds, fee + overpayment);

        assertEq(balBefore - forwarder.balance, fee, "Forwarder should only pay the exact fee");
    }

    /// @notice V8: a two-phase batch where every entry is skipped (already registered) must not
    ///         charge a registration fee — the caller gets the whole `msg.value` back.
    /// @dev It must still clear the acknowledgement rather than revert. `acknowledgeTransactions`
    ///      refuses a new acknowledgement while a live one exists, so reverting here would strand
    ///      the reporter behind a dataHash they can never satisfy until the window expires.
    function test_TxReg_ZeroEffectiveEntries_ChargesNoFee() public {
        (TransactionRegistry feeRegistry,,) = _deployWithFeeManager();
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();

        // First round registers every hash, so the identical second round is a full no-op.
        _doFullFlowOnRegistry(feeRegistry, txHashes, chainIds);
        _zeroEffectiveSecondRound(feeRegistry, txHashes, chainIds);
    }

    /// @dev Extracted to keep the test body off the stack.
    function _zeroEffectiveSecondRound(
        TransactionRegistry feeRegistry,
        bytes32[] memory txHashes,
        bytes32[] memory chainIds
    ) internal {
        uint256 hubBefore = address(hub).balance;

        _doFullFlowAck(feeRegistry, txHashes, chainIds);
        _sigWindowBlock = _rollToWindow(feeRegistry.getTransactionAcknowledgementData(reporter).gracePeriodStart);

        uint256 fee = feeRegistry.quoteRegistration(reporter);
        assertTrue(fee > 0, "Precondition: fee manager must price this non-zero");
        vm.deal(forwarder, fee);
        uint256 balBefore = forwarder.balance;

        _doFullFlowReg(feeRegistry, txHashes, chainIds, fee);

        assertEq(forwarder.balance, balBefore, "Zero-entry batch must be fully refunded");
        assertEq(address(hub).balance, hubBefore, "Hub must receive nothing for a zero-entry batch");
        assertEq(
            feeRegistry.getTransactionAcknowledgementData(reporter).trustedForwarder,
            address(0),
            "Acknowledgement must still be cleared so the reporter is not locked out"
        );
    }

    /// @notice V8 residual: a two-phase batch that writes zero entries must not materialise a batch.
    /// @dev The refund half of V8 landed; the batch write did not. The indexer joins per-entry
    ///      events to batches on the transaction hash they share, so a batch row with
    ///      transactionCount 0 and no accompanying TransactionRegistered events is a permanent
    ///      orphan — exactly what `registerTransactionsFromOperator`'s EmptyBatch guard was added
    ///      to prevent. A burnt batch ID also leaves a hole in the sequence the indexer walks.
    function test_TxReg_ZeroEffectiveEntries_DoesNotMaterialiseBatch() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();

        // First round registers every hash, so the identical second round writes nothing.
        _doFullFlowOnRegistry(txRegistry, txHashes, chainIds);
        uint256 batchCountAfterFirst = txRegistry.transactionBatchCount();

        _zeroEffectiveRoundEmitsNoBatch(txHashes, chainIds);

        assertEq(txRegistry.transactionBatchCount(), batchCountAfterFirst, "Zero-entry batch must not burn a batch ID");
        assertEq(
            txRegistry.getTransactionBatch(batchCountAfterFirst + 1).timestamp,
            0,
            "No phantom batch row may be written for a zero-entry batch"
        );
    }

    /// @dev Runs the zero-effective round and asserts no TransactionBatchRegistered was emitted.
    ///      Extracted to keep the recordLogs bookkeeping off the caller's stack.
    function _zeroEffectiveRoundEmitsNoBatch(bytes32[] memory txHashes, bytes32[] memory chainIds) internal {
        _doFullFlowAck(txRegistry, txHashes, chainIds);
        _sigWindowBlock = _rollToWindow(txRegistry.getTransactionAcknowledgementData(reporter).gracePeriodStart);

        vm.recordLogs();
        _doFullFlowReg(txRegistry, txHashes, chainIds, 0);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 batchTopic = keccak256("TransactionBatchRegistered(uint256,address,bytes32,uint32,bool)");
        for (uint256 i = 0; i < logs.length; i++) {
            assertTrue(logs[i].topics[0] != batchTopic, "Zero-entry batch must not emit TransactionBatchRegistered");
        }
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

    /// @notice Already-registered entries are skipped, and the batch counts only what landed.
    function test_TxRegFromOperator_SkipsDuplicates() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();

        // First batch: register all 3
        vm.prank(operatorSubmitter);
        txRegistry.registerTransactionsFromOperator(keccak256("op1"), txHashes, chainIds);

        // Second batch: the same 3 duplicates plus one genuinely new entry
        bytes32[] memory mixedHashes = new bytes32[](4);
        bytes32[] memory mixedChainIds = new bytes32[](4);
        for (uint256 i = 0; i < 3; i++) {
            mixedHashes[i] = txHashes[i];
            mixedChainIds[i] = chainIds[i];
        }
        mixedHashes[3] = keccak256("txBrandNew");
        mixedChainIds[3] = chainIds[0];

        vm.prank(operatorSubmitter);
        uint256 batchId2 = txRegistry.registerTransactionsFromOperator(keccak256("op2"), mixedHashes, mixedChainIds);

        ITransactionRegistry.TransactionBatch memory batch2 = txRegistry.getTransactionBatch(batchId2);
        assertEq(batch2.transactionCount, 1, "Only the one new entry should be counted");
    }

    /// @notice A batch where EVERY entry is a duplicate reverts rather than burning a batch ID.
    /// @dev Matches ContractRegistry and WalletRegistry. Previously this silently succeeded:
    ///      the operator paid full gas for a no-op, a batch ID was consumed, and the indexer
    ///      materialised a phantom zero-entry batch with no per-entry events to join against.
    function test_TxRegFromOperator_RevertsWhenEveryEntryIsDuplicate() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();

        vm.prank(operatorSubmitter);
        txRegistry.registerTransactionsFromOperator(keccak256("op1"), txHashes, chainIds);

        vm.prank(operatorSubmitter);
        vm.expectRevert(ITransactionRegistry.TransactionRegistry__EmptyBatch.selector);
        txRegistry.registerTransactionsFromOperator(keccak256("op2"), txHashes, chainIds);
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

        assertGt(entry.batchId, 0, "batchId should be set");
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

    // ═══════════════════════════════════════════════════════════════════════════
    // BATCH SIZE LIMIT
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice registerTransactionsFromOperator reverts when batch exceeds MAX_BATCH_SIZE
    function test_RegisterFromOperator_RejectsBatchTooLarge() public {
        uint256 tooMany = txRegistry.MAX_BATCH_SIZE() + 1;
        bytes32[] memory txHashes = new bytes32[](tooMany);
        bytes32[] memory chainIds = new bytes32[](tooMany);

        vm.expectRevert(ITransactionRegistry.TransactionRegistry__BatchTooLarge.selector);
        vm.prank(operatorSubmitter);
        txRegistry.registerTransactionsFromOperator(keccak256("op"), txHashes, chainIds);
    }

    /// @notice MAX_BATCH_SIZE is 10_000
    function test_MaxBatchSizeValue() public view {
        assertEq(txRegistry.MAX_BATCH_SIZE(), 10_000);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CUSTOM ERROR FOR TX HASH LENGTH
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice isTransactionRegistered(string) reverts with custom error for invalid tx hash length
    function test_IsTransactionRegistered_String_RejectsInvalidLength() public {
        // "eip155:1:0xabc" — tx hash too short (not 66 chars)
        string memory badRef = "eip155:1:0xabc";

        vm.expectRevert(ITransactionRegistry.TransactionRegistry__InvalidTxHashLength.selector);
        txRegistry.isTransactionRegistered(badRef);
    }

    /// @notice getTransactionEntry(string) reverts with custom error for invalid tx hash length
    function test_GetTransactionEntry_String_RejectsInvalidLength() public {
        string memory badRef = "eip155:1:0xabc";

        vm.expectRevert(ITransactionRegistry.TransactionRegistry__InvalidTxHashLength.selector);
        txRegistry.getTransactionEntry(badRef);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WITHDRAW TO
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice withdrawTo sends balance to specified recipient and emits FeesWithdrawn
    function test_WithdrawTo_Success() public {
        vm.deal(address(txRegistry), 1 ether);

        address recipient = makeAddr("feeRecipient");
        uint256 recipientBefore = recipient.balance;

        vm.expectEmit(true, false, false, true);
        emit ITransactionRegistry.FeesWithdrawn(recipient, 1 ether);

        vm.prank(owner);
        txRegistry.withdrawTo(recipient);

        assertEq(address(txRegistry).balance, 0);
        assertEq(recipient.balance - recipientBefore, 1 ether);
    }

    /// @notice withdrawTo rejects zero address
    function test_WithdrawTo_RejectsZeroAddress() public {
        vm.deal(address(txRegistry), 1 ether);

        vm.expectRevert(ITransactionRegistry.TransactionRegistry__ZeroAddress.selector);
        vm.prank(owner);
        txRegistry.withdrawTo(address(0));
    }

    /// @notice withdrawTo is a no-op when balance is zero
    function test_WithdrawTo_NoOpWhenEmpty() public {
        address recipient = makeAddr("emptyRecipient");
        vm.prank(owner);
        txRegistry.withdrawTo(recipient);
        assertEq(recipient.balance, 0);
    }

    /// @notice Non-owner cannot call withdrawTo
    function test_WithdrawTo_RejectsNonOwner() public {
        address nonOwner = makeAddr("nonOwner");
        vm.deal(address(txRegistry), 1 ether);

        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", nonOwner));
        vm.prank(nonOwner);
        txRegistry.withdrawTo(makeAddr("any"));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STORAGE SLOT INVARIANT — TransactionEntry MUST fit in 1 slot
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice TransactionEntry fits in exactly 1 storage slot (no overflow to next slot).
    /// @dev Uses vm.record()/vm.accesses() to discover the entry's storage slot dynamically
    ///      (no hardcoded mapping slot index). A single-slot struct triggers exactly 1 SLOAD
    ///      in the getter; a multi-slot struct would trigger more.
    function test_TransactionEntryFitsInOneSlot() public {
        bytes32 txHash = keccak256("slotTestTx");
        bytes32 chainId = CAIP10Evm.caip2Hash(uint64(1));

        bytes32[] memory hashes = new bytes32[](1);
        hashes[0] = txHash;
        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        vm.prank(operatorSubmitter);
        txRegistry.registerTransactionsFromOperator(keccak256("op"), hashes, chainIds);

        // Record storage reads when fetching the entry — reveals which slot(s) the struct occupies
        vm.record();
        txRegistry.getTransactionEntry(txHash, chainId);
        (bytes32[] memory reads,) = vm.accesses(address(txRegistry));

        // A single-slot entry triggers exactly 1 SLOAD
        assertEq(reads.length, 1, "TransactionEntry should occupy exactly 1 storage slot");

        // Verify the slot is populated
        bytes32 packed = vm.load(address(txRegistry), reads[0]);
        assertNotEq(packed, bytes32(0), "TransactionEntry should be populated");

        // Deliberately NOT asserted: that slot+1 is zero. Entry slots are keccak-derived, so the
        // neighbouring slot is unallocated whatever the struct's size — that assertion held for a
        // two-slot struct too and read as a second, independent proof of the invariant while
        // proving nothing. The vm.record()/reads.length check above is the real proof.
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SIGNATURE MALLEABILITY AND REPLAY
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev secp256k1 group order. (v^1, r, n - s) recovers the same signer under raw ecrecover.
    uint256 internal constant SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    function _malleate(uint8 v, bytes32 s) internal pure returns (uint8 flippedV, bytes32 flippedS) {
        flippedS = bytes32(SECP256K1_N - uint256(s));
        flippedV = v == 27 ? 28 : 27;
    }

    /// @notice A malleated acknowledgement signature is rejected.
    /// @dev SECURITY. Recovery goes through OpenZeppelin's ECDSA, which rejects s > n/2, so the
    ///      property holds — but nothing pinned it anywhere in the suite. A hand-rolled
    ///      `ecrecover` swapped in during a gas optimisation would accept the malleated twin of
    ///      every signature this contract consumes, and no test would notice.
    function test_AcknowledgeTransactions_RejectsMalleatedSignature() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint32 txCount = uint32(txHashes.length);
        uint256 deadline = block.timestamp + 3600;

        (uint8 v, bytes32 r, bytes32 s) = _signProdTxAckFor(
            address(txRegistry), dataHash, reportedChainId, txCount, txRegistry.nonces(reporter), deadline
        );
        (uint8 flippedV, bytes32 flippedS) = _malleate(v, s);

        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(ECDSA.ECDSAInvalidSignatureS.selector, flippedS));
        txRegistry.acknowledgeTransactions(
            reporter, forwarder, deadline, dataHash, reportedChainId, txCount, flippedV, r, flippedS
        );

        assertFalse(txRegistry.isTransactionPending(reporter), "A malleated signature must not open a window");
    }

    /// @notice A captured acknowledgement signature cannot be replayed once its window lapses.
    /// @dev SECURITY. Capture a genuine acknowledgement, wait for the registration window to
    ///      expire without the reporter completing, then re-submit the identical bytes. The
    ///      `AlreadyAcknowledged` guard has lapsed by then, so the nonce is the only defense left.
    ///      vm.roll moves block.number only, so the EIP-712 deadline (a timestamp) stays valid.
    ///      This contract reads `nonces[reporter]` itself rather than taking it as a parameter, so
    ///      the moved nonce surfaces as a digest mismatch (`InvalidSignature`) rather than a
    ///      dedicated nonce error — the defense is the same, the reported reason differs.
    function test_AcknowledgeTransactions_CapturedSignatureCannotBeReplayed() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint32 txCount = uint32(txHashes.length);
        uint256 deadline = block.timestamp + 3600;
        uint256 nonce = txRegistry.nonces(reporter);

        (uint8 v, bytes32 r, bytes32 s) =
            _signProdTxAckFor(address(txRegistry), dataHash, reportedChainId, txCount, nonce, deadline);

        vm.prank(forwarder);
        txRegistry.acknowledgeTransactions(reporter, forwarder, deadline, dataHash, reportedChainId, txCount, v, r, s);

        vm.roll(txRegistry.getTransactionAcknowledgementData(reporter).deadline + 1);

        vm.prank(forwarder);
        vm.expectRevert(ITransactionRegistry.TransactionRegistry__InvalidSignature.selector);
        txRegistry.acknowledgeTransactions(reporter, forwarder, deadline, dataHash, reportedChainId, txCount, v, r, s);
    }

    /// @notice A registration signature cannot be replayed after it has succeeded.
    /// @dev Asserting no second batch is minted (rather than only that the call reverts) is what
    ///      makes this survive a change to which guard wins: a replay that got through would
    ///      burn a batch ID and emit a phantom batch for the indexer to join against.
    function test_RegisterTransactions_CannotBeReplayedAfterSuccess() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();

        _doAcknowledge(forwarder, txHashes, chainIds);
        _sigWindowBlock = _rollToWindow(txRegistry.getTransactionAcknowledgementData(reporter).gracePeriodStart);

        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint32 txCount = uint32(txHashes.length);
        uint256 deadline = block.timestamp + 3600;
        (uint8 v, bytes32 r, bytes32 s) = _signProdTxRegFor(
            address(txRegistry), dataHash, reportedChainId, txCount, txRegistry.nonces(reporter), deadline
        );

        vm.prank(forwarder);
        txRegistry.registerTransactions(reporter, deadline, txHashes, chainIds, _sigWindowBlock, v, r, s);
        uint256 batchesAfterFirst = txRegistry.transactionBatchCount();

        vm.prank(forwarder);
        vm.expectRevert(ITransactionRegistry.TransactionRegistry__InvalidForwarder.selector);
        txRegistry.registerTransactions(reporter, deadline, txHashes, chainIds, _sigWindowBlock, v, r, s);

        assertEq(txRegistry.transactionBatchCount(), batchesAfterFirst, "A replay must not mint a second batch");
    }
}
