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

    /// @notice Message type identifier for wallet registration messages
    /// @dev Future message types can use 0x02, 0x03, etc.
    bytes1 public constant MSG_TYPE_REGISTRATION = 0x01;

    /// @notice Message type identifier for transaction batch messages
    bytes1 public constant MSG_TYPE_TRANSACTION_BATCH = 0x02;

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

    /// @notice Cross-chain transaction batch payload sent from spoke to hub
    /// @dev Includes full transaction hashes and chain IDs for hub-side event emission.
    ///      All batch data is forwarded to enable single-indexer architecture on hub.
    struct TransactionBatchPayload {
        bytes32 merkleRoot; // Root of the Merkle tree (leaf = keccak256(txHash || chainId))
        address reporter; // Address that submitted the registration
        bytes32 reportedChainId; // CAIP-2 chain ID where transactions occurred
        bytes32 sourceChainId; // CAIP-2 chain ID where registration was submitted
        uint32 transactionCount; // Number of transactions in the batch
        bool isSponsored; // True if third party paid gas
        uint256 nonce; // Registration nonce (for replay protection)
        uint64 timestamp; // Block timestamp on spoke
        bytes32[] transactionHashes; // Full list of transaction hashes
        bytes32[] chainIds; // Parallel array of CAIP-2 chain IDs per transaction
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

    /// @notice Encode transaction batch payload for cross-chain transport
    /// @dev Includes full transaction data for hub-side event emission.
    ///      Uses abi.encode which handles dynamic arrays automatically.
    /// @param payload The transaction batch data to encode
    /// @return Encoded bytes suitable for bridge transmission
    function encodeTransactionBatch(TransactionBatchPayload memory payload) internal pure returns (bytes memory) {
        return abi.encode(
            MESSAGE_VERSION,
            MSG_TYPE_TRANSACTION_BATCH,
            payload.merkleRoot,
            payload.reporter,
            payload.reportedChainId,
            payload.sourceChainId,
            payload.transactionCount,
            payload.isSponsored,
            payload.nonce,
            payload.timestamp,
            payload.transactionHashes,
            payload.chainIds
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

    /// @notice Decode transaction batch payload from cross-chain message
    /// @dev Validates version and message type. Uses full decode since dynamic arrays
    ///      have relative offsets that must be preserved.
    /// @param data Encoded message bytes from bridge
    /// @return payload The decoded transaction batch data
    function decodeTransactionBatch(bytes calldata data)
        internal
        pure
        returns (TransactionBatchPayload memory payload)
    {
        // Minimum length check (header + fixed fields + array offset pointers)
        // Version (32) + Type (32) + 8 fixed fields (256) + 2 array offsets (64) = 384 bytes minimum
        if (data.length < 384) revert CrossChainMessage__InvalidMessageLength();

        // Decode the full structure including header
        // We must decode everything together because dynamic arrays have relative offsets
        (
            uint8 version,
            bytes1 msgType,
            bytes32 merkleRoot,
            address reporter,
            bytes32 reportedChainId,
            bytes32 sourceChainId,
            uint32 transactionCount,
            bool isSponsored,
            uint256 nonce,
            uint64 timestamp,
            bytes32[] memory transactionHashes,
            bytes32[] memory chainIds
        ) = abi.decode(
            data,
            (uint8, bytes1, bytes32, address, bytes32, bytes32, uint32, bool, uint256, uint64, bytes32[], bytes32[])
        );

        // Validate header
        if (version != MESSAGE_VERSION) revert CrossChainMessage__UnsupportedVersion();
        if (msgType != MSG_TYPE_TRANSACTION_BATCH) revert CrossChainMessage__InvalidMessageType();

        // Build payload struct
        payload = TransactionBatchPayload({
            merkleRoot: merkleRoot,
            reporter: reporter,
            reportedChainId: reportedChainId,
            sourceChainId: sourceChainId,
            transactionCount: transactionCount,
            isSponsored: isSponsored,
            nonce: nonce,
            timestamp: timestamp,
            transactionHashes: transactionHashes,
            chainIds: chainIds
        });
    }

    /// @notice Extract message type from encoded message without full decoding
    /// @dev Useful for routing messages to appropriate handlers
    /// @param data Encoded message bytes
    /// @return The message type byte
    function getMessageType(bytes calldata data) internal pure returns (bytes1) {
        if (data.length < 64) revert CrossChainMessage__InvalidMessageLength();
        return abi.decode(data[32:64], (bytes1));
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
