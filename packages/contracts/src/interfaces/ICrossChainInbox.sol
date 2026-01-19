// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ICrossChainInbox
/// @author Stolen Wallet Registry Team
/// @notice Interface for hub chain message receiver
/// @dev Receives messages from bridge adapters and routes to RegistryHub.
///      Each bridge protocol has its own inbox implementation (HyperlaneInbox, CCIPInbox, etc.)
interface ICrossChainInbox {
    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when a wallet registration message is received from a spoke chain
    /// @param sourceChain Origin chain domain ID
    /// @param wallet The wallet being registered as stolen
    /// @param messageId Bridge message identifier
    event RegistrationReceived(uint32 indexed sourceChain, address indexed wallet, bytes32 messageId);

    /// @notice Emitted when a transaction batch message is received from a spoke chain
    /// @param sourceChain Origin chain domain ID
    /// @param reporter The reporter who submitted the batch
    /// @param merkleRoot Merkle root of the transaction batch
    /// @param messageId Bridge message identifier
    event TransactionBatchReceived(
        uint32 indexed sourceChain, address indexed reporter, bytes32 indexed merkleRoot, bytes32 messageId
    );

    /// @notice Emitted when a trusted source is added or removed
    /// @param chainId Source chain domain ID
    /// @param spokeRegistry Spoke registry address (bytes32)
    /// @param trusted Whether the source is now trusted
    event TrustedSourceUpdated(uint32 indexed chainId, bytes32 indexed spokeRegistry, bool trusted);

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Thrown when message is from untrusted source
    error CrossChainInbox__UntrustedSource();

    /// @notice Thrown when caller is not the bridge endpoint
    error CrossChainInbox__OnlyBridge();

    /// @notice Thrown when message format is invalid
    error CrossChainInbox__InvalidMessage();

    /// @notice Thrown when a zero address is provided for a required parameter
    error CrossChainInbox__ZeroAddress();

    /// @notice Thrown when payload sourceChainId doesn't match Hyperlane origin domain
    error CrossChainInbox__SourceChainMismatch();

    /// @notice Thrown when message type is not recognized
    error CrossChainInbox__UnknownMessageType();

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Add or remove a trusted spoke registry
    /// @dev Only callable by owner. Each spoke chain has one trusted registry.
    /// @param chainId Source chain domain ID
    /// @param spokeRegistry Spoke registry address (bytes32 for cross-VM compatibility)
    /// @param trusted Whether to trust or untrust this source
    function setTrustedSource(uint32 chainId, bytes32 spokeRegistry, bool trusted) external;

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Check if a source chain + sender combination is trusted
    /// @param chainId Source chain domain ID
    /// @param sender Sender address on source chain (bytes32)
    /// @return True if the source is trusted
    function isTrustedSource(uint32 chainId, bytes32 sender) external view returns (bool);

    /// @notice Get the registry hub address
    /// @return The RegistryHub contract address
    function registryHub() external view returns (address);

    /// @notice Get the bridge ID for this inbox
    /// @dev BridgeId enum: 1=Hyperlane, 2=CCIP, 3=Wormhole
    /// @return The bridge identifier
    function bridgeId() external view returns (uint8);
}
