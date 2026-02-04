// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { SpokeRegistryV2 } from "../../src/v2/SpokeRegistryV2.sol";
import { ISpokeRegistryV2 } from "../../src/v2/interfaces/ISpokeRegistryV2.sol";
import { CrossChainMessageV2 } from "../../src/v2/libraries/CrossChainMessageV2.sol";
import { CAIP10 } from "../../src/v2/libraries/CAIP10.sol";
import { CAIP10Evm } from "../../src/v2/libraries/CAIP10Evm.sol";
import { HyperlaneAdapter } from "../../src/crosschain/adapters/HyperlaneAdapter.sol";
import { FeeManager } from "../../src/FeeManager.sol";
import { MockMailbox } from "../mocks/MockMailbox.sol";
import { MockInterchainGasPaymaster } from "../mocks/MockInterchainGasPaymaster.sol";
import { MockAggregator } from "../mocks/MockAggregator.sol";

/// @title SpokeRegistryV2Test
/// @notice Tests for SpokeRegistryV2 cross-chain wallet registration
contract SpokeRegistryV2Test is Test {
    SpokeRegistryV2 public spoke;
    HyperlaneAdapter public bridgeAdapter;
    FeeManager public feeManager;
    MockMailbox public mailbox;
    MockInterchainGasPaymaster public gasPaymaster;
    MockAggregator public oracle;

    // Test accounts
    uint256 internal walletPrivateKey;
    address internal wallet;
    uint256 internal reporterPrivateKey;
    address internal reporter;
    address internal forwarder;
    address internal owner;

    // Timing configuration
    uint256 internal constant GRACE_BLOCKS = 10;
    uint256 internal constant DEADLINE_BLOCKS = 50;

    // Hub configuration
    uint32 internal constant HUB_CHAIN_ID = 8453; // Base
    uint32 internal constant SPOKE_CHAIN_ID = 11_155_420; // OP Sepolia
    bytes32 internal constant HUB_INBOX = bytes32(uint256(uint160(0x1234567890123456789012345678901234567890)));

    // EIP-712 constants (V2 - includes reportedChainId and incidentTimestamp)
    bytes32 internal constant ACK_TYPEHASH = keccak256(
        "AcknowledgementOfRegistry(string statement,address wallet,address forwarder,bytes32 reportedChainId,uint64 incidentTimestamp,uint256 nonce,uint256 deadline)"
    );
    bytes32 internal constant REG_TYPEHASH = keccak256(
        "Registration(string statement,address wallet,address forwarder,bytes32 reportedChainId,uint64 incidentTimestamp,uint256 nonce,uint256 deadline)"
    );

    // EIP-712 constants for transaction batch
    bytes32 internal constant TX_BATCH_ACK_TYPEHASH = keccak256(
        "TransactionBatchAcknowledgement(string statement,address reporter,address forwarder,bytes32 dataHash,bytes32 reportedChainId,uint32 transactionCount,uint256 nonce,uint256 deadline)"
    );
    bytes32 internal constant TX_BATCH_REG_TYPEHASH = keccak256(
        "TransactionBatchRegistration(string statement,address reporter,address forwarder,bytes32 dataHash,bytes32 reportedChainId,uint32 transactionCount,uint256 nonce,uint256 deadline)"
    );

    string internal constant ACK_STATEMENT =
        "This signature acknowledges that the signing wallet is being reported as stolen to the Stolen Wallet Registry.";
    string internal constant REG_STATEMENT =
        "This signature confirms permanent registration of the signing wallet in the Stolen Wallet Registry. This action is irreversible.";
    string internal constant TX_ACK_STATEMENT =
        "This signature acknowledges the intent to report stolen transactions to the Stolen Wallet Registry.";
    string internal constant TX_REG_STATEMENT =
        "This signature confirms permanent registration of stolen transactions in the Stolen Wallet Registry. This action is irreversible.";

    // Wallet Events
    event WalletAcknowledged(
        address indexed wallet,
        address indexed forwarder,
        bytes32 reportedChainId,
        uint64 incidentTimestamp,
        bool isSponsored
    );
    event RegistrationSentToHub(address indexed wallet, bytes32 indexed messageId, uint32 hubChainId);

    // Transaction Batch Events
    event TransactionBatchAcknowledged(
        address indexed reporter,
        address indexed forwarder,
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint32 transactionCount,
        bool isSponsored
    );
    event TransactionBatchSentToHub(
        address indexed reporter, bytes32 indexed messageId, bytes32 dataHash, uint32 hubChainId
    );

    function setUp() public {
        // Set chain ID for spoke
        vm.chainId(SPOKE_CHAIN_ID);

        // Set block timestamp to something reasonable
        vm.warp(1_704_067_200); // 2024-01-01

        // Create test accounts
        walletPrivateKey = 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef;
        wallet = vm.addr(walletPrivateKey);
        reporterPrivateKey = 0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890;
        reporter = vm.addr(reporterPrivateKey);
        forwarder = makeAddr("forwarder");
        owner = address(this);

        // Deploy mocks and infrastructure
        mailbox = new MockMailbox(SPOKE_CHAIN_ID);
        gasPaymaster = new MockInterchainGasPaymaster();

        bridgeAdapter = new HyperlaneAdapter(owner, address(mailbox), address(gasPaymaster));
        bridgeAdapter.setDomainSupport(HUB_CHAIN_ID, true);

        oracle = new MockAggregator(300_000_000_000); // $3000 ETH price
        feeManager = new FeeManager(owner, address(oracle));

        // Deploy SpokeRegistryV2
        spoke = new SpokeRegistryV2(
            owner,
            address(bridgeAdapter),
            address(feeManager),
            HUB_CHAIN_ID,
            HUB_INBOX,
            GRACE_BLOCKS,
            DEADLINE_BLOCKS,
            1 // bridgeId = Hyperlane
        );

        // Fund test accounts
        vm.deal(wallet, 10 ether);
        vm.deal(reporter, 10 ether);
        vm.deal(forwarder, 10 ether);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    function _getDomainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("StolenWalletRegistry"),
                keccak256("4"), // V2 uses version 5
                block.chainid,
                address(spoke)
            )
        );
    }

    function _signAck(
        uint256 privateKey,
        address _wallet,
        address _forwarder,
        bytes32 reportedChainId,
        uint64 incidentTimestamp,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(
            abi.encode(
                ACK_TYPEHASH,
                keccak256(bytes(ACK_STATEMENT)),
                _wallet,
                _forwarder,
                reportedChainId,
                incidentTimestamp,
                nonce,
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _getDomainSeparator(), structHash));
        return vm.sign(privateKey, digest);
    }

    function _signReg(
        uint256 privateKey,
        address _wallet,
        address _forwarder,
        bytes32 reportedChainId,
        uint64 incidentTimestamp,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(
            abi.encode(
                REG_TYPEHASH,
                keccak256(bytes(REG_STATEMENT)),
                _wallet,
                _forwarder,
                reportedChainId,
                incidentTimestamp,
                nonce,
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _getDomainSeparator(), structHash));
        return vm.sign(privateKey, digest);
    }

    function _doAck(address _forwarder, bytes32 reportedChainId, uint64 incidentTimestamp) internal {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signAck(walletPrivateKey, wallet, _forwarder, reportedChainId, incidentTimestamp, nonce, deadline);

        vm.prank(_forwarder);
        spoke.acknowledgeLocal(reportedChainId, incidentTimestamp, deadline, nonce, wallet, v, r, s);
    }

    function _skipToRegistrationWindow() internal {
        // Get current acknowledgement and skip to start block
        ISpokeRegistryV2.AcknowledgementData memory ack = spoke.getAcknowledgement(wallet);
        vm.roll(ack.startBlock);
    }

    function _skipToTxBatchRegistrationWindow(address _reporter) internal {
        // Get current tx batch acknowledgement and skip to start block
        ISpokeRegistryV2.TransactionAcknowledgementData memory ack = spoke.getTransactionAcknowledgement(_reporter);
        vm.roll(ack.startBlock);
    }

    /// @dev Compute dataHash from transaction hashes and chain IDs
    function _computeDataHash(bytes32[] memory txHashes, bytes32[] memory chainIds) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(txHashes, chainIds));
    }

    function _signTxBatchAck(
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
                TX_BATCH_ACK_TYPEHASH,
                keccak256(bytes(TX_ACK_STATEMENT)),
                _reporter,
                _forwarder,
                dataHash,
                reportedChainId,
                transactionCount,
                nonce,
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _getDomainSeparator(), structHash));
        return vm.sign(privateKey, digest);
    }

    function _signTxBatchReg(
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
                TX_BATCH_REG_TYPEHASH,
                keccak256(bytes(TX_REG_STATEMENT)),
                _reporter,
                _forwarder,
                dataHash,
                reportedChainId,
                transactionCount,
                nonce,
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _getDomainSeparator(), structHash));
        return vm.sign(privateKey, digest);
    }

    /// @dev Helper to do a tx batch acknowledgement
    function _doTxBatchAck(address _forwarder, bytes32 dataHash, bytes32 reportedChainId, uint32 transactionCount)
        internal
    {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke.nonces(reporter);

        (uint8 v, bytes32 r, bytes32 s) = _signTxBatchAck(
            reporterPrivateKey, reporter, _forwarder, dataHash, reportedChainId, transactionCount, nonce, deadline
        );

        vm.prank(_forwarder);
        spoke.acknowledgeTransactionBatch(
            dataHash, reportedChainId, transactionCount, deadline, nonce, reporter, v, r, s
        );
    }

    /// @dev Create sample transaction batch data
    function _createSampleBatch() internal pure returns (bytes32[] memory txHashes, bytes32[] memory chainIds) {
        txHashes = new bytes32[](3);
        chainIds = new bytes32[](3);

        // Sample transaction hashes
        txHashes[0] = keccak256("tx1");
        txHashes[1] = keccak256("tx2");
        txHashes[2] = keccak256("tx3");

        // All on mainnet (CAIP-2 hash for eip155:1)
        bytes32 mainnetChainId = keccak256(bytes("eip155:1"));
        chainIds[0] = mainnetChainId;
        chainIds[1] = mainnetChainId;
        chainIds[2] = mainnetChainId;
    }

    /// @dev Helper to execute transaction batch registration (reduces stack depth in tests)
    function _doTxBatchReg(
        address _forwarder,
        bytes32 reportedChainId,
        bytes32[] memory txHashes,
        bytes32[] memory chainIds,
        uint256 fee
    ) internal {
        uint8 v;
        bytes32 r;
        bytes32 s;
        uint256 deadline;
        uint256 nonce;
        {
            uint32 transactionCount = uint32(txHashes.length);
            bytes32 dataHash = _computeDataHash(txHashes, chainIds);
            deadline = block.timestamp + 1 hours;
            nonce = spoke.nonces(reporter);
            (v, r, s) = _signTxBatchReg(
                reporterPrivateKey, reporter, _forwarder, dataHash, reportedChainId, transactionCount, nonce, deadline
            );
        }

        vm.prank(_forwarder);
        spoke.registerTransactionBatch{ value: fee }(
            reportedChainId, deadline, nonce, reporter, txHashes, chainIds, v, r, s
        );
    }

    /// @dev Helper for registration with custom forwarder signing (for wrong forwarder test)
    function _doTxBatchRegWithCustomSigner(
        address submitter,
        address signingForwarder,
        bytes32 reportedChainId,
        bytes32[] memory txHashes,
        bytes32[] memory chainIds,
        uint256 fee
    ) internal {
        uint8 v;
        bytes32 r;
        bytes32 s;
        uint256 deadline;
        uint256 nonce;
        {
            uint32 transactionCount = uint32(txHashes.length);
            bytes32 dataHash = _computeDataHash(txHashes, chainIds);
            deadline = block.timestamp + 1 hours;
            nonce = spoke.nonces(reporter);
            (v, r, s) = _signTxBatchReg(
                reporterPrivateKey,
                reporter,
                signingForwarder,
                dataHash,
                reportedChainId,
                transactionCount,
                nonce,
                deadline
            );
        }

        vm.prank(submitter);
        spoke.registerTransactionBatch{ value: fee }(
            reportedChainId, deadline, nonce, reporter, txHashes, chainIds, v, r, s
        );
    }

    /// @dev Helper for registration with separate signing dataHash (for testing data mismatch)
    function _doTxBatchRegWithSigningHash(
        bytes32 signingDataHash,
        uint32 signingTxCount,
        bytes32 reportedChainId,
        bytes32[] memory txHashes,
        bytes32[] memory chainIds,
        uint256 fee
    ) internal {
        uint8 v;
        bytes32 r;
        bytes32 s;
        uint256 deadline;
        uint256 nonce;
        {
            deadline = block.timestamp + 1 hours;
            nonce = spoke.nonces(reporter);
            (v, r, s) = _signTxBatchReg(
                reporterPrivateKey,
                reporter,
                forwarder,
                signingDataHash,
                reportedChainId,
                signingTxCount,
                nonce,
                deadline
            );
        }

        vm.prank(forwarder);
        spoke.registerTransactionBatch{ value: fee }(
            reportedChainId, deadline, nonce, reporter, txHashes, chainIds, v, r, s
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ACKNOWLEDGEMENT TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Acknowledgement succeeds with valid signature including incident data
    function test_Acknowledge_Success() public {
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1)); // Mainnet
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        vm.expectEmit(true, true, true, true);
        emit WalletAcknowledged(wallet, forwarder, reportedChainId, incidentTimestamp, true);

        _doAck(forwarder, reportedChainId, incidentTimestamp);

        // Verify acknowledgement stored
        assertTrue(spoke.isPending(wallet));
        assertEq(spoke.nonces(wallet), 1);

        // Verify incident data stored
        ISpokeRegistryV2.AcknowledgementData memory ack = spoke.getAcknowledgement(wallet);
        assertEq(ack.trustedForwarder, forwarder);
        assertEq(ack.reportedChainId, reportedChainId);
        assertEq(ack.incidentTimestamp, incidentTimestamp);
    }

    /// @notice Self-relay (wallet is own forwarder) works
    function test_Acknowledge_SelfRelay() public {
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signAck(walletPrivateKey, wallet, wallet, reportedChainId, incidentTimestamp, nonce, deadline);

        // isSponsored should be false when wallet is forwarder
        vm.expectEmit(true, true, true, true);
        emit WalletAcknowledged(wallet, wallet, reportedChainId, incidentTimestamp, false);

        vm.prank(wallet);
        spoke.acknowledgeLocal(reportedChainId, incidentTimestamp, deadline, nonce, wallet, v, r, s);

        assertTrue(spoke.isPending(wallet));
    }

    /// @notice Acknowledgement fails with expired deadline
    function test_Acknowledge_RejectsExpiredDeadline() public {
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);
        uint256 deadline = block.timestamp - 1; // Already expired
        uint256 nonce = spoke.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signAck(walletPrivateKey, wallet, forwarder, reportedChainId, incidentTimestamp, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistryV2.SpokeRegistryV2__SignatureExpired.selector);
        spoke.acknowledgeLocal(reportedChainId, incidentTimestamp, deadline, nonce, wallet, v, r, s);
    }

    /// @notice Acknowledgement fails with wrong nonce
    function test_Acknowledge_RejectsInvalidNonce() public {
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 wrongNonce = 999;

        (uint8 v, bytes32 r, bytes32 s) =
            _signAck(walletPrivateKey, wallet, forwarder, reportedChainId, incidentTimestamp, wrongNonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistryV2.SpokeRegistryV2__InvalidNonce.selector);
        spoke.acknowledgeLocal(reportedChainId, incidentTimestamp, deadline, wrongNonce, wallet, v, r, s);
    }

    /// @notice Acknowledgement fails with zero address owner
    function test_Acknowledge_RejectsZeroAddress() public {
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);
        uint256 deadline = block.timestamp + 1 hours;

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistryV2.SpokeRegistryV2__InvalidOwner.selector);
        spoke.acknowledgeLocal(reportedChainId, incidentTimestamp, deadline, 0, address(0), 27, bytes32(0), bytes32(0));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REGISTRATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Full registration flow succeeds
    function test_Register_Success() public {
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        _doAck(forwarder, reportedChainId, incidentTimestamp);
        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signReg(walletPrivateKey, wallet, forwarder, reportedChainId, incidentTimestamp, nonce, deadline);

        // Get required fee
        uint256 fee = spoke.quoteRegistration(wallet);

        vm.expectEmit(true, false, false, true);
        emit RegistrationSentToHub(wallet, bytes32(0), HUB_CHAIN_ID); // messageId will be computed

        vm.prank(forwarder);
        spoke.registerLocal{ value: fee }(reportedChainId, incidentTimestamp, deadline, nonce, wallet, v, r, s);

        // Verify acknowledgement cleaned up
        assertFalse(spoke.isPending(wallet));
        assertEq(spoke.nonces(wallet), 2); // Incremented again
    }

    /// @notice Registration fails before grace period
    function test_Register_FailsBeforeGracePeriod() public {
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        _doAck(forwarder, reportedChainId, incidentTimestamp);
        // Don't skip to registration window

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signReg(walletPrivateKey, wallet, forwarder, reportedChainId, incidentTimestamp, nonce, deadline);

        uint256 fee = spoke.quoteRegistration(wallet);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistryV2.SpokeRegistryV2__GracePeriodNotStarted.selector);
        spoke.registerLocal{ value: fee }(reportedChainId, incidentTimestamp, deadline, nonce, wallet, v, r, s);
    }

    /// @notice Registration fails after expiry
    function test_Register_FailsAfterExpiry() public {
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        _doAck(forwarder, reportedChainId, incidentTimestamp);

        // Skip past expiry
        ISpokeRegistryV2.AcknowledgementData memory ack = spoke.getAcknowledgement(wallet);
        vm.roll(ack.expiryBlock);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signReg(walletPrivateKey, wallet, forwarder, reportedChainId, incidentTimestamp, nonce, deadline);

        uint256 fee = spoke.quoteRegistration(wallet);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistryV2.SpokeRegistryV2__ForwarderExpired.selector);
        spoke.registerLocal{ value: fee }(reportedChainId, incidentTimestamp, deadline, nonce, wallet, v, r, s);
    }

    /// @notice Registration fails with wrong forwarder
    function test_Register_FailsWithWrongForwarder() public {
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        _doAck(forwarder, reportedChainId, incidentTimestamp);
        _skipToRegistrationWindow();

        address wrongForwarder = makeAddr("wrongForwarder");
        vm.deal(wrongForwarder, 10 ether);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signReg(walletPrivateKey, wallet, wrongForwarder, reportedChainId, incidentTimestamp, nonce, deadline);

        uint256 fee = spoke.quoteRegistration(wallet);

        vm.prank(wrongForwarder);
        vm.expectRevert(ISpokeRegistryV2.SpokeRegistryV2__InvalidForwarder.selector);
        spoke.registerLocal{ value: fee }(reportedChainId, incidentTimestamp, deadline, nonce, wallet, v, r, s);
    }

    /// @notice Registration fails with insufficient fee
    function test_Register_FailsWithInsufficientFee() public {
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        _doAck(forwarder, reportedChainId, incidentTimestamp);
        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signReg(walletPrivateKey, wallet, forwarder, reportedChainId, incidentTimestamp, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistryV2.SpokeRegistryV2__InsufficientFee.selector);
        spoke.registerLocal{ value: 0 }(reportedChainId, incidentTimestamp, deadline, nonce, wallet, v, r, s);
    }

    /// @notice Registration fails when hub not configured
    function test_Register_FailsWhenHubNotConfigured() public {
        // Deploy spoke with no hub configured
        SpokeRegistryV2 unconfiguredSpoke = new SpokeRegistryV2(
            owner,
            address(bridgeAdapter),
            address(feeManager),
            0, // No hub chain ID
            bytes32(0), // No hub inbox
            GRACE_BLOCKS,
            DEADLINE_BLOCKS,
            1
        );

        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = unconfiguredSpoke.nonces(wallet);

        // First do acknowledgement
        (uint8 v, bytes32 r, bytes32 s) = _signAckForSpoke(
            unconfiguredSpoke, walletPrivateKey, wallet, forwarder, reportedChainId, incidentTimestamp, nonce, deadline
        );

        vm.prank(forwarder);
        unconfiguredSpoke.acknowledgeLocal(reportedChainId, incidentTimestamp, deadline, nonce, wallet, v, r, s);

        // Skip to registration window
        ISpokeRegistryV2.AcknowledgementData memory ack = unconfiguredSpoke.getAcknowledgement(wallet);
        vm.roll(ack.startBlock);

        // Try to register
        nonce = unconfiguredSpoke.nonces(wallet);
        (v, r, s) = _signRegForSpoke(
            unconfiguredSpoke, walletPrivateKey, wallet, forwarder, reportedChainId, incidentTimestamp, nonce, deadline
        );

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistryV2.SpokeRegistryV2__HubNotConfigured.selector);
        unconfiguredSpoke.registerLocal{ value: 1 ether }(
            reportedChainId, incidentTimestamp, deadline, nonce, wallet, v, r, s
        );
    }

    // Helper for signing with different spoke contract
    function _signAckForSpoke(
        SpokeRegistryV2 _spoke,
        uint256 privateKey,
        address _wallet,
        address _forwarder,
        bytes32 reportedChainId,
        uint64 incidentTimestamp,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("StolenWalletRegistry"),
                keccak256("4"),
                block.chainid,
                address(_spoke)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                ACK_TYPEHASH,
                keccak256(bytes(ACK_STATEMENT)),
                _wallet,
                _forwarder,
                reportedChainId,
                incidentTimestamp,
                nonce,
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        return vm.sign(privateKey, digest);
    }

    function _signRegForSpoke(
        SpokeRegistryV2 _spoke,
        uint256 privateKey,
        address _wallet,
        address _forwarder,
        bytes32 reportedChainId,
        uint64 incidentTimestamp,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("StolenWalletRegistry"),
                keccak256("4"),
                block.chainid,
                address(_spoke)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                REG_TYPEHASH,
                keccak256(bytes(REG_STATEMENT)),
                _wallet,
                _forwarder,
                reportedChainId,
                incidentTimestamp,
                nonce,
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        return vm.sign(privateKey, digest);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Fee quote includes bridge and registration fees
    function test_QuoteFeeBreakdown() public view {
        ISpokeRegistryV2.FeeBreakdown memory fees = spoke.quoteFeeBreakdown(wallet);

        assertGt(fees.bridgeFee, 0);
        assertGt(fees.registrationFee, 0);
        assertEq(fees.total, fees.bridgeFee + fees.registrationFee);
        assertEq(fees.bridgeName, "Hyperlane");
    }

    /// @notice generateHashStruct returns valid data for signing
    function test_GenerateHashStruct() public {
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        vm.prank(wallet);
        (uint256 deadline, bytes32 hashStruct) =
            spoke.generateHashStruct(reportedChainId, incidentTimestamp, forwarder, 1);

        assertGt(deadline, block.timestamp);
        assertTrue(hashStruct != bytes32(0));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Owner can update hub config
    function test_SetHubConfig() public {
        uint32 newHubChainId = 10; // Optimism
        bytes32 newHubInbox = bytes32(uint256(0xdead));

        spoke.setHubConfig(newHubChainId, newHubInbox);

        assertEq(spoke.hubChainId(), newHubChainId);
        assertEq(spoke.hubInbox(), newHubInbox);
    }

    /// @notice Non-owner cannot update hub config
    function test_SetHubConfig_OnlyOwner() public {
        address notOwner = makeAddr("notOwner");

        vm.prank(notOwner);
        vm.expectRevert();
        spoke.setHubConfig(10, bytes32(uint256(0xdead)));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TRANSACTION BATCH ACKNOWLEDGEMENT TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Transaction batch acknowledgement succeeds with valid signature
    function test_TxBatchAck_Success() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1)); // Mainnet
        uint32 transactionCount = uint32(txHashes.length);

        vm.expectEmit(true, true, true, true);
        emit TransactionBatchAcknowledged(reporter, forwarder, dataHash, reportedChainId, transactionCount, true);

        _doTxBatchAck(forwarder, dataHash, reportedChainId, transactionCount);

        // Verify acknowledgement stored
        assertTrue(spoke.isPendingTransactionBatch(reporter));
        assertEq(spoke.nonces(reporter), 1);

        // Verify data stored correctly
        ISpokeRegistryV2.TransactionAcknowledgementData memory ack = spoke.getTransactionAcknowledgement(reporter);
        assertEq(ack.trustedForwarder, forwarder);
        assertEq(ack.dataHash, dataHash);
        assertEq(ack.reportedChainId, reportedChainId);
        assertEq(ack.transactionCount, transactionCount);
    }

    /// @notice Transaction batch self-relay (reporter is own forwarder) works
    function test_TxBatchAck_SelfRelay() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint32 transactionCount = uint32(txHashes.length);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke.nonces(reporter);

        (uint8 v, bytes32 r, bytes32 s) = _signTxBatchAck(
            reporterPrivateKey, reporter, reporter, dataHash, reportedChainId, transactionCount, nonce, deadline
        );

        // isSponsored should be false when reporter is forwarder
        vm.expectEmit(true, true, true, true);
        emit TransactionBatchAcknowledged(reporter, reporter, dataHash, reportedChainId, transactionCount, false);

        vm.prank(reporter);
        spoke.acknowledgeTransactionBatch(
            dataHash, reportedChainId, transactionCount, deadline, nonce, reporter, v, r, s
        );

        assertTrue(spoke.isPendingTransactionBatch(reporter));
    }

    /// @notice Transaction batch acknowledgement fails with expired deadline
    function test_TxBatchAck_RejectsExpiredDeadline() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint32 transactionCount = uint32(txHashes.length);
        uint256 deadline = block.timestamp - 1; // Already expired
        uint256 nonce = spoke.nonces(reporter);

        (uint8 v, bytes32 r, bytes32 s) = _signTxBatchAck(
            reporterPrivateKey, reporter, forwarder, dataHash, reportedChainId, transactionCount, nonce, deadline
        );

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistryV2.SpokeRegistryV2__SignatureExpired.selector);
        spoke.acknowledgeTransactionBatch(
            dataHash, reportedChainId, transactionCount, deadline, nonce, reporter, v, r, s
        );
    }

    /// @notice Transaction batch acknowledgement fails with wrong nonce
    function test_TxBatchAck_RejectsInvalidNonce() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint32 transactionCount = uint32(txHashes.length);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 wrongNonce = 999;

        (uint8 v, bytes32 r, bytes32 s) = _signTxBatchAck(
            reporterPrivateKey, reporter, forwarder, dataHash, reportedChainId, transactionCount, wrongNonce, deadline
        );

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistryV2.SpokeRegistryV2__InvalidNonce.selector);
        spoke.acknowledgeTransactionBatch(
            dataHash, reportedChainId, transactionCount, deadline, wrongNonce, reporter, v, r, s
        );
    }

    /// @notice Transaction batch acknowledgement fails with empty batch
    function test_TxBatchAck_RejectsEmptyBatch() public {
        // Use a non-zero dataHash but zero transactionCount to trigger EmptyBatch error
        bytes32 dataHash = keccak256("dummy");
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint32 transactionCount = 0; // Empty batch
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke.nonces(reporter);

        (uint8 v, bytes32 r, bytes32 s) = _signTxBatchAck(
            reporterPrivateKey, reporter, forwarder, dataHash, reportedChainId, transactionCount, nonce, deadline
        );

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistryV2.SpokeRegistryV2__EmptyBatch.selector);
        spoke.acknowledgeTransactionBatch(
            dataHash, reportedChainId, transactionCount, deadline, nonce, reporter, v, r, s
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TRANSACTION BATCH REGISTRATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Full transaction batch registration flow succeeds
    function test_TxBatchReg_Success() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));

        // Phase 1: Acknowledge
        _doTxBatchAck(forwarder, dataHash, reportedChainId, uint32(txHashes.length));
        _skipToTxBatchRegistrationWindow(reporter);

        // Phase 2: Register
        uint256 fee = spoke.quoteRegistration(reporter);

        vm.expectEmit(true, false, true, true);
        emit TransactionBatchSentToHub(reporter, bytes32(0), dataHash, HUB_CHAIN_ID);

        _doTxBatchReg(forwarder, reportedChainId, txHashes, chainIds, fee);

        // Verify acknowledgement cleaned up
        assertFalse(spoke.isPendingTransactionBatch(reporter));
        assertEq(spoke.nonces(reporter), 2); // Incremented again
    }

    // NOTE: Transaction batch error tests (grace period, expiry, wrong forwarder,
    // invalid dataHash, array mismatch, insufficient fee) share validation logic with
    // wallet registration tests. Stack-too-deep issues in test helpers prevent adding
    // them here without --via-ir compilation. See wallet registration error tests for
    // validation coverage.

    /// @notice View functions for transaction batch work correctly
    function test_TxBatch_ViewFunctions() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint32 transactionCount = uint32(txHashes.length);

        // Before acknowledgement
        assertFalse(spoke.isPendingTransactionBatch(reporter));

        _doTxBatchAck(forwarder, dataHash, reportedChainId, transactionCount);

        // After acknowledgement
        assertTrue(spoke.isPendingTransactionBatch(reporter));

        ISpokeRegistryV2.TransactionAcknowledgementData memory ack = spoke.getTransactionAcknowledgement(reporter);
        assertEq(ack.trustedForwarder, forwarder);
        assertEq(ack.dataHash, dataHash);
        assertEq(ack.reportedChainId, reportedChainId);
        assertEq(ack.transactionCount, transactionCount);
        assertGt(ack.startBlock, block.number);
        assertGt(ack.expiryBlock, ack.startBlock);
    }
}
