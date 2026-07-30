// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { TimelockOwnable } from "../libraries/TimelockOwnable.sol";
import { ISpokeRegistry } from "../interfaces/ISpokeRegistry.sol";
import { IBridgeAdapter } from "../interfaces/IBridgeAdapter.sol";
import { IFeeManager } from "../interfaces/IFeeManager.sol";
import { TimingConfig } from "../libraries/TimingConfig.sol";
import { CAIP10 } from "../libraries/CAIP10.sol";
import { CAIP10Evm } from "../libraries/CAIP10Evm.sol";
import { CrossChainMessage } from "../libraries/CrossChainMessage.sol";
import { EIP712Constants } from "../libraries/EIP712Constants.sol";
import { BatchLimits } from "../libraries/BatchLimits.sol";

/// @title SpokeRegistry
/// @author Stolen Wallet Registry Team
/// @notice Spoke chain registration contract for cross-chain stolen wallet registry
/// @dev Includes incidentTimestamp and reportedChainId in user signatures.
///      Sends messages to FraudRegistryHub on hub chain via bridge adapter.
///
///      Owner powers are timelocked (TimelockOwnable): `hubInbox` is where every registration
///      this contract accepts ultimately lands, so repointing it in one transaction would
///      silently divert users' paid registrations. Post-setup it requires propose → 2 days →
///      activate, matching the hub-side registries.
contract SpokeRegistry is ISpokeRegistry, EIP712, TimelockOwnable {
    using CrossChainMessage for CrossChainMessage.WalletRegistrationPayload;
    using CrossChainMessage for CrossChainMessage.TransactionBatchPayload;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Largest transaction batch that may be acknowledged for cross-chain registration
    /// @dev Bounded by what the hub can execute in a single destination transaction. At ~26,200 gas
    ///      per entry a 25M-gas block tops out near 950 entries; 800 leaves headroom for the fixed
    ///      cost of message delivery and ISM verification. Without a bound here the two-phase and
    ///      cross-chain paths accept a batch that is quotable but not executable on arrival — the
    ///      spoke consumes the nonce and the fee, and the registration strands.
    uint32 public constant MAX_CROSS_CHAIN_BATCH_SIZE = uint32(BatchLimits.MAX_CROSS_CHAIN_BATCH_SIZE);

    // ═══════════════════════════════════════════════════════════════════════════
    // IMMUTABLES
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice This spoke chain's source chain ID as CAIP-2 hash
    bytes32 public immutable sourceChainId;

    /// @notice Bridge adapter for cross-chain messaging
    address public immutable bridgeAdapter;

    /// @notice Fee manager for registration fees (address(0) = free)
    address public immutable feeManager;

    /// @notice Base blocks for grace period
    uint256 public immutable graceBlocks;

    /// @notice Base blocks for registration deadline
    uint256 public immutable deadlineBlocks;

    /// @notice Bridge ID for message tagging (1 = Hyperlane, etc.)
    uint8 public immutable bridgeId;

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Hub chain domain ID (Hyperlane domain)
    uint32 public hubChainId;

    /// @notice Hub inbox address (bytes32 for cross-chain addressing)
    bytes32 public hubInbox;

    /// @notice Pending wallet acknowledgements
    mapping(address => AcknowledgementData) private _pendingAcknowledgements;

    /// @notice Pending transaction batch acknowledgements
    mapping(address => TransactionAcknowledgementData) private _pendingTxAcknowledgements;

    /// @notice Nonces for replay protection
    mapping(address => uint256) public nonces;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Initializes the spoke registry
    /// @param _owner Contract owner
    /// @param _bridgeAdapter Bridge adapter address
    /// @param _feeManager Fee manager address (address(0) for free registrations)
    /// @param _hubChainId Hub chain Hyperlane domain ID
    /// @param _hubInbox Hub inbox address
    /// @param _graceBlocks Base blocks for grace period
    /// @param _deadlineBlocks Base blocks for deadline window
    /// @param _bridgeId Bridge identifier (1 = Hyperlane, etc.)
    constructor(
        address _owner,
        address _bridgeAdapter,
        address _feeManager,
        uint32 _hubChainId,
        bytes32 _hubInbox,
        uint256 _graceBlocks,
        uint256 _deadlineBlocks,
        uint8 _bridgeId
    ) EIP712("StolenWalletRegistry", "4") Ownable(_owner) {
        if (_bridgeAdapter == address(0)) revert SpokeRegistry__ZeroAddress();

        // Validate timing: deadline must be >= 2*grace to ensure window always exists
        if (_graceBlocks == 0 || _deadlineBlocks == 0 || _deadlineBlocks < 2 * _graceBlocks) {
            revert SpokeRegistry__InvalidTimingConfig();
        }

        // Validate hub config: must be both set or both zero
        bool hubChainIdSet = _hubChainId != 0;
        bool hubInboxSet = _hubInbox != bytes32(0);
        if (hubChainIdSet != hubInboxSet) {
            revert SpokeRegistry__InvalidHubConfig();
        }

        // Compute source chain ID as CAIP-2 hash
        // Note: block.chainid cast to uint64 is safe - all known chains fit in uint64
        sourceChainId = CAIP10Evm.caip2Hash(uint64(block.chainid));

        bridgeAdapter = _bridgeAdapter;
        feeManager = _feeManager;
        hubChainId = _hubChainId;
        hubInbox = _hubInbox;
        graceBlocks = _graceBlocks;
        deadlineBlocks = _deadlineBlocks;
        bridgeId = _bridgeId;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc ISpokeRegistry
    function acknowledge(
        address wallet,
        address trustedForwarder,
        uint64 reportedChainId,
        uint64 incidentTimestamp,
        uint256 deadline,
        uint256 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        // Fail fast: reject zero address
        if (wallet == address(0)) revert SpokeRegistry__InvalidOwner();
        if (trustedForwarder == address(0)) revert SpokeRegistry__ZeroAddress();

        // Validate signature deadline hasn't passed
        if (deadline <= block.timestamp) revert SpokeRegistry__SignatureExpired();

        // 0 means "unknown" and is allowed; a future incident is not physically possible.
        // Mirrors the hub's check so the two phases cannot disagree about validity.
        if (incidentTimestamp > block.timestamp) revert SpokeRegistry__InvalidIncidentTimestamp();

        // Reject re-acknowledgement while a prior one is still live, matching
        // WalletRegistry.acknowledge on the hub. Overwriting would restart the grace period and
        // strand the registration signature the user produced against the first acknowledgement.
        // (There is deliberately no already-registered check: registrations live on the hub, so
        // the spoke has no local registry state to consult.)
        AcknowledgementData memory existing = _pendingAcknowledgements[wallet];
        if (existing.trustedForwarder != address(0) && block.number < existing.expiryBlock) {
            revert SpokeRegistry__AlreadyAcknowledged();
        }

        // Validate nonce matches expected value
        if (nonce != nonces[wallet]) revert SpokeRegistry__InvalidNonce();

        // Compute isSponsored early to reduce stack pressure at emit
        bool isSponsored = wallet != trustedForwarder;

        // Verify EIP-712 signature (scoped to free stack slots)
        {
            bytes32 digest = _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        EIP712Constants.WALLET_ACK_TYPEHASH,
                        EIP712Constants.ACK_STATEMENT_HASH,
                        wallet,
                        trustedForwarder,
                        reportedChainId,
                        incidentTimestamp,
                        nonce,
                        deadline
                    )
                )
            );
            address signer = ECDSA.recover(digest, v, r, s);
            if (signer == address(0) || signer != wallet) revert SpokeRegistry__InvalidSigner();
        }

        // Increment nonce AFTER validation
        nonces[wallet]++;

        // Convert uint64 reportedChainId to bytes32 CAIP-2 hash for cross-chain payload
        bytes32 reportedChainIdHash = CAIP10Evm.caip2Hash(reportedChainId);

        // Store acknowledgement with randomized grace period
        _pendingAcknowledgements[wallet] = AcknowledgementData({
            trustedForwarder: trustedForwarder,
            incidentTimestamp: incidentTimestamp,
            reportedChainId: reportedChainIdHash,
            startBlock: TimingConfig.getGracePeriodEndBlock(graceBlocks),
            expiryBlock: TimingConfig.getDeadlineBlock(deadlineBlocks)
        });

        emit WalletAcknowledged(wallet, trustedForwarder, reportedChainIdHash, incidentTimestamp, isSponsored);
    }

    /// @inheritdoc ISpokeRegistry
    function register(
        address wallet,
        address trustedForwarder,
        uint64 reportedChainId,
        uint64 incidentTimestamp,
        uint256 deadline,
        uint256 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable {
        // Validate inputs and signature, get data needed for payload
        (bytes32 digest, bytes32 reportedChainIdHash) = _validateWalletRegistration(
            wallet, trustedForwarder, reportedChainId, incidentTimestamp, deadline, nonce, v, r, s
        );

        // Determine sponsorship
        bool isSponsored = wallet != trustedForwarder;

        // Build and send cross-chain message
        _executeWalletRegistration(wallet, reportedChainIdHash, incidentTimestamp, nonce, isSponsored, digest);
    }

    /// @dev Validate wallet registration inputs and signature (reduces stack pressure in main function)
    function _validateWalletRegistration(
        address wallet,
        address trustedForwarder,
        uint64 reportedChainId,
        uint64 incidentTimestamp,
        uint256 deadline,
        uint256 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal view returns (bytes32 digest, bytes32 reportedChainIdHash) {
        // Fail fast: reject zero address and trusted forwarder mismatch
        if (wallet == address(0)) revert SpokeRegistry__InvalidOwner();
        if (trustedForwarder != msg.sender) revert SpokeRegistry__InvalidForwarder();

        // Validate hub is configured
        if (hubInbox == bytes32(0)) revert SpokeRegistry__HubNotConfigured();

        // Validate signature deadline hasn't passed
        if (deadline <= block.timestamp) revert SpokeRegistry__SignatureExpired();

        // Validate nonce matches expected value
        if (nonce != nonces[wallet]) revert SpokeRegistry__InvalidNonce();

        // Compute digest and verify signature (uses trustedForwarder param)
        digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    EIP712Constants.WALLET_REG_TYPEHASH,
                    EIP712Constants.REG_STATEMENT_HASH,
                    wallet,
                    trustedForwarder,
                    reportedChainId,
                    incidentTimestamp,
                    nonce,
                    deadline
                )
            )
        );
        address signer = ECDSA.recover(digest, v, r, s);
        if (signer == address(0) || signer != wallet) revert SpokeRegistry__InvalidSigner();

        // Load and validate acknowledgement (msg.sender must be the authorized forwarder)
        AcknowledgementData memory ack = _pendingAcknowledgements[wallet];
        if (ack.trustedForwarder != msg.sender) revert SpokeRegistry__InvalidForwarder();
        if (block.number < ack.startBlock) revert SpokeRegistry__GracePeriodNotStarted();
        if (block.number >= ack.expiryBlock) revert SpokeRegistry__ForwarderExpired();

        // Convert uint64 to bytes32 hash for comparison and return
        reportedChainIdHash = CAIP10Evm.caip2Hash(reportedChainId);
        if (ack.reportedChainId != reportedChainIdHash || ack.incidentTimestamp != incidentTimestamp) {
            revert SpokeRegistry__DataMismatch();
        }
    }

    /// @dev Execute wallet registration state changes and cross-chain message (CEI pattern)
    function _executeWalletRegistration(
        address wallet,
        bytes32 reportedChainIdHash,
        uint64 incidentTimestamp,
        uint256 nonce,
        bool isSponsored,
        bytes32 registrationHash
    ) internal {
        // Build cross-chain payload (format for FraudRegistryHub)
        CrossChainMessage.WalletRegistrationPayload memory payload = CrossChainMessage.WalletRegistrationPayload({
            namespaceHash: CAIP10.NAMESPACE_EIP155,
            chainRef: CAIP10Evm.evmChainRefHash(uint64(block.chainid)),
            identifier: bytes32(uint256(uint160(wallet))),
            reportedChainId: reportedChainIdHash,
            incidentTimestamp: incidentTimestamp,
            sourceChainId: sourceChainId,
            isSponsored: isSponsored,
            nonce: nonce,
            timestamp: uint64(block.timestamp),
            registrationHash: registrationHash
        });

        bytes memory encodedPayload = payload.encodeWalletRegistration();

        // Quote fees
        uint256 bridgeFee = IBridgeAdapter(bridgeAdapter).quoteMessage(hubChainId, encodedPayload);
        uint256 registrationFee = feeManager != address(0) ? IFeeManager(feeManager).currentFeeWei() : 0;
        uint256 totalRequired = bridgeFee + registrationFee;

        if (msg.value < totalRequired) revert SpokeRegistry__InsufficientFee();

        // EFFECTS: State changes before external calls (CEI pattern)
        nonces[wallet]++;
        delete _pendingAcknowledgements[wallet];

        // INTERACTIONS: External calls
        bytes32 messageId =
            IBridgeAdapter(bridgeAdapter).sendMessage{ value: bridgeFee }(hubChainId, hubInbox, encodedPayload);

        emit RegistrationSentToHub(wallet, messageId, hubChainId);

        // Refund excess (registration fee stays on spoke for treasury sweep)
        uint256 excess = msg.value - totalRequired;
        if (excess > 0) {
            (bool success,) = msg.sender.call{ value: excess }("");
            if (!success) revert SpokeRegistry__RefundFailed();
        }
    }

    /// @inheritdoc ISpokeRegistry
    /// @dev Transaction batches use msg.sender as the implicit trusted forwarder rather than accepting an
    ///      explicit trustedForwarder parameter. Third-party submission IS supported: if msg.sender != reporter,
    ///      the tx is marked as sponsored and msg.sender is stored as trustedForwarder. The reporter
    ///      signs an EIP-712 message that includes msg.sender, so the relayer must be known at sign time.
    function acknowledgeTransactionBatch(
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint32 transactionCount,
        uint256 deadline,
        uint256 nonce,
        address reporter,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        // Fail fast: reject zero address
        if (reporter == address(0)) revert SpokeRegistry__InvalidOwner();

        // Validate dataHash is not zero
        if (dataHash == bytes32(0)) revert SpokeRegistry__InvalidDataHash();

        // Validate batch size
        if (transactionCount == 0) revert SpokeRegistry__EmptyBatch();
        if (transactionCount > MAX_CROSS_CHAIN_BATCH_SIZE) revert SpokeRegistry__BatchTooLarge();

        // Validate signature deadline hasn't passed
        if (deadline <= block.timestamp) revert SpokeRegistry__SignatureExpired();

        // Reject re-acknowledgement while a prior one is still live, matching
        // TransactionRegistry.acknowledgeTransactions on the hub (and the wallet path above).
        // Overwriting would restart the grace period and strand the registration signature the
        // reporter produced against the first acknowledgement.
        {
            TransactionAcknowledgementData memory existing = _pendingTxAcknowledgements[reporter];
            if (existing.trustedForwarder != address(0) && block.number < existing.expiryBlock) {
                revert SpokeRegistry__AlreadyAcknowledged();
            }
        }

        // Validate nonce matches expected value
        if (nonce != nonces[reporter]) revert SpokeRegistry__InvalidNonce();

        // Verify EIP-712 signature
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    EIP712Constants.TX_BATCH_ACK_TYPEHASH,
                    EIP712Constants.TX_ACK_STATEMENT_HASH,
                    reporter,
                    msg.sender,
                    dataHash,
                    reportedChainId,
                    transactionCount,
                    nonce,
                    deadline
                )
            )
        );
        address signer = ECDSA.recover(digest, v, r, s);
        if (signer == address(0) || signer != reporter) revert SpokeRegistry__InvalidSigner();

        // Increment nonce AFTER validation
        nonces[reporter]++;

        // Store acknowledgement with randomized grace period
        _pendingTxAcknowledgements[reporter] = TransactionAcknowledgementData({
            trustedForwarder: msg.sender,
            dataHash: dataHash,
            reportedChainId: reportedChainId,
            transactionCount: transactionCount,
            startBlock: TimingConfig.getGracePeriodEndBlock(graceBlocks),
            expiryBlock: TimingConfig.getDeadlineBlock(deadlineBlocks)
        });

        emit TransactionBatchAcknowledged(
            reporter, msg.sender, dataHash, reportedChainId, transactionCount, reporter != msg.sender
        );
    }

    /// @inheritdoc ISpokeRegistry
    function registerTransactionBatch(
        bytes32 reportedChainId,
        uint256 deadline,
        uint256 nonce,
        address reporter,
        bytes32[] calldata transactionHashes,
        bytes32[] calldata chainIds,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable {
        // Compute dataHash from submitted arrays - this is the key verification
        bytes32 dataHash = keccak256(abi.encode(transactionHashes, chainIds));

        // Validate inputs and acknowledgement (reverts on failure)
        _validateTxBatchRegistration(dataHash, reportedChainId, deadline, nonce, reporter, transactionHashes, chainIds);

        // Verify EIP-712 signature
        _verifyTxBatchSignature(dataHash, reportedChainId, deadline, nonce, reporter, transactionHashes.length, v, r, s);

        // Execute registration (state changes + cross-chain message)
        _executeTxBatchRegistration(dataHash, reportedChainId, nonce, reporter, transactionHashes, chainIds);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc ISpokeRegistry
    function isPending(address wallet) external view returns (bool) {
        AcknowledgementData memory ack = _pendingAcknowledgements[wallet];
        return ack.trustedForwarder != address(0) && block.number < ack.expiryBlock;
    }

    /// @inheritdoc ISpokeRegistry
    function getAcknowledgement(address wallet) external view returns (AcknowledgementData memory) {
        return _pendingAcknowledgements[wallet];
    }

    /// @inheritdoc ISpokeRegistry
    function isPendingTransactionBatch(address reporter) external view returns (bool) {
        TransactionAcknowledgementData memory ack = _pendingTxAcknowledgements[reporter];
        return ack.trustedForwarder != address(0) && block.number < ack.expiryBlock;
    }

    /// @inheritdoc ISpokeRegistry
    function getTransactionAcknowledgement(address reporter)
        external
        view
        returns (TransactionAcknowledgementData memory)
    {
        return _pendingTxAcknowledgements[reporter];
    }

    /// @inheritdoc ISpokeRegistry
    function quoteRegistration(address wallet) external view returns (uint256) {
        // Build dummy payload to get accurate quote
        CrossChainMessage.WalletRegistrationPayload memory payload = CrossChainMessage.WalletRegistrationPayload({
            namespaceHash: CAIP10.NAMESPACE_EIP155,
            chainRef: bytes32(0),
            identifier: bytes32(uint256(uint160(wallet))),
            reportedChainId: bytes32(0),
            incidentTimestamp: 0,
            sourceChainId: sourceChainId,
            isSponsored: false,
            nonce: nonces[wallet],
            timestamp: uint64(block.timestamp),
            registrationHash: bytes32(0)
        });

        bytes memory encodedPayload = payload.encodeWalletRegistration();

        uint256 bridgeFee = IBridgeAdapter(bridgeAdapter).quoteMessage(hubChainId, encodedPayload);
        uint256 registrationFee = feeManager != address(0) ? IFeeManager(feeManager).currentFeeWei() : 0;

        return bridgeFee + registrationFee;
    }

    /// @inheritdoc ISpokeRegistry
    function quoteTransactionBatchRegistration(address reporter) external view returns (uint256) {
        uint256 bridgeFee = _quoteTransactionBatchBridgeFee(reporter);
        uint256 registrationFee = feeManager != address(0) ? IFeeManager(feeManager).currentFeeWei() : 0;

        return bridgeFee + registrationFee;
    }

    /// @inheritdoc ISpokeRegistry
    function quoteTransactionBatchFeeBreakdown(address reporter) external view returns (FeeBreakdown memory) {
        uint256 bridgeFee = _quoteTransactionBatchBridgeFee(reporter);
        uint256 registrationFee = feeManager != address(0) ? IFeeManager(feeManager).currentFeeWei() : 0;

        return FeeBreakdown({
            bridgeFee: bridgeFee,
            registrationFee: registrationFee,
            total: bridgeFee + registrationFee,
            bridgeName: IBridgeAdapter(bridgeAdapter).bridgeName()
        });
    }

    /// @dev Bridge fee for the reporter's pending transaction batch, priced on the acknowledged
    ///      entry count. Shared by the total and breakdown quotes so the two can never disagree.
    function _quoteTransactionBatchBridgeFee(address reporter) internal view returns (uint256) {
        uint32 count = _pendingTxAcknowledgements[reporter].transactionCount;
        if (count == 0) count = 1;

        // Zero-filled arrays of the acknowledged length: the adapter prices on the declared entry
        // count, and matching the real payload length keeps the quote correct for any bridge that
        // also prices on message size.
        bytes32[] memory empty = new bytes32[](count);

        CrossChainMessage.TransactionBatchPayload memory payload = CrossChainMessage.TransactionBatchPayload({
            dataHash: bytes32(0),
            reporter: reporter,
            reportedChainId: bytes32(0),
            sourceChainId: sourceChainId,
            transactionCount: count,
            isSponsored: false,
            nonce: nonces[reporter],
            timestamp: uint64(block.timestamp),
            transactionHashes: empty,
            chainIds: empty
        });

        return IBridgeAdapter(bridgeAdapter).quoteMessage(hubChainId, payload.encodeTransactionBatch());
    }

    /// @inheritdoc ISpokeRegistry
    function quoteFeeBreakdown(address wallet) external view returns (FeeBreakdown memory) {
        // Build payload for accurate quote
        CrossChainMessage.WalletRegistrationPayload memory payload = CrossChainMessage.WalletRegistrationPayload({
            namespaceHash: CAIP10.NAMESPACE_EIP155,
            chainRef: bytes32(0),
            identifier: bytes32(uint256(uint160(wallet))),
            reportedChainId: bytes32(0),
            incidentTimestamp: 0,
            sourceChainId: sourceChainId,
            isSponsored: false,
            nonce: nonces[wallet],
            timestamp: uint64(block.timestamp),
            registrationHash: bytes32(0)
        });

        bytes memory encodedPayload = payload.encodeWalletRegistration();

        uint256 bridgeFee = IBridgeAdapter(bridgeAdapter).quoteMessage(hubChainId, encodedPayload);
        string memory bridgeName = IBridgeAdapter(bridgeAdapter).bridgeName();
        uint256 registrationFee = feeManager != address(0) ? IFeeManager(feeManager).currentFeeWei() : 0;

        return FeeBreakdown({
            bridgeFee: bridgeFee,
            registrationFee: registrationFee,
            total: bridgeFee + registrationFee,
            bridgeName: bridgeName
        });
    }

    /// @inheritdoc ISpokeRegistry
    function generateHashStruct(uint64 reportedChainId, uint64 incidentTimestamp, address trustedForwarder, uint8 step)
        external
        view
        returns (uint256 deadline, bytes32 hashStruct)
    {
        if (step != 1 && step != 2) revert SpokeRegistry__InvalidStep();
        deadline = TimingConfig.getSignatureDeadline();

        if (step == 1) {
            hashStruct = keccak256(
                abi.encode(
                    EIP712Constants.WALLET_ACK_TYPEHASH,
                    EIP712Constants.ACK_STATEMENT_HASH,
                    msg.sender,
                    trustedForwarder,
                    reportedChainId,
                    incidentTimestamp,
                    nonces[msg.sender],
                    deadline
                )
            );
        } else {
            hashStruct = keccak256(
                abi.encode(
                    EIP712Constants.WALLET_REG_TYPEHASH,
                    EIP712Constants.REG_STATEMENT_HASH,
                    msg.sender,
                    trustedForwarder,
                    reportedChainId,
                    incidentTimestamp,
                    nonces[msg.sender],
                    deadline
                )
            );
        }
    }

    /// @inheritdoc ISpokeRegistry
    function generateTransactionHashStruct(
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint32 transactionCount,
        address trustedForwarder,
        uint8 step
    ) external view returns (uint256 deadline, bytes32 hashStruct) {
        if (step != 1 && step != 2) revert SpokeRegistry__InvalidStep();
        deadline = TimingConfig.getSignatureDeadline();
        if (step == 1) {
            // Acknowledgement — matches acknowledgeTransactionBatch signature verification
            hashStruct = keccak256(
                abi.encode(
                    EIP712Constants.TX_BATCH_ACK_TYPEHASH,
                    EIP712Constants.TX_ACK_STATEMENT_HASH,
                    msg.sender, // reporter
                    trustedForwarder,
                    dataHash,
                    reportedChainId,
                    transactionCount,
                    nonces[msg.sender],
                    deadline
                )
            );
        } else {
            // Registration — matches _computeTxBatchRegStructHash
            hashStruct = keccak256(
                abi.encode(
                    EIP712Constants.TX_BATCH_REG_TYPEHASH,
                    EIP712Constants.TX_REG_STATEMENT_HASH,
                    msg.sender,
                    trustedForwarder,
                    dataHash,
                    reportedChainId,
                    transactionCount,
                    nonces[msg.sender],
                    deadline
                )
            );
        }
    }

    /// @dev Compute deadline fields from acknowledgement timing data
    function _computeDeadlineFields(uint256 startBlock_, uint256 expiryBlock_)
        internal
        view
        returns (uint256 graceStartsAt, uint256 timeLeft, bool isExpired)
    {
        if (expiryBlock_ <= block.number) {
            isExpired = true;
        } else {
            timeLeft = expiryBlock_ - block.number;
            graceStartsAt = startBlock_ > block.number ? startBlock_ - block.number : 0;
        }
    }

    /// @inheritdoc ISpokeRegistry
    function getDeadlines(address session)
        external
        view
        returns (
            uint256 currentBlock,
            uint256 expiryBlock,
            uint256 startBlock,
            uint256 graceStartsAt,
            uint256 timeLeft,
            bool isExpired
        )
    {
        AcknowledgementData memory ack = _pendingAcknowledgements[session];
        currentBlock = block.number;
        expiryBlock = ack.expiryBlock;
        startBlock = ack.startBlock;
        (graceStartsAt, timeLeft, isExpired) = _computeDeadlineFields(ack.startBlock, ack.expiryBlock);
    }

    /// @inheritdoc ISpokeRegistry
    function getTransactionDeadlines(address reporter)
        external
        view
        returns (
            uint256 currentBlock,
            uint256 expiryBlock,
            uint256 startBlock,
            uint256 graceStartsAt,
            uint256 timeLeft,
            bool isExpired
        )
    {
        TransactionAcknowledgementData memory ack = _pendingTxAcknowledgements[reporter];
        currentBlock = block.number;
        expiryBlock = ack.expiryBlock;
        startBlock = ack.startBlock;
        (graceStartsAt, timeLeft, isExpired) = _computeDeadlineFields(ack.startBlock, ack.expiryBlock);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Update hub chain configuration
    /// @dev Both values must be set together, or both must be zero (unconfigured).
    ///      Immediate during initial setup, timelocked after completeSetup().
    /// @param _hubChainId Hub chain domain ID
    /// @param _hubInbox Hub inbox address
    function setHubConfig(uint32 _hubChainId, bytes32 _hubInbox) external onlyOwner onlyDuringSetup {
        _setHubConfig(_hubChainId, _hubInbox);
    }

    /// @notice Propose a hub configuration change (2-day delay before activation)
    /// @param _hubChainId Hub chain domain ID
    /// @param _hubInbox Hub inbox address
    function proposeHubConfig(uint32 _hubChainId, bytes32 _hubInbox) external onlyOwner {
        _proposeAction(keccak256(abi.encode("setHubConfig", _hubChainId, _hubInbox)));
    }

    /// @notice Activate a previously proposed hub configuration change
    /// @param _hubChainId Hub chain domain ID
    /// @param _hubInbox Hub inbox address
    function activateHubConfig(uint32 _hubChainId, bytes32 _hubInbox) external onlyOwner {
        _activateAction(keccak256(abi.encode("setHubConfig", _hubChainId, _hubInbox)));
        _setHubConfig(_hubChainId, _hubInbox);
    }

    function _setHubConfig(uint32 _hubChainId, bytes32 _hubInbox) internal {
        // Enforce "both set or both zero" invariant
        bool hubChainIdSet = _hubChainId != 0;
        bool hubInboxSet = _hubInbox != bytes32(0);
        if (hubChainIdSet != hubInboxSet) {
            revert SpokeRegistry__InvalidHubConfig();
        }
        hubChainId = _hubChainId;
        hubInbox = _hubInbox;
        emit HubConfigUpdated(_hubChainId, _hubInbox);
    }

    /// @notice Withdraw accumulated fees to treasury
    /// @param to Treasury address
    /// @param amount Amount to withdraw
    function withdrawFees(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert SpokeRegistry__ZeroAddress();
        (bool success,) = to.call{ value: amount }("");
        if (!success) revert SpokeRegistry__WithdrawalFailed();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Validate inputs and acknowledgement for transaction batch registration
    function _validateTxBatchRegistration(
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint256 deadline,
        uint256 nonce,
        address reporter,
        bytes32[] calldata transactionHashes,
        bytes32[] calldata chainIds
    ) internal view {
        // Fail fast: reject zero address
        if (reporter == address(0)) revert SpokeRegistry__InvalidOwner();

        // Validate hub is configured
        if (hubInbox == bytes32(0)) revert SpokeRegistry__HubNotConfigured();

        // Validate arrays match
        if (transactionHashes.length != chainIds.length) revert SpokeRegistry__ArrayLengthMismatch();
        if (transactionHashes.length == 0) revert SpokeRegistry__EmptyBatch();

        // Validate signature deadline hasn't passed
        if (deadline <= block.timestamp) revert SpokeRegistry__SignatureExpired();

        // Validate nonce matches expected value
        if (nonce != nonces[reporter]) revert SpokeRegistry__InvalidNonce();

        // Load and validate acknowledgement
        TransactionAcknowledgementData memory ack = _pendingTxAcknowledgements[reporter];
        if (ack.trustedForwarder != msg.sender) revert SpokeRegistry__InvalidForwarder();
        if (block.number < ack.startBlock) revert SpokeRegistry__GracePeriodNotStarted();
        if (block.number >= ack.expiryBlock) revert SpokeRegistry__ForwarderExpired();

        // Validate computed dataHash matches what was acknowledged
        // This proves the submitted arrays are exactly what the user signed
        if (ack.dataHash != dataHash || ack.reportedChainId != reportedChainId) {
            revert SpokeRegistry__InvalidDataHash();
        }
        if (ack.transactionCount != transactionHashes.length) {
            revert SpokeRegistry__ArrayLengthMismatch();
        }
    }

    /// @dev Verify EIP-712 signature for transaction batch registration
    function _verifyTxBatchSignature(
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint256 deadline,
        uint256 nonce,
        address reporter,
        uint256 txCount,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal view {
        bytes32 structHash = _computeTxBatchRegStructHash(dataHash, reportedChainId, deadline, nonce, reporter, txCount);
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, v, r, s);
        if (signer == address(0) || signer != reporter) revert SpokeRegistry__InvalidSigner();
    }

    /// @dev Compute struct hash for transaction batch registration (avoids stack too deep)
    function _computeTxBatchRegStructHash(
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint256 deadline,
        uint256 nonce,
        address reporter,
        uint256 txCount
    ) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712Constants.TX_BATCH_REG_TYPEHASH,
                EIP712Constants.TX_REG_STATEMENT_HASH,
                reporter,
                msg.sender,
                dataHash,
                reportedChainId,
                uint32(txCount),
                nonce,
                deadline
            )
        );
    }

    /// @dev Execute transaction batch registration (state changes + cross-chain message)
    /// @notice Follows CEI pattern: state changes first, then external calls
    /// @param dataHash Hash of (txHashes, chainIds) for verification
    /// @param reportedChainId CAIP-2 chain ID hash where incident occurred
    /// @param nonce The validated nonce for replay protection
    /// @param reporter The address that acknowledged the registration
    /// @param transactionHashes Array of transaction hashes to register
    /// @param chainIds Array of CAIP-2 chain ID hashes for each transaction
    function _executeTxBatchRegistration(
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint256 nonce,
        address reporter,
        bytes32[] calldata transactionHashes,
        bytes32[] calldata chainIds
    ) internal {
        // Build cross-chain payload (view operation, no state changes)
        bytes memory encodedPayload =
            _encodeTxBatchPayload(dataHash, reportedChainId, nonce, reporter, transactionHashes, chainIds);

        // Quote and validate fees BEFORE state changes (matches wallet registration pattern)
        uint256 bridgeFee = IBridgeAdapter(bridgeAdapter).quoteMessage(hubChainId, encodedPayload);
        uint256 registrationFee = feeManager != address(0) ? IFeeManager(feeManager).currentFeeWei() : 0;
        uint256 totalRequired = bridgeFee + registrationFee;

        if (msg.value < totalRequired) revert SpokeRegistry__InsufficientFee();

        // EFFECTS: Update state after fee validation
        nonces[reporter]++;
        delete _pendingTxAcknowledgements[reporter];

        // INTERACTIONS: Send cross-chain message
        bytes32 messageId =
            IBridgeAdapter(bridgeAdapter).sendMessage{ value: bridgeFee }(hubChainId, hubInbox, encodedPayload);

        emit TransactionBatchSentToHub(reporter, messageId, dataHash, hubChainId);

        // Refund excess (registration fee stays on spoke for treasury sweep)
        uint256 excess = msg.value - totalRequired;
        if (excess > 0) {
            (bool success,) = msg.sender.call{ value: excess }("");
            if (!success) revert SpokeRegistry__RefundFailed();
        }
    }

    /// @dev Encode transaction batch payload for cross-chain transport
    function _encodeTxBatchPayload(
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint256 nonce,
        address reporter,
        bytes32[] calldata transactionHashes,
        bytes32[] calldata chainIds
    ) internal view returns (bytes memory) {
        CrossChainMessage.TransactionBatchPayload memory payload =
            CrossChainMessage.TransactionBatchPayload({
                dataHash: dataHash,
                reporter: reporter,
                reportedChainId: reportedChainId,
                sourceChainId: sourceChainId,
                transactionCount: uint32(transactionHashes.length),
                isSponsored: reporter != msg.sender,
                nonce: nonce,
                timestamp: uint64(block.timestamp),
                transactionHashes: transactionHashes,
                chainIds: chainIds
            });

        return payload.encodeTransactionBatch();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RECEIVE ETH
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Accept ETH for cross-chain fees and refunds
    receive() external payable { }
}
