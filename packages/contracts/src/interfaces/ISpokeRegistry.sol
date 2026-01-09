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
    /// @dev Renamed from PendingAcknowledgement to match StolenWalletRegistry for frontend compatibility
    /// @param trustedForwarder Address authorized to complete the registration
    /// @param startBlock Block number when grace period ends
    /// @param expiryBlock Block number when registration window closes
    struct AcknowledgementData {
        address trustedForwarder;
        uint256 startBlock;
        uint256 expiryBlock;
    }

    /// @notice Breakdown of fees for cross-chain registration
    /// @dev Bridge-agnostic: bridgeName comes from IBridgeAdapter.bridgeName()
    /// @param bridgeFee Cross-chain message fee from the configured bridge adapter
    /// @param registrationFee Protocol fee from FeeManager (0 if no fee manager)
    /// @param total Combined fee required (bridgeFee + registrationFee)
    /// @param bridgeName Human-readable name of the bridge ("Hyperlane", "CCIP", "Wormhole", etc.)
    struct FeeBreakdown {
        uint256 bridgeFee;
        uint256 registrationFee;
        uint256 total;
        string bridgeName;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when acknowledgement is received on spoke
    /// @dev Renamed from AcknowledgementReceived to match StolenWalletRegistry for frontend compatibility
    /// @param owner The wallet being registered as stolen
    /// @param forwarder The address authorized to complete registration
    /// @param isSponsored True if forwarder is different from owner
    event WalletAcknowledged(address indexed owner, address indexed forwarder, bool indexed isSponsored);

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

    /// @notice Thrown when timing configuration is invalid (graceBlocks=0, deadlineBlocks=0, or deadline <= grace)
    error SpokeRegistry__InvalidTimingConfig();

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
    function getAcknowledgement(address wallet) external view returns (AcknowledgementData memory data);

    /// @notice Get current nonce for owner
    /// @param owner The address to query
    /// @return The current nonce value
    function nonces(address owner) external view returns (uint256);

    /// @notice Quote total cost (registration fee + bridge fee)
    /// @param owner The wallet being registered (for nonce lookup)
    /// @return Total fee required in native token
    function quoteRegistration(address owner) external view returns (uint256);

    /// @notice Get detailed fee breakdown for registration
    /// @dev Returns separate line items for UI display with bridge identification.
    ///      Bridge-agnostic: works with any adapter implementing IBridgeAdapter.
    /// @param owner The wallet being registered (for nonce lookup in payload sizing)
    /// @return breakdown Structured fee data including bridge name
    function quoteFeeBreakdown(address owner) external view returns (FeeBreakdown memory breakdown);

    /// @notice Get the hub chain domain ID
    /// @return The Hyperlane domain ID of the hub chain (may differ from EIP-155 chain ID)
    function hubChainId() external view returns (uint32);

    /// @notice Get the hub inbox address (bytes32 for cross-chain)
    /// @return The CrossChainInbox address on the hub
    function hubInbox() external view returns (bytes32);

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Frontend Compatibility (matches StolenWalletRegistry)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Generate hash struct for EIP-712 signature
    /// @dev Matches StolenWalletRegistry.generateHashStruct() for frontend compatibility.
    ///      SECURITY: Uses msg.sender as the owner in the hash struct.
    /// @param forwarder The address that will submit the transaction
    /// @param step 1 for acknowledgement, any other value for registration
    /// @return deadline The signature expiry timestamp
    /// @return hashStruct The EIP-712 hash struct to sign
    function generateHashStruct(address forwarder, uint8 step)
        external
        view
        returns (uint256 deadline, bytes32 hashStruct);

    /// @notice Get grace period timing information for a pending acknowledgement
    /// @dev Matches StolenWalletRegistry.getDeadlines() for frontend compatibility
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
