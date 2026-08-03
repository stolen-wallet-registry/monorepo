// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { SpokeRegistry } from "../src/spoke/SpokeRegistry.sol";
import { ISpokeRegistry } from "../src/interfaces/ISpokeRegistry.sol";
import { CrossChainMessage } from "../src/libraries/CrossChainMessage.sol";
import { CAIP10 } from "../src/libraries/CAIP10.sol";
import { CAIP10Evm } from "../src/libraries/CAIP10Evm.sol";
import { TimingConfig } from "../src/libraries/TimingConfig.sol";
import { EIP712Constants } from "../src/libraries/EIP712Constants.sol";
import { WalletRegistry } from "../src/registries/WalletRegistry.sol";
import { IWalletRegistry } from "../src/interfaces/IWalletRegistry.sol";
import { TransactionRegistry } from "../src/registries/TransactionRegistry.sol";
import { ContractRegistry } from "../src/registries/ContractRegistry.sol";
import { FraudRegistryHub } from "../src/FraudRegistryHub.sol";
import { CrossChainInbox } from "../src/CrossChainInbox.sol";
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
    uint256 internal _sWindowBlock;
    uint256 internal _txWindowBlock;

    // Second, independent set of the same slots. The nonce-separation tests (C-1) must hold a
    // WALLET registration signature across a TRANSACTION-batch acknowledgement, and both helpers
    // stage their output in _sv/_sr/_ss/_sDeadline/_sNonce — so the second call would clobber the
    // first. These slots park the wallet signature out of the way.
    uint8 internal _wv;
    bytes32 internal _wr;
    bytes32 internal _ws;
    uint256 internal _wDeadline;
    uint256 internal _wNonce;

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
    // Mirrors EIP712Constants.TX_BATCH_REG_TYPEHASH. All nine declared members are encoded in
    // `_signTxBatchReg` below, including the `windowBlockHash` freshness commitment — the spoke's
    // transaction-batch path is now at parity with the wallet path and the hub's
    // TransactionRegistry. Encoding fewer members than the typehash declares is what previously
    // desynced this digest from the one the frontend signature builder produces; keep them in
    // lockstep.
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
    ///
    ///      DUPLICATE OF {EIP712TestHelper._rollToWindow}, and deliberately so: this suite extends
    ///      forge-std's Test directly rather than EIP712TestHelper, because the spoke signs
    ///      `reportedChainId`/`incidentTimestamp` as uint64 where the hub uses bytes32, so it
    ///      cannot share the helper's typehashes. The two bodies MUST stay identical — they encode
    ///      the same anti-phishing window convention, and a change to one without the other would
    ///      silently give the hub and spoke test suites different notions of a valid windowBlock.
    ///      If EIP712TestHelper's copy changes, change this one.
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

    /// @dev Skip into the tx-batch registration window and return the `windowBlock` to sign and
    ///      submit. Rolls one block PAST `startBlock` so there is a mined block to reference —
    ///      `resolveWindowBlockHash` requires `startBlock <= windowBlock < block.number`.
    function _skipToTxBatchRegistrationWindow(address _reporter) internal returns (uint256 windowBlock) {
        ISpokeRegistry.TransactionAcknowledgementData memory ack = spoke.getTransactionAcknowledgement(_reporter);
        return _rollToWindow(ack.startBlock);
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
        uint256 deadline,
        uint256 windowBlock
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
                deadline,
                blockhash(windowBlock)
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
        uint256 nonce = spoke.txNonces(reporter);

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
        uint256 fee,
        uint256 windowBlock
    ) internal {
        // Signature components, deadline, nonce and windowBlock all travel through storage:
        // registerTransactionBatch now takes ten arguments, and holding any of them as locals
        // here overflows the EVM's 16-slot stack (this project builds without via-ir).
        _prepareTxBatchRegSig(
            _computeDataHash(txHashes, chainIds), reportedChainId, uint32(txHashes.length), _forwarder, windowBlock
        );

        vm.prank(_forwarder);
        spoke.registerTransactionBatch{ value: fee }(
            reportedChainId, _sDeadline, _sNonce, reporter, txHashes, chainIds, _sWindowBlock, _sv, _sr, _ss
        );
    }

    /// @dev Helper for registration with custom forwarder signing (for wrong forwarder test)
    function _doTxBatchRegWithCustomSigner(
        address submitter,
        address signingForwarder,
        bytes32 reportedChainId,
        bytes32[] memory txHashes,
        bytes32[] memory chainIds,
        uint256 fee,
        uint256 windowBlock
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
            nonce = spoke.txNonces(reporter);
            (v, r, s) = _signTxBatchReg(
                reporterPrivateKey,
                reporter,
                signingForwarder,
                dataHash,
                reportedChainId,
                transactionCount,
                nonce,
                deadline,
                windowBlock
            );
        }

        vm.prank(submitter);
        spoke.registerTransactionBatch{ value: fee }(
            reportedChainId, deadline, nonce, reporter, txHashes, chainIds, windowBlock, v, r, s
        );
    }

    /// @dev Helper for registration with separate signing dataHash (for testing data mismatch)
    function _doTxBatchRegWithSigningHash(
        bytes32 signingDataHash,
        uint32 signingTxCount,
        bytes32 reportedChainId,
        bytes32[] memory txHashes,
        bytes32[] memory chainIds,
        uint256 fee,
        uint256 windowBlock
    ) internal {
        uint8 v;
        bytes32 r;
        bytes32 s;
        uint256 deadline;
        uint256 nonce;
        {
            deadline = block.timestamp + 1 hours;
            nonce = spoke.txNonces(reporter);
            (v, r, s) = _signTxBatchReg(
                reporterPrivateKey,
                reporter,
                forwarder,
                signingDataHash,
                reportedChainId,
                signingTxCount,
                nonce,
                deadline,
                windowBlock
            );
        }

        vm.prank(forwarder);
        spoke.registerTransactionBatch{ value: fee }(
            reportedChainId, deadline, nonce, reporter, txHashes, chainIds, windowBlock, v, r, s
        );
    }

    /// @dev Prepare tx batch reg signature and store in _sv/_sr/_ss/_sDeadline/_sNonce.
    ///      Writes to storage to free stack slots — registerTransactionBatch takes 10 args,
    ///      which combined with local variables exceeds the EVM's 16-slot stack limit.
    ///      Reads nonce via external call, so call BEFORE vm.expectRevert.
    function _prepareTxBatchRegSig(
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint32 txCount,
        address _forwarder,
        uint256 windowBlock
    ) internal {
        _prepareTxBatchRegSigWithDeadline(
            dataHash, reportedChainId, txCount, _forwarder, windowBlock, block.timestamp + 1 hours
        );
    }

    /// @dev As {_prepareTxBatchRegSig}, but with an explicit deadline, so a test can produce a
    ///      signature that genuinely commits to the deadline it then submits. Without this a
    ///      deadline-bound test signs one value and submits another, which passes only because
    ///      the bound is checked before signature recovery — i.e. it tests check ORDER, not the
    ///      bound itself, and would keep passing if the bound were removed but the recovery
    ///      happened to reject the mismatch.
    ///      Reads nonce via an external call, so call BEFORE vm.expectRevert.
    function _prepareTxBatchRegSigWithDeadline(
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint32 txCount,
        address _forwarder,
        uint256 windowBlock,
        uint256 deadline
    ) internal {
        _sDeadline = deadline;
        _sNonce = spoke.txNonces(reporter);
        _sWindowBlock = windowBlock;
        (_sv, _sr, _ss) = _signTxBatchReg(
            reporterPrivateKey,
            reporter,
            _forwarder,
            dataHash,
            reportedChainId,
            txCount,
            _sNonce,
            _sDeadline,
            windowBlock
        );
    }

    // ── Calldata trampolines ────────────────────────────────────────────────
    // CrossChainMessage's decoders take `bytes calldata`; `mailbox.lastMessage()` returns memory.
    // Calling these through `this.` converts it. Using the PRODUCTION decoder (rather than
    // re-implementing the layout here) is the point: it is the decoder the hub inbox runs.

    function decodeWalletPayload(bytes calldata data)
        external
        pure
        returns (CrossChainMessage.WalletRegistrationPayload memory)
    {
        return CrossChainMessage.decodeWalletRegistration(data);
    }

    function decodeTxBatchPayload(bytes calldata data)
        external
        pure
        returns (CrossChainMessage.TransactionBatchPayload memory)
    {
        return CrossChainMessage.decodeTransactionBatch(data);
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

        // The dispatched message itself — previously unasserted, so field-order drift or a wrong
        // sourceChainId in the encoder left this test green while breaking every cross-chain
        // registration on arrival at the hub. See test_E2E_WalletRegistrationReachesHub for the
        // other half: that the hub's DECODER agrees with what is asserted here.
        assertEq(mailbox.lastDestination(), HUB_CHAIN_ID, "Message must be addressed to the hub domain");
        assertEq(mailbox.lastRecipient(), HUB_INBOX, "Message must be addressed to the configured hub inbox");

        CrossChainMessage.WalletRegistrationPayload memory sent = this.decodeWalletPayload(mailbox.lastMessage());
        assertEq(sent.identifier, bytes32(uint256(uint160(wallet))), "identifier must be the registered wallet");
        assertEq(sent.sourceChainId, CAIP10Evm.caip2Hash(uint64(SPOKE_CHAIN_ID)), "sourceChainId must be this spoke");
        assertEq(sent.reportedChainId, CAIP10Evm.caip2Hash(reportedChainId), "reportedChainId must survive encoding");
        assertEq(sent.incidentTimestamp, incidentTimestamp, "incidentTimestamp must survive encoding");
        assertTrue(sent.isSponsored, "wallet != forwarder is a sponsored registration");
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
    /// @notice Phase 1 already refuses on a spoke with no hub configured.
    /// @dev This test used to acknowledge successfully and assert only that `register` reverted —
    ///      which is the bug: the user had already spent acknowledgement gas and burned a nonce on
    ///      a spoke that can never deliver phase 2, and could not re-acknowledge until the window
    ///      expired. `acknowledge` now carries the same `hubInbox != 0` check `register` has, so
    ///      the flow fails on the first call and costs the user nothing.
    function test_Acknowledge_FailsWhenHubNotConfigured() public {
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

        (uint8 v, bytes32 r, bytes32 s) = _signAckForSpoke(
            unconfiguredSpoke, walletPrivateKey, wallet, forwarder, reportedChainId, incidentTimestamp, nonce, deadline
        );

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__HubNotConfigured.selector);
        unconfiguredSpoke.acknowledge(wallet, forwarder, reportedChainId, incidentTimestamp, deadline, nonce, v, r, s);

        assertFalse(unconfiguredSpoke.isPending(wallet), "No window may open on an undeliverable spoke");
        assertEq(unconfiguredSpoke.nonces(wallet), nonce, "A rejected acknowledgement must not burn the nonce");
    }

    /// @notice The tx-batch acknowledgement carries the same guard as the wallet one.
    function test_TxBatchAck_FailsWhenHubNotConfigured() public {
        SpokeRegistry unconfiguredSpoke = new SpokeRegistry(
            owner, address(bridgeAdapter), address(feeManager), 0, bytes32(0), GRACE_BLOCKS, DEADLINE_BLOCKS, 1
        );

        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint32 transactionCount = uint32(txHashes.length);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = unconfiguredSpoke.txNonces(reporter);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__HubNotConfigured.selector);
        unconfiguredSpoke.acknowledgeTransactionBatch(
            dataHash, reportedChainId, transactionCount, deadline, nonce, reporter, 27, bytes32(0), bytes32(0)
        );

        assertEq(unconfiguredSpoke.txNonces(reporter), nonce, "A rejected acknowledgement must not burn the nonce");
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

    /// @notice getSignatureDeadline returns a usable signing deadline.
    /// @dev Deadline only — see {WalletRegistry} test of the same name for why there is no
    ///      hash-struct return value any more.
    function test_GetSignatureDeadline() public {
        uint64 reportedChainId = 1;
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        vm.prank(wallet);
        uint256 deadline = spoke.getSignatureDeadline(reportedChainId, incidentTimestamp, forwarder, 1);

        assertGt(deadline, block.timestamp);
    }

    /// @notice getSignatureDeadline reverts on invalid step values
    function test_GetSignatureDeadline_RevertIf_InvalidStep() public {
        uint64 reportedChainId = 1;
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        vm.prank(wallet);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InvalidStep.selector);
        spoke.getSignatureDeadline(reportedChainId, incidentTimestamp, forwarder, 0);

        vm.prank(wallet);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InvalidStep.selector);
        spoke.getSignatureDeadline(reportedChainId, incidentTimestamp, forwarder, 3);
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
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, notOwner));
        spoke.setHubConfig(10, bytes32(uint256(0xdead)));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // NONCE SEPARATION (C-1)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Acknowledge a transaction batch on behalf of an ARBITRARY reporter/key, unlike
    ///      {_doTxBatchAck} which is hardwired to the suite's `reporter`. The nonce-separation
    ///      tests need one address to be active in BOTH flows at once, which is only reachable
    ///      if the tx-flow reporter can be the wallet.
    ///
    ///      Signature components, deadline and nonce travel through the suite's storage slots
    ///      rather than locals: `acknowledgeTransactionBatch` takes nine arguments, and holding
    ///      them alongside this helper's six parameters overflows the EVM's 16-slot stack (this
    ///      project builds without via-ir). Same pattern as {_prepareTxBatchRegSigWithDeadline}.
    function _doTxBatchAckFor(
        uint256 privateKey,
        address _reporter,
        address _forwarder,
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint32 transactionCount
    ) internal {
        _sDeadline = block.timestamp + 1 hours;
        _sNonce = spoke.txNonces(_reporter);
        (_sv, _sr, _ss) = _signTxBatchAck(
            privateKey, _reporter, _forwarder, dataHash, reportedChainId, transactionCount, _sNonce, _sDeadline
        );

        vm.prank(_forwarder);
        spoke.acknowledgeTransactionBatch(
            dataHash, reportedChainId, transactionCount, _sDeadline, _sNonce, _reporter, _sv, _sr, _ss
        );
    }

    /// @notice A transaction-batch acknowledgement must not strand an in-flight WALLET registration.
    /// @dev SECURITY-CRITICAL (C-1). The spoke hosts both flows on one contract, where the hub
    ///      splits them across WalletRegistry and TransactionRegistry. With a single shared
    ///      `nonces` mapping, acknowledging a batch moved the counter out from under the wallet
    ///      registration signature the user had already produced — and because the wallet
    ///      acknowledgement is still live, they could not re-acknowledge to obtain a fresh nonce
    ///      either. The registration was unrecoverable until `expiryBlock`, with the
    ///      acknowledgement gas already spent.
    function test_NonceSeparation_TxBatchAckDoesNotStrandWalletRegistration() public {
        uint64 reportedChainId = 1;
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        // Phase 1 of the wallet flow, then produce the phase-2 signature against the nonce as it
        // stands right now — exactly what a frontend does the moment the grace period opens.
        _doAck(forwarder, reportedChainId, incidentTimestamp);
        uint256 windowBlock = _skipToRegistrationWindow();
        _prepareWalletRegSig(forwarder, reportedChainId, incidentTimestamp, windowBlock);
        assertEq(_sNonce, 1, "Wallet registration signed against wallet nonce 1");
        // Park it: the tx-batch helper below stages into the same slots.
        (_wv, _wr, _ws, _wDeadline, _wNonce) = (_sv, _sr, _ss, _sDeadline, _sNonce);

        // Now interleave: the SAME address opens a transaction-batch flow. Under the shared
        // mapping this incremented the wallet counter to 2 and invalidated _sNonce above.
        {
            (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
            _doTxBatchAckFor(
                walletPrivateKey,
                wallet,
                forwarder,
                _computeDataHash(txHashes, chainIds),
                CAIP10Evm.caip2Hash(uint64(1)),
                uint32(txHashes.length)
            );
        }

        // The two counters moved independently.
        assertEq(spoke.nonces(wallet), 1, "Wallet nonce must be untouched by the tx-batch flow");
        assertEq(spoke.txNonces(wallet), 1, "Tx nonce advanced on its own counter");

        // And the wallet registration still lands.
        uint256 fee = spoke.quoteRegistration(wallet);
        vm.prank(forwarder);
        spoke.register{ value: fee }(
            wallet, forwarder, reportedChainId, incidentTimestamp, _wDeadline, _wNonce, windowBlock, _wv, _wr, _ws
        );

        assertFalse(spoke.isPending(wallet), "Wallet registration should have consumed the acknowledgement");
        assertEq(spoke.nonces(wallet), 2, "Wallet nonce advances only on the wallet flow");
        assertTrue(spoke.isPendingTransactionBatch(wallet), "Tx-batch acknowledgement must survive intact");
    }

    /// @notice The mirror of the above: a wallet acknowledgement must not disturb the tx counter.
    /// @dev Same shared-mapping defect seen from the other side — a user who reports a stolen
    ///      wallet mid-batch would have found their already-signed batch registration rejected.
    function test_NonceSeparation_WalletAckDoesNotMoveTxNonce() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        _doTxBatchAckFor(
            walletPrivateKey,
            wallet,
            forwarder,
            _computeDataHash(txHashes, chainIds),
            CAIP10Evm.caip2Hash(uint64(1)),
            uint32(txHashes.length)
        );
        assertEq(spoke.txNonces(wallet), 1);

        _doAck(forwarder, 1, uint64(block.timestamp - 1 days));

        assertEq(spoke.txNonces(wallet), 1, "Wallet acknowledgement must not move the tx counter");
        assertEq(spoke.nonces(wallet), 1, "Wallet counter advances on its own");
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
        assertEq(spoke.txNonces(reporter), 1);

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
        uint256 nonce = spoke.txNonces(reporter);
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
        assertEq(spoke.txNonces(reporter), 2, "Second acknowledgement should have consumed another nonce");
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
        uint256 nonce = spoke.txNonces(reporter);
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
        uint256 nonce = spoke.txNonces(reporter);

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
        uint256 nonce = spoke.txNonces(reporter);

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
        uint256 nonce = spoke.txNonces(reporter);

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
        uint256 windowBlock = _skipToTxBatchRegistrationWindow(reporter);

        // Phase 2: Register
        uint256 fee = spoke.quoteTransactionBatchRegistration(reporter);

        vm.expectEmit(true, false, true, true);
        emit TransactionBatchSentToHub(reporter, bytes32(0), dataHash, HUB_CHAIN_ID);

        _doTxBatchReg(forwarder, reportedChainId, txHashes, chainIds, fee, windowBlock);

        // Verify acknowledgement cleaned up
        assertFalse(spoke.isPendingTransactionBatch(reporter));
        assertEq(spoke.txNonces(reporter), 2); // Incremented again

        // Assert the dispatched payload, not just that something was dispatched — see the same
        // block in test_Register_Success for why.
        assertEq(mailbox.lastDestination(), HUB_CHAIN_ID, "Message must be addressed to the hub domain");
        assertEq(mailbox.lastRecipient(), HUB_INBOX, "Message must be addressed to the configured hub inbox");

        CrossChainMessage.TransactionBatchPayload memory sent = this.decodeTxBatchPayload(mailbox.lastMessage());
        assertEq(sent.dataHash, dataHash, "dataHash must survive encoding");
        assertEq(sent.reporter, reporter, "reporter must survive encoding");
        assertEq(sent.sourceChainId, CAIP10Evm.caip2Hash(uint64(SPOKE_CHAIN_ID)), "sourceChainId must be this spoke");
        assertEq(sent.reportedChainId, reportedChainId, "reportedChainId must survive encoding");
        assertEq(sent.transactionCount, uint32(txHashes.length), "transactionCount must survive encoding");
        assertEq(sent.transactionHashes.length, txHashes.length, "every hash must be carried");
        assertTrue(sent.isSponsored, "reporter != forwarder is a sponsored registration");
    }

    /// @notice A transaction batch whose two arrays differ in length is rejected.
    /// @dev This is the one gap the old NOTE here was right about: `__ArrayLengthMismatch` had no
    ///      test. The rest of the errors that NOTE claimed were untestable (grace period, expiry,
    ///      wrong forwarder, invalid dataHash, insufficient fee) now have tests in this file, so
    ///      the NOTE was stale as well as wrong. Signature is produced against the SUBMITTED
    ///      arrays' dataHash so the length check is what fires, not a hash mismatch.
    function test_TxBatchReg_RejectsArrayLengthMismatch() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));

        _doTxBatchAck(forwarder, _computeDataHash(txHashes, chainIds), reportedChainId, uint32(txHashes.length));
        uint256 windowBlock = _skipToTxBatchRegistrationWindow(reporter);

        // Drop one chain ID so the arrays disagree.
        bytes32[] memory shortChainIds = new bytes32[](2);
        shortChainIds[0] = chainIds[0];
        shortChainIds[1] = chainIds[1];

        // Pre-compute nonce and signature: vm.expectRevert would otherwise consume the view read.
        _prepareTxBatchRegSig(
            _computeDataHash(txHashes, shortChainIds), reportedChainId, uint32(txHashes.length), forwarder, windowBlock
        );
        uint256 fee = spoke.quoteTransactionBatchRegistration(reporter);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__ArrayLengthMismatch.selector);
        spoke.registerTransactionBatch{ value: fee }(
            reportedChainId, _sDeadline, _sNonce, reporter, txHashes, shortChainIds, _sWindowBlock, _sv, _sr, _ss
        );
    }

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

    /// @notice Constructor rejects `deadlineBlocks == 2 * graceBlocks` — the exact boundary.
    /// @dev The case the old `< 2 * graceBlocks` bound wrongly ACCEPTED. `getGracePeriodEndBlock`
    ///      can return `bn + 2g - 1` while `getDeadlineBlock` can return `bn + 2g`, and
    ///      `resolveWindowBlockHash` requires `startBlock <= windowBlock < block.number` — so the
    ///      earliest usable registration block is `startBlock + 1`, already at/past `expiryBlock`
    ///      on that draw. On a spoke this is worse than on the hub: the user has burned a nonce and
    ///      the acknowledgement gas on a chain whose registration can only complete by bridging,
    ///      and the already-acknowledged guard blocks a retry until the window expires.
    function test_Constructor_RejectsInvalidTiming_DeadlineExactlyTwiceGrace() public {
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InvalidTimingConfig.selector);
        new SpokeRegistry(
            owner,
            address(bridgeAdapter),
            address(feeManager),
            HUB_CHAIN_ID,
            HUB_INBOX,
            10, // grace
            20, // deadline == 2*10, no usable registration block on the worst draw
            1
        );
    }

    /// @notice Constructor accepts `deadlineBlocks == 2 * graceBlocks + 1` — the smallest config
    ///         that guarantees a usable registration block for every randomised draw.
    function test_Constructor_AcceptsDeadlineTwiceGracePlusOne() public {
        SpokeRegistry reg =
            new SpokeRegistry(owner, address(bridgeAdapter), address(feeManager), HUB_CHAIN_ID, HUB_INBOX, 10, 21, 1);
        assertEq(reg.graceBlocks(), 10);
        assertEq(reg.deadlineBlocks(), 21);
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
            uint256 windowBlock = _skipToTxBatchRegistrationWindow(reporter);
            _prepareTxBatchRegSig(dataHash, reportedChainId, uint32(txHashes.length), forwarder, windowBlock);
        }
        uint256 fee = spoke.quoteTransactionBatchRegistration(reporter);
        address wrongFwd = makeAddr("wrongForwarder");
        vm.deal(wrongFwd, 10 ether);

        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InvalidForwarder.selector);
        vm.prank(wrongFwd);
        spoke.registerTransactionBatch{ value: fee }(
            reportedChainId, _sDeadline, _sNonce, reporter, txHashes, chainIds, _sWindowBlock, _sv, _sr, _ss
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
            // DO NOT skip to registration window. The grace-period check fires before
            // resolveWindowBlockHash, so any mined block works as the (unusable) reference.
            _prepareTxBatchRegSig(dataHash, reportedChainId, uint32(txHashes.length), forwarder, block.number - 1);
        }
        uint256 fee = spoke.quoteTransactionBatchRegistration(reporter);

        vm.expectRevert(ISpokeRegistry.SpokeRegistry__GracePeriodNotStarted.selector);
        vm.prank(forwarder);
        spoke.registerTransactionBatch{ value: fee }(
            reportedChainId, _sDeadline, _sNonce, reporter, txHashes, chainIds, _sWindowBlock, _sv, _sr, _ss
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
            // Otherwise-valid window; the expiry check must still win.
            _prepareTxBatchRegSig(dataHash, reportedChainId, uint32(txHashes.length), forwarder, ack.startBlock);
        }
        uint256 fee = spoke.quoteTransactionBatchRegistration(reporter);

        vm.expectRevert(ISpokeRegistry.SpokeRegistry__ForwarderExpired.selector);
        vm.prank(forwarder);
        spoke.registerTransactionBatch{ value: fee }(
            reportedChainId, _sDeadline, _sNonce, reporter, txHashes, chainIds, _sWindowBlock, _sv, _sr, _ss
        );
    }

    /// @notice A zero `dataHash` at acknowledgement reverts with `__InvalidDataHash`.
    /// @dev Sibling of {test_TxBatchReg_RejectsDataMismatch}. Nothing has been acknowledged yet,
    ///      so this is a CALLER BUG and must not surface as one of the tampering errors.
    function test_TxBatchAck_RejectsZeroDataHash() public {
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke.txNonces(reporter);
        (uint8 v, bytes32 r, bytes32 s) =
            _signTxBatchAck(reporterPrivateKey, reporter, forwarder, bytes32(0), reportedChainId, 3, nonce, deadline);

        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InvalidDataHash.selector);
        vm.prank(forwarder);
        spoke.acknowledgeTransactionBatch(bytes32(0), reportedChainId, 3, deadline, nonce, reporter, v, r, s);
    }

    /// @notice Tx batch registration rejects when submitted data differs from acknowledged data
    /// @dev Expects `__DataHashMismatch` (a TAMPERING signal), not `__InvalidDataHash`, which now
    ///      means only "the caller passed a zero dataHash" — see {test_TxBatchAck_RejectsZeroDataHash}.
    function test_TxBatchReg_RejectsDataMismatch() public {
        _rejectsDataMismatchImpl();
    }

    /// @notice A pure chain-ID discrepancy reverts with `__ChainIdMismatch`, NOT `__DataHashMismatch`.
    /// @dev Discrimination test. `dataHash` covers only `(transactionHashes, chainIds)`, so
    ///      submitting the acknowledged arrays under a different `reportedChainId` satisfies the
    ///      hash commitment and isolates the chain check. These were previously fused into one
    ///      `||` condition behind a single error, so a relayer swapping the reported chain looked
    ///      identical to one swapping the whole transaction set.
    function test_TxBatchReg_ChainIdMismatchIsDistinctFromDataHashMismatch() public {
        _chainIdMismatchImpl();
    }

    function _chainIdMismatchImpl() internal {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 ackChainId = CAIP10Evm.caip2Hash(uint64(1));
        bytes32 wrongChainId = CAIP10Evm.caip2Hash(uint64(8453));
        {
            bytes32 dataHash = _computeDataHash(txHashes, chainIds);
            _doTxBatchAck(forwarder, dataHash, ackChainId, uint32(txHashes.length));
            uint256 windowBlock = _skipToTxBatchRegistrationWindow(reporter);
            // Sign for the WRONG chain so the signature is not what rejects this.
            _prepareTxBatchRegSig(dataHash, wrongChainId, uint32(txHashes.length), forwarder, windowBlock);
        }
        uint256 fee = spoke.quoteTransactionBatchRegistration(reporter);

        // Arrays are byte-identical to the acknowledged ones, so the dataHash check passes and
        // only the reportedChainId check can be responsible for this revert.
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__ChainIdMismatch.selector);
        vm.prank(forwarder);
        spoke.registerTransactionBatch{ value: fee }(
            wrongChainId, _sDeadline, _sNonce, reporter, txHashes, chainIds, _sWindowBlock, _sv, _sr, _ss
        );
    }

    /// @notice A pure count discrepancy reverts with `__BatchCountMismatch`, NOT `__DataHashMismatch`.
    /// @dev Discrimination test, and the only way to reach the count check at all. Phase 1 takes
    ///      `dataHash` and `transactionCount` as independent arguments, so an acknowledgement can
    ///      commit the hash of the real 3-item batch alongside a count of 2. Phase 2 then submits
    ///      the genuine arrays: hash and chain both match, leaving the count as the sole fault.
    function test_TxBatchReg_CountMismatchIsDistinctFromDataHashMismatch() public {
        _countMismatchImpl();
    }

    function _countMismatchImpl() internal {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        {
            bytes32 dataHash = _computeDataHash(txHashes, chainIds);
            // Acknowledge the REAL dataHash but a WRONG transactionCount (2, not 3).
            _doTxBatchAck(forwarder, dataHash, reportedChainId, 2);
            uint256 windowBlock = _skipToTxBatchRegistrationWindow(reporter);
            _prepareTxBatchRegSig(dataHash, reportedChainId, uint32(txHashes.length), forwarder, windowBlock);
        }
        uint256 fee = spoke.quoteTransactionBatchRegistration(reporter);

        vm.expectRevert(ISpokeRegistry.SpokeRegistry__BatchCountMismatch.selector);
        vm.prank(forwarder);
        spoke.registerTransactionBatch{ value: fee }(
            reportedChainId, _sDeadline, _sNonce, reporter, txHashes, chainIds, _sWindowBlock, _sv, _sr, _ss
        );
    }

    function _rejectsDataMismatchImpl() internal {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        {
            bytes32 dataHash = _computeDataHash(txHashes, chainIds);
            _doTxBatchAck(forwarder, dataHash, reportedChainId, uint32(txHashes.length));
            _txWindowBlock = _skipToTxBatchRegistrationWindow(reporter);
        }

        bytes32[] memory wrongTxHashes = new bytes32[](3);
        wrongTxHashes[0] = keccak256("wrong_tx1");
        wrongTxHashes[1] = keccak256("wrong_tx2");
        wrongTxHashes[2] = keccak256("wrong_tx3");
        {
            bytes32 wrongDataHash = _computeDataHash(wrongTxHashes, chainIds);
            _prepareTxBatchRegSig(
                wrongDataHash, reportedChainId, uint32(wrongTxHashes.length), forwarder, _txWindowBlock
            );
        }
        uint256 fee = spoke.quoteTransactionBatchRegistration(reporter);

        vm.expectRevert(ISpokeRegistry.SpokeRegistry__DataHashMismatch.selector);
        vm.prank(forwarder);
        spoke.registerTransactionBatch{ value: fee }(
            reportedChainId, _sDeadline, _sNonce, reporter, wrongTxHashes, chainIds, _sWindowBlock, _sv, _sr, _ss
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
            uint256 windowBlock = _skipToTxBatchRegistrationWindow(reporter);
            _prepareTxBatchRegSig(dataHash, reportedChainId, uint32(txHashes.length), forwarder, windowBlock);
        }

        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InsufficientFee.selector);
        vm.prank(forwarder);
        spoke.registerTransactionBatch{ value: 0 }(
            reportedChainId, _sDeadline, _sNonce, reporter, txHashes, chainIds, _sWindowBlock, _sv, _sr, _ss
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TX BATCH ANTI-PHISHING REGRESSION (audit finding V1) + SIGNATURE LIFETIME (V13)
    // ═══════════════════════════════════════════════════════════════════════════
    //
    // The spoke's transaction-batch path was the one signing path V1's original fix missed:
    // its struct hash encoded eight members under the nine-member TX_BATCH_REG_TYPEHASH, so it
    // carried no freshness commitment at all (and disagreed with the digest the frontend
    // builds). These tests are the inverted exploit — they must FAIL to register. The honest
    // flow is covered by test_TxBatchReg_Success above; keep both halves, or a change that
    // simply broke registration would still look secure.

    /// The core exploit: a phishing page collects the batch acknowledgement AND the batch
    /// registration signature seconds apart in one visit, then submits both itself once the
    /// grace period has quietly elapsed. The registration signature can only commit to a block
    /// that already exists at signing time, and every such block precedes `startBlock`.
    function test_attack_TxBatch_bothSignaturesInOneSitting_cannotRegister() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        {
            bytes32 dataHash = _computeDataHash(txHashes, chainIds);
            _doTxBatchAck(forwarder, dataHash, reportedChainId, uint32(txHashes.length));
            // Signed in the same sitting as the acknowledgement: the newest block available is
            // the one before the ack, which is necessarily earlier than the grace-period start.
            _prepareTxBatchRegSig(dataHash, reportedChainId, uint32(txHashes.length), forwarder, block.number - 1);
            // Attacker now waits out the grace period alone, victim long gone.
            _rollToWindow(spoke.getTransactionAcknowledgement(reporter).startBlock);
        }
        uint256 fee = spoke.quoteTransactionBatchRegistration(reporter);

        vm.expectRevert(TimingConfig.TimingConfig__WindowBlockBeforeGracePeriod.selector);
        vm.prank(forwarder);
        spoke.registerTransactionBatch{ value: fee }(
            reportedChainId, _sDeadline, _sNonce, reporter, txHashes, chainIds, _sWindowBlock, _sv, _sr, _ss
        );
    }

    /// The obvious escape from the test above: sign over the grace-start block anyway, before
    /// it is mined. `blockhash` of an unmined block is zero, so the attacker signs over
    /// bytes32(0) while the contract resolves the real hash — the digests cannot agree.
    function test_attack_TxBatch_cannotPreCommitToAFutureBlock() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        {
            bytes32 dataHash = _computeDataHash(txHashes, chainIds);
            _doTxBatchAck(forwarder, dataHash, reportedChainId, uint32(txHashes.length));
            uint256 graceStart = spoke.getTransactionAcknowledgement(reporter).startBlock;
            assertEq(blockhash(graceStart), bytes32(0), "grace-start block must not be mined yet");
            _prepareTxBatchRegSig(dataHash, reportedChainId, uint32(txHashes.length), forwarder, graceStart);
            _rollToWindow(graceStart);
        }
        uint256 fee = spoke.quoteTransactionBatchRegistration(reporter);

        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InvalidSigner.selector);
        vm.prank(forwarder);
        spoke.registerTransactionBatch{ value: fee }(
            reportedChainId, _sDeadline, _sNonce, reporter, txHashes, chainIds, _sWindowBlock, _sv, _sr, _ss
        );
    }

    /// V13: a hostile frontend must not be able to mint a batch acknowledgement signature that
    /// stays usable indefinitely. Bounds how long a harvested signature survives.
    function test_TxBatchAck_RejectsDeadlineBeyondMaxLifetime() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint32 txCount = uint32(txHashes.length);

        uint256 deadline = block.timestamp + TimingConfig.MAX_SIGNATURE_LIFETIME + 1;
        uint256 nonce = spoke.txNonces(reporter);
        (uint8 v, bytes32 r, bytes32 s) = _signTxBatchAck(
            reporterPrivateKey, reporter, forwarder, dataHash, reportedChainId, txCount, nonce, deadline
        );

        vm.expectRevert(ISpokeRegistry.SpokeRegistry__DeadlineTooFarInFuture.selector);
        vm.prank(forwarder);
        spoke.acknowledgeTransactionBatch(dataHash, reportedChainId, txCount, deadline, nonce, reporter, v, r, s);
    }

    /// V13, phase 2: the same bound on the registration signature.
    /// @dev The signature is produced OVER `farDeadline`, not over a different value that the call
    ///      then replaces. Otherwise the submission would be rejectable on two independent grounds
    ///      and the test would pass even with the lifetime bound removed, as long as signature
    ///      recovery still failed on the mismatch. Signing the submitted deadline makes this
    ///      otherwise fully valid, so the lifetime bound is the only thing that can reject it.
    function test_TxBatchReg_RejectsDeadlineBeyondMaxLifetime() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        {
            bytes32 dataHash = _computeDataHash(txHashes, chainIds);
            _doTxBatchAck(forwarder, dataHash, reportedChainId, uint32(txHashes.length));
            uint256 windowBlock = _skipToTxBatchRegistrationWindow(reporter);
            _prepareTxBatchRegSigWithDeadline(
                dataHash,
                reportedChainId,
                uint32(txHashes.length),
                forwarder,
                windowBlock,
                block.timestamp + TimingConfig.MAX_SIGNATURE_LIFETIME + 1
            );
        }
        uint256 fee = spoke.quoteTransactionBatchRegistration(reporter);

        vm.expectRevert(ISpokeRegistry.SpokeRegistry__DeadlineTooFarInFuture.selector);
        vm.prank(forwarder);
        spoke.registerTransactionBatch{ value: fee }(
            reportedChainId, _sDeadline, _sNonce, reporter, txHashes, chainIds, _sWindowBlock, _sv, _sr, _ss
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
    // WINDOW BLOCK AGE BOUND (TimingConfig.MAX_WINDOW_BLOCK_AGE)
    // ═══════════════════════════════════════════════════════════════════════════
    //
    // TimingConfig.resolveWindowBlockHash rejects with `block.number - windowBlock >=
    // MAX_WINDOW_BLOCK_AGE`, i.e. STRICTLY less than 256 is required, so the last valid age is
    // 255. Both sides of that edge are pinned below, on both spoke signing paths.
    //
    // MEASURED, because the source comment on that line is wrong and it changes what these tests
    // prove. It says "at exactly MAX_WINDOW_BLOCK_AGE the hash is already gone"; the EVM actually
    // serves `blockhash` for ages 1..256 inclusive, and only age 257 returns zero (verified in
    // this fixture). So the contract's bound is deliberately ONE BLOCK STRICTER than the EVM's,
    // and the defensive `hash == 0` check is NOT a backstop for this edge.
    //
    // That is exactly why the exact-256 test below is worth having: if the bound were mistakenly
    // relaxed to `>`, age 256 would clear the range check AND `blockhash` would return a real
    // non-zero hash, so the registration would SUCCEED and the test would fail. The pair is a
    // genuine off-by-one detector rather than a restatement of the zero-check.
    //
    // These need a spoke whose registration window outlives a 256-block roll; the default
    // DEADLINE_BLOCKS of 50 would trip ForwarderExpired first and the age check would never run.

    uint256 internal constant LONG_DEADLINE_BLOCKS = 2000;

    /// @dev A spoke wired exactly like the one in setUp, but with a registration window wide
    ///      enough that a 256-block roll stays inside it.
    function _longWindowSpoke() internal returns (SpokeRegistry longSpoke) {
        longSpoke = new SpokeRegistry(
            owner,
            address(bridgeAdapter),
            address(feeManager),
            HUB_CHAIN_ID,
            HUB_INBOX,
            GRACE_BLOCKS,
            LONG_DEADLINE_BLOCKS,
            1
        );
        bridgeAdapter.setAuthorizedSender(address(longSpoke), true);
    }

    /// @dev Acknowledge on `longSpoke` and return the grace start.
    ///      Extracted so phase-1 locals are off the stack before phase 2 signs (no via-ir here).
    function _ackOnSpoke(SpokeRegistry longSpoke, uint64 reportedChainId, uint64 incidentTimestamp)
        internal
        returns (uint256 graceStart)
    {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = longSpoke.nonces(wallet);
        (uint8 v, bytes32 r, bytes32 s) = _signAckForSpoke(
            longSpoke, walletPrivateKey, wallet, forwarder, reportedChainId, incidentTimestamp, nonce, deadline
        );
        vm.prank(forwarder);
        longSpoke.acknowledge(wallet, forwarder, reportedChainId, incidentTimestamp, deadline, nonce, v, r, s);
        return longSpoke.getAcknowledgement(wallet).startBlock;
    }

    /// @dev Sign and submit a wallet registration on `longSpoke` at the given windowBlock.
    ///      All external calls (nonce, fee) happen before the caller's vm.expectRevert.
    function _registerOnSpokeAtWindow(
        SpokeRegistry longSpoke,
        uint64 reportedChainId,
        uint64 incidentTimestamp,
        uint256 windowBlock,
        bool expectTooOld
    ) internal {
        _sDeadline = block.timestamp + 1 hours;
        _sNonce = longSpoke.nonces(wallet);
        (_sv, _sr, _ss) = _signRegForSpoke(
            longSpoke, forwarder, reportedChainId, incidentTimestamp, _sNonce, _sDeadline, windowBlock
        );
        uint256 fee = longSpoke.quoteRegistration(wallet);

        vm.prank(forwarder);
        if (expectTooOld) vm.expectRevert(TimingConfig.TimingConfig__WindowBlockTooOld.selector);
        longSpoke.register{ value: fee }(
            wallet, forwarder, reportedChainId, incidentTimestamp, _sDeadline, _sNonce, windowBlock, _sv, _sr, _ss
        );
    }

    /// @notice Wallet path: a windowBlock exactly MAX_WINDOW_BLOCK_AGE - 1 blocks old still works.
    /// @dev The last age at which `blockhash` still resolves. If the bound were mistakenly written
    ///      as `>` instead of `>=`, this test would still pass — which is why the companion below
    ///      is the one that matters. Kept as the paired half so a fix that simply tightened the
    ///      bound into uselessness (rejecting everything) fails here.
    function test_register_windowBlockAtMaxAgeMinusOneSucceeds() public {
        SpokeRegistry longSpoke = _longWindowSpoke();
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);
        uint256 graceStart = _ackOnSpoke(longSpoke, 1, incidentTimestamp);

        vm.roll(graceStart + TimingConfig.MAX_WINDOW_BLOCK_AGE - 1);
        // age == MAX_WINDOW_BLOCK_AGE - 1 == 255
        assertEq(block.number - graceStart, TimingConfig.MAX_WINDOW_BLOCK_AGE - 1);

        _registerOnSpokeAtWindow(longSpoke, 1, incidentTimestamp, graceStart, false);
        assertFalse(longSpoke.isPending(wallet), "registration at the oldest valid age must succeed");
    }

    /// @notice Wallet path: a windowBlock exactly MAX_WINDOW_BLOCK_AGE blocks old is rejected.
    /// @dev The assertion that pins the `>=`. The EVM still serves `blockhash` at this age (see
    ///      the section note), so with `>` the contract would clear the range check, get a real
    ///      non-zero hash, and the registration would SUCCEED — this test would fail. Directly
    ///      adjacent to the passing case above, so an off-by-one in either direction breaks
    ///      exactly one of the two.
    function test_register_windowBlockAtExactlyMaxAgeReverts() public {
        SpokeRegistry longSpoke = _longWindowSpoke();
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);
        uint256 graceStart = _ackOnSpoke(longSpoke, 1, incidentTimestamp);

        vm.roll(graceStart + TimingConfig.MAX_WINDOW_BLOCK_AGE);
        assertEq(block.number - graceStart, TimingConfig.MAX_WINDOW_BLOCK_AGE);

        _registerOnSpokeAtWindow(longSpoke, 1, incidentTimestamp, graceStart, true);
        assertTrue(longSpoke.isPending(wallet), "a rejected registration must leave the ack intact");
    }

    /// @notice Tx-batch path: a windowBlock at or beyond the current block is rejected.
    /// @dev The spoke's transaction-batch path is the one V1's first pass missed entirely, so each
    ///      window-block branch needs pinning here separately from the wallet path — they are
    ///      distinct call sites into resolveWindowBlockHash.
    function test_registerTransactionBatch_revertsIfWindowBlockNotMined() public {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        {
            bytes32 dataHash = _computeDataHash(txHashes, chainIds);
            _doTxBatchAck(forwarder, dataHash, reportedChainId, uint32(txHashes.length));
            _skipToTxBatchRegistrationWindow(reporter);
            // The current block is not yet mined from the EVM's point of view.
            _prepareTxBatchRegSig(dataHash, reportedChainId, uint32(txHashes.length), forwarder, block.number);
        }
        uint256 fee = spoke.quoteTransactionBatchRegistration(reporter);

        vm.expectRevert(TimingConfig.TimingConfig__WindowBlockNotMined.selector);
        vm.prank(forwarder);
        spoke.registerTransactionBatch{ value: fee }(
            reportedChainId, _sDeadline, _sNonce, reporter, txHashes, chainIds, _sWindowBlock, _sv, _sr, _ss
        );
    }

    /// @notice Tx-batch path: a windowBlock older than MAX_WINDOW_BLOCK_AGE is rejected.
    /// @dev Same bound as the wallet path, asserted at the tx-batch call site. Uses the
    ///      long-window spoke so the age check, not ForwarderExpired, is what fires.
    function test_registerTransactionBatch_revertsIfWindowBlockTooOld() public {
        SpokeRegistry longSpoke = _longWindowSpoke();
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint256 graceStart = _ackTxBatchOnSpoke(longSpoke, txHashes, chainIds, reportedChainId);

        vm.roll(graceStart + TimingConfig.MAX_WINDOW_BLOCK_AGE);

        _prepareTxBatchRegSigForSpoke(longSpoke, txHashes, chainIds, reportedChainId, graceStart);
        uint256 fee = longSpoke.quoteTransactionBatchRegistration(reporter);

        vm.expectRevert(TimingConfig.TimingConfig__WindowBlockTooOld.selector);
        vm.prank(forwarder);
        longSpoke.registerTransactionBatch{ value: fee }(
            reportedChainId, _sDeadline, _sNonce, reporter, txHashes, chainIds, _sWindowBlock, _sv, _sr, _ss
        );
    }

    /// @notice Tx-batch path: one block younger than that bound still works.
    /// @dev The paired passing half of the test above — adjacent ages, so an off-by-one in the
    ///      `>=` breaks exactly one of the two.
    function test_registerTransactionBatch_windowBlockAtMaxAgeMinusOneSucceeds() public {
        SpokeRegistry longSpoke = _longWindowSpoke();
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));
        uint256 graceStart = _ackTxBatchOnSpoke(longSpoke, txHashes, chainIds, reportedChainId);

        vm.roll(graceStart + TimingConfig.MAX_WINDOW_BLOCK_AGE - 1);

        _prepareTxBatchRegSigForSpoke(longSpoke, txHashes, chainIds, reportedChainId, graceStart);
        uint256 fee = longSpoke.quoteTransactionBatchRegistration(reporter);

        vm.prank(forwarder);
        longSpoke.registerTransactionBatch{ value: fee }(
            reportedChainId, _sDeadline, _sNonce, reporter, txHashes, chainIds, _sWindowBlock, _sv, _sr, _ss
        );

        assertFalse(longSpoke.isPendingTransactionBatch(reporter), "registration at the oldest valid age must succeed");
    }

    /// @dev Tx-batch acknowledgement against an arbitrary spoke; returns its grace start.
    ///      Signature components go through the _s* storage slots and the digest is built in a
    ///      separate frame ({_txBatchAckDigestFor}) — inlining either overflows the 16-slot stack,
    ///      and this project builds without via-ir.
    function _ackTxBatchOnSpoke(
        SpokeRegistry longSpoke,
        bytes32[] memory txHashes,
        bytes32[] memory chainIds,
        bytes32 reportedChainId
    ) internal returns (uint256 graceStart) {
        bytes32 dataHash = _computeDataHash(txHashes, chainIds);
        uint32 txCount = uint32(txHashes.length);
        _sDeadline = block.timestamp + 1 hours;
        _sNonce = longSpoke.txNonces(reporter);
        (_sv, _sr, _ss) = vm.sign(
            reporterPrivateKey,
            _txBatchAckDigestFor(address(longSpoke), dataHash, reportedChainId, txCount, _sNonce, _sDeadline)
        );
        vm.prank(forwarder);
        longSpoke.acknowledgeTransactionBatch(
            dataHash, reportedChainId, txCount, _sDeadline, _sNonce, reporter, _sv, _sr, _ss
        );
        return longSpoke.getTransactionAcknowledgement(reporter).startBlock;
    }

    /// @dev Tx-batch acknowledgement digest for an arbitrary spoke instance.
    function _txBatchAckDigestFor(
        address spokeAddr,
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint32 txCount,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                TX_BATCH_ACK_TYPEHASH,
                keccak256(bytes(TX_ACK_STATEMENT)),
                reporter,
                forwarder,
                dataHash,
                reportedChainId,
                txCount,
                nonce,
                deadline
            )
        );
        return keccak256(
            abi.encodePacked("\x19\x01", _domainSeparatorFor("StolenWalletRegistry", "4", spokeAddr), structHash)
        );
    }

    /// @dev Tx-batch registration signature against an arbitrary spoke, into the _s* storage
    ///      slots. Reads the nonce via an external call, so call BEFORE vm.expectRevert.
    function _prepareTxBatchRegSigForSpoke(
        SpokeRegistry longSpoke,
        bytes32[] memory txHashes,
        bytes32[] memory chainIds,
        bytes32 reportedChainId,
        uint256 windowBlock
    ) internal {
        _sDeadline = block.timestamp + 1 hours;
        _sNonce = longSpoke.txNonces(reporter);
        _sWindowBlock = windowBlock;
        (_sv, _sr, _ss) = vm.sign(
            reporterPrivateKey,
            _txBatchRegDigestFor(
                address(longSpoke),
                _computeDataHash(txHashes, chainIds),
                reportedChainId,
                uint32(txHashes.length),
                windowBlock
            )
        );
    }

    /// @dev Tx-batch registration digest for an arbitrary spoke instance. Reads nonce/deadline
    ///      from the _s* slots the caller just populated, to stay inside the stack limit.
    function _txBatchRegDigestFor(
        address spokeAddr,
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint32 txCount,
        uint256 windowBlock
    ) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                TX_BATCH_REG_TYPEHASH,
                keccak256(bytes(TX_REG_STATEMENT)),
                reporter,
                forwarder,
                dataHash,
                reportedChainId,
                txCount,
                _sNonce,
                _sDeadline,
                blockhash(windowBlock)
            )
        );
        return keccak256(
            abi.encodePacked("\x19\x01", _domainSeparatorFor("StolenWalletRegistry", "4", spokeAddr), structHash)
        );
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
        assertTrue(hubDigest != spokeDigest, "cross-chain replay must remain impossible");

        // The external ABI (argument order, including windowBlock's position) must also match.
        assertEq(ISpokeRegistry.register.selector, IWalletRegistry.register.selector, "register ABI drift");

        // Everything above is computed off-chain from reported fields, so on its own it would
        // still hold if a contract's REAL separator differed from the one its eip712Domain()
        // fields describe. Neither registry exposes a public DOMAIN_SEPARATOR to read, so the
        // separator is pinned behaviourally instead — see below.
        _assertSpokeRejectsHubDomainSignature(_domainSeparatorFor(hubName, hubVersion, address(hub)));
    }

    /// @dev Empirical half of {test_HubAndSpokeRegistrationDigestsAreUnified}. Drives a real spoke
    ///      registration whose signature is built over the HUB's domain separator and asserts the
    ///      spoke rejects it.
    ///
    ///      This is what makes the digest comparison above non-circular. The positive direction is
    ///      already covered by test_Register_Success, which succeeds with a signature built from
    ///      `_domainSeparatorFor(spokeName, spokeVersion, spoke)` — so the spoke's real separator
    ///      provably equals the locally computed one. This adds the negative direction: a
    ///      signature that differs ONLY in `verifyingContract` must not verify, which is precisely
    ///      the property that stops a spoke signature being replayed on the hub. Together they pin
    ///      the separator to the contract's actual behaviour rather than to a recomputation of the
    ///      same formula on both sides of an assertEq.
    function _assertSpokeRejectsHubDomainSignature(bytes32 hubSeparator) internal {
        uint64 reportedChainId = 1;
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        _doAck(forwarder, reportedChainId, incidentTimestamp);
        uint256 windowBlock = _skipToRegistrationWindow();

        // External calls (nonce, fee quote) all happen before vm.expectRevert.
        _sDeadline = block.timestamp + 1 hours;
        _sNonce = spoke.nonces(wallet);
        (_sv, _sr, _ss) = vm.sign(
            walletPrivateKey,
            keccak256(
                abi.encodePacked(
                    "\x19\x01",
                    hubSeparator,
                    _regStructHash(
                        wallet, forwarder, reportedChainId, incidentTimestamp, _sNonce, _sDeadline, windowBlock
                    )
                )
            )
        );
        uint256 fee = spoke.quoteRegistration(wallet);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InvalidSigner.selector);
        spoke.register{ value: fee }(
            wallet, forwarder, reportedChainId, incidentTimestamp, _sDeadline, _sNonce, windowBlock, _sv, _sr, _ss
        );
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

    // ═══════════════════════════════════════════════════════════════════════════
    // END-TO-END: REAL SPOKE DISPATCH → REAL HUB INBOX (T-4)
    //
    // Every CrossChainInbox test hand-constructs a payload and calls simulateReceive, so the
    // spoke's ENCODER and the inbox's DECODER were only ever tested against themselves. A field
    // reordered in one and not the other, or a wrong sourceChainId, leaves both suites green and
    // breaks every cross-chain registration on testnet. These two tests close the loop: a real
    // two-phase flow on a real spoke, the bytes it actually dispatched read back out of the spoke
    // mailbox, and those exact bytes delivered to a real hub inbox.
    // ═══════════════════════════════════════════════════════════════════════════

    MockMailbox internal hubMailbox;
    CrossChainInbox internal hubInboxContract;
    WalletRegistry internal hubWalletRegistry;
    TransactionRegistry internal hubTxRegistry;

    /// @dev Stand up the hub side and trust THIS spoke's bridge adapter as the cross-chain sender.
    ///      Hyperlane records the dispatching contract as the sender, which is the adapter, not
    ///      the SpokeRegistry — trusting the wrong one here would make these tests pass against a
    ///      configuration that cannot work in production.
    function _deployHubSide() internal {
        hubMailbox = new MockMailbox(HUB_CHAIN_ID);
        hubWalletRegistry = new WalletRegistry(owner, address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);
        hubTxRegistry = new TransactionRegistry(owner, address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);

        FraudRegistryHub hub = new FraudRegistryHub(owner, makeAddr("hubFeeRecipient"));
        hub.setWalletRegistry(address(hubWalletRegistry));
        hub.setTransactionRegistry(address(hubTxRegistry));
        hub.setContractRegistry(address(new ContractRegistry(owner)));
        hubWalletRegistry.setHub(address(hub));
        hubTxRegistry.setHub(address(hub));

        hubInboxContract = new CrossChainInbox(address(hubMailbox), address(hub), owner);
        hub.setInbox(address(hubInboxContract));
        hubInboxContract.setTrustedSource(SPOKE_CHAIN_ID, _adapterAsSender(), true);
    }

    function _adapterAsSender() internal view returns (bytes32) {
        return bytes32(uint256(uint160(address(bridgeAdapter))));
    }

    /// @dev Deliver whatever the spoke last dispatched to the hub inbox, over the real route.
    function _deliverLastSpokeMessageToHub() internal {
        hubMailbox.simulateReceive(address(hubInboxContract), SPOKE_CHAIN_ID, _adapterAsSender(), mailbox.lastMessage());
    }

    /// @notice A real spoke wallet registration decodes and registers on a real hub.
    /// @dev SECURITY-ADJACENT. This is the only test that runs the production encoder's output
    ///      through the production decoder. It would fail on field-order drift between
    ///      CrossChainMessage's encode/decode halves, on a wrong `sourceChainId` (the inbox
    ///      rejects it against the Hyperlane origin domain), and on a namespace/key mismatch that
    ///      would file the wallet under an identifier nothing can look up.
    function test_E2E_WalletRegistrationReachesHub() public {
        _deployHubSide();

        uint64 reportedChainId = 1;
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        _doAck(forwarder, reportedChainId, incidentTimestamp);
        uint256 windowBlock = _skipToRegistrationWindow();
        _prepareWalletRegSig(forwarder, reportedChainId, incidentTimestamp, windowBlock);

        uint256 fee = spoke.quoteRegistration(wallet);
        vm.prank(forwarder);
        spoke.register{ value: fee }(
            wallet, forwarder, reportedChainId, incidentTimestamp, _sDeadline, _sNonce, windowBlock, _sv, _sr, _ss
        );

        assertFalse(hubWalletRegistry.isWalletRegistered(wallet), "Precondition: hub must not know the wallet yet");

        _deliverLastSpokeMessageToHub();

        assertTrue(hubWalletRegistry.isWalletRegistered(wallet), "Hub must register the wallet the spoke dispatched");

        IWalletRegistry.WalletEntry memory entry = hubWalletRegistry.getWalletEntry(wallet);
        assertEq(entry.incidentTimestamp, incidentTimestamp, "incidentTimestamp must survive the round trip");
        assertEq(entry.bridgeId, 1, "bridgeId must be recorded as Hyperlane");
        assertTrue(entry.isSponsored, "Sponsorship must survive the round trip");
    }

    /// @notice A real spoke transaction batch decodes and registers on a real hub.
    /// @dev The batch message carries two dynamic arrays, so it is the encoding most exposed to
    ///      offset drift — and the one whose failure mode (a batch that decodes to the wrong
    ///      hashes) is silent rather than a revert. Asserting each submitted hash is registered
    ///      under its chain ID is what makes that visible.
    function test_E2E_TransactionBatchReachesHub() public {
        _deployHubSide();

        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _createSampleBatch();
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(1));

        _doTxBatchAck(forwarder, _computeDataHash(txHashes, chainIds), reportedChainId, uint32(txHashes.length));
        uint256 windowBlock = _skipToTxBatchRegistrationWindow(reporter);
        uint256 fee = spoke.quoteTransactionBatchRegistration(reporter);
        _doTxBatchReg(forwarder, reportedChainId, txHashes, chainIds, fee, windowBlock);

        _deliverLastSpokeMessageToHub();

        for (uint256 i = 0; i < txHashes.length; i++) {
            assertTrue(
                hubTxRegistry.isTransactionRegistered(txHashes[i], chainIds[i]),
                "Every dispatched transaction must be registered on the hub"
            );
        }
        assertEq(hubTxRegistry.transactionBatchCount(), 1, "Exactly one batch must be minted on the hub");
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

    /// @notice A malleated acknowledgement signature is rejected on the spoke.
    /// @dev SECURITY. The spoke recovers via OpenZeppelin's ECDSA, which rejects s > n/2. Nothing
    ///      pinned that, so a hand-rolled `ecrecover` introduced during a gas optimisation would
    ///      silently accept the malleated twin of every signature this contract consumes.
    function test_Acknowledge_RejectsMalleatedSignature() public {
        uint64 reportedChainId = 1;
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signAck(walletPrivateKey, wallet, forwarder, reportedChainId, incidentTimestamp, nonce, deadline);
        (uint8 flippedV, bytes32 flippedS) = _malleate(v, s);

        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(ECDSA.ECDSAInvalidSignatureS.selector, flippedS));
        spoke.acknowledge(wallet, forwarder, reportedChainId, incidentTimestamp, deadline, nonce, flippedV, r, flippedS);

        assertFalse(spoke.isPending(wallet), "A malleated signature must not open a window");
    }

    /// @notice A malleated registration signature is rejected on the spoke.
    function test_Register_RejectsMalleatedSignature() public {
        uint64 reportedChainId = 1;
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        _doAck(forwarder, reportedChainId, incidentTimestamp);
        uint256 windowBlock = _skipToRegistrationWindow();
        _prepareWalletRegSig(forwarder, reportedChainId, incidentTimestamp, windowBlock);

        (uint8 flippedV, bytes32 flippedS) = _malleate(_sv, _ss);
        uint256 fee = spoke.quoteRegistration(wallet);

        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(ECDSA.ECDSAInvalidSignatureS.selector, flippedS));
        spoke.register{ value: fee }(
            wallet,
            forwarder,
            reportedChainId,
            incidentTimestamp,
            _sDeadline,
            _sNonce,
            windowBlock,
            flippedV,
            _sr,
            flippedS
        );

        assertTrue(spoke.isPending(wallet), "A rejected registration must leave the acknowledgement intact");
    }

    /// @notice A captured acknowledgement signature cannot be replayed once its window lapses.
    /// @dev SECURITY. Drives the real replay: capture a genuine acknowledgement, wait for the
    ///      registration window to expire, then re-submit the identical bytes. The
    ///      `AlreadyAcknowledged` guard has lapsed by then, so the nonce is the only defense left.
    ///      vm.roll moves block.number only, so the EIP-712 deadline (a timestamp) is still valid.
    function test_Acknowledge_CapturedSignatureCannotBeReplayed() public {
        uint64 reportedChainId = 1;
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signAck(walletPrivateKey, wallet, forwarder, reportedChainId, incidentTimestamp, nonce, deadline);

        vm.prank(forwarder);
        spoke.acknowledge(wallet, forwarder, reportedChainId, incidentTimestamp, deadline, nonce, v, r, s);

        vm.roll(spoke.getAcknowledgement(wallet).expiryBlock + 1);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InvalidNonce.selector);
        spoke.acknowledge(wallet, forwarder, reportedChainId, incidentTimestamp, deadline, nonce, v, r, s);
    }

    /// @notice A registration signature cannot be replayed after it has succeeded.
    /// @dev The acknowledgement is deleted on success and the nonce has moved; on the spoke the
    ///      nonce check fires first (the hub's `register` orders these the other way round, which
    ///      is why both suites pin the reason rather than accepting any revert). Asserting that no
    ///      second message is dispatched is the property that matters —
    ///      a replay that got through would register the same wallet on the hub twice and bill the
    ///      relayer a second bridge fee.
    function test_Register_CannotBeReplayedAfterSuccess() public {
        uint64 reportedChainId = 1;
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        _doAck(forwarder, reportedChainId, incidentTimestamp);
        uint256 windowBlock = _skipToRegistrationWindow();
        _prepareWalletRegSig(forwarder, reportedChainId, incidentTimestamp, windowBlock);

        uint256 fee = spoke.quoteRegistration(wallet);
        vm.prank(forwarder);
        spoke.register{ value: fee }(
            wallet, forwarder, reportedChainId, incidentTimestamp, _sDeadline, _sNonce, windowBlock, _sv, _sr, _ss
        );
        uint32 messagesAfterFirst = mailbox.messageCount();

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InvalidNonce.selector);
        spoke.register{ value: fee }(
            wallet, forwarder, reportedChainId, incidentTimestamp, _sDeadline, _sNonce, windowBlock, _sv, _sr, _ss
        );

        assertEq(mailbox.messageCount(), messagesAfterFirst, "A replay must not dispatch a second message");
    }
}
