// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IStolenWalletRegistry
/// @author Stolen Wallet Registry Team
/// @notice Interface for the Stolen Wallet Registry subregistry
/// @dev Implements two-phase registration: acknowledgement → grace period → registration
///      This prevents single-transaction phishing attacks by requiring two signatures
///      separated by a randomized time delay.
interface IStolenWalletRegistry {
    // ═══════════════════════════════════════════════════════════════════════════
    // STRUCTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Data stored for a pending acknowledgement (before registration completes)
    /// @param trustedForwarder Address authorized to submit the registration transaction
    /// @param startBlock Block number when grace period ends and registration can begin
    /// @param expiryBlock Block number after which the registration window closes
    struct AcknowledgementData {
        address trustedForwarder;
        uint256 startBlock;
        uint256 expiryBlock;
    }

    /// @notice Data stored for a completed registration
    /// @param registeredAt Block number when registration was finalized
    /// @param registeredBy Address that submitted the registration (owner or forwarder)
    /// @param isSponsored True if a third party paid gas on behalf of owner
    struct RegistrationData {
        uint256 registeredAt;
        address registeredBy;
        bool isSponsored;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Thrown when the provided nonce doesn't match the expected nonce
    error InvalidNonce();

    /// @notice Thrown when the acknowledgement signature deadline has passed
    error Acknowledgement__Expired();

    /// @notice Thrown when the acknowledgement signature is invalid or signer doesn't match
    error Acknowledgement__InvalidSigner();

    /// @notice Thrown when the registration signature deadline has passed
    error Registration__SignatureExpired();

    /// @notice Thrown when the registration signature is invalid or signer doesn't match
    error Registration__InvalidSigner();

    /// @notice Thrown when msg.sender is not the authorized forwarder for this registration
    error Registration__InvalidForwarder();

    /// @notice Thrown when attempting to register after the grace period has expired
    error Registration__ForwarderExpired();

    /// @notice Thrown when attempting to register before the grace period has started
    error Registration__GracePeriodNotStarted();

    /// @notice Thrown when the wallet is already registered
    error AlreadyRegistered();

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when a wallet owner acknowledges intent to register
    /// @param owner The wallet address being registered as stolen
    /// @param forwarder The address authorized to complete the registration
    /// @param isSponsored True if forwarder is different from owner (relayed registration)
    event WalletAcknowledged(address indexed owner, address indexed forwarder, bool indexed isSponsored);

    /// @notice Emitted when a wallet registration is finalized
    /// @param owner The wallet address that was registered as stolen
    /// @param isSponsored True if registration was submitted by a third party
    event WalletRegistered(address indexed owner, bool indexed isSponsored);

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Phase 1: Submit acknowledgement of intent to register a wallet as stolen
    /// @dev Creates a trusted forwarder relationship and starts the grace period.
    ///      The owner must sign an EIP-712 message authorizing this submission.
    ///      Nonce is incremented after successful acknowledgement.
    /// @param deadline Timestamp after which the signature is no longer valid
    /// @param nonce Owner's current nonce (must match contract state)
    /// @param owner Address of the wallet being registered as stolen
    /// @param v ECDSA signature component
    /// @param r ECDSA signature component
    /// @param s ECDSA signature component
    function acknowledge(uint256 deadline, uint256 nonce, address owner, uint8 v, bytes32 r, bytes32 s) external payable;

    /// @notice Phase 2: Complete the registration after grace period
    /// @dev Must be called by the same forwarder that was authorized in acknowledge().
    ///      Must be called after grace period starts but before it expires.
    ///      Nonce is incremented after successful registration.
    ///      Forwarder data is deleted after successful registration.
    /// @param deadline Timestamp after which the signature is no longer valid
    /// @param nonce Owner's current nonce (must match contract state)
    /// @param owner Address of the wallet being registered as stolen
    /// @param v ECDSA signature component
    /// @param r ECDSA signature component
    /// @param s ECDSA signature component
    function register(uint256 deadline, uint256 nonce, address owner, uint8 v, bytes32 r, bytes32 s) external payable;

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Primary Query Interface
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Check if a wallet has completed registration as stolen
    /// @param wallet The address to query
    /// @return True if the wallet is registered as stolen
    function isRegistered(address wallet) external view returns (bool);

    /// @notice Check if a wallet has a pending acknowledgement awaiting registration
    /// @param wallet The address to query
    /// @return True if there is a pending acknowledgement for this wallet
    function isPending(address wallet) external view returns (bool);

    /// @notice Get full registration data for a registered wallet
    /// @param wallet The address to query
    /// @return data The registration data (zeroed struct if not registered)
    function getRegistration(address wallet) external view returns (RegistrationData memory data);

    /// @notice Get pending acknowledgement data for a wallet
    /// @param wallet The address to query
    /// @return data The acknowledgement data (zeroed struct if no pending acknowledgement)
    function getAcknowledgement(address wallet) external view returns (AcknowledgementData memory data);

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Frontend Compatibility
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Get the current nonce for a wallet owner
    /// @param owner The address to query
    /// @return The current nonce value
    function nonces(address owner) external view returns (uint256);

    /// @notice Generate hash struct for EIP-712 signature
    /// @dev Used by frontend to prepare typed data for signing.
    ///      SECURITY: Uses msg.sender as the owner in the hash struct. This prevents
    ///      malicious actors from creating valid signatures for wallets they don't control.
    ///      The signer MUST be the wallet owner calling this function.
    /// @param forwarder The address that will submit the transaction
    /// @param step 1 for acknowledgement, any other value for registration
    /// @return deadline The signature expiry timestamp
    /// @return hashStruct The EIP-712 hash struct to sign
    function generateHashStruct(address forwarder, uint8 step)
        external
        view
        returns (uint256 deadline, bytes32 hashStruct);

    /// @notice Get grace period timing information for a pending acknowledgement
    /// @dev Preserves return signature for frontend compatibility
    /// @param session The wallet address to query
    /// @return currentBlock Current block number
    /// @return expiryBlock Block when registration window closes
    /// @return startBlock Block when grace period ends (registration can begin)
    /// @return graceStartsAt Blocks remaining until grace period ends (0 if already passed)
    /// @return timeLeft Blocks remaining until registration expires (0 if expired)
    /// @return isExpired True if the registration window has closed
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
