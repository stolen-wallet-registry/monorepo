// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISpokeRegistry
/// @author Stolen Wallet Registry Team
/// @notice Interface for spoke chain registration contracts
/// @dev Spoke registries handle local two-phase registration and send results to hub via bridge.
///      Implements the same EIP-712 signature flow as StolenWalletRegistry but sends
///      cross-chain messages instead of local storage.
interface ISpokeRegistry {
    // ═══════════════════════════════════════════════════════════════════════════
    // STRUCTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Data stored for a pending acknowledgement
    /// @param trustedForwarder Address authorized to complete the registration
    /// @param startBlock Block number when grace period ends
    /// @param expiryBlock Block number when registration window closes
    struct PendingAcknowledgement {
        address trustedForwarder;
        uint256 startBlock;
        uint256 expiryBlock;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when acknowledgement is received on spoke
    /// @param owner The wallet being registered as stolen
    /// @param forwarder The address authorized to complete registration
    /// @param isSponsored True if forwarder is different from owner
    event AcknowledgementReceived(address indexed owner, address indexed forwarder, bool indexed isSponsored);

    /// @notice Emitted when registration is sent to hub via bridge
    /// @param owner The wallet being registered as stolen
    /// @param messageId Bridge message identifier for tracking
    /// @param destinationChain Target chain domain ID (hub)
    event RegistrationSentToHub(address indexed owner, bytes32 indexed messageId, uint32 destinationChain);

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Thrown when the provided nonce doesn't match expected
    error SpokeRegistry__InvalidNonce();

    /// @notice Thrown when signature deadline has passed
    error SpokeRegistry__SignatureExpired();

    /// @notice Thrown when signature is invalid
    error SpokeRegistry__InvalidSigner();

    /// @notice Thrown when caller is not the authorized forwarder
    error SpokeRegistry__InvalidForwarder();

    /// @notice Thrown when registration window has expired
    error SpokeRegistry__ForwarderExpired();

    /// @notice Thrown when grace period hasn't started yet
    error SpokeRegistry__GracePeriodNotStarted();

    /// @notice Thrown when owner address is zero
    error SpokeRegistry__InvalidOwner();

    /// @notice Thrown when insufficient fee is provided
    error SpokeRegistry__InsufficientFee();

    /// @notice Thrown when bridge message fails
    error SpokeRegistry__BridgeFailed();

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Phase 1: Acknowledge registration intent (local validation)
    /// @dev Creates trusted forwarder relationship and starts grace period.
    ///      Same EIP-712 flow as StolenWalletRegistry.acknowledge().
    /// @param deadline Timestamp after which signature is invalid
    /// @param nonce Owner's current nonce
    /// @param owner Address of wallet being registered as stolen
    /// @param v ECDSA signature component
    /// @param r ECDSA signature component
    /// @param s ECDSA signature component
    function acknowledgeLocal(uint256 deadline, uint256 nonce, address owner, uint8 v, bytes32 r, bytes32 s)
        external
        payable;

    /// @notice Phase 2: Complete registration and send to hub
    /// @dev After grace period, validates signature and sends cross-chain message.
    ///      Requires payment of registration fee + bridge fee.
    /// @param deadline Timestamp after which signature is invalid
    /// @param nonce Owner's current nonce
    /// @param owner Address of wallet being registered as stolen
    /// @param v ECDSA signature component
    /// @param r ECDSA signature component
    /// @param s ECDSA signature component
    function registerLocal(uint256 deadline, uint256 nonce, address owner, uint8 v, bytes32 r, bytes32 s)
        external
        payable;

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Check if wallet has pending acknowledgement
    /// @param wallet The address to query
    /// @return True if there is a pending acknowledgement
    function isPending(address wallet) external view returns (bool);

    /// @notice Get acknowledgement data for a wallet
    /// @param wallet The address to query
    /// @return data The acknowledgement data
    function getAcknowledgement(address wallet) external view returns (PendingAcknowledgement memory data);

    /// @notice Get current nonce for owner
    /// @param owner The address to query
    /// @return The current nonce value
    function nonces(address owner) external view returns (uint256);

    /// @notice Quote total cost (registration fee + bridge fee)
    /// @param owner The wallet being registered (for nonce lookup)
    /// @return Total fee required in native token
    function quoteRegistration(address owner) external view returns (uint256);

    /// @notice Get the hub chain domain ID
    /// @return The Hyperlane domain ID of the hub chain (may differ from EIP-155 chain ID)
    function hubChainId() external view returns (uint32);

    /// @notice Get the hub inbox address (bytes32 for cross-chain)
    /// @return The CrossChainInbox address on the hub
    function hubInbox() external view returns (bytes32);
}
