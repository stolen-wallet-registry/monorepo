// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CrossChainMessage
/// @author Stolen Wallet Registry Team
/// @notice Library for encoding/decoding cross-chain registration messages
/// @dev Uses simple chainId + address for EVM chains. Full CAIP-10 support deferred.
///      Message format is versioned for future compatibility.
library CrossChainMessage {
    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Message type identifier for registration messages
    /// @dev Future message types can use 0x02, 0x03, etc.
    bytes1 public constant MSG_TYPE_REGISTRATION = 0x01;

    /// @notice Current message format version
    uint8 public constant MESSAGE_VERSION = 1;

    // ═══════════════════════════════════════════════════════════════════════════
    // STRUCTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Cross-chain registration payload sent from spoke to hub
    /// @dev Sent via bridge after successful two-phase registration on spoke.
    ///      Note: registrationMethod removed for privacy (would reveal multi-wallet ownership).
    struct RegistrationPayload {
        // === Identity ===
        address wallet; // The wallet being registered as stolen
        uint32 sourceChainId; // EIP-155 chain ID where registration originated
        // === Registration context ===
        bool isSponsored; // True if third party paid gas
        // === Verification ===
        uint256 nonce; // Registration nonce (for replay protection)
        uint64 timestamp; // Block timestamp on spoke
        bytes32 registrationHash; // Hash of signed EIP-712 data for verification
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Thrown when message type is not MSG_TYPE_REGISTRATION
    error CrossChainMessage__InvalidMessageType();

    /// @notice Thrown when message version is not supported
    error CrossChainMessage__UnsupportedVersion();

    /// @notice Thrown when message data is too short (must be at least 256 bytes)
    error CrossChainMessage__InvalidMessageLength();

    // ═══════════════════════════════════════════════════════════════════════════
    // ENCODING
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Encode registration payload for cross-chain transport
    /// @dev Prepends version and message type for forward compatibility
    /// @param payload The registration data to encode
    /// @return Encoded bytes suitable for bridge transmission
    function encodeRegistration(RegistrationPayload memory payload) internal pure returns (bytes memory) {
        return abi.encode(
            MESSAGE_VERSION,
            MSG_TYPE_REGISTRATION,
            payload.wallet,
            payload.sourceChainId,
            payload.isSponsored,
            payload.nonce,
            payload.timestamp,
            payload.registrationHash
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DECODING
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Decode registration payload from cross-chain message
    /// @dev Validates length, version, and message type before decoding.
    ///      Decodes directly from calldata slices to avoid stack-too-deep.
    /// @param data Encoded message bytes from bridge
    /// @return payload The decoded registration data
    function decodeRegistration(bytes calldata data) internal pure returns (RegistrationPayload memory payload) {
        // Validate minimum length (8 fields × 32 bytes = 256 bytes)
        if (data.length < 256) revert CrossChainMessage__InvalidMessageLength();

        // Validate header first (each abi.encode slot is 32 bytes)
        uint8 version = abi.decode(data[0:32], (uint8));
        if (version != MESSAGE_VERSION) revert CrossChainMessage__UnsupportedVersion();

        bytes1 msgType = abi.decode(data[32:64], (bytes1));
        if (msgType != MSG_TYPE_REGISTRATION) revert CrossChainMessage__InvalidMessageType();

        // Decode payload fields from their respective slots
        payload.wallet = abi.decode(data[64:96], (address));
        payload.sourceChainId = abi.decode(data[96:128], (uint32));
        payload.isSponsored = abi.decode(data[128:160], (bool));
        payload.nonce = abi.decode(data[160:192], (uint256));
        payload.timestamp = abi.decode(data[192:224], (uint64));
        payload.registrationHash = abi.decode(data[224:256], (bytes32));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // UTILITIES
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Convert an address to bytes32 (for cross-chain addressing)
    /// @dev Pads address with zeros on the left
    /// @param addr The address to convert
    /// @return The address as bytes32
    function addressToBytes32(address addr) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(addr)));
    }

    /// @notice Convert bytes32 to an address
    /// @dev Takes the last 20 bytes of the bytes32
    /// @param b The bytes32 to convert
    /// @return The address (last 20 bytes)
    function bytes32ToAddress(bytes32 b) internal pure returns (address) {
        return address(uint160(uint256(b)));
    }
}
