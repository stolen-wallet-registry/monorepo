// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CrossChainMessageV2
/// @author Stolen Wallet Registry Team
/// @notice Library for encoding/decoding cross-chain registration messages (V2)
/// @dev V2 uses full CAIP-10 compatible format with bytes32 identifiers for cross-blockchain support.
///      Designed to work with FraudRegistryHubV2.registerFromHub interface.
library CrossChainMessageV2 {
    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Message type identifier for wallet registration messages
    bytes1 public constant MSG_TYPE_WALLET = 0x01;

    /// @notice Message type identifier for transaction batch messages
    bytes1 public constant MSG_TYPE_TRANSACTION_BATCH = 0x02;

    /// @notice Current message format version (V2)
    uint8 public constant MESSAGE_VERSION = 2;

    // ═══════════════════════════════════════════════════════════════════════════
    // STRUCTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Cross-chain wallet registration payload (V2)
    /// @dev Matches FraudRegistryHubV2.registerFromHub parameters for direct forwarding.
    ///      Uses bytes32 identifiers for cross-blockchain compatibility.
    struct WalletRegistrationPayload {
        // === CAIP-10 Identity (cross-blockchain) ===
        bytes32 namespaceHash; // keccak256("eip155"), keccak256("solana"), etc.
        bytes32 chainRef; // Chain reference hash (ignored for EVM wallets due to wildcard)
        bytes32 identifier; // Wallet identifier (address padded to bytes32 for EVM)
        // === Registration context ===
        bytes32 reportedChainId; // Full CAIP-2 hash where incident reported
        uint64 incidentTimestamp; // When theft occurred (user-provided)
        bytes32 sourceChainId; // Full CAIP-2 hash where registration submitted
        bool isSponsored; // True if third party paid gas
        // === Verification ===
        uint256 nonce; // Registration nonce (for replay protection)
        uint64 timestamp; // Block timestamp on spoke
        bytes32 registrationHash; // Hash of signed EIP-712 data
    }

    /// @notice Cross-chain transaction batch payload (V2)
    /// @dev Includes full transaction hashes for hub-side direct storage.
    ///      dataHash = keccak256(abi.encode(transactionHashes, chainIds))
    ///      Used for signature verification - binds signature to exact data.
    struct TransactionBatchPayload {
        bytes32 dataHash; // Hash of (txHashes, chainIds) - signature commitment
        address reporter; // Address that submitted the registration
        bytes32 reportedChainId; // CAIP-2 chain ID where transactions occurred
        bytes32 sourceChainId; // CAIP-2 chain ID where registration submitted
        uint32 transactionCount; // Number of transactions in batch
        bool isSponsored; // True if third party paid gas
        uint256 nonce; // Registration nonce
        uint64 timestamp; // Block timestamp on spoke
        bytes32[] transactionHashes; // Full list of transaction hashes
        bytes32[] chainIds; // Parallel array of CAIP-2 chain IDs per tx
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    error CrossChainMessageV2__InvalidMessageType();
    error CrossChainMessageV2__UnsupportedVersion();
    error CrossChainMessageV2__InvalidMessageLength();
    error CrossChainMessageV2__BatchSizeMismatch();

    // ═══════════════════════════════════════════════════════════════════════════
    // ENCODING
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Encode wallet registration payload for cross-chain transport
    /// @param payload The registration data to encode
    /// @return Encoded bytes suitable for bridge transmission
    function encodeWalletRegistration(WalletRegistrationPayload memory payload) internal pure returns (bytes memory) {
        return abi.encode(
            MESSAGE_VERSION,
            MSG_TYPE_WALLET,
            payload.namespaceHash,
            payload.chainRef,
            payload.identifier,
            payload.reportedChainId,
            payload.incidentTimestamp,
            payload.sourceChainId,
            payload.isSponsored,
            payload.nonce,
            payload.timestamp,
            payload.registrationHash
        );
    }

    /// @notice Encode transaction batch payload for cross-chain transport
    /// @param payload The transaction batch data to encode
    /// @return Encoded bytes suitable for bridge transmission
    function encodeTransactionBatch(TransactionBatchPayload memory payload) internal pure returns (bytes memory) {
        return abi.encode(
            MESSAGE_VERSION,
            MSG_TYPE_TRANSACTION_BATCH,
            payload.dataHash,
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

    /// @notice Decode wallet registration payload from cross-chain message
    /// @param data Encoded message bytes from bridge
    /// @return payload The decoded registration data
    function decodeWalletRegistration(bytes calldata data)
        internal
        pure
        returns (WalletRegistrationPayload memory payload)
    {
        // Validate minimum length (12 fields × 32 bytes = 384 bytes)
        if (data.length < 384) revert CrossChainMessageV2__InvalidMessageLength();

        // Validate header
        uint8 version = abi.decode(data[0:32], (uint8));
        if (version != MESSAGE_VERSION) revert CrossChainMessageV2__UnsupportedVersion();

        bytes1 msgType = abi.decode(data[32:64], (bytes1));
        if (msgType != MSG_TYPE_WALLET) revert CrossChainMessageV2__InvalidMessageType();

        // Decode payload fields from their respective slots
        payload.namespaceHash = abi.decode(data[64:96], (bytes32));
        payload.chainRef = abi.decode(data[96:128], (bytes32));
        payload.identifier = abi.decode(data[128:160], (bytes32));
        payload.reportedChainId = abi.decode(data[160:192], (bytes32));
        payload.incidentTimestamp = abi.decode(data[192:224], (uint64));
        payload.sourceChainId = abi.decode(data[224:256], (bytes32));
        payload.isSponsored = abi.decode(data[256:288], (bool));
        payload.nonce = abi.decode(data[288:320], (uint256));
        payload.timestamp = abi.decode(data[320:352], (uint64));
        payload.registrationHash = abi.decode(data[352:384], (bytes32));
    }

    /// @notice Decode transaction batch payload from cross-chain message
    /// @param data Encoded message bytes from bridge
    /// @return payload The decoded transaction batch data
    function decodeTransactionBatch(bytes calldata data)
        internal
        pure
        returns (TransactionBatchPayload memory payload)
    {
        // Minimum length check
        if (data.length < 384) revert CrossChainMessageV2__InvalidMessageLength();

        // Decode everything together (dynamic arrays need relative offsets)
        (
            uint8 version,
            bytes1 msgType,
            bytes32 dataHash,
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
        if (version != MESSAGE_VERSION) revert CrossChainMessageV2__UnsupportedVersion();
        if (msgType != MSG_TYPE_TRANSACTION_BATCH) revert CrossChainMessageV2__InvalidMessageType();

        // Validate batch size consistency
        if (transactionCount != transactionHashes.length || transactionCount != chainIds.length) {
            revert CrossChainMessageV2__BatchSizeMismatch();
        }

        payload = TransactionBatchPayload({
            dataHash: dataHash,
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
    /// @param data Encoded message bytes
    /// @return The message type byte
    function getMessageType(bytes calldata data) internal pure returns (bytes1) {
        if (data.length < 64) revert CrossChainMessageV2__InvalidMessageLength();
        return abi.decode(data[32:64], (bytes1));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // UTILITIES
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Convert an address to bytes32 (for cross-chain addressing)
    /// @param addr The address to convert
    /// @return The address as bytes32 (right-padded)
    function addressToBytes32(address addr) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(addr)));
    }

    /// @notice Convert bytes32 to an address
    /// @param b The bytes32 value to convert
    /// @return The address extracted from the lower 160 bits
    function bytes32ToAddress(bytes32 b) internal pure returns (address) {
        return address(uint160(uint256(b)));
    }
}
