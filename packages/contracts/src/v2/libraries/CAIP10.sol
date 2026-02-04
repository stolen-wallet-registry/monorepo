// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { CAIP10Evm } from "./CAIP10Evm.sol";

/// @title CAIP10
/// @author Stolen Wallet Registry Team
/// @notice Core cross-chain library for CAIP-10 identifiers and storage keys
/// @dev This library is designed for CROSS-CHAIN compatibility, not just EVM.
///      For EVM-specific convenience functions, see CAIP10Evm.sol
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
///      Cross-Chain Design:
///        All chain references use bytes32 to accommodate:
///        - EVM: numeric chain IDs (1, 8453, etc.) → hash or pad to bytes32
///        - Solana: string refs ("mainnet", "devnet") → keccak256("mainnet")
///        - Bitcoin: 32-byte genesis block hash → use directly
///        - Cosmos: string refs ("cosmoshub-4") → keccak256("cosmoshub-4")
library CAIP10 {
    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    error CAIP10__InvalidFormat();
    error CAIP10__UnsupportedNamespace();

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

    /// @notice Compute wildcard storage key for EVM wallet
    /// @dev Uses CAIP-363 wildcard: one key for all EVM chains. Delegates to CAIP10Evm.
    /// @param wallet The wallet address
    /// @return key The storage key
    function evmWalletKey(address wallet) internal pure returns (bytes32) {
        return CAIP10Evm.evmWalletKey(wallet);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CHAIN REFERENCE HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

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
    //   - EVM: keccak256("eip155:8453") or use CAIP10Evm.caip2Hash(8453)
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
            // Delegate to CAIP10Evm for EVM address parsing
            address wallet = CAIP10Evm.parseEvmAddress(caip10, addrStart);
            return evmWalletKey(wallet);
        }

        // Generic: hash the identifier portion
        bytes memory identifier = _slice(bytes(caip10), addrStart, addrLen);
        return walletKey(namespaceHash, chainRef, keccak256(identifier));
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
}
