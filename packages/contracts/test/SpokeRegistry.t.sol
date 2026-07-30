// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { SpokeRegistry } from "../src/spoke/SpokeRegistry.sol";
import { ISpokeRegistry } from "../src/interfaces/ISpokeRegistry.sol";
import { CrossChainMessage } from "../src/libraries/CrossChainMessage.sol";
import { CAIP10 } from "../src/libraries/CAIP10.sol";
import { CAIP10Evm } from "../src/libraries/CAIP10Evm.sol";
import { TimingConfig } from "../src/libraries/TimingConfig.sol";
import { EIP712Constants } from "../src/libraries/EIP712Constants.sol";
import { WalletRegistry } from "../src/registries/WalletRegistry.sol";
import { IWalletRegistry } from "../src/interfaces/IWalletRegistry.sol";
import { HyperlaneAdapter } from "../src/crosschain/adapters/HyperlaneAdapter.sol";
import { FeeManager } from "../src/FeeManager.sol";
import { MockMailbox } from "./mocks/MockMailbox.sol";
import { MockAggregator } from "./mocks/MockAggregator.sol";

/// @title SpokeRegistryTest
/// @notice Tests for SpokeRegistry cross-chain wallet registration
contract SpokeRegistryTest is Test {
    SpokeRegistry public spoke;
    HyperlaneAdapter public bridgeAdapter;
    FeeManager public feeManager;
    MockMailbox public mailbox;
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

    // ── Stack-pressure workaround ──────────────────────────────────────────
    // EVM limits functions to 16 stack slots. Functions like registerTransactionBatch
    // take 9 arguments; combined with local variables for the ack/signing phase,
    // the Solidity compiler (without via-ir) cannot schedule them all.
    // Storing signature components in contract storage between the signing and
    // registration phases frees 5 stack slots and avoids the via-ir requirement.
    uint8 internal _sv;
    bytes32 internal _sr;
    bytes32 internal _ss;
    uint256 internal _sDeadline;
    uint256 internal _sNonce;

    // EIP-712 constants — duplicated here (not imported from EIP712Constants) because
    // spoke uses uint64 reportedChainId/incidentTimestamp while hub uses bytes32.
    // If these drift from the SpokeRegistry contract, signing tests will fail.
    bytes32 internal constant ACK_TYPEHASH = keccak256(
        "AcknowledgementOfRegistry(string statement,address wallet,address trustedForwarder,uint64 reportedChainId,uint64 incidentTimestamp,uint256 nonce,uint256 deadline)"
    );
    // `windowBlockHash` is the V1 anti-phishing field: the registration signature commits to the
    // hash of a block at or after the acknowledgement's grace start, so it cannot be produced in
    // the same sitting as the acknowledgement. Shared verbatim with the hub (see EIP712Constants).
    bytes32 internal constant REG_TYPEHASH = keccak256(
        "Registration(string statement,address wallet,address trustedForwarder,uint64 reportedChainId,uint64 incidentTimestamp,uint256 nonce,uint256 deadline,bytes32 windowBlockHash)"
    );

    // EIP-712 constants for transaction batch
    bytes32 internal constant TX_BATCH_ACK_TYPEHASH = keccak256(
        "TransactionBatchAcknowledgement(string statement,address reporter,address trustedForwarder,bytes32 dataHash,bytes32 reportedChainId,uint32 transactionCount,uint256 nonce,uint256 deadline)"
    );
    // Mirrors EIP712Constants.TX_BATCH_REG_TYPEHASH, which gained `windowBlockHash` alongside the
    // wallet typehash. NOTE: SpokeRegistry's transaction-batch path hashes this typehash but does
    // NOT yet append a windowBlockHash field (the hub's TransactionRegistry does), so the signed
    // struct below deliberately stops at `deadline` to match what the spoke actually computes.
    // When the spoke's tx-batch path is brought to parity, add blockhash(windowBlock) here too.
    bytes32 internal constant TX_BATCH_REG_TYPEHASH = keccak256(
        "TransactionBatchRegistration(string statement,address reporter,address trustedForwarder,bytes32 dataHash,bytes32 reportedChainId,uint32 transactionCount,uint256 nonce,uint256 deadline,bytes32 windowBlockHash)"
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
        address indexed trustedForwarder,
        bytes32 reportedChainId,
        uint64 incidentTimestamp,
        bool isSponsored
    );
    event RegistrationSentToHub(address indexed wallet, bytes32 indexed messageId, uint32 hubChainId);

    // Transaction Batch Events
    event TransactionBatchAcknowledged(
        address indexed reporter,
        address indexed trustedForwarder,
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
        walletPrivateKey = uint256(keccak256("test wallet")); // deterministic test-only key
        wallet = vm.addr(walletPrivateKey);
        reporterPrivateKey = uint256(keccak256("test reporter")); // deterministic test-only key
        reporter = vm.addr(reporterPrivateKey);
        forwarder = makeAddr("forwarder");
        owner = address(this);

        // Deploy mocks and infrastructure
        mailbox = new MockMailbox(SPOKE_CHAIN_ID);

        bridgeAdapter = new HyperlaneAdapter(owner, address(mailbox));
        bridgeAdapter.setDomainSupport(HUB_CHAIN_ID, true);

        oracle = new MockAggregator(300_000_000_000); // $3000 ETH price
        feeManager = new FeeManager(owner, address(oracle));

        // Deploy SpokeRegistry
        spoke = new SpokeRegistry(
            owner,
            address(bridgeAdapter),
            address(feeManager),
            HUB_CHAIN_ID,
            HUB_INBOX,
            GRACE_BLOCKS,
            DEADLINE_BLOCKS,
            1 // bridgeId = Hyperlane
        );

        bridgeAdapter.setAuthorizedSender(address(spoke), true);

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
                keccak256("4"), // EIP-712 version 4
                block.chainid,
                address(spoke)
            )
        );
    }

    function _signAck(
        uint256 privateKey,
        address _wallet,
        address _forwarder,
        uint64 reportedChainId,
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

    /// @dev Signs the registration message. Only the HASH of `windowBlock` is signed; the block
    ///      number itself travels to `register` as unsigned calldata, so pass the same value to
    ///      both. To exercise a rejection, pass a `windowBlock` that is before the grace start,
    ///      at/above `block.number`, or more than 256 blocks old.
    function _signReg(
        uint256 privateKey,
        address _wallet,
        address _forwarder,
        uint64 reportedChainId,
        uint64 incidentTimestamp,
        uint256 nonce,
        uint256 deadline,
        uint256 windowBlock
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = _regStructHash(
            _wallet, _forwarder, reportedChainId, incidentTimestamp, nonce, deadline, windowBlock
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _getDomainSeparator(), structHash));
        return vm.sign(privateKey, digest);
    }

    function _doAck(address _forwarder, uint64 reportedChainId, uint64 incidentTimestamp) internal {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signAck(walletPrivateKey, wallet, _forwarder, reportedChainId, incidentTimestamp, nonce, deadline);

        vm.prank(_forwarder);
        spoke.acknowledge(wallet, _forwarder, reportedChainId, incidentTimestamp, deadline, nonce, v, r, s);
    }

    /// @dev Roll one block past `graceStart` and return a `windowBlock` that satisfies both of
    ///      `register`'s bounds: `windowBlock >= ack.startBlock` AND `windowBlock < block.number`.
    ///      Rolling only to `graceStart` (as before V1) leaves no mined block to reference.
    function _rollToWindow(uint256 graceStart) internal returns (uint256 windowBlock) {
        if (block.number <= graceStart) vm.roll(graceStart + 1);
        return graceStart;
    }

    /// @dev Skip into the registration window and return the `windowBlock` to sign/submit.
    function _skipToRegistrationWindow() internal returns (uint256 windowBlock) {
        ISpokeRegistry.AcknowledgementData memory ack = spoke.getAcknowledgement(wallet);
        return _rollToWindow(ack.startBlock);
    }

    /// @dev Prepare a wallet registration signature into _sv/_sr/_ss/_sDeadline/_sNonce.
    ///      `register` now takes 10 arguments; routing the signature and deadline/nonce through
    ///      storage keeps the call sites inside the EVM's 16-slot stack limit without via-ir.
    ///      Reads the nonce via an external call, so call this BEFORE vm.expectRevert.
    function _prepareWalletRegSig(
        address _forwarder,
        uint64 reportedChainId,
        uint64 incidentTimestamp,
        uint256 windowBlock
    ) internal {
        _sDeadline = block.timestamp + 1 hours;
        _sNonce = spoke.nonces(wallet);
        (_sv, _sr, _ss) = _signReg(
            walletPrivateKey, wallet, _forwarder, reportedChainId, incidentTimestamp, _sNonce, _sDeadline, windowBlock
        );
    }

    function _skipToTxBatchRegistrationWindow(address _reporter) internal {
        // Get current tx batch acknowledgement and skip to start block
        ISpokeRegistry.TransactionAcknowledgementData memory ack = spoke.getTransactionAcknowledgement(_reporter);
        vm.roll(ack.startBlock);
    }

    /// @dev Compute dataHash from transaction hashes and chain IDs
    function _computeDataHash(bytes32[] memory txHashes, bytes32[] memory chainIds) internal pure returns (bytes32) {
        return keccak256(abi.encode(txHashes, chainIds));
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

    /// @dev Prepare tx batch reg signature and store in _sv/_sr/_ss/_sDeadline/_sNonce.
    ///      Writes to storage to free stack slots — registerTransactionBatch takes 9 args,
    ///      which combined with local variables exceeds the EVM's 16-slot stack limit.
    ///      Reads nonce via external call, so call BEFORE vm.expectRevert.
    function _prepareTxBatchRegSig(bytes32 dataHash, bytes32 reportedChainId, uint32 txCount, address _forwarder)
        internal
    {
        _sDeadline = block.timestamp + 1 hours;
        _sNonce = spoke.nonces(reporter);
        (_sv, _sr, _ss) = _signTxBatchReg(
            reporterPrivateKey, reporter, _forwarder, dataHash, reportedChainId, txCount, _sNonce, _sDeadline
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ACKNOWLEDGEMENT TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Acknowledgement succeeds with valid signature including incident data
    function test_Acknowledge_Success() public {
        uint64 reportedChainId = 1; // Mainnet chain ID
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);
        // Spoke converts uint64 to bytes32 hash internally for storage
        bytes32 reportedChainIdHash = CAIP10Evm.caip2Hash(reportedChainId);

        vm.expectEmit(true, true, true, true);
        emit WalletAcknowledged(wallet, forwarder, reportedChainIdHash, incidentTimestamp, true);

        _doAck(forwarder, reportedChainId, incidentTimestamp);

        // Verify acknowledgement stored
        assertTrue(spoke.isPending(wallet));
        assertEq(spoke.nonces(wallet), 1);

        // Verify incident data stored (as bytes32 hash)
        ISpokeRegistry.AcknowledgementData memory ack = spoke.getAcknowledgement(wallet);
        assertEq(ack.trustedForwarder, forwarder);
        assertEq(ack.reportedChainId, reportedChainIdHash);
        assertEq(ack.incidentTimestamp, incidentTimestamp);
    }

    /// @notice Re-acknowledging while a prior acknowledgement is still live is rejected.
    /// @dev Hub/spoke parity: WalletRegistry.acknowledge has always reverted with
    ///      WalletRegistry__AlreadyAcknowledged here, but the spoke silently overwrote the
    ///      stored acknowledgement — restarting the randomized grace period and orphaning the
    ///      registration signature the user had already produced against the first one. This is
    ///      exactly the hub/spoke drift the Feb-2026 signature unification set out to end.
    function test_Acknowledge_RejectsWhileLiveAcknowledgementExists() public {
        uint64 reportedChainId = 1;
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        _doAck(forwarder, reportedChainId, incidentTimestamp);
        ISpokeRegistry.AcknowledgementData memory first = spoke.getAcknowledgement(wallet);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke.nonces(wallet);
        (uint8 v, bytes32 r, bytes32 s) =
            _signAck(walletPrivateKey, wallet, forwarder, reportedChainId, incidentTimestamp, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__AlreadyAcknowledged.selector);
        spoke.acknowledge(wallet, forwarder, reportedChainId, incidentTimestamp, deadline, nonce, v, r, s);

        // The original acknowledgement must be untouched
        ISpokeRegistry.AcknowledgementData memory afterAck = spoke.getAcknowledgement(wallet);
        assertEq(afterAck.startBlock, first.startBlock, "Grace period must not restart");
        assertEq(afterAck.expiryBlock, first.expiryBlock);
    }

    /// @notice Once the prior acknowledgement has expired, acknowledging again is allowed.
    /// @dev The guard must not permanently lock a wallet out after an abandoned attempt.
    function test_Acknowledge_AllowedAfterPriorExpired() public {
        uint64 reportedChainId = 1;
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        _doAck(forwarder, reportedChainId, incidentTimestamp);
        ISpokeRegistry.AcknowledgementData memory first = spoke.getAcknowledgement(wallet);

        vm.roll(first.expiryBlock + 1);
        _doAck(forwarder, reportedChainId, incidentTimestamp);

        assertTrue(spoke.isPending(wallet));
        assertEq(spoke.nonces(wallet), 2, "Second acknowledgement should have consumed another nonce");
    }

    /// @notice A future incident timestamp is rejected; 0 ("unknown") is still accepted.
    /// @dev incidentTimestamp is trusted into permanent storage and feeds the indexer and any
    ///      downstream fraud scoring. A future value is unfalsifiable at write time. 0 stays
    ///      valid because it is the sentinel the app and CLI submit today.
    function test_Acknowledge_RejectsFutureIncidentTimestamp() public {
        uint64 reportedChainId = 1;
        uint64 futureIncident = uint64(block.timestamp + 1 days);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signAck(walletPrivateKey, wallet, forwarder, reportedChainId, futureIncident, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InvalidIncidentTimestamp.selector);
        spoke.acknowledge(wallet, forwarder, reportedChainId, futureIncident, deadline, nonce, v, r, s);
    }

    function test_Acknowledge_AcceptsZeroIncidentTimestamp() public {
        _doAck(forwarder, 1, 0);

        assertTrue(spoke.isPending(wallet));
        assertEq(spoke.getAcknowledgement(wallet).incidentTimestamp, 0);
    }

    /// @notice Self-relay (wallet is own forwarder) works
    function test_Acknowledge_SelfRelay() public {
        uint64 reportedChainId = 1; // Mainnet
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke.nonces(wallet);
        bytes32 reportedChainIdHash = CAIP10Evm.caip2Hash(reportedChainId);

        (uint8 v, bytes32 r, bytes32 s) =
            _signAck(walletPrivateKey, wallet, wallet, reportedChainId, incidentTimestamp, nonce, deadline);

        // isSponsored should be false when wallet is forwarder
        vm.expectEmit(true, true, true, true);
        emit WalletAcknowledged(wallet, wallet, reportedChainIdHash, incidentTimestamp, false);

        vm.prank(wallet);
        spoke.acknowledge(wallet, wallet, reportedChainId, incidentTimestamp, deadline, nonce, v, r, s);

        assertTrue(spoke.isPending(wallet));
    }

    /// @notice Acknowledgement fails with expired deadline
    function test_Acknowledge_RejectsExpiredDeadline() public {
        uint64 reportedChainId = 1;
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);
        uint256 deadline = block.timestamp - 1; // Already expired
        uint256 nonce = spoke.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signAck(walletPrivateKey, wallet, forwarder, reportedChainId, incidentTimestamp, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__SignatureExpired.selector);
        spoke.acknowledge(wallet, forwarder, reportedChainId, incidentTimestamp, deadline, nonce, v, r, s);
    }

    /// @notice Acknowledgement fails with wrong nonce
    function test_Acknowledge_RejectsInvalidNonce() public {
        uint64 reportedChainId = 1;
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 wrongNonce = 999;

        (uint8 v, bytes32 r, bytes32 s) =
            _signAck(walletPrivateKey, wallet, forwarder, reportedChainId, incidentTimestamp, wrongNonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InvalidNonce.selector);
        spoke.acknowledge(wallet, forwarder, reportedChainId, incidentTimestamp, deadline, wrongNonce, v, r, s);
    }

    /// @notice Acknowledgement fails with zero address owner
    function test_Acknowledge_RejectsZeroAddress() public {
        uint64 reportedChainId = 1;
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);
        uint256 deadline = block.timestamp + 1 hours;

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InvalidOwner.selector);
        spoke.acknowledge(
            address(0), forwarder, reportedChainId, incidentTimestamp, deadline, 0, 27, bytes32(0), bytes32(0)
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REGISTRATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Full registration flow succeeds
    function test_Register_Success() public {
        uint64 reportedChainId = 1; // Mainnet
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        _doAck(forwarder, reportedChainId, incidentTimestamp);
        uint256 windowBlock = _skipToRegistrationWindow();

        _prepareWalletRegSig(forwarder, reportedChainId, incidentTimestamp, windowBlock);

        // Get required fee
        uint256 fee = spoke.quoteRegistration(wallet);

        vm.expectEmit(true, false, false, true);
        emit RegistrationSentToHub(wallet, bytes32(0), HUB_CHAIN_ID); // messageId will be computed

        vm.prank(forwarder);
        spoke.register{ value: fee }(
            wallet, forwarder, reportedChainId, incidentTimestamp, _sDeadline, _sNonce, windowBlock, _sv, _sr, _ss
        );

        // Verify acknowledgement cleaned up
        assertFalse(spoke.isPending(wallet));
        assertEq(spoke.nonces(wallet), 2); // Incremented again
    }

    /// @notice Registration fails before grace period
    function test_Register_FailsBeforeGracePeriod() public {
        uint64 reportedChainId = 1;
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        _doAck(forwarder, reportedChainId, incidentTimestamp);
        // Don't skip to registration window

        // windowBlock is irrelevant here: the grace-period check runs before the window is
        // resolved, so this must still surface GracePeriodNotStarted rather than a timing error.
        uint256 windowBlock = block.number - 1;
        _prepareWalletRegSig(forwarder, reportedChainId, incidentTimestamp, windowBlock);

        uint256 fee = spoke.quoteRegistration(wallet);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__GracePeriodNotStarted.selector);
        spoke.register{ value: fee }(
            wallet, forwarder, reportedChainId, incidentTimestamp, _sDeadline, _sNonce, windowBlock, _sv, _sr, _ss
        );
    }

    /// @notice Registration fails after expiry
    function test_Register_FailsAfterExpiry() public {
        uint64 reportedChainId = 1;
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        _doAck(forwarder, reportedChainId, incidentTimestamp);

        // Skip past expiry
        uint256 windowBlock;
        {
            ISpokeRegistry.AcknowledgementData memory ack = spoke.getAcknowledgement(wallet);
            vm.roll(ack.expiryBlock);
            windowBlock = ack.startBlock; // otherwise-valid window; expiry must still win
        }

        _prepareWalletRegSig(forwarder, reportedChainId, incidentTimestamp, windowBlock);

        uint256 fee = spoke.quoteRegistration(wallet);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__ForwarderExpired.selector);
        spoke.register{ value: fee }(
            wallet, forwarder, reportedChainId, incidentTimestamp, _sDeadline, _sNonce, windowBlock, _sv, _sr, _ss
        );
    }

    /// @notice Registration fails with wrong forwarder
    function test_Register_FailsWithWrongForwarder() public {
        uint64 reportedChainId = 1;
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        _doAck(forwarder, reportedChainId, incidentTimestamp);
        uint256 windowBlock = _skipToRegistrationWindow();

        address wrongForwarder = makeAddr("wrongForwarder");
        vm.deal(wrongForwarder, 10 ether);

        _prepareWalletRegSig(wrongForwarder, reportedChainId, incidentTimestamp, windowBlock);

        uint256 fee = spoke.quoteRegistration(wallet);

        vm.prank(wrongForwarder);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InvalidForwarder.selector);
        spoke.register{ value: fee }(
            wallet, wrongForwarder, reportedChainId, incidentTimestamp, _sDeadline, _sNonce, windowBlock, _sv, _sr, _ss
        );
    }

    /// @notice Registration fails with insufficient fee
    function test_Register_FailsWithInsufficientFee() public {
        uint64 reportedChainId = 1;
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        _doAck(forwarder, reportedChainId, incidentTimestamp);
        uint256 windowBlock = _skipToRegistrationWindow();

        _prepareWalletRegSig(forwarder, reportedChainId, incidentTimestamp, windowBlock);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InsufficientFee.selector);
        spoke.register{ value: 0 }(
            wallet, forwarder, reportedChainId, incidentTimestamp, _sDeadline, _sNonce, windowBlock, _sv, _sr, _ss
        );
    }

    /// @notice Registration fails when hub not configured
    function test_Register_FailsWhenHubNotConfigured() public {
        // Deploy spoke with no hub configured
        SpokeRegistry unconfiguredSpoke = new SpokeRegistry(
            owner,
            address(bridgeAdapter),
            address(feeManager),
            0, // No hub chain ID
            bytes32(0), // No hub inbox
            GRACE_BLOCKS,
            DEADLINE_BLOCKS,
            1
        );

        uint64 reportedChainId = 1;
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = unconfiguredSpoke.nonces(wallet);

        // First do acknowledgement
        (uint8 v, bytes32 r, bytes32 s) = _signAckForSpoke(
            unconfiguredSpoke, walletPrivateKey, wallet, forwarder, reportedChainId, incidentTimestamp, nonce, deadline
        );

        vm.prank(forwarder);
        unconfiguredSpoke.acknowledge(wallet, forwarder, reportedChainId, incidentTimestamp, deadline, nonce, v, r, s);

        // Skip to registration window (one block past grace start, so a window block exists)
        uint256 windowBlock = _rollToWindow(unconfiguredSpoke.getAcknowledgement(wallet).startBlock);

        // Try to register
        nonce = unconfiguredSpoke.nonces(wallet);
        (v, r, s) = _signRegForSpoke(
            unconfiguredSpoke, forwarder, reportedChainId, incidentTimestamp, nonce, deadline, windowBlock
        );

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__HubNotConfigured.selector);
        unconfiguredSpoke.register{ value: 1 ether }(
            wallet, forwarder, reportedChainId, incidentTimestamp, deadline, nonce, windowBlock, v, r, s
        );
    }

    // Helper for signing with different spoke contract
    function _signAckForSpoke(
        SpokeRegistry _spoke,
        uint256 privateKey,
        address _wallet,
        address _forwarder,
        uint64 reportedChainId,
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

    /// @dev Registration struct hash, extracted so the signing helpers stay under the 16-slot
    ///      stack limit now that `windowBlock` is a ninth parameter (no via-ir in this project).
    function _regStructHash(
        address _wallet,
        address _forwarder,
        uint64 reportedChainId,
        uint64 incidentTimestamp,
        uint256 nonce,
        uint256 deadline,
        uint256 windowBlock
    ) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                REG_TYPEHASH,
                keccak256(bytes(REG_STATEMENT)),
                _wallet,
                _forwarder,
                reportedChainId,
                incidentTimestamp,
                nonce,
                deadline,
                blockhash(windowBlock)
            )
        );
    }

    /// @dev Signs a registration for an arbitrary spoke instance. Unlike {_signAckForSpoke} this
    ///      takes neither the signer key nor the wallet: with `windowBlock` added, nine parameters
    ///      plus the three return values exceed the 16-slot stack limit (no via-ir here), so the
    ///      test wallet is read from state instead.
    function _signRegForSpoke(
        SpokeRegistry _spoke,
        address _forwarder,
        uint64 reportedChainId,
        uint64 incidentTimestamp,
        uint256 nonce,
        uint256 deadline,
        uint256 windowBlock
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        return vm.sign(
            walletPrivateKey,
            keccak256(
                abi.encodePacked(
                    "\x19\x01",
                    _domainSeparatorFor("StolenWalletRegistry", "4", address(_spoke)),
                    _regStructHash(wallet, _forwarder, reportedChainId, incidentTimestamp, nonce, deadline, windowBlock)
                )
            )
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Fee quote includes bridge and registration fees
    function test_QuoteFeeBreakdown() public view {
        ISpokeRegistry.FeeBreakdown memory fees = spoke.quoteFeeBreakdown(wallet);

        assertGt(fees.bridgeFee, 0);
        assertGt(fees.registrationFee, 0);
        assertEq(fees.total, fees.bridgeFee + fees.registrationFee);
        assertEq(fees.bridgeName, "Hyperlane");
    }

    /// @notice generateHashStruct returns valid data for signing
    function test_GenerateHashStruct() public {
        uint64 reportedChainId = 1;
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        vm.prank(wallet);
        (uint256 deadline, bytes32 hashStruct) =
            spoke.generateHashStruct(reportedChainId, incidentTimestamp, forwarder, 1);

        assertGt(deadline, block.timestamp);
        assertTrue(hashStruct != bytes32(0));
    }

    /// @notice generateHashStruct reverts on invalid step values
    function test_GenerateHashStruct_RevertIf_InvalidStep() public {
        uint64 reportedChainId = 1;
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        vm.prank(wallet);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InvalidStep.selector);
        spoke.generateHashStruct(reportedChainId, incidentTimestamp, forwarder, 0);

        vm.prank(wallet);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InvalidStep.selector);
        spoke.generateHashStruct(reportedChainId, incidentTimestamp, forwarder, 3);
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
        ISpokeRegistry.TransactionAcknowledgementData memory ack = spoke.getTransactionAcknowledgement(reporter);
        assertEq(ack.trustedForwarder, forwarder);
        assertEq(ack.dataHash, dataHash);
        assertEq(ack.reportedChainId, reportedChainId);
        assertEq(ack.transactionCount, transactionCount);
    }

    /// @notice Re-acknowledging a transaction batch while a prior one is still live is rejected.
    /// @dev Hub/spoke parity: TransactionRegistry.acknowledgeTransactions reverts with
    ///      AlreadyAcknowledged here, but the spoke silently overwrote the stored
    ///      acknowledgement — restarting the randomized grace period and orphaning the
    ///      registration signature the reporter had already produced against the first one.
    ///      Mirrors test_Acknowledge_RejectsWhileLiveAcknowledgementExists on the wallet path.
    function test_TxBatchAck_RejectsWhileLiveAcknowledgementExists() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint32 transactionCount = uint32(txHashes.length);

        _doTxBatchAck(forwarder, dataHash, reportedChainId, transactionCount);
        ISpokeRegistry.TransactionAcknowledgementData memory first = spoke.getTransactionAcknowledgement(reporter);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke.nonces(reporter);
        (uint8 v, bytes32 r, bytes32 s) = _signTxBatchAck(
            reporterPrivateKey, reporter, forwarder, dataHash, reportedChainId, transactionCount, nonce, deadline
        );

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__AlreadyAcknowledged.selector);
        spoke.acknowledgeTransactionBatch(
            dataHash, reportedChainId, transactionCount, deadline, nonce, reporter, v, r, s
        );

        // The original acknowledgement must be untouched
        ISpokeRegistry.TransactionAcknowledgementData memory afterAck = spoke.getTransactionAcknowledgement(reporter);
        assertEq(afterAck.startBlock, first.startBlock, "Grace period must not restart");
        assertEq(afterAck.expiryBlock, first.expiryBlock);
    }

    /// @notice Once the prior batch acknowledgement has expired, acknowledging again is allowed.
    /// @dev The guard must not permanently lock a reporter out after an abandoned attempt.
    function test_TxBatchAck_AllowedAfterPriorExpired() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint32 transactionCount = uint32(txHashes.length);

        _doTxBatchAck(forwarder, dataHash, reportedChainId, transactionCount);
        ISpokeRegistry.TransactionAcknowledgementData memory first = spoke.getTransactionAcknowledgement(reporter);

        vm.roll(first.expiryBlock + 1);
        _doTxBatchAck(forwarder, dataHash, reportedChainId, transactionCount);

        assertTrue(spoke.isPendingTransactionBatch(reporter));
        assertEq(spoke.nonces(reporter), 2, "Second acknowledgement should have consumed another nonce");
    }

    /// @dev The hub executes the whole batch in one destination transaction. A batch larger than a
    ///      destination block can run is quotable but never executable, and because the spoke has
    ///      already consumed the nonce, cleared the acknowledgement and kept the fee before
    ///      dispatch, the registration strands with the user's money spent. Reject it up front.
    function test_TxBatchAck_RejectsOversizedBatch() public {
        bytes32 dataHash = keccak256("oversized");
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint32 tooMany = spoke.MAX_CROSS_CHAIN_BATCH_SIZE() + 1;

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke.nonces(reporter);
        (uint8 v, bytes32 r, bytes32 s) = _signTxBatchAck(
            reporterPrivateKey, reporter, forwarder, dataHash, reportedChainId, tooMany, nonce, deadline
        );

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__BatchTooLarge.selector);
        spoke.acknowledgeTransactionBatch(dataHash, reportedChainId, tooMany, deadline, nonce, reporter, v, r, s);
    }

    /// @dev The bound is inclusive: exactly MAX_CROSS_CHAIN_BATCH_SIZE must still be accepted.
    function test_TxBatchAck_AcceptsMaximumBatch() public {
        bytes32 dataHash = keccak256("max");
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint32 max = spoke.MAX_CROSS_CHAIN_BATCH_SIZE();

        _doTxBatchAck(forwarder, dataHash, reportedChainId, max);

        assertEq(spoke.getTransactionAcknowledgement(reporter).transactionCount, max);
    }

    /// @dev The batch quote must scale with the acknowledged entry count. Quoting a batch with the
    ///      wallet-shaped `quoteRegistration` under-funds the bridge message for any batch past one
    ///      entry, which is what previously made large batches unrelayable.
    function test_QuoteTransactionBatch_ScalesWithAcknowledgedCount() public {
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));

        uint256 walletQuote = spoke.quoteRegistration(reporter);
        _doTxBatchAck(forwarder, keccak256("batch"), reportedChainId, 50);
        uint256 batchQuote = spoke.quoteTransactionBatchRegistration(reporter);

        assertGt(batchQuote, walletQuote);
        // 49 extra entries x 35,000 gas x 1 gwei, on top of the single-entry wallet quote.
        assertEq(batchQuote - walletQuote, 49 * 35_000 * 1 gwei);
    }

    /// @dev The breakdown quote is what the UI actually calls. It must agree with the total
    ///      quote and must scale with the batch, or the payment step under-funds the bridge.
    function test_QuoteTransactionBatchFeeBreakdown_MatchesTotalAndScales() public {
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        _doTxBatchAck(forwarder, keccak256("batch"), reportedChainId, 50);

        ISpokeRegistry.FeeBreakdown memory breakdown = spoke.quoteTransactionBatchFeeBreakdown(reporter);

        assertEq(breakdown.total, spoke.quoteTransactionBatchRegistration(reporter));
        assertEq(breakdown.total, breakdown.bridgeFee + breakdown.registrationFee);
        assertEq(breakdown.bridgeName, "Hyperlane");

        // Wallet-shaped breakdown prices one entry; the batch one prices fifty.
        uint256 walletBridgeFee = spoke.quoteFeeBreakdown(reporter).bridgeFee;
        assertEq(breakdown.bridgeFee - walletBridgeFee, 49 * 35_000 * 1 gwei);
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
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__SignatureExpired.selector);
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
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InvalidNonce.selector);
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
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__EmptyBatch.selector);
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
        uint256 fee = spoke.quoteTransactionBatchRegistration(reporter);

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

        ISpokeRegistry.TransactionAcknowledgementData memory ack = spoke.getTransactionAcknowledgement(reporter);
        assertEq(ack.trustedForwarder, forwarder);
        assertEq(ack.dataHash, dataHash);
        assertEq(ack.reportedChainId, reportedChainId);
        assertEq(ack.transactionCount, transactionCount);
        assertGt(ack.startBlock, block.number);
        assertGt(ack.expiryBlock, ack.startBlock);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR VALIDATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Constructor rejects zero owner via OZ OwnableInvalidOwner
    function test_Constructor_RejectsZeroOwner() public {
        vm.expectRevert(abi.encodeWithSignature("OwnableInvalidOwner(address)", address(0)));
        new SpokeRegistry(
            address(0),
            address(bridgeAdapter),
            address(feeManager),
            HUB_CHAIN_ID,
            HUB_INBOX,
            GRACE_BLOCKS,
            DEADLINE_BLOCKS,
            1
        );
    }

    /// @notice Constructor rejects zero bridge adapter
    function test_Constructor_RejectsZeroBridgeAdapter() public {
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__ZeroAddress.selector);
        new SpokeRegistry(
            owner, address(0), address(feeManager), HUB_CHAIN_ID, HUB_INBOX, GRACE_BLOCKS, DEADLINE_BLOCKS, 1
        );
    }

    /// @notice Constructor rejects zero grace blocks
    function test_Constructor_RejectsInvalidTiming_ZeroGrace() public {
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InvalidTimingConfig.selector);
        new SpokeRegistry(
            owner,
            address(bridgeAdapter),
            address(feeManager),
            HUB_CHAIN_ID,
            HUB_INBOX,
            0, // zero grace
            DEADLINE_BLOCKS,
            1
        );
    }

    /// @notice Constructor rejects zero deadline blocks
    function test_Constructor_RejectsInvalidTiming_ZeroDeadline() public {
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InvalidTimingConfig.selector);
        new SpokeRegistry(
            owner,
            address(bridgeAdapter),
            address(feeManager),
            HUB_CHAIN_ID,
            HUB_INBOX,
            GRACE_BLOCKS,
            0, // zero deadline
            1
        );
    }

    /// @notice Constructor rejects deadline < 2*grace (window too small)
    function test_Constructor_RejectsInvalidTiming_DeadlineTooSmall() public {
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InvalidTimingConfig.selector);
        new SpokeRegistry(
            owner,
            address(bridgeAdapter),
            address(feeManager),
            HUB_CHAIN_ID,
            HUB_INBOX,
            10, // grace
            15, // deadline < 2*10=20
            1
        );
    }

    /// @notice Constructor rejects mismatched hub config (chainId set, inbox zero)
    function test_Constructor_RejectsMismatchedHubConfig() public {
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InvalidHubConfig.selector);
        new SpokeRegistry(
            owner,
            address(bridgeAdapter),
            address(feeManager),
            HUB_CHAIN_ID,
            bytes32(0), // inbox zero with non-zero chainId
            GRACE_BLOCKS,
            DEADLINE_BLOCKS,
            1
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ACKNOWLEDGE EDGE CASES
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Acknowledge rejects zero forwarder address
    function test_Acknowledge_RejectsZeroForwarder() public {
        uint64 reportedChainId = 1;
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke.nonces(wallet);

        // Sign with zero forwarder
        (uint8 v, bytes32 r, bytes32 s) =
            _signAck(walletPrivateKey, wallet, address(0), reportedChainId, incidentTimestamp, nonce, deadline);

        // Intentionally prank from address(0) so msg.sender matches the zero forwarder argument
        vm.prank(address(0));
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__ZeroAddress.selector);
        spoke.acknowledge(wallet, address(0), reportedChainId, incidentTimestamp, deadline, nonce, v, r, s);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REGISTER DATA MISMATCH TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Register rejects mismatched reportedChainId between ack and register
    function test_Register_RejectsDataMismatch_ChainId() public {
        uint64 ackChainId = 1; // Acknowledge with chainId 1
        uint64 regChainId = 10; // Register with chainId 10
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        // Acknowledge with chainId=1
        _doAck(forwarder, ackChainId, incidentTimestamp);
        uint256 windowBlock = _skipToRegistrationWindow();

        // Try to register with chainId=10. The signature itself is valid (it commits to the same
        // mismatched chainId that is submitted), so validation reaches the ack/register data
        // comparison rather than failing earlier on the signer or the window block.
        _prepareWalletRegSig(forwarder, regChainId, incidentTimestamp, windowBlock);

        uint256 fee = spoke.quoteRegistration(wallet);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__DataMismatch.selector);
        spoke.register{ value: fee }(
            wallet, forwarder, regChainId, incidentTimestamp, _sDeadline, _sNonce, windowBlock, _sv, _sr, _ss
        );
    }

    /// @notice Register rejects mismatched incidentTimestamp between ack and register
    function test_Register_RejectsDataMismatch_Timestamp() public {
        uint64 reportedChainId = 1;
        uint64 ackTimestamp = uint64(block.timestamp - 1 days);
        uint64 regTimestamp = uint64(block.timestamp - 2 days); // Different timestamp

        // Acknowledge with ackTimestamp
        _doAck(forwarder, reportedChainId, ackTimestamp);
        uint256 windowBlock = _skipToRegistrationWindow();

        // Try to register with different timestamp — signature is internally consistent, so the
        // ack-vs-register comparison is what must reject it.
        _prepareWalletRegSig(forwarder, reportedChainId, regTimestamp, windowBlock);

        uint256 fee = spoke.quoteRegistration(wallet);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__DataMismatch.selector);
        spoke.register{ value: fee }(
            wallet, forwarder, reportedChainId, regTimestamp, _sDeadline, _sNonce, windowBlock, _sv, _sr, _ss
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TX BATCH REGISTRATION ERROR PATH TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Tx batch registration rejects when submitted by wrong forwarder
    function test_TxBatchReg_RejectsWrongForwarder() public {
        _rejectsWrongForwarderImpl();
    }

    function _rejectsWrongForwarderImpl() internal {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        {
            bytes32 dataHash = _computeDataHash(txHashes, chainIds);
            _doTxBatchAck(forwarder, dataHash, reportedChainId, uint32(txHashes.length));
            _skipToTxBatchRegistrationWindow(reporter);
            _prepareTxBatchRegSig(dataHash, reportedChainId, uint32(txHashes.length), forwarder);
        }
        uint256 fee = spoke.quoteTransactionBatchRegistration(reporter);
        address wrongFwd = makeAddr("wrongForwarder");
        vm.deal(wrongFwd, 10 ether);

        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InvalidForwarder.selector);
        vm.prank(wrongFwd);
        spoke.registerTransactionBatch{ value: fee }(
            reportedChainId, _sDeadline, _sNonce, reporter, txHashes, chainIds, _sv, _sr, _ss
        );
    }

    /// @notice Tx batch registration rejects before grace period
    function test_TxBatchReg_RejectsBeforeGracePeriod() public {
        _rejectsBeforeGracePeriodImpl();
    }

    function _rejectsBeforeGracePeriodImpl() internal {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        {
            bytes32 dataHash = _computeDataHash(txHashes, chainIds);
            _doTxBatchAck(forwarder, dataHash, reportedChainId, uint32(txHashes.length));
            // DO NOT skip to registration window
            _prepareTxBatchRegSig(dataHash, reportedChainId, uint32(txHashes.length), forwarder);
        }
        uint256 fee = spoke.quoteTransactionBatchRegistration(reporter);

        vm.expectRevert(ISpokeRegistry.SpokeRegistry__GracePeriodNotStarted.selector);
        vm.prank(forwarder);
        spoke.registerTransactionBatch{ value: fee }(
            reportedChainId, _sDeadline, _sNonce, reporter, txHashes, chainIds, _sv, _sr, _ss
        );
    }

    /// @notice Tx batch registration rejects after expiry
    function test_TxBatchReg_RejectsAfterExpiry() public {
        _rejectsAfterExpiryImpl();
    }

    function _rejectsAfterExpiryImpl() internal {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        {
            bytes32 dataHash = _computeDataHash(txHashes, chainIds);
            _doTxBatchAck(forwarder, dataHash, reportedChainId, uint32(txHashes.length));
            ISpokeRegistry.TransactionAcknowledgementData memory ack = spoke.getTransactionAcknowledgement(reporter);
            vm.roll(ack.expiryBlock);
            _prepareTxBatchRegSig(dataHash, reportedChainId, uint32(txHashes.length), forwarder);
        }
        uint256 fee = spoke.quoteTransactionBatchRegistration(reporter);

        vm.expectRevert(ISpokeRegistry.SpokeRegistry__ForwarderExpired.selector);
        vm.prank(forwarder);
        spoke.registerTransactionBatch{ value: fee }(
            reportedChainId, _sDeadline, _sNonce, reporter, txHashes, chainIds, _sv, _sr, _ss
        );
    }

    /// @notice Tx batch registration rejects when submitted data differs from acknowledged data
    function test_TxBatchReg_RejectsDataMismatch() public {
        _rejectsDataMismatchImpl();
    }

    function _rejectsDataMismatchImpl() internal {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        {
            bytes32 dataHash = _computeDataHash(txHashes, chainIds);
            _doTxBatchAck(forwarder, dataHash, reportedChainId, uint32(txHashes.length));
            _skipToTxBatchRegistrationWindow(reporter);
        }

        bytes32[] memory wrongTxHashes = new bytes32[](3);
        wrongTxHashes[0] = keccak256("wrong_tx1");
        wrongTxHashes[1] = keccak256("wrong_tx2");
        wrongTxHashes[2] = keccak256("wrong_tx3");
        {
            bytes32 wrongDataHash = _computeDataHash(wrongTxHashes, chainIds);
            _prepareTxBatchRegSig(wrongDataHash, reportedChainId, uint32(wrongTxHashes.length), forwarder);
        }
        uint256 fee = spoke.quoteTransactionBatchRegistration(reporter);

        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InvalidDataHash.selector);
        vm.prank(forwarder);
        spoke.registerTransactionBatch{ value: fee }(
            reportedChainId, _sDeadline, _sNonce, reporter, wrongTxHashes, chainIds, _sv, _sr, _ss
        );
    }

    /// @notice Tx batch registration rejects with insufficient fee (0 ETH)
    function test_TxBatchReg_RejectsInsufficientFee() public {
        _rejectsInsufficientFeeImpl();
    }

    function _rejectsInsufficientFeeImpl() internal {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        {
            bytes32 dataHash = _computeDataHash(txHashes, chainIds);
            _doTxBatchAck(forwarder, dataHash, reportedChainId, uint32(txHashes.length));
            _skipToTxBatchRegistrationWindow(reporter);
            _prepareTxBatchRegSig(dataHash, reportedChainId, uint32(txHashes.length), forwarder);
        }

        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InsufficientFee.selector);
        vm.prank(forwarder);
        spoke.registerTransactionBatch{ value: 0 }(
            reportedChainId, _sDeadline, _sNonce, reporter, txHashes, chainIds, _sv, _sr, _ss
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN ADDITIONAL TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice setHubConfig rejects mismatched config (chainId non-zero, inbox zero)
    function test_SetHubConfig_RejectsMismatchedConfig() public {
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InvalidHubConfig.selector);
        spoke.setHubConfig(10, bytes32(0));
    }

    /// @notice withdrawFees sends ETH to treasury address
    function test_WithdrawFees_Success() public {
        address treasury = makeAddr("treasury");
        uint256 amount = 1 ether;

        // Fund the spoke contract
        vm.deal(address(spoke), amount);

        // Withdraw as owner
        spoke.withdrawFees(treasury, amount);

        assertEq(treasury.balance, amount);
        assertEq(address(spoke).balance, 0);
    }

    /// @notice withdrawFees rejects zero address
    function test_WithdrawFees_RejectsZeroAddress() public {
        vm.deal(address(spoke), 1 ether);

        vm.expectRevert(ISpokeRegistry.SpokeRegistry__ZeroAddress.selector);
        spoke.withdrawFees(address(0), 1 ether);
    }

    /// @notice withdrawFees rejects non-owner
    function test_WithdrawFees_RejectsNonOwner() public {
        address notOwner = makeAddr("notOwner");
        vm.deal(address(spoke), 1 ether);

        vm.prank(notOwner);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", notOwner));
        spoke.withdrawFees(makeAddr("treasury"), 1 ether);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WINDOW BLOCK (ANTI-PHISHING) TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice A window block older than the acknowledgement's grace start is rejected.
    /// @dev This is the anti-phishing control itself. If a pre-grace block were accepted, both
    ///      signatures could be harvested in one sitting: the attacker would reference a block
    ///      that already existed at acknowledgement time, and the enforced delay would apply only
    ///      to the transactions, not to the victim's two interactions.
    function test_register_revertsIfWindowBlockBeforeGracePeriod() public {
        uint64 reportedChainId = 1;
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        _doAck(forwarder, reportedChainId, incidentTimestamp);
        uint256 graceStart = _skipToRegistrationWindow();

        // One block too early — the hash of this block existed before the grace period elapsed.
        uint256 windowBlock = graceStart - 1;
        _prepareWalletRegSig(forwarder, reportedChainId, incidentTimestamp, windowBlock);

        uint256 fee = spoke.quoteRegistration(wallet);

        vm.prank(forwarder);
        vm.expectRevert(TimingConfig.TimingConfig__WindowBlockBeforeGracePeriod.selector);
        spoke.register{ value: fee }(
            wallet, forwarder, reportedChainId, incidentTimestamp, _sDeadline, _sNonce, windowBlock, _sv, _sr, _ss
        );
    }

    /// @notice A window block at or beyond the current block is rejected.
    /// @dev `blockhash` returns zero for an unmined block. Without this bound a signer could
    ///      commit to bytes32(0) for a future block and satisfy the check with a hash nobody had
    ///      to wait for.
    function test_register_revertsIfWindowBlockNotMined() public {
        uint64 reportedChainId = 1;
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        _doAck(forwarder, reportedChainId, incidentTimestamp);
        _skipToRegistrationWindow();

        // The current block is not yet mined from the EVM's point of view.
        uint256 windowBlock = block.number;
        _prepareWalletRegSig(forwarder, reportedChainId, incidentTimestamp, windowBlock);

        uint256 fee = spoke.quoteRegistration(wallet);

        vm.prank(forwarder);
        vm.expectRevert(TimingConfig.TimingConfig__WindowBlockNotMined.selector);
        spoke.register{ value: fee }(
            wallet, forwarder, reportedChainId, incidentTimestamp, _sDeadline, _sNonce, windowBlock, _sv, _sr, _ss
        );
    }

    /// @notice Only the forwarder named in the signature may submit the acknowledgement.
    /// @dev Hub parity. A third party able to submit someone else's acknowledgement could grind
    ///      submissions for favourable randomized timing and burn the wallet's nonce, invalidating
    ///      a registration signature the user had already produced.
    function test_acknowledge_revertsIfSenderIsNotForwarder() public {
        uint64 reportedChainId = 1;
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signAck(walletPrivateKey, wallet, forwarder, reportedChainId, incidentTimestamp, nonce, deadline);

        address thirdParty = makeAddr("thirdParty");
        vm.deal(thirdParty, 1 ether);

        vm.prank(thirdParty);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InvalidForwarder.selector);
        spoke.acknowledge(wallet, forwarder, reportedChainId, incidentTimestamp, deadline, nonce, v, r, s);
    }

    /// @notice A deadline further out than MAX_SIGNATURE_LIFETIME is rejected in both phases.
    /// @dev An unbounded deadline lets a harvested signature stay usable indefinitely, so it could
    ///      be submitted months later when the victim has no memory of signing.
    function test_acknowledge_revertsIfDeadlineTooFarInFuture() public {
        uint64 reportedChainId = 1;
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);
        uint256 deadline = block.timestamp + TimingConfig.MAX_SIGNATURE_LIFETIME + 1;
        uint256 nonce = spoke.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signAck(walletPrivateKey, wallet, forwarder, reportedChainId, incidentTimestamp, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__DeadlineTooFarInFuture.selector);
        spoke.acknowledge(wallet, forwarder, reportedChainId, incidentTimestamp, deadline, nonce, v, r, s);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HUB / SPOKE SIGNATURE UNIFICATION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Hub and spoke must build the SAME registration struct hash and expose the SAME
    ///         `register` ABI, so one frontend code path can serve both.
    /// @dev The full EIP-712 digests necessarily differ in `verifyingContract` only — that field is
    ///      what stops a spoke signature being replayed on the hub. Everything else must match:
    ///      the domain name/version, the typehash (including the new trailing `windowBlockHash`
    ///      field), the field order, and the external argument order. Any drift here silently
    ///      breaks one of the two chains' signing paths.
    function test_HubAndSpokeRegistrationDigestsAreUnified() public {
        WalletRegistry hub = new WalletRegistry(owner, address(feeManager), GRACE_BLOCKS, DEADLINE_BLOCKS);

        // The typehash the test signs with is the one both production contracts use.
        assertEq(REG_TYPEHASH, EIP712Constants.WALLET_REG_TYPEHASH, "typehash drift");
        assertEq(keccak256(bytes(REG_STATEMENT)), EIP712Constants.REG_STATEMENT_HASH, "statement drift");

        // Identical inputs must produce an identical struct hash on both sides.
        bytes32 structHash = keccak256(
            abi.encode(
                EIP712Constants.WALLET_REG_TYPEHASH,
                EIP712Constants.REG_STATEMENT_HASH,
                wallet,
                forwarder,
                uint64(1),
                uint64(block.timestamp - 1 days),
                uint256(0),
                block.timestamp + 1 hours,
                blockhash(block.number - 1)
            )
        );

        // Same domain name and version on both contracts; only verifyingContract differs.
        (, string memory hubName, string memory hubVersion,, address hubVerifying,,) = hub.eip712Domain();
        (, string memory spokeName, string memory spokeVersion,, address spokeVerifying,,) = spoke.eip712Domain();
        assertEq(hubName, spokeName, "domain name drift");
        assertEq(hubVersion, spokeVersion, "domain version drift");
        assertEq(hubVerifying, address(hub));
        assertEq(spokeVerifying, address(spoke));

        bytes32 hubDigest = keccak256(
            abi.encodePacked("\x19\x01", _domainSeparatorFor(hubName, hubVersion, address(hub)), structHash)
        );
        bytes32 spokeDigest = keccak256(
            abi.encodePacked("\x19\x01", _domainSeparatorFor(spokeName, spokeVersion, address(spoke)), structHash)
        );

        // Substituting the spoke's address into the hub's domain reproduces the spoke digest
        // exactly, which is only possible if every other input matches.
        assertEq(
            spokeDigest,
            keccak256(
                abi.encodePacked("\x19\x01", _domainSeparatorFor(hubName, hubVersion, address(spoke)), structHash)
            ),
            "digest differs by more than verifyingContract"
        );
        assertTrue(hubDigest != spokeDigest, "cross-chain replay must remain impossible");

        // The external ABI (argument order, including windowBlock's position) must also match.
        assertEq(ISpokeRegistry.register.selector, IWalletRegistry.register.selector, "register ABI drift");
    }

    /// @dev EIP-712 domain separator for an arbitrary (name, version, contract) triple.
    function _domainSeparatorFor(string memory name, string memory version, address verifying)
        internal
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                block.chainid,
                verifying
            )
        );
    }
}
