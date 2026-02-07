// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";

import { ISpokeRegistry } from "../interfaces/ISpokeRegistry.sol";
import { IBridgeAdapter } from "../interfaces/IBridgeAdapter.sol";
import { IFeeManager } from "../interfaces/IFeeManager.sol";
import { TimingConfig } from "../libraries/TimingConfig.sol";
import { CAIP10 } from "../libraries/CAIP10.sol";
import { CAIP10Evm } from "../libraries/CAIP10Evm.sol";
import { CrossChainMessage } from "../libraries/CrossChainMessage.sol";
import { EIP712Constants } from "../libraries/EIP712Constants.sol";

/// @title SpokeRegistry
/// @author Stolen Wallet Registry Team
/// @notice Spoke chain registration contract for cross-chain stolen wallet registry
/// @dev Includes incidentTimestamp and reportedChainId in user signatures.
///      Sends messages to FraudRegistryHub on hub chain via bridge adapter.
contract SpokeRegistry is ISpokeRegistry, EIP712, Ownable2Step {
    using CrossChainMessage for CrossChainMessage.WalletRegistrationPayload;
    using CrossChainMessage for CrossChainMessage.TransactionBatchPayload;

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
    mapping(address => AcknowledgementData) private pendingAcknowledgements;

    /// @notice Pending transaction batch acknowledgements
    mapping(address => TransactionAcknowledgementData) private pendingTxAcknowledgements;

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
        if (_owner == address(0)) revert SpokeRegistry__ZeroAddress();
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
    function acknowledgeLocal(
        address wallet,
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

        // Validate signature deadline hasn't passed
        if (deadline <= block.timestamp) revert SpokeRegistry__SignatureExpired();

        // Validate nonce matches expected value
        if (nonce != nonces[wallet]) revert SpokeRegistry__InvalidNonce();

        // Compute isSponsored early to reduce stack pressure at emit
        bool isSponsored = wallet != msg.sender;

        // Verify EIP-712 signature (scoped to free stack slots)
        {
            bytes32 digest = _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        EIP712Constants.WALLET_ACK_TYPEHASH,
                        EIP712Constants.ACK_STATEMENT_HASH,
                        wallet,
                        msg.sender,
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
        pendingAcknowledgements[wallet] = AcknowledgementData({
            trustedForwarder: msg.sender,
            incidentTimestamp: incidentTimestamp,
            reportedChainId: reportedChainIdHash,
            startBlock: TimingConfig.getGracePeriodEndBlock(graceBlocks),
            expiryBlock: TimingConfig.getDeadlineBlock(deadlineBlocks)
        });

        emit WalletAcknowledged(wallet, msg.sender, reportedChainIdHash, incidentTimestamp, isSponsored);
    }

    /// @inheritdoc ISpokeRegistry
    function registerLocal(
        address wallet,
        uint64 reportedChainId,
        uint64 incidentTimestamp,
        uint256 deadline,
        uint256 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable {
        // Validate inputs and signature, get data needed for payload
        (bytes32 digest, bytes32 reportedChainIdHash) =
            _validateWalletRegistration(wallet, reportedChainId, incidentTimestamp, deadline, nonce, v, r, s);

        // Determine sponsorship
        bool isSponsored = wallet != msg.sender;

        // Build and send cross-chain message
        _executeWalletRegistration(wallet, reportedChainIdHash, incidentTimestamp, nonce, isSponsored, digest);
    }

    /// @dev Validate wallet registration inputs and signature (reduces stack pressure in main function)
    function _validateWalletRegistration(
        address wallet,
        uint64 reportedChainId,
        uint64 incidentTimestamp,
        uint256 deadline,
        uint256 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal view returns (bytes32 digest, bytes32 reportedChainIdHash) {
        // Fail fast: reject zero address
        if (wallet == address(0)) revert SpokeRegistry__InvalidOwner();

        // Validate hub is configured
        if (hubInbox == bytes32(0)) revert SpokeRegistry__HubNotConfigured();

        // Validate signature deadline hasn't passed
        if (deadline <= block.timestamp) revert SpokeRegistry__SignatureExpired();

        // Validate nonce matches expected value
        if (nonce != nonces[wallet]) revert SpokeRegistry__InvalidNonce();

        // Compute digest and verify signature
        digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    EIP712Constants.WALLET_REG_TYPEHASH,
                    EIP712Constants.REG_STATEMENT_HASH,
                    wallet,
                    msg.sender,
                    reportedChainId,
                    incidentTimestamp,
                    nonce,
                    deadline
                )
            )
        );
        address signer = ECDSA.recover(digest, v, r, s);
        if (signer == address(0) || signer != wallet) revert SpokeRegistry__InvalidSigner();

        // Load and validate acknowledgement
        AcknowledgementData memory ack = pendingAcknowledgements[wallet];
        if (ack.trustedForwarder != msg.sender) revert SpokeRegistry__InvalidForwarder();
        if (block.number < ack.startBlock) revert SpokeRegistry__GracePeriodNotStarted();
        if (block.number >= ack.expiryBlock) revert SpokeRegistry__ForwarderExpired();

        // Convert uint64 to bytes32 hash for comparison and return
        reportedChainIdHash = CAIP10Evm.caip2Hash(reportedChainId);
        if (ack.reportedChainId != reportedChainIdHash || ack.incidentTimestamp != incidentTimestamp) {
            revert SpokeRegistry__InvalidForwarder(); // Reuse error for data mismatch
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
        delete pendingAcknowledgements[wallet];

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

        // Validate signature deadline hasn't passed
        if (deadline <= block.timestamp) revert SpokeRegistry__SignatureExpired();

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
        pendingTxAcknowledgements[reporter] = TransactionAcknowledgementData({
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
        AcknowledgementData memory ack = pendingAcknowledgements[wallet];
        return ack.trustedForwarder != address(0) && block.number < ack.expiryBlock;
    }

    /// @inheritdoc ISpokeRegistry
    function getAcknowledgement(address wallet) external view returns (AcknowledgementData memory) {
        return pendingAcknowledgements[wallet];
    }

    /// @inheritdoc ISpokeRegistry
    function isPendingTransactionBatch(address reporter) external view returns (bool) {
        TransactionAcknowledgementData memory ack = pendingTxAcknowledgements[reporter];
        return ack.trustedForwarder != address(0) && block.number < ack.expiryBlock;
    }

    /// @inheritdoc ISpokeRegistry
    function getTransactionAcknowledgement(address reporter)
        external
        view
        returns (TransactionAcknowledgementData memory)
    {
        return pendingTxAcknowledgements[reporter];
    }

    /// @inheritdoc ISpokeRegistry
    function quoteRegistration(address owner) external view returns (uint256) {
        // Build dummy payload to get accurate quote
        CrossChainMessage.WalletRegistrationPayload memory payload = CrossChainMessage.WalletRegistrationPayload({
            namespaceHash: CAIP10.NAMESPACE_EIP155,
            chainRef: bytes32(0),
            identifier: bytes32(uint256(uint160(owner))),
            reportedChainId: bytes32(0),
            incidentTimestamp: 0,
            sourceChainId: sourceChainId,
            isSponsored: false,
            nonce: nonces[owner],
            timestamp: uint64(block.timestamp),
            registrationHash: bytes32(0)
        });

        bytes memory encodedPayload = payload.encodeWalletRegistration();

        uint256 bridgeFee = IBridgeAdapter(bridgeAdapter).quoteMessage(hubChainId, encodedPayload);
        uint256 registrationFee = feeManager != address(0) ? IFeeManager(feeManager).currentFeeWei() : 0;

        return bridgeFee + registrationFee;
    }

    /// @inheritdoc ISpokeRegistry
    function quoteFeeBreakdown(address owner) external view returns (FeeBreakdown memory) {
        // Build payload for accurate quote
        CrossChainMessage.WalletRegistrationPayload memory payload = CrossChainMessage.WalletRegistrationPayload({
            namespaceHash: CAIP10.NAMESPACE_EIP155,
            chainRef: bytes32(0),
            identifier: bytes32(uint256(uint160(owner))),
            reportedChainId: bytes32(0),
            incidentTimestamp: 0,
            sourceChainId: sourceChainId,
            isSponsored: false,
            nonce: nonces[owner],
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
    function generateHashStruct(uint64 reportedChainId, uint64 incidentTimestamp, address forwarder, uint8 step)
        external
        view
        returns (uint256 deadline, bytes32 hashStruct)
    {
        deadline = TimingConfig.getSignatureDeadline();

        if (step == 1) {
            hashStruct = keccak256(
                abi.encode(
                    EIP712Constants.WALLET_ACK_TYPEHASH,
                    EIP712Constants.ACK_STATEMENT_HASH,
                    msg.sender,
                    forwarder,
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
                    forwarder,
                    reportedChainId,
                    incidentTimestamp,
                    nonces[msg.sender],
                    deadline
                )
            );
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
        AcknowledgementData memory ack = pendingAcknowledgements[session];
        currentBlock = block.number;
        expiryBlock = ack.expiryBlock;
        startBlock = ack.startBlock;

        if (ack.expiryBlock <= block.number) {
            isExpired = true;
            timeLeft = 0;
            graceStartsAt = 0;
        } else {
            isExpired = false;
            timeLeft = ack.expiryBlock - block.number;
            graceStartsAt = ack.startBlock > block.number ? ack.startBlock - block.number : 0;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Update hub chain configuration
    /// @dev Both values must be set together, or both must be zero (unconfigured)
    /// @param _hubChainId Hub chain domain ID
    /// @param _hubInbox Hub inbox address
    function setHubConfig(uint32 _hubChainId, bytes32 _hubInbox) external onlyOwner {
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
        TransactionAcknowledgementData memory ack = pendingTxAcknowledgements[reporter];
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
        // EFFECTS: Update state before external calls (CEI pattern)
        nonces[reporter]++;
        delete pendingTxAcknowledgements[reporter];

        // INTERACTIONS: External calls after state changes
        // NOTE: Pass the validated nonce (nonce parameter was validated against nonces[reporter] before increment)
        (bytes32 messageId, uint256 totalRequired) =
            _buildAndSendTxBatchMessage(dataHash, reportedChainId, nonce, reporter, transactionHashes, chainIds);

        emit TransactionBatchSentToHub(reporter, messageId, dataHash, hubChainId);

        // Refund excess
        if (msg.value > totalRequired) {
            (bool success,) = msg.sender.call{ value: msg.value - totalRequired }("");
            if (!success) revert SpokeRegistry__RefundFailed();
        }
    }

    /// @dev Build and send the cross-chain transaction batch message
    function _buildAndSendTxBatchMessage(
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint256 nonce,
        address reporter,
        bytes32[] calldata transactionHashes,
        bytes32[] calldata chainIds
    ) internal returns (bytes32 messageId, uint256 totalRequired) {
        // Build cross-chain payload
        bytes memory encodedPayload =
            _encodeTxBatchPayload(dataHash, reportedChainId, nonce, reporter, transactionHashes, chainIds);

        // Quote and validate fees
        uint256 bridgeFee = IBridgeAdapter(bridgeAdapter).quoteMessage(hubChainId, encodedPayload);
        uint256 registrationFee = feeManager != address(0) ? IFeeManager(feeManager).currentFeeWei() : 0;
        totalRequired = bridgeFee + registrationFee;

        if (msg.value < totalRequired) revert SpokeRegistry__InsufficientFee();

        // Send cross-chain message
        messageId = IBridgeAdapter(bridgeAdapter).sendMessage{ value: bridgeFee }(hubChainId, hubInbox, encodedPayload);
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
