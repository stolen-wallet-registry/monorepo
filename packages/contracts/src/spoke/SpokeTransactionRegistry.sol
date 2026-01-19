// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";

import { ISpokeTransactionRegistry } from "../interfaces/ISpokeTransactionRegistry.sol";
import { IBridgeAdapter } from "../interfaces/IBridgeAdapter.sol";
import { IFeeManager } from "../interfaces/IFeeManager.sol";
import { TimingConfig } from "../libraries/TimingConfig.sol";
import { CrossChainMessage } from "../libraries/CrossChainMessage.sol";
import { CAIP2 } from "../libraries/CAIP2.sol";

/// @title SpokeTransactionRegistry
/// @author Stolen Wallet Registry Team
/// @notice Spoke chain registration for cross-chain stolen transaction batches
/// @dev Implements two-phase EIP-712 registration locally, then sends full batch data to hub via bridge.
///      All transaction hashes and chain IDs are forwarded to hub for event emission (single indexer model).
contract SpokeTransactionRegistry is ISpokeTransactionRegistry, EIP712, Ownable2Step {
    using CrossChainMessage for CrossChainMessage.TransactionBatchPayload;

    // ═══════════════════════════════════════════════════════════════════════════
    // TYPE HASHES
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev EIP-712 type hash for acknowledgement phase
    bytes32 private constant ACKNOWLEDGEMENT_TYPEHASH = keccak256(
        "TransactionBatchAcknowledgement(bytes32 merkleRoot,bytes32 reportedChainId,uint32 transactionCount,address forwarder,uint256 nonce,uint256 deadline)"
    );

    /// @dev EIP-712 type hash for registration phase
    bytes32 private constant REGISTRATION_TYPEHASH = keccak256(
        "TransactionBatchRegistration(bytes32 merkleRoot,bytes32 reportedChainId,address forwarder,uint256 nonce,uint256 deadline)"
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // IMMUTABLES
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice This spoke chain's EIP-155 chain ID
    uint32 public immutable spokeChainId;

    /// @notice Bridge adapter for cross-chain messaging
    address public immutable bridgeAdapter;

    /// @notice Fee manager for registration fees (address(0) = free)
    address public immutable feeManager;

    /// @notice Base blocks for grace period (chain-specific for consistent UX)
    uint256 public immutable graceBlocks;

    /// @notice Base blocks for registration deadline (chain-specific for consistent UX)
    uint256 public immutable deadlineBlocks;

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Hub chain Hyperlane domain ID
    uint32 public hubChainId;

    /// @notice CrossChainInbox address on hub (bytes32 for cross-chain addressing)
    bytes32 public hubInbox;

    /// @notice Pending acknowledgements by reporter
    mapping(address => AcknowledgementData) private pendingAcknowledgements;

    /// @notice Nonces for replay protection
    mapping(address => uint256) public nonces;

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL STRUCTS (for stack management)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Acknowledgement params packed to reduce stack usage
    struct AcknowledgeParams {
        bytes32 merkleRoot;
        bytes32 reportedChainId;
        uint32 transactionCount;
        address reporter;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    /// @dev Registration params packed to reduce stack usage
    struct RegisterParams {
        bytes32 merkleRoot;
        bytes32 reportedChainId;
        bytes32[] transactionHashes;
        bytes32[] chainIds;
        address reporter;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Initializes the spoke transaction registry
    /// @param _owner Contract owner
    /// @param _bridgeAdapter Bridge adapter address for cross-chain messaging
    /// @param _feeManager Fee manager address (address(0) for free registrations)
    /// @param _hubChainId Hub chain Hyperlane domain ID
    /// @param _hubInbox CrossChainInbox address on hub
    /// @param _graceBlocks Base blocks for grace period
    /// @param _deadlineBlocks Base blocks for deadline window
    constructor(
        address _owner,
        address _bridgeAdapter,
        address _feeManager,
        uint32 _hubChainId,
        bytes32 _hubInbox,
        uint256 _graceBlocks,
        uint256 _deadlineBlocks
    ) EIP712("StolenTransactionRegistry", "4") Ownable(_owner) {
        if (_owner == address(0)) revert SpokeTransactionRegistry__ZeroAddress();
        if (_bridgeAdapter == address(0)) revert SpokeTransactionRegistry__ZeroAddress();

        // Validate timing: deadline must be >= 2*grace to ensure window always exists
        if (_graceBlocks == 0 || _deadlineBlocks == 0 || _deadlineBlocks < 2 * _graceBlocks) {
            revert SpokeTransactionRegistry__InvalidTimingConfig();
        }

        spokeChainId = uint32(block.chainid);
        bridgeAdapter = _bridgeAdapter;
        feeManager = _feeManager;
        hubChainId = _hubChainId;
        hubInbox = _hubInbox;
        graceBlocks = _graceBlocks;
        deadlineBlocks = _deadlineBlocks;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc ISpokeTransactionRegistry
    function acknowledge(
        bytes32 merkleRoot,
        bytes32 reportedChainId,
        uint32 transactionCount,
        bytes32[] calldata transactionHashes,
        bytes32[] calldata chainIds,
        address reporter,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        // Validate array lengths first (before packing to struct)
        if (transactionHashes.length != chainIds.length) revert SpokeTransactionRegistry__ArrayLengthMismatch();
        if (transactionCount != transactionHashes.length) revert SpokeTransactionRegistry__ArrayLengthMismatch();

        // Pack params into struct to reduce stack depth
        AcknowledgeParams memory params = AcknowledgeParams({
            merkleRoot: merkleRoot,
            reportedChainId: reportedChainId,
            transactionCount: transactionCount,
            reporter: reporter,
            deadline: deadline,
            v: v,
            r: r,
            s: s
        });

        _executeAcknowledge(params);
    }

    /// @dev Internal acknowledgement execution with packed params to avoid stack too deep
    function _executeAcknowledge(AcknowledgeParams memory params) internal {
        // Validate inputs
        if (params.reporter == address(0)) revert SpokeTransactionRegistry__InvalidReporter();
        if (params.deadline <= block.timestamp) revert SpokeTransactionRegistry__SignatureExpired();

        // Get and verify nonce
        uint256 currentNonce = nonces[params.reporter];

        // Verify signature
        _verifyAcknowledgementSignature(params, currentNonce);

        // Increment nonce AFTER validation
        nonces[params.reporter]++;

        // Store acknowledgement data
        _storeAcknowledgement(params);
    }

    /// @dev Verify EIP-712 acknowledgement signature
    function _verifyAcknowledgementSignature(AcknowledgeParams memory params, uint256 currentNonce) internal view {
        bytes32 structHash = keccak256(
            abi.encode(
                ACKNOWLEDGEMENT_TYPEHASH,
                params.merkleRoot,
                params.reportedChainId,
                params.transactionCount,
                msg.sender, // forwarder
                currentNonce,
                params.deadline
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, params.v, params.r, params.s);

        if (signer == address(0) || signer != params.reporter) {
            revert SpokeTransactionRegistry__InvalidSigner();
        }
    }

    /// @dev Store acknowledgement and emit event
    function _storeAcknowledgement(AcknowledgeParams memory params) internal {
        uint256 startBlock = TimingConfig.getGracePeriodEndBlock(graceBlocks);
        uint256 expiryBlock = TimingConfig.getDeadlineBlock(deadlineBlocks);

        pendingAcknowledgements[params.reporter] = AcknowledgementData({
            trustedForwarder: msg.sender,
            pendingMerkleRoot: params.merkleRoot,
            pendingReportedChainId: params.reportedChainId,
            pendingTxCount: params.transactionCount,
            startBlock: startBlock,
            expiryBlock: expiryBlock
        });

        bool isSponsored = params.reporter != msg.sender;

        emit TransactionBatchAcknowledged(
            params.merkleRoot,
            params.reporter,
            msg.sender,
            params.reportedChainId,
            params.transactionCount,
            isSponsored,
            startBlock,
            expiryBlock
        );
    }

    /// @inheritdoc ISpokeTransactionRegistry
    function register(
        bytes32 merkleRoot,
        bytes32 reportedChainId,
        bytes32[] calldata transactionHashes,
        bytes32[] calldata chainIds,
        address reporter,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable {
        // Pack params into struct to reduce stack depth
        RegisterParams memory params = RegisterParams({
            merkleRoot: merkleRoot,
            reportedChainId: reportedChainId,
            transactionHashes: transactionHashes,
            chainIds: chainIds,
            reporter: reporter,
            deadline: deadline,
            v: v,
            r: r,
            s: s
        });

        _executeRegister(params);
    }

    /// @dev Internal registration execution with packed params to avoid stack too deep
    function _executeRegister(RegisterParams memory params) internal {
        // Validate inputs
        if (params.reporter == address(0)) revert SpokeTransactionRegistry__InvalidReporter();
        if (hubInbox == bytes32(0)) revert SpokeTransactionRegistry__HubNotConfigured();
        if (hubChainId == 0) revert SpokeTransactionRegistry__HubNotConfigured();
        if (params.deadline <= block.timestamp) revert SpokeTransactionRegistry__SignatureExpired();
        if (params.transactionHashes.length != params.chainIds.length) {
            revert SpokeTransactionRegistry__ArrayLengthMismatch();
        }

        // Get current nonce and verify signature
        uint256 currentNonce = _verifyRegistrationSignature(params);

        // Validate acknowledgement and get sponsored status
        bool isSponsored = _validateAcknowledgement(params.reporter, params.merkleRoot, params.reportedChainId);

        // Build and send cross-chain message
        _sendCrossChainMessage(
            params.merkleRoot,
            params.reportedChainId,
            params.transactionHashes,
            params.chainIds,
            params.reporter,
            currentNonce,
            isSponsored
        );
    }

    /// @dev Verify EIP-712 registration signature. Returns current nonce.
    function _verifyRegistrationSignature(RegisterParams memory params) internal view returns (uint256) {
        uint256 currentNonce = nonces[params.reporter];

        bytes32 structHash = keccak256(
            abi.encode(
                REGISTRATION_TYPEHASH,
                params.merkleRoot,
                params.reportedChainId,
                msg.sender,
                currentNonce,
                params.deadline
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, params.v, params.r, params.s);

        if (signer == address(0) || signer != params.reporter) {
            revert SpokeTransactionRegistry__InvalidSigner();
        }

        return currentNonce;
    }

    /// @dev Validate acknowledgement state. Returns true if sponsored.
    function _validateAcknowledgement(address reporter, bytes32 merkleRoot, bytes32 reportedChainId)
        internal
        view
        returns (bool isSponsored)
    {
        AcknowledgementData storage ack = pendingAcknowledgements[reporter];

        if (ack.trustedForwarder == address(0)) revert SpokeTransactionRegistry__NoPendingAcknowledgement();
        if (ack.trustedForwarder != msg.sender) revert SpokeTransactionRegistry__InvalidForwarder();
        if (block.number < ack.startBlock) revert SpokeTransactionRegistry__GracePeriodNotStarted();
        if (block.number >= ack.expiryBlock) revert SpokeTransactionRegistry__RegistrationExpired();
        if (ack.pendingMerkleRoot != merkleRoot) revert SpokeTransactionRegistry__MerkleRootMismatch();
        if (ack.pendingReportedChainId != reportedChainId) revert SpokeTransactionRegistry__ReportedChainIdMismatch();

        return reporter != msg.sender;
    }

    /// @dev Internal function to build payload, quote fee, send message, and handle refunds
    /// @dev Separated to avoid stack too deep in register()
    function _sendCrossChainMessage(
        bytes32 merkleRoot,
        bytes32 reportedChainId,
        bytes32[] memory transactionHashes,
        bytes32[] memory chainIds,
        address reporter,
        uint256 currentNonce,
        bool isSponsored
    ) internal {
        // Build cross-chain payload with full batch data
        bytes memory encodedPayload = _buildPayload(
            merkleRoot, reportedChainId, transactionHashes, chainIds, reporter, currentNonce, isSponsored
        );

        // Quote bridge fee
        uint256 bridgeFee = IBridgeAdapter(bridgeAdapter).quoteMessage(hubChainId, encodedPayload);

        // Quote registration fee (if fee manager is configured)
        uint256 registrationFee = feeManager != address(0) ? IFeeManager(feeManager).currentFeeWei() : 0;

        uint256 totalRequired = bridgeFee + registrationFee;
        if (msg.value < totalRequired) revert SpokeTransactionRegistry__InsufficientFee();

        // Increment nonce AFTER validation
        nonces[reporter]++;

        // Clean up acknowledgement (CEI pattern - before external call)
        delete pendingAcknowledgements[reporter];

        // Send cross-chain message
        bytes32 messageId =
            IBridgeAdapter(bridgeAdapter).sendMessage{ value: bridgeFee }(hubChainId, hubInbox, encodedPayload);

        emit TransactionBatchForwarded(merkleRoot, reporter, messageId, uint32(transactionHashes.length), bridgeFee);

        // Refund excess (registration fee stays on spoke for treasury sweep)
        uint256 excess = msg.value - totalRequired;
        if (excess > 0) {
            (bool success,) = msg.sender.call{ value: excess }("");
            if (!success) revert SpokeTransactionRegistry__RefundFailed();
        }
    }

    /// @dev Build cross-chain payload. Separated to reduce stack depth.
    function _buildPayload(
        bytes32 merkleRoot,
        bytes32 reportedChainId,
        bytes32[] memory transactionHashes,
        bytes32[] memory chainIds,
        address reporter,
        uint256 currentNonce,
        bool isSponsored
    ) internal view returns (bytes memory) {
        // Source chain ID as CAIP-2 format bytes32 using shared library
        bytes32 sourceChainId = CAIP2.fromEIP155(spokeChainId);

        CrossChainMessage.TransactionBatchPayload memory payload = CrossChainMessage.TransactionBatchPayload({
            merkleRoot: merkleRoot,
            reporter: reporter,
            reportedChainId: reportedChainId,
            sourceChainId: sourceChainId,
            transactionCount: uint32(transactionHashes.length),
            isSponsored: isSponsored,
            nonce: currentNonce,
            timestamp: uint64(block.timestamp),
            transactionHashes: transactionHashes,
            chainIds: chainIds
        });

        return payload.encodeTransactionBatch();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc ISpokeTransactionRegistry
    function isPending(address reporter) external view returns (bool) {
        AcknowledgementData memory ack = pendingAcknowledgements[reporter];
        return ack.trustedForwarder != address(0) && block.number < ack.expiryBlock;
    }

    /// @inheritdoc ISpokeTransactionRegistry
    function getAcknowledgement(address reporter) external view returns (AcknowledgementData memory data) {
        return pendingAcknowledgements[reporter];
    }

    /// @inheritdoc ISpokeTransactionRegistry
    function quoteRegistration(uint32 transactionCount) external view returns (uint256) {
        // Build dummy payload to get accurate quote
        bytes32[] memory dummyHashes = new bytes32[](transactionCount);
        bytes32[] memory dummyChainIds = new bytes32[](transactionCount);

        CrossChainMessage.TransactionBatchPayload memory payload = CrossChainMessage.TransactionBatchPayload({
            merkleRoot: bytes32(0),
            reporter: address(0),
            reportedChainId: bytes32(0),
            sourceChainId: bytes32(0),
            transactionCount: transactionCount,
            isSponsored: false,
            nonce: 0,
            timestamp: uint64(block.timestamp),
            transactionHashes: dummyHashes,
            chainIds: dummyChainIds
        });

        bytes memory encodedPayload = payload.encodeTransactionBatch();

        // Quote bridge fee
        uint256 bridgeFee = IBridgeAdapter(bridgeAdapter).quoteMessage(hubChainId, encodedPayload);

        // Quote registration fee
        uint256 registrationFee = 0;
        if (feeManager != address(0)) {
            registrationFee = IFeeManager(feeManager).currentFeeWei();
        }

        return bridgeFee + registrationFee;
    }

    /// @inheritdoc ISpokeTransactionRegistry
    function quoteFeeBreakdown(uint32 transactionCount) external view returns (FeeBreakdown memory) {
        // Build dummy payload for accurate quote
        bytes32[] memory dummyHashes = new bytes32[](transactionCount);
        bytes32[] memory dummyChainIds = new bytes32[](transactionCount);

        CrossChainMessage.TransactionBatchPayload memory payload = CrossChainMessage.TransactionBatchPayload({
            merkleRoot: bytes32(0),
            reporter: address(0),
            reportedChainId: bytes32(0),
            sourceChainId: bytes32(0),
            transactionCount: transactionCount,
            isSponsored: false,
            nonce: 0,
            timestamp: uint64(block.timestamp),
            transactionHashes: dummyHashes,
            chainIds: dummyChainIds
        });

        bytes memory encodedPayload = payload.encodeTransactionBatch();

        // Get bridge fee and name from adapter
        uint256 bridgeFee = IBridgeAdapter(bridgeAdapter).quoteMessage(hubChainId, encodedPayload);
        string memory bridgeName = IBridgeAdapter(bridgeAdapter).bridgeName();

        // Get registration fee from fee manager
        uint256 registrationFee = 0;
        if (feeManager != address(0)) {
            registrationFee = IFeeManager(feeManager).currentFeeWei();
        }

        return FeeBreakdown({
            bridgeFee: bridgeFee,
            registrationFee: registrationFee,
            total: bridgeFee + registrationFee,
            bridgeName: bridgeName
        });
    }

    /// @inheritdoc ISpokeTransactionRegistry
    function getDeadlines(address reporter)
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
        AcknowledgementData memory ack = pendingAcknowledgements[reporter];
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

    /// @inheritdoc ISpokeTransactionRegistry
    function generateHashStruct(
        bytes32 merkleRoot,
        bytes32 reportedChainId,
        uint32 transactionCount,
        address forwarder,
        uint8 step
    ) external view returns (uint256 deadline, bytes32 hashStruct) {
        deadline = TimingConfig.getSignatureDeadline();

        if (step == 1) {
            // Acknowledgement
            hashStruct = keccak256(
                abi.encode(
                    ACKNOWLEDGEMENT_TYPEHASH,
                    merkleRoot,
                    reportedChainId,
                    transactionCount,
                    forwarder,
                    nonces[msg.sender],
                    deadline
                )
            );
        } else {
            // Registration
            hashStruct = keccak256(
                abi.encode(REGISTRATION_TYPEHASH, merkleRoot, reportedChainId, forwarder, nonces[msg.sender], deadline)
            );
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Update hub chain configuration
    /// @dev If hubChainId is non-zero, hubInbox must also be non-zero.
    /// @param _hubChainId Hub chain Hyperlane domain ID
    /// @param _hubInbox CrossChainInbox address on hub
    function setHubConfig(uint32 _hubChainId, bytes32 _hubInbox) external onlyOwner {
        if (_hubChainId != 0 && _hubInbox == bytes32(0)) {
            revert SpokeTransactionRegistry__InvalidHubConfig();
        }
        hubChainId = _hubChainId;
        hubInbox = _hubInbox;
        emit HubConfigUpdated(_hubChainId, _hubInbox);
    }

    /// @notice Withdraw accumulated fees to treasury
    /// @param to Treasury address
    /// @param amount Amount to withdraw
    function withdrawFees(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert SpokeTransactionRegistry__ZeroAddress();
        if (amount > address(this).balance) revert SpokeTransactionRegistry__WithdrawalFailed();
        (bool success,) = to.call{ value: amount }("");
        if (!success) revert SpokeTransactionRegistry__WithdrawalFailed();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RECEIVE ETH
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Allows the contract to receive ETH for fee collection
    receive() external payable { }
}
