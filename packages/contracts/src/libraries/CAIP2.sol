// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { CAIP2 as OzCAIP2 } from "@openzeppelin/contracts/utils/CAIP2.sol";

/// @title CAIP2
/// @author Stolen Wallet Registry Team
/// @notice Library for working with CAIP-2 chain identifiers as bytes32
/// @dev Wraps OpenZeppelin's CAIP2 library and provides bytes32 hashes for efficient on-chain storage.
///      CAIP-2 format: {namespace}:{reference} e.g., "eip155:8453" for Base
///
/// CAIP-2 Specification: https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md
///
/// Common identifiers:
/// - EVM chains: "eip155:{chainId}" where chainId is the EIP-155 chain ID
/// - Solana: "solana:mainnet", "solana:devnet", "solana:testnet"
/// - Bitcoin: "bip122:{genesisHash}" where genesisHash identifies the network
library CAIP2 {
    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Thrown when the chain ID is zero
    error InvalidChainId();

    // ═══════════════════════════════════════════════════════════════════════════
    // FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Get the CAIP-2 identifier for the current chain as bytes32
    /// @dev Uses OpenZeppelin's CAIP2.local() and hashes the result
    /// @return The CAIP-2 identifier for block.chainid as keccak256 hash
    function current() internal view returns (bytes32) {
        return keccak256(bytes(OzCAIP2.local()));
    }

    /// @notice Convert an EIP-155 chain ID to a CAIP-2 identifier (bytes32)
    /// @dev Constructs "eip155:{chainId}" string using OZ utils and hashes it
    /// @param chainId The EIP-155 chain ID (e.g., 8453 for Base)
    /// @return The CAIP-2 identifier as keccak256 hash
    function fromEIP155(uint256 chainId) internal pure returns (bytes32) {
        if (chainId == 0) revert InvalidChainId();
        return keccak256(bytes(OzCAIP2.format("eip155", _uint256ToString(chainId))));
    }

    /// @notice Get CAIP-2 string for the current chain (for events/logging)
    /// @return The CAIP-2 string (e.g., "eip155:8453")
    function localString() internal view returns (string memory) {
        return OzCAIP2.local();
    }

    /// @notice Check if two CAIP-2 identifiers are equal
    /// @param a First identifier
    /// @param b Second identifier
    /// @return True if equal
    function equals(bytes32 a, bytes32 b) internal pure returns (bool) {
        return a == b;
    }

    /// @notice Check if a CAIP-2 identifier represents the current chain
    /// @param identifier The CAIP-2 identifier to check
    /// @return True if identifier matches current chain
    function isCurrent(bytes32 identifier) internal view returns (bool) {
        return equals(identifier, current());
    }

    /// @notice Check if an identifier is zero (null/empty)
    /// @param identifier The identifier to check
    /// @return True if zero
    function isNull(bytes32 identifier) internal pure returns (bool) {
        return identifier == bytes32(0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Convert uint256 to string (for constructing CAIP-2 strings)
    /// @dev Simple implementation for pure function context
    /// @param value The number to convert
    /// @return The string representation
    function _uint256ToString(uint256 value) private pure returns (string memory) {
        if (value == 0) {
            return "0";
        }

        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }

        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            // Safe cast: (48 + (value % 10)) is always 48-57, fits in uint8
            // forge-lint: disable-next-line unsafe-typecast
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }

        return string(buffer);
    }
}
