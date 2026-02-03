// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISpokeRegistryV2
/// @author Stolen Wallet Registry Team
/// @notice Interface for spoke chain wallet registration (V2)
/// @dev V2 includes incidentTimestamp and reportedChainId in user signatures.
///      Works with FraudRegistryV2 on hub chain.
interface ISpokeRegistryV2 {
    // ═══════════════════════════════════════════════════════════════════════════
    // STRUCTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Acknowledgement data for pending registrations
    /// @param trustedForwarder Address authorized to complete registration
    /// @param reportedChainId CAIP-2 hash of chain where incident occurred
    /// @param incidentTimestamp User-provided timestamp of when theft occurred
    /// @param startBlock Block number when grace period ends
    /// @param expiryBlock Block number when registration window expires
    struct AcknowledgementData {
        address trustedForwarder;
        bytes32 reportedChainId;
        uint64 incidentTimestamp;
        uint256 startBlock;
        uint256 expiryBlock;
    }

    /// @notice Fee breakdown for registration
    struct FeeBreakdown {
        uint256 bridgeFee;
        uint256 registrationFee;
        uint256 total;
        string bridgeName;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when wallet acknowledgement is recorded
    /// @param wallet The wallet being registered as stolen
    /// @param forwarder The authorized forwarder address
    /// @param reportedChainId CAIP-2 hash of chain where incident occurred
    /// @param incidentTimestamp When theft occurred
    /// @param isSponsored True if registration is sponsored by third party
    event WalletAcknowledged(
        address indexed wallet,
        address indexed forwarder,
        bytes32 reportedChainId,
        uint64 incidentTimestamp,
        bool isSponsored
    );

    /// @notice Emitted when registration message is sent to hub
    /// @param wallet The wallet being registered
    /// @param messageId Bridge message ID for tracking
    /// @param hubChainId Hub chain domain ID
    event RegistrationSentToHub(address indexed wallet, bytes32 indexed messageId, uint32 hubChainId);

    /// @notice Emitted when hub configuration is updated
    event HubConfigUpdated(uint32 indexed hubChainId, bytes32 hubInbox);

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    error SpokeRegistryV2__ZeroAddress();
    error SpokeRegistryV2__InvalidTimingConfig();
    error SpokeRegistryV2__InvalidOwner();
    error SpokeRegistryV2__SignatureExpired();
    error SpokeRegistryV2__InvalidNonce();
    error SpokeRegistryV2__InvalidSigner();
    error SpokeRegistryV2__InvalidForwarder();
    error SpokeRegistryV2__GracePeriodNotStarted();
    error SpokeRegistryV2__ForwarderExpired();
    error SpokeRegistryV2__HubNotConfigured();
    error SpokeRegistryV2__InsufficientFee();
    error SpokeRegistryV2__RefundFailed();
    error SpokeRegistryV2__WithdrawalFailed();
    error SpokeRegistryV2__InvalidHubConfig();

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Phase 1: Record acknowledgement with EIP-712 signature
    /// @dev Caller becomes trusted forwarder. Signature includes incident details.
    /// @param reportedChainId CAIP-2 hash of chain where theft occurred
    /// @param incidentTimestamp Unix timestamp when theft occurred (user-provided)
    /// @param deadline Signature expiry timestamp
    /// @param nonce Expected nonce for replay protection
    /// @param owner Wallet address being registered as stolen
    /// @param v Signature v component
    /// @param r Signature r component
    /// @param s Signature s component
    function acknowledgeLocal(
        bytes32 reportedChainId,
        uint64 incidentTimestamp,
        uint256 deadline,
        uint256 nonce,
        address owner,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /// @notice Phase 2: Complete registration and send to hub
    /// @dev Must be called by trusted forwarder within registration window.
    /// @param reportedChainId CAIP-2 hash (must match acknowledgement)
    /// @param incidentTimestamp Incident timestamp (must match acknowledgement)
    /// @param deadline Signature expiry timestamp
    /// @param nonce Expected nonce for replay protection
    /// @param owner Wallet address being registered
    /// @param v Signature v component
    /// @param r Signature r component
    /// @param s Signature s component
    function registerLocal(
        bytes32 reportedChainId,
        uint64 incidentTimestamp,
        uint256 deadline,
        uint256 nonce,
        address owner,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable;

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Check if wallet has pending acknowledgement
    function isPending(address wallet) external view returns (bool);

    /// @notice Get acknowledgement data for wallet
    function getAcknowledgement(address wallet) external view returns (AcknowledgementData memory);

    /// @notice Get nonce for wallet
    function nonces(address wallet) external view returns (uint256);

    /// @notice Quote total registration fee
    function quoteRegistration(address owner) external view returns (uint256);

    /// @notice Get detailed fee breakdown
    function quoteFeeBreakdown(address owner) external view returns (FeeBreakdown memory);

    /// @notice Generate hash struct for signing (frontend helper)
    /// @param reportedChainId CAIP-2 hash of incident chain
    /// @param incidentTimestamp When theft occurred
    /// @param forwarder Address that will submit the transaction
    /// @param step 1 for acknowledgement, 2 for registration
    /// @return deadline Signature expiry timestamp
    /// @return hashStruct Hash to sign
    function generateHashStruct(bytes32 reportedChainId, uint64 incidentTimestamp, address forwarder, uint8 step)
        external
        view
        returns (uint256 deadline, bytes32 hashStruct);

    /// @notice Get deadline info for pending registration
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
        );
}
