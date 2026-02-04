// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";

import { ISpokeRegistryV2 } from "./interfaces/ISpokeRegistryV2.sol";
import { IBridgeAdapter } from "../interfaces/IBridgeAdapter.sol";
import { IFeeManager } from "../interfaces/IFeeManager.sol";
import { TimingConfig } from "../libraries/TimingConfig.sol";
import { CAIP10 } from "./libraries/CAIP10.sol";
import { CAIP10Evm } from "./libraries/CAIP10Evm.sol";
import { CrossChainMessageV2 } from "./libraries/CrossChainMessageV2.sol";
import { EIP712ConstantsV2 } from "./libraries/EIP712ConstantsV2.sol";

/// @title SpokeRegistryV2
/// @author Stolen Wallet Registry Team
/// @notice Spoke chain registration contract for cross-chain stolen wallet registry (V2)
/// @dev V2 includes incidentTimestamp and reportedChainId in user signatures.
///      Sends messages to FraudRegistryV2 on hub chain via bridge adapter.
contract SpokeRegistryV2 is ISpokeRegistryV2, EIP712, Ownable2Step {
    using CrossChainMessageV2 for CrossChainMessageV2.WalletRegistrationPayload;
    using CrossChainMessageV2 for CrossChainMessageV2.TransactionBatchPayload;

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

    /// @notice Initializes the spoke registry V2
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
        if (_owner == address(0)) revert SpokeRegistryV2__ZeroAddress();
        if (_bridgeAdapter == address(0)) revert SpokeRegistryV2__ZeroAddress();

        // Validate timing: deadline must be >= 2*grace to ensure window always exists
        if (_graceBlocks == 0 || _deadlineBlocks == 0 || _deadlineBlocks < 2 * _graceBlocks) {
            revert SpokeRegistryV2__InvalidTimingConfig();
        }

        // Validate hub config: must be both set or both zero
        bool hubChainIdSet = _hubChainId != 0;
        bool hubInboxSet = _hubInbox != bytes32(0);
        if (hubChainIdSet != hubInboxSet) {
            revert SpokeRegistryV2__InvalidHubConfig();
        }

        // Compute source chain ID as CAIP-2 hash
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

    /// @inheritdoc ISpokeRegistryV2
    function acknowledgeLocal(
        bytes32 reportedChainId,
        uint64 incidentTimestamp,
        uint256 deadline,
        uint256 nonce,
        address owner,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        // Fail fast: reject zero address
        if (owner == address(0)) revert SpokeRegistryV2__InvalidOwner();

        // Validate signature deadline hasn't passed
        if (deadline <= block.timestamp) revert SpokeRegistryV2__SignatureExpired();

        // Validate nonce matches expected value
        if (nonce != nonces[owner]) revert SpokeRegistryV2__InvalidNonce();

        // Verify EIP-712 signature
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    EIP712ConstantsV2.WALLET_ACK_TYPEHASH,
                    EIP712ConstantsV2.ACK_STATEMENT_HASH,
                    owner,
                    msg.sender,
                    reportedChainId,
                    incidentTimestamp,
                    nonce,
                    deadline
                )
            )
        );
        address signer = ECDSA.recover(digest, v, r, s);
        if (signer == address(0) || signer != owner) revert SpokeRegistryV2__InvalidSigner();

        // Increment nonce AFTER validation
        nonces[owner]++;

        // Store acknowledgement with randomized grace period
        // Struct packing: trustedForwarder (20) + incidentTimestamp (8) fit in slot 1
        pendingAcknowledgements[owner] = AcknowledgementData({
            trustedForwarder: msg.sender,
            incidentTimestamp: incidentTimestamp,
            reportedChainId: reportedChainId,
            startBlock: TimingConfig.getGracePeriodEndBlock(graceBlocks),
            expiryBlock: TimingConfig.getDeadlineBlock(deadlineBlocks)
        });

        emit WalletAcknowledged(owner, msg.sender, reportedChainId, incidentTimestamp, owner != msg.sender);
    }

    /// @inheritdoc ISpokeRegistryV2
    function registerLocal(
        bytes32 reportedChainId,
        uint64 incidentTimestamp,
        uint256 deadline,
        uint256 nonce,
        address owner,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable {
        // Fail fast: reject zero address
        if (owner == address(0)) revert SpokeRegistryV2__InvalidOwner();

        // Validate hub is configured
        if (hubInbox == bytes32(0)) revert SpokeRegistryV2__HubNotConfigured();

        // Validate signature deadline hasn't passed
        if (deadline <= block.timestamp) revert SpokeRegistryV2__SignatureExpired();

        // Validate nonce matches expected value
        if (nonce != nonces[owner]) revert SpokeRegistryV2__InvalidNonce();

        // Verify EIP-712 signature
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    EIP712ConstantsV2.WALLET_REG_TYPEHASH,
                    EIP712ConstantsV2.REG_STATEMENT_HASH,
                    owner,
                    msg.sender,
                    reportedChainId,
                    incidentTimestamp,
                    nonce,
                    deadline
                )
            )
        );
        address signer = ECDSA.recover(digest, v, r, s);
        if (signer == address(0) || signer != owner) revert SpokeRegistryV2__InvalidSigner();

        // Load and validate acknowledgement
        AcknowledgementData memory ack = pendingAcknowledgements[owner];
        if (ack.trustedForwarder != msg.sender) revert SpokeRegistryV2__InvalidForwarder();
        if (block.number < ack.startBlock) revert SpokeRegistryV2__GracePeriodNotStarted();
        if (block.number >= ack.expiryBlock) revert SpokeRegistryV2__ForwarderExpired();

        // Validate incident data matches acknowledgement
        // (prevents submitting different incident than what was acknowledged)
        if (ack.reportedChainId != reportedChainId || ack.incidentTimestamp != incidentTimestamp) {
            revert SpokeRegistryV2__InvalidForwarder(); // Reuse error for data mismatch
        }

        // Determine sponsorship
        bool isSponsored = owner != msg.sender;

        // Build cross-chain payload (V2 format for FraudRegistryV2)
        CrossChainMessageV2.WalletRegistrationPayload memory payload = CrossChainMessageV2.WalletRegistrationPayload({
            namespaceHash: CAIP10.NAMESPACE_EIP155,
            chainRef: CAIP10Evm.evmChainRefHash(uint64(block.chainid)), // Not used for EVM (wildcard key)
            identifier: bytes32(uint256(uint160(owner))),
            reportedChainId: reportedChainId,
            incidentTimestamp: incidentTimestamp,
            sourceChainId: sourceChainId,
            isSponsored: isSponsored,
            nonce: nonce,
            timestamp: uint64(block.timestamp),
            registrationHash: digest
        });

        bytes memory encodedPayload = payload.encodeWalletRegistration();

        // Quote fees
        uint256 bridgeFee = IBridgeAdapter(bridgeAdapter).quoteMessage(hubChainId, encodedPayload);
        uint256 registrationFee = feeManager != address(0) ? IFeeManager(feeManager).currentFeeWei() : 0;
        uint256 totalRequired = bridgeFee + registrationFee;

        if (msg.value < totalRequired) revert SpokeRegistryV2__InsufficientFee();

        // Increment nonce AFTER validation
        nonces[owner]++;

        // Clean up acknowledgement (CEI pattern - before external call)
        delete pendingAcknowledgements[owner];

        // Send cross-chain message
        bytes32 messageId =
            IBridgeAdapter(bridgeAdapter).sendMessage{ value: bridgeFee }(hubChainId, hubInbox, encodedPayload);

        emit RegistrationSentToHub(owner, messageId, hubChainId);

        // Refund excess (registration fee stays on spoke for treasury sweep)
        uint256 excess = msg.value - totalRequired;
        if (excess > 0) {
            (bool success,) = msg.sender.call{ value: excess }("");
            if (!success) revert SpokeRegistryV2__RefundFailed();
        }
    }

    /// @inheritdoc ISpokeRegistryV2
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
        if (reporter == address(0)) revert SpokeRegistryV2__InvalidOwner();

        // Validate dataHash is not zero
        if (dataHash == bytes32(0)) revert SpokeRegistryV2__InvalidDataHash();

        // Validate batch size
        if (transactionCount == 0) revert SpokeRegistryV2__EmptyBatch();

        // Validate signature deadline hasn't passed
        if (deadline <= block.timestamp) revert SpokeRegistryV2__SignatureExpired();

        // Validate nonce matches expected value
        if (nonce != nonces[reporter]) revert SpokeRegistryV2__InvalidNonce();

        // Verify EIP-712 signature
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    EIP712ConstantsV2.TX_BATCH_ACK_TYPEHASH,
                    EIP712ConstantsV2.TX_ACK_STATEMENT_HASH,
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
        if (signer == address(0) || signer != reporter) revert SpokeRegistryV2__InvalidSigner();

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

    /// @inheritdoc ISpokeRegistryV2
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
        bytes32 dataHash = keccak256(abi.encodePacked(transactionHashes, chainIds));

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

    /// @inheritdoc ISpokeRegistryV2
    function isPending(address wallet) external view returns (bool) {
        AcknowledgementData memory ack = pendingAcknowledgements[wallet];
        return ack.trustedForwarder != address(0) && block.number < ack.expiryBlock;
    }

    /// @inheritdoc ISpokeRegistryV2
    function getAcknowledgement(address wallet) external view returns (AcknowledgementData memory) {
        return pendingAcknowledgements[wallet];
    }

    /// @inheritdoc ISpokeRegistryV2
    function isPendingTransactionBatch(address reporter) external view returns (bool) {
        TransactionAcknowledgementData memory ack = pendingTxAcknowledgements[reporter];
        return ack.trustedForwarder != address(0) && block.number < ack.expiryBlock;
    }

    /// @inheritdoc ISpokeRegistryV2
    function getTransactionAcknowledgement(address reporter)
        external
        view
        returns (TransactionAcknowledgementData memory)
    {
        return pendingTxAcknowledgements[reporter];
    }

    /// @inheritdoc ISpokeRegistryV2
    function quoteRegistration(address owner) external view returns (uint256) {
        // Build dummy payload to get accurate quote
        CrossChainMessageV2.WalletRegistrationPayload memory payload = CrossChainMessageV2.WalletRegistrationPayload({
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

    /// @inheritdoc ISpokeRegistryV2
    function quoteFeeBreakdown(address owner) external view returns (FeeBreakdown memory) {
        // Build payload for accurate quote
        CrossChainMessageV2.WalletRegistrationPayload memory payload = CrossChainMessageV2.WalletRegistrationPayload({
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

    /// @inheritdoc ISpokeRegistryV2
    function generateHashStruct(bytes32 reportedChainId, uint64 incidentTimestamp, address forwarder, uint8 step)
        external
        view
        returns (uint256 deadline, bytes32 hashStruct)
    {
        deadline = TimingConfig.getSignatureDeadline();

        if (step == 1) {
            hashStruct = keccak256(
                abi.encode(
                    EIP712ConstantsV2.WALLET_ACK_TYPEHASH,
                    EIP712ConstantsV2.ACK_STATEMENT_HASH,
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
                    EIP712ConstantsV2.WALLET_REG_TYPEHASH,
                    EIP712ConstantsV2.REG_STATEMENT_HASH,
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

    /// @inheritdoc ISpokeRegistryV2
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
            revert SpokeRegistryV2__InvalidHubConfig();
        }
        hubChainId = _hubChainId;
        hubInbox = _hubInbox;
        emit HubConfigUpdated(_hubChainId, _hubInbox);
    }

    /// @notice Withdraw accumulated fees to treasury
    /// @param to Treasury address
    /// @param amount Amount to withdraw
    function withdrawFees(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert SpokeRegistryV2__ZeroAddress();
        (bool success,) = to.call{ value: amount }("");
        if (!success) revert SpokeRegistryV2__WithdrawalFailed();
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
        if (reporter == address(0)) revert SpokeRegistryV2__InvalidOwner();

        // Validate hub is configured
        if (hubInbox == bytes32(0)) revert SpokeRegistryV2__HubNotConfigured();

        // Validate arrays match
        if (transactionHashes.length != chainIds.length) revert SpokeRegistryV2__ArrayLengthMismatch();
        if (transactionHashes.length == 0) revert SpokeRegistryV2__EmptyBatch();

        // Validate signature deadline hasn't passed
        if (deadline <= block.timestamp) revert SpokeRegistryV2__SignatureExpired();

        // Validate nonce matches expected value
        if (nonce != nonces[reporter]) revert SpokeRegistryV2__InvalidNonce();

        // Load and validate acknowledgement
        TransactionAcknowledgementData memory ack = pendingTxAcknowledgements[reporter];
        if (ack.trustedForwarder != msg.sender) revert SpokeRegistryV2__InvalidForwarder();
        if (block.number < ack.startBlock) revert SpokeRegistryV2__GracePeriodNotStarted();
        if (block.number >= ack.expiryBlock) revert SpokeRegistryV2__ForwarderExpired();

        // Validate computed dataHash matches what was acknowledged
        // This proves the submitted arrays are exactly what the user signed
        if (ack.dataHash != dataHash || ack.reportedChainId != reportedChainId) {
            revert SpokeRegistryV2__InvalidDataHash();
        }
        if (ack.transactionCount != transactionHashes.length) {
            revert SpokeRegistryV2__ArrayLengthMismatch();
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
        if (signer == address(0) || signer != reporter) revert SpokeRegistryV2__InvalidSigner();
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
                EIP712ConstantsV2.TX_BATCH_REG_TYPEHASH,
                EIP712ConstantsV2.TX_REG_STATEMENT_HASH,
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
    function _executeTxBatchRegistration(
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint256 nonce,
        address reporter,
        bytes32[] calldata transactionHashes,
        bytes32[] calldata chainIds
    ) internal {
        // Build and send message, returning required fee amount
        (bytes32 messageId, uint256 totalRequired) =
            _buildAndSendTxBatchMessage(dataHash, reportedChainId, nonce, reporter, transactionHashes, chainIds);

        // Increment nonce AFTER message sent
        nonces[reporter]++;

        // Clean up acknowledgement
        delete pendingTxAcknowledgements[reporter];

        emit TransactionBatchSentToHub(reporter, messageId, dataHash, hubChainId);

        // Refund excess
        if (msg.value > totalRequired) {
            (bool success,) = msg.sender.call{ value: msg.value - totalRequired }("");
            if (!success) revert SpokeRegistryV2__RefundFailed();
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

        if (msg.value < totalRequired) revert SpokeRegistryV2__InsufficientFee();

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
        CrossChainMessageV2.TransactionBatchPayload memory payload =
            CrossChainMessageV2.TransactionBatchPayload({
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
