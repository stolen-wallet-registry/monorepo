// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

/// @title CAIP10
/// @author Stolen Wallet Registry Team
/// @notice Unified cross-chain library for CAIP-10 identifiers and storage keys
/// @dev This library is designed for CROSS-CHAIN compatibility, not just EVM.
///
///      CAIP-10 format: {namespace}:{chainRef}:{identifier}
///      Examples:
///        - EVM:          "eip155:8453:0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
///        - EVM Wildcard: "eip155:_:0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb" (CAIP-363)
///        - Solana:       "solana:mainnet:7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV"
///        - Bitcoin:      "bip122:000000000019d6689c085ae165831e93:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"
///        - Cosmos:       "cosmos:cosmoshub-4:cosmos1..."
///
///      Specifications:
///        - CAIP-2 (Chain ID):  https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md
///        - CAIP-10 (Account): https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-10.md
///        - CAIP-363 (Wildcard): https://github.com/ChainAgnostic/CAIPs/blob/master/CAIPs/caip-363.md
///
///      Storage Key Strategy:
///        - WALLETS: EVM uses wildcard key (same address across all EVM chains)
///                   Other namespaces use chain-specific keys
///        - TRANSACTIONS: Always chain-specific (tx hashes are unique per chain)
///        - CONTRACTS: Always chain-specific (bytecode may differ per chain)
///
///      Why not OpenZeppelin's CAIP10/CAIP2 libraries?
///        OZ's implementation (v5.1+) provides string formatting/parsing, returning strings.
///        We need STORAGE KEYS (keccak256 hashes) for O(1) mapping lookups.
///        We also need wildcard support (CAIP-363) and cross-chain bytes32 identifiers.
///        OZ returns strings; we need hashes. Different use case entirely.
///
///      Cross-Chain Design:
///        All chain references use bytes32 to accommodate:
///        - EVM: numeric chain IDs (1, 8453, etc.) → hash or pad to bytes32
///        - Solana: string refs ("mainnet", "devnet") → keccak256("mainnet")
///        - Bitcoin: 32-byte genesis block hash → use directly
///        - Cosmos: string refs ("cosmoshub-4") → keccak256("cosmoshub-4")
library CAIP10 {
    using Strings for uint256;
    using Strings for address;

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    error CAIP10__InvalidFormat();
    error CAIP10__UnsupportedNamespace();
    error CAIP10__InvalidAddress();

    // ═══════════════════════════════════════════════════════════════════════════
    // NAMESPACE CONSTANTS (keccak256 hashes for efficient comparison)
    // ═══════════════════════════════════════════════════════════════════════════

    bytes32 internal constant NAMESPACE_EIP155 = keccak256("eip155");
    bytes32 internal constant NAMESPACE_SOLANA = keccak256("solana");
    bytes32 internal constant NAMESPACE_COSMOS = keccak256("cosmos");
    bytes32 internal constant NAMESPACE_BIP122 = keccak256("bip122");

    /// @dev Wildcard chain reference for CAIP-363 (cross-chain identity)
    bytes32 internal constant WILDCARD = keccak256("_");

    // ═══════════════════════════════════════════════════════════════════════════
    // GENERIC STORAGE KEYS (cross-chain compatible)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Compute storage key for a wallet from components
    /// @dev For EVM (eip155), uses wildcard key. Others use chain-specific.
    /// @param namespaceHash Hash of namespace (use NAMESPACE_* constants)
    /// @param chainRef Hash of chain reference (ignored for EVM wallets)
    /// @param identifier The wallet identifier as bytes32
    /// @return key The storage key
    function walletKey(bytes32 namespaceHash, bytes32 chainRef, bytes32 identifier) internal pure returns (bytes32) {
        if (namespaceHash == NAMESPACE_EIP155) {
            // EVM: wildcard key (same wallet on all EVM chains)
            return keccak256(abi.encodePacked(NAMESPACE_EIP155, WILDCARD, identifier));
        }
        // Other namespaces: chain-specific key
        return keccak256(abi.encodePacked(namespaceHash, chainRef, identifier));
    }

    /// @notice Compute storage key for a transaction
    /// @dev Always chain-specific (transactions are unique per chain)
    /// @param namespaceHash Hash of namespace
    /// @param chainRef Hash of chain reference
    /// @param txHash The transaction hash/signature as bytes32
    /// @return key The storage key
    function transactionKey(bytes32 namespaceHash, bytes32 chainRef, bytes32 txHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(namespaceHash, chainRef, txHash));
    }

    /// @notice Compute storage key for a contract
    /// @dev Always chain-specific (contracts may differ per chain)
    /// @param namespaceHash Hash of namespace
    /// @param chainRef Hash of chain reference
    /// @param contractId The contract identifier as bytes32
    /// @return key The storage key
    function contractKey(bytes32 namespaceHash, bytes32 chainRef, bytes32 contractId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(namespaceHash, chainRef, contractId));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EVM CONVENIENCE FUNCTIONS
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
        return transactionKey(NAMESPACE_EIP155, keccak256(bytes(uint256(chainId).toString())), txHash);
    }

    /// @notice Compute chain-specific storage key for EVM contract
    /// @param contractAddr The contract address
    /// @param chainId The EIP-155 chain ID
    /// @return key The storage key
    function evmContractKey(address contractAddr, uint64 chainId) internal pure returns (bytes32) {
        return contractKey(
            NAMESPACE_EIP155, keccak256(bytes(uint256(chainId).toString())), bytes32(uint256(uint160(contractAddr)))
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CHAIN REFERENCE HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Convert EVM chain ID to bytes32 chain reference hash
    /// @param chainId The EIP-155 chain ID
    /// @return hash The hashed chain reference
    function evmChainRefHash(uint64 chainId) internal pure returns (bytes32) {
        return keccak256(bytes(uint256(chainId).toString()));
    }

    /// @notice Convert string chain reference to bytes32 hash
    /// @dev Use for Solana ("mainnet"), Cosmos ("cosmoshub-4"), etc.
    /// @param chainRef The chain reference string
    /// @return hash The hashed chain reference
    function chainRefHash(string memory chainRef) internal pure returns (bytes32) {
        return keccak256(bytes(chainRef));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DIRECT STORAGE KEY FUNCTIONS (for registry interfaces)
    // ═══════════════════════════════════════════════════════════════════════════
    // These use a pre-hashed chainId (bytes32) for cross-chain compatibility.
    // The chainId should be the keccak256 hash of the CAIP-2 chain identifier:
    //   - EVM: keccak256("eip155:8453") or use caip2Hash(8453)
    //   - Solana: keccak256("solana:mainnet") or use caip2Hash("solana", "mainnet")
    //   - Bitcoin: keccak256("bip122:000000000019d6689c085ae165831e93")
    //
    // Key format: keccak256(abi.encode(identifier, chainId))
    // This is intentionally different from the generic *Key functions above which use
    // abi.encodePacked(namespace, chainRef, identifier). The direct functions use a
    // pre-combined chainId for simpler interfaces that don't separate namespace.

    /// @notice Compute storage key for a transaction
    /// @dev Key format: keccak256(abi.encode(txHash, chainId))
    /// @param txHash The transaction hash
    /// @param chainId Pre-hashed CAIP-2 chain identifier
    /// @return key The storage key
    function txStorageKey(bytes32 txHash, bytes32 chainId) internal pure returns (bytes32) {
        return keccak256(abi.encode(txHash, chainId));
    }

    /// @notice Compute storage key for a contract
    /// @dev Key format: keccak256(abi.encode(contractAddr, chainId))
    /// @param contractAddr The contract address
    /// @param chainId Pre-hashed CAIP-2 chain identifier
    /// @return key The storage key
    function contractStorageKey(address contractAddr, bytes32 chainId) internal pure returns (bytes32) {
        return keccak256(abi.encode(contractAddr, chainId));
    }

    /// @notice Compute CAIP-2 hash for an EVM chain
    /// @dev Produces keccak256("eip155:{chainId}") for use as chainId parameter
    /// @param chainId The EIP-155 chain ID (e.g., 8453 for Base)
    /// @return hash The CAIP-2 chain identifier hash
    function caip2Hash(uint64 chainId) internal pure returns (bytes32) {
        return keccak256(bytes(string(abi.encodePacked("eip155:", uint256(chainId).toString()))));
    }

    /// @notice Compute CAIP-2 hash from namespace and chain reference strings
    /// @dev Produces keccak256("{namespace}:{chainRef}")
    /// @param namespace The namespace (e.g., "solana", "bip122")
    /// @param chainRef The chain reference (e.g., "mainnet", "devnet")
    /// @return hash The CAIP-2 chain identifier hash
    function caip2Hash(string memory namespace, string memory chainRef) internal pure returns (bytes32) {
        return keccak256(bytes(string(abi.encodePacked(namespace, ":", chainRef))));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TRUNCATED CHAIN ID HASH (storage-efficient cross-blockchain support)
    // ═══════════════════════════════════════════════════════════════════════════
    // These functions produce uint64 truncated hashes for storage efficiency.
    // A full CAIP-2 hash is 32 bytes, but for storage we only need 8 bytes.
    // With 64 bits (~18 quintillion values) and only thousands of chains,
    // collision probability is effectively zero.
    //
    // Use cases:
    //   - WalletEntry.reportedChainIdHash (where incident was reported)
    //   - Any storage field that needs cross-blockchain chain identification
    //
    // The full bytes32 hash should still be emitted in EVENTS for indexers.

    /// @notice Compute truncated CAIP-2 hash for storage-efficient chain identification
    /// @dev Takes top 64 bits of keccak256(caip2String)
    /// @param caip2 CAIP-2 string (e.g., "eip155:8453", "solana:mainnet")
    /// @return Truncated 64-bit hash suitable for uint64 storage
    function truncatedChainIdHash(string memory caip2) internal pure returns (uint64) {
        return uint64(uint256(keccak256(bytes(caip2))) >> 192);
    }

    /// @notice Compute truncated chain ID hash from full bytes32 hash
    /// @dev Use when you already have the full CAIP-2 hash
    /// @param fullHash The full keccak256 hash of CAIP-2 string
    /// @return Truncated 64-bit hash
    function truncatedChainIdHash(bytes32 fullHash) internal pure returns (uint64) {
        return uint64(uint256(fullHash) >> 192);
    }

    /// @notice Compute truncated chain ID hash for EVM chain
    /// @dev Convenience function: truncatedChainIdHash("eip155:{chainId}")
    /// @param chainId The EIP-155 chain ID (e.g., 8453 for Base)
    /// @return Truncated 64-bit hash
    function truncatedEvmChainIdHash(uint64 chainId) internal pure returns (uint64) {
        return truncatedChainIdHash(string(abi.encodePacked("eip155:", uint256(chainId).toString())));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CAIP-10 STRING PARSING
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Parse CAIP-10 string into component hashes
    /// @param caip10 The CAIP-10 string (e.g., "eip155:8453:0x...")
    /// @return namespaceHash Hash of namespace
    /// @return chainRef Hash of chain reference
    /// @return addrStart Offset where identifier starts
    /// @return addrLen Length of identifier portion
    function parse(string memory caip10)
        internal
        pure
        returns (bytes32 namespaceHash, bytes32 chainRef, uint256 addrStart, uint256 addrLen)
    {
        bytes memory data = bytes(caip10);
        uint256 len = data.length;

        uint256 firstColon = _findColon(data, 0);
        if (firstColon == 0 || firstColon >= len - 1) revert CAIP10__InvalidFormat();

        uint256 secondColon = _findColon(data, firstColon + 1);
        if (secondColon == 0 || secondColon >= len - 1) revert CAIP10__InvalidFormat();

        namespaceHash = keccak256(_slice(data, 0, firstColon));
        chainRef = keccak256(_slice(data, firstColon + 1, secondColon - firstColon - 1));
        addrStart = secondColon + 1;
        addrLen = len - addrStart;
    }

    /// @notice Parse CAIP-10 string and compute wallet storage key
    /// @dev Routes to appropriate key function based on namespace
    /// @param caip10 The CAIP-10 string
    /// @return key The storage key
    function toWalletStorageKey(string memory caip10) internal pure returns (bytes32) {
        (bytes32 namespaceHash, bytes32 chainRef, uint256 addrStart, uint256 addrLen) = parse(caip10);

        if (namespaceHash == NAMESPACE_EIP155) {
            address wallet = parseEvmAddress(caip10, addrStart);
            return evmWalletKey(wallet);
        }

        // Generic: hash the identifier portion
        bytes memory identifier = _slice(bytes(caip10), addrStart, addrLen);
        return walletKey(namespaceHash, chainRef, keccak256(identifier));
    }

    /// @notice Parse EVM address from CAIP-10 string at given offset
    /// @param caip10 The full CAIP-10 string
    /// @param offset Byte offset where address starts
    /// @return wallet The parsed address
    function parseEvmAddress(string memory caip10, uint256 offset) internal pure returns (address) {
        bytes memory data = bytes(caip10);
        uint256 len = data.length;

        if (len - offset != 42) revert CAIP10__InvalidAddress();
        if (data[offset] != "0" || (data[offset + 1] != "x" && data[offset + 1] != "X")) {
            revert CAIP10__InvalidAddress();
        }

        uint160 addr = 0;
        for (uint256 i = 0; i < 40; i++) {
            uint8 b = uint8(data[offset + 2 + i]);
            uint8 val;
            if (b >= 48 && b <= 57) val = b - 48;
            else if (b >= 65 && b <= 70) val = b - 55;
            else if (b >= 97 && b <= 102) val = b - 87;
            else revert CAIP10__InvalidAddress();
            addr = addr * 16 + val;
        }
        return address(addr);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VALIDATION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Check if CAIP-10 string uses wildcard chainId
    /// @param caip10 The CAIP-10 string to check
    /// @return True if the string uses wildcard ("_") as chainId
    function hasWildcard(string memory caip10) internal pure returns (bool) {
        (, bytes32 chainRef,,) = parse(caip10);
        return chainRef == WILDCARD;
    }

    /// @notice Validate CAIP-10 string format (basic structural check)
    /// @param caip10 The CAIP-10 string to validate
    /// @return True if the string has valid structure (namespace:chainRef:identifier)
    function validate(string memory caip10) internal pure returns (bool) {
        bytes memory data = bytes(caip10);
        uint256 len = data.length;

        if (len < 5) return false;

        uint256 firstColon = _findColon(data, 0);
        if (firstColon == 0 || firstColon >= len - 1) return false;

        uint256 secondColon = _findColon(data, firstColon + 1);
        if (secondColon == 0 || secondColon >= len - 1) return false;

        if (secondColon - firstColon <= 1) return false;
        if (len - secondColon <= 1) return false;

        return true;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FORMATTING (for events/logging)
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

    function _findColon(bytes memory data, uint256 start) private pure returns (uint256) {
        for (uint256 i = start; i < data.length; i++) {
            if (data[i] == ":") return i;
        }
        return 0;
    }

    function _slice(bytes memory data, uint256 start, uint256 len) private pure returns (bytes memory) {
        bytes memory result = new bytes(len);
        for (uint256 i = 0; i < len; i++) {
            result[i] = data[start + i];
        }
        return result;
    }

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
