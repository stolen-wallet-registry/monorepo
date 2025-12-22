// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IBridgeAdapter
/// @author Stolen Wallet Registry Team
/// @notice ERC-7786 aligned interface for cross-chain bridge adapters
/// @dev Provides a standardized interface for sending messages across chains.
///      Each bridge implementation (Hyperlane, CCIP, Wormhole) implements this interface.
interface IBridgeAdapter {
    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when a message is sent cross-chain
    /// @param messageId Unique identifier for tracking the message
    /// @param destinationChain Target chain domain ID
    /// @param recipient Address on destination (bytes32 for cross-VM compatibility)
    /// @param payload Encoded message data
    event MessageSent(bytes32 indexed messageId, uint32 indexed destinationChain, bytes32 recipient, bytes payload);

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Thrown when insufficient fee is provided for the bridge
    error BridgeAdapter__InsufficientFee();

    /// @notice Thrown when the destination chain is not supported
    error BridgeAdapter__UnsupportedChain();

    /// @notice Thrown when the payload exceeds maximum size
    error BridgeAdapter__PayloadTooLarge();

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Send a message to another chain
    /// @dev Implementations should validate fee payment and emit MessageSent event.
    ///      Excess fee should be refunded to msg.sender.
    /// @param destinationChain Target chain domain ID (Hyperlane domain or EIP-155 chain ID)
    /// @param recipient Address on destination (bytes32 for cross-VM compatibility)
    /// @param payload Encoded message data
    /// @return messageId Unique identifier for tracking the message
    function sendMessage(uint32 destinationChain, bytes32 recipient, bytes calldata payload)
        external
        payable
        returns (bytes32 messageId);

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Get quote for sending a message
    /// @dev Used by callers to determine how much native token to send
    /// @param destinationChain Target chain domain ID
    /// @param payload Encoded message data
    /// @return fee Required payment in native token
    function quoteMessage(uint32 destinationChain, bytes calldata payload) external view returns (uint256 fee);

    /// @notice Check if this adapter supports a destination chain
    /// @param chainId Target chain domain ID
    /// @return True if the chain is supported
    function supportsChain(uint32 chainId) external view returns (bool);

    /// @notice Get the bridge protocol name
    /// @return Human-readable name of the bridge (e.g., "Hyperlane", "CCIP", "Wormhole")
    function bridgeName() external pure returns (string memory);
}
