// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
import { CAIP10 } from "./CAIP10.sol";

/// @title CAIP10Evm
/// @author Stolen Wallet Registry Team
/// @notice EVM-specific CAIP-10 utilities for storage keys and formatting
/// @dev Extracted from CAIP10.sol for cleaner separation of concerns.
///      Contains all EVM-specific functions that depend on address type,
///      uint64 chain IDs, or EIP-155 formatting.
///
///      For generic cross-chain functions, see CAIP10.sol
library CAIP10Evm {
    using Strings for uint256;
    using Strings for address;

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    error CAIP10Evm__InvalidAddress();

    // ═══════════════════════════════════════════════════════════════════════════
    // EVM STORAGE KEY FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Compute wildcard storage key for EVM wallet
    /// @dev Uses CAIP-363 wildcard: one key for all EVM chains
    /// @param wallet The wallet address
    /// @return key The storage key
    function evmWalletKey(address wallet) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("eip155:_:", wallet));
    }

    /// @notice Compute chain-specific storage key for EVM transaction
    /// @param txHash The transaction hash
    /// @param chainId The EIP-155 chain ID
    /// @return key The storage key
    function evmTransactionKey(bytes32 txHash, uint64 chainId) internal pure returns (bytes32) {
        return CAIP10.transactionKey(CAIP10.NAMESPACE_EIP155, keccak256(bytes(uint256(chainId).toString())), txHash);
    }

    /// @notice Compute chain-specific storage key for EVM contract
    /// @param contractAddr The contract address
    /// @param chainId The EIP-155 chain ID
    /// @return key The storage key
    function evmContractKey(address contractAddr, uint64 chainId) internal pure returns (bytes32) {
        return CAIP10.contractKey(
            CAIP10.NAMESPACE_EIP155,
            keccak256(bytes(uint256(chainId).toString())),
            bytes32(uint256(uint160(contractAddr)))
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EVM CHAIN REFERENCE HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Convert EVM chain ID to bytes32 chain reference hash
    /// @param chainId The EIP-155 chain ID
    /// @return hash The hashed chain reference
    function evmChainRefHash(uint64 chainId) internal pure returns (bytes32) {
        return keccak256(bytes(uint256(chainId).toString()));
    }

    /// @notice Compute CAIP-2 hash for an EVM chain
    /// @dev Produces keccak256("eip155:{chainId}") for use as chainId parameter
    /// @param chainId The EIP-155 chain ID (e.g., 8453 for Base)
    /// @return hash The CAIP-2 chain identifier hash
    function caip2Hash(uint64 chainId) internal pure returns (bytes32) {
        return keccak256(bytes(string(abi.encodePacked("eip155:", uint256(chainId).toString()))));
    }

    /// @notice Compute truncated chain ID hash for EVM chain
    /// @dev Convenience function: truncatedChainIdHash("eip155:{chainId}")
    /// @param chainId The EIP-155 chain ID (e.g., 8453 for Base)
    /// @return Truncated 64-bit hash
    function truncatedEvmChainIdHash(uint64 chainId) internal pure returns (uint64) {
        return CAIP10.truncatedChainIdHash(string(abi.encodePacked("eip155:", uint256(chainId).toString())));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EVM ADDRESS PARSING
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Parse EVM address from CAIP-10 string at given offset
    /// @dev Uses OpenZeppelin's Strings.parseAddress for validation
    /// @param caip10 The full CAIP-10 string
    /// @param offset Byte offset where address starts
    /// @return wallet The parsed address
    function parseEvmAddress(string memory caip10, uint256 offset) internal pure returns (address) {
        bytes memory data = bytes(caip10);
        uint256 len = data.length;

        // Guard against underflow: offset must not exceed length
        if (offset > len) revert CAIP10Evm__InvalidAddress();

        // Validate we have exactly 42 characters (0x + 40 hex)
        if (len - offset != 42) revert CAIP10Evm__InvalidAddress();

        // Use OZ's parseAddress which handles 0x prefix and hex validation
        return Strings.parseAddress(caip10, offset, len);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HEX STRING PARSING
    // ═══════════════════════════════════════════════════════════════════════════

    error CAIP10Evm__InvalidHexChar();

    /// @notice Parse a hex-encoded bytes32 from a string at a given offset
    /// @dev Handles both "0x"-prefixed (66 chars) and raw (64 chars) hex strings
    /// @param str The source string containing hex data
    /// @param offset Byte offset where the hex string starts
    /// @param len Length of the hex string (64 or 66 with 0x prefix)
    /// @return result The decoded bytes32 value
    function parseHexToBytes32(string memory str, uint256 offset, uint256 len) internal pure returns (bytes32 result) {
        bytes memory data = bytes(str);
        uint256 start = offset;
        if (len >= 2 && data[offset] == "0" && (data[offset + 1] == "x" || data[offset + 1] == "X")) {
            start += 2;
        }
        for (uint256 i = 0; i < 32; i++) {
            uint8 hi = _hexCharToNibble(data[start + i * 2]);
            uint8 lo = _hexCharToNibble(data[start + i * 2 + 1]);
            result |= bytes32(bytes1(hi << 4 | lo)) >> (i * 8);
        }
    }

    /// @dev Convert a single hex character to its numeric value
    function _hexCharToNibble(bytes1 c) private pure returns (uint8) {
        if (c >= "0" && c <= "9") return uint8(c) - uint8(bytes1("0"));
        if (c >= "a" && c <= "f") return uint8(c) - uint8(bytes1("a")) + 10;
        if (c >= "A" && c <= "F") return uint8(c) - uint8(bytes1("A")) + 10;
        revert CAIP10Evm__InvalidHexChar();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EVM FORMATTING (for events/logging)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Format EVM address to CAIP-10 wildcard string (checksummed)
    /// @param wallet The EVM wallet address
    /// @return The CAIP-10 string in format "eip155:_:0xChecksum..."
    function formatEvmWildcard(address wallet) internal pure returns (string memory) {
        return string(abi.encodePacked("eip155:_:", wallet.toChecksumHexString()));
    }

    /// @notice Format EVM address to chain-specific CAIP-10 string (checksummed)
    /// @param wallet The EVM wallet address
    /// @param chainId The EIP-155 chain ID
    /// @return The CAIP-10 string in format "eip155:{chainId}:0xChecksum..."
    function formatEvm(address wallet, uint64 chainId) internal pure returns (string memory) {
        return string(abi.encodePacked("eip155:", uint256(chainId).toString(), ":", wallet.toChecksumHexString()));
    }

    /// @notice Format EVM address to CAIP-10 wildcard string (lowercase)
    /// @param wallet The EVM wallet address
    /// @return The CAIP-10 string in format "eip155:_:0xlowercase..."
    function formatEvmWildcardLower(address wallet) internal pure returns (string memory) {
        return string(abi.encodePacked("eip155:_:", _addressToLowerHex(wallet)));
    }

    /// @notice Format EVM address to chain-specific CAIP-10 string (lowercase)
    /// @param wallet The EVM wallet address
    /// @param chainId The EIP-155 chain ID
    /// @return The CAIP-10 string in format "eip155:{chainId}:0xlowercase..."
    function formatEvmLower(address wallet, uint64 chainId) internal pure returns (string memory) {
        return string(abi.encodePacked("eip155:", uint256(chainId).toString(), ":", _addressToLowerHex(wallet)));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    function _addressToLowerHex(address addr) private pure returns (string memory) {
        bytes memory buffer = new bytes(42);
        buffer[0] = "0";
        buffer[1] = "x";
        bytes memory alphabet = "0123456789abcdef";
        uint160 value = uint160(addr);
        for (uint256 i = 41; i > 1; i--) {
            buffer[i] = alphabet[value & 0xf];
            value >>= 4;
        }
        return string(buffer);
    }
}
