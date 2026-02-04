// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { CAIP10 } from "../../src/v2/libraries/CAIP10.sol";
import { CAIP10Evm } from "../../src/v2/libraries/CAIP10Evm.sol";

contract CAIP10Wrapper {
    function parse(string memory caip10) external pure returns (bytes32, bytes32, uint256, uint256) {
        return CAIP10.parse(caip10);
    }

    function parseEvmAddress(string memory caip10, uint256 offset) external pure returns (address) {
        return CAIP10Evm.parseEvmAddress(caip10, offset);
    }

    function toWalletStorageKey(string memory caip10) external pure returns (bytes32) {
        return CAIP10.toWalletStorageKey(caip10);
    }
}

/// @title CAIP10Test
/// @notice Tests for unified cross-chain CAIP-10 library
contract CAIP10Test is Test {
    CAIP10Wrapper wrapper;

    function setUp() public {
        wrapper = new CAIP10Wrapper();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GENERIC STORAGE KEY TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_WalletKey_EvmUsesWildcard() public pure {
        bytes32 identifier = bytes32(uint256(uint160(0x742d35cc6634c0532925A3b844Bc9e7595f0ABcd)));

        // EVM should use wildcard (chainRefHash ignored)
        bytes32 key1 = CAIP10.walletKey(CAIP10.NAMESPACE_EIP155, keccak256("8453"), identifier);
        bytes32 key2 = CAIP10.walletKey(CAIP10.NAMESPACE_EIP155, keccak256("1"), identifier);

        assertEq(key1, key2, "EVM wallet keys should be same regardless of chain");
    }

    function test_WalletKey_NonEvmUsesChainSpecific() public pure {
        bytes32 identifier = keccak256("7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV");

        bytes32 keyMainnet = CAIP10.walletKey(CAIP10.NAMESPACE_SOLANA, keccak256("mainnet"), identifier);
        bytes32 keyDevnet = CAIP10.walletKey(CAIP10.NAMESPACE_SOLANA, keccak256("devnet"), identifier);

        assertTrue(keyMainnet != keyDevnet, "Solana wallet keys should differ by chain");
    }

    function test_TransactionKey_AlwaysChainSpecific() public pure {
        bytes32 txHash = keccak256("test_tx");

        bytes32 keyBase = CAIP10.transactionKey(CAIP10.NAMESPACE_EIP155, keccak256("8453"), txHash);
        bytes32 keyMainnet = CAIP10.transactionKey(CAIP10.NAMESPACE_EIP155, keccak256("1"), txHash);

        assertTrue(keyBase != keyMainnet, "Transaction keys should differ by chain");
    }

    function test_ContractKey_AlwaysChainSpecific() public pure {
        bytes32 contractId = bytes32(uint256(uint160(0x742d35cc6634c0532925A3b844Bc9e7595f0ABcd)));

        bytes32 keyBase = CAIP10.contractKey(CAIP10.NAMESPACE_EIP155, keccak256("8453"), contractId);
        bytes32 keyMainnet = CAIP10.contractKey(CAIP10.NAMESPACE_EIP155, keccak256("1"), contractId);

        assertTrue(keyBase != keyMainnet, "Contract keys should differ by chain");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EVM CONVENIENCE FUNCTION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_EvmWalletKey_Format() public pure {
        address wallet = 0x742d35cc6634c0532925A3b844Bc9e7595f0ABcd;
        bytes32 key = CAIP10.evmWalletKey(wallet);
        bytes32 expected = keccak256(abi.encodePacked("eip155:_:", wallet));
        assertEq(key, expected);
    }

    function test_EvmWalletKey_SameAcrossChains() public pure {
        address wallet = 0x742d35cc6634c0532925A3b844Bc9e7595f0ABcd;
        bytes32 key1 = CAIP10.evmWalletKey(wallet);
        bytes32 key2 = CAIP10.evmWalletKey(wallet);
        assertEq(key1, key2);
    }

    function test_EvmTransactionKey_ChainSpecific() public pure {
        bytes32 txHash = keccak256("test_tx");
        bytes32 keyBase = CAIP10Evm.evmTransactionKey(txHash, 8453);
        bytes32 keyOptimism = CAIP10Evm.evmTransactionKey(txHash, 10);
        assertTrue(keyBase != keyOptimism);
    }

    function test_EvmContractKey_ChainSpecific() public pure {
        address contractAddr = 0x742d35cc6634c0532925A3b844Bc9e7595f0ABcd;
        bytes32 keyBase = CAIP10Evm.evmContractKey(contractAddr, 8453);
        bytes32 keyOptimism = CAIP10Evm.evmContractKey(contractAddr, 10);
        assertTrue(keyBase != keyOptimism);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CHAIN REFERENCE HELPER TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_EvmChainRefHash() public pure {
        bytes32 hash = CAIP10Evm.evmChainRefHash(8453);
        assertEq(hash, keccak256("8453"));
    }

    function test_ChainRefHash_String() public pure {
        bytes32 hash = CAIP10.chainRefHash("mainnet");
        assertEq(hash, keccak256("mainnet"));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PARSING TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Parse_ValidEvm() public pure {
        string memory caip10 = "eip155:8453:0x742d35cc6634c0532925A3b844Bc9e7595f0ABcd";
        (bytes32 namespaceHash, bytes32 chainRef, uint256 addrStart, uint256 addrLen) = CAIP10.parse(caip10);

        assertEq(namespaceHash, CAIP10.NAMESPACE_EIP155);
        assertEq(chainRef, keccak256("8453"));
        assertEq(addrStart, 12);
        assertEq(addrLen, 42);
    }

    function test_Parse_ValidSolana() public pure {
        string memory caip10 = "solana:mainnet:7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV";
        (bytes32 namespaceHash, bytes32 chainRef,,) = CAIP10.parse(caip10);

        assertEq(namespaceHash, CAIP10.NAMESPACE_SOLANA);
        assertEq(chainRef, keccak256("mainnet"));
    }

    function test_Parse_Wildcard() public pure {
        string memory caip10 = "eip155:_:0x742d35cc6634c0532925A3b844Bc9e7595f0ABcd";
        (, bytes32 chainRef,,) = CAIP10.parse(caip10);
        assertEq(chainRef, CAIP10.WILDCARD);
    }

    function test_Parse_RevertsOnNoColons() public {
        vm.expectRevert(CAIP10.CAIP10__InvalidFormat.selector);
        wrapper.parse("invalid_no_colons");
    }

    function test_Parse_RevertsOnSingleColon() public {
        vm.expectRevert(CAIP10.CAIP10__InvalidFormat.selector);
        wrapper.parse("eip155:missing_address");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WALLET STORAGE KEY FROM STRING TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_ToWalletStorageKey_EvmUsesWildcard() public pure {
        string memory caip10Specific = "eip155:8453:0x742d35cc6634c0532925A3b844Bc9e7595f0ABcd";
        string memory caip10Wildcard = "eip155:_:0x742d35cc6634c0532925A3b844Bc9e7595f0ABcd";

        bytes32 keySpecific = CAIP10.toWalletStorageKey(caip10Specific);
        bytes32 keyWildcard = CAIP10.toWalletStorageKey(caip10Wildcard);

        assertEq(keySpecific, keyWildcard, "Both should use wildcard key");

        address wallet = 0x742d35cc6634c0532925A3b844Bc9e7595f0ABcd;
        assertEq(keySpecific, CAIP10.evmWalletKey(wallet), "Should match direct wallet key");
    }

    function test_ToWalletStorageKey_SolanaChainSpecific() public pure {
        string memory mainnet = "solana:mainnet:7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV";
        string memory devnet = "solana:devnet:7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV";

        bytes32 keyMainnet = CAIP10.toWalletStorageKey(mainnet);
        bytes32 keyDevnet = CAIP10.toWalletStorageKey(devnet);

        assertTrue(keyMainnet != keyDevnet, "Solana keys should differ by chain");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADDRESS PARSING TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_ParseEvmAddress_Valid() public pure {
        string memory caip10 = "eip155:8453:0x742d35cc6634c0532925a3b844bc9e7595f0abcd";
        address wallet = CAIP10Evm.parseEvmAddress(caip10, 12);
        assertEq(wallet, 0x742d35cc6634c0532925A3b844Bc9e7595f0ABcd);
    }

    function test_ParseEvmAddress_RevertsWithoutPrefix() public {
        vm.expectRevert(CAIP10Evm.CAIP10Evm__InvalidAddress.selector);
        wrapper.parseEvmAddress("eip155:8453:742d35cc6634c0532925a3b844bc9e7595f0abcd", 12);
    }

    function test_ParseEvmAddress_RevertsOnShort() public {
        vm.expectRevert(CAIP10Evm.CAIP10Evm__InvalidAddress.selector);
        wrapper.parseEvmAddress("eip155:8453:0x742d35", 12);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VALIDATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_HasWildcard_True() public pure {
        assertTrue(CAIP10.hasWildcard("eip155:_:0x742d35cc6634c0532925A3b844Bc9e7595f0ABcd"));
    }

    function test_HasWildcard_False() public pure {
        assertFalse(CAIP10.hasWildcard("eip155:8453:0x742d35cc6634c0532925A3b844Bc9e7595f0ABcd"));
    }

    function test_Validate_Valid() public pure {
        assertTrue(CAIP10.validate("eip155:8453:0x742d35cc6634c0532925A3b844Bc9e7595f0ABcd"));
        assertTrue(CAIP10.validate("solana:mainnet:7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV"));
    }

    function test_Validate_Invalid() public pure {
        assertFalse(CAIP10.validate("invalid"));
        assertFalse(CAIP10.validate("a:b"));
        assertFalse(CAIP10.validate(":8453:0x123"));
        assertFalse(CAIP10.validate("eip155::0x123"));
        assertFalse(CAIP10.validate("eip155:8453:"));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FORMATTING TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_FormatEvmWildcard() public pure {
        address wallet = 0x742d35cc6634c0532925A3b844Bc9e7595f0ABcd;
        string memory formatted = CAIP10Evm.formatEvmWildcard(wallet);
        assertEq(formatted, "eip155:_:0x742d35cc6634c0532925A3b844Bc9e7595f0ABcd");
    }

    function test_FormatEvm() public pure {
        address wallet = 0x742d35cc6634c0532925A3b844Bc9e7595f0ABcd;
        string memory formatted = CAIP10Evm.formatEvm(wallet, 8453);
        assertEq(formatted, "eip155:8453:0x742d35cc6634c0532925A3b844Bc9e7595f0ABcd");
    }

    function test_FormatEvmWildcardLower() public pure {
        address wallet = 0x742d35cc6634c0532925A3b844Bc9e7595f0ABcd;
        string memory formatted = CAIP10Evm.formatEvmWildcardLower(wallet);
        assertEq(formatted, "eip155:_:0x742d35cc6634c0532925a3b844bc9e7595f0abcd");
    }

    function test_FormatEvmLower() public pure {
        address wallet = 0x742d35cc6634c0532925A3b844Bc9e7595f0ABcd;
        string memory formatted = CAIP10Evm.formatEvmLower(wallet, 8453);
        assertEq(formatted, "eip155:8453:0x742d35cc6634c0532925a3b844bc9e7595f0abcd");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DIRECT STORAGE KEY TESTS (for registry interfaces)
    // ═══════════════════════════════════════════════════════════════════════════

    function test_TxStorageKey_Format() public pure {
        bytes32 txHash = keccak256("test_tx_hash");
        bytes32 chainId = keccak256("eip155:8453");

        bytes32 key = CAIP10.txStorageKey(txHash, chainId);
        bytes32 expected = keccak256(abi.encode(txHash, chainId));

        assertEq(key, expected);
    }

    function test_TxStorageKey_ChainSpecific() public pure {
        bytes32 txHash = keccak256("test_tx_hash");
        bytes32 chainIdBase = keccak256("eip155:8453");
        bytes32 chainIdMainnet = keccak256("eip155:1");

        bytes32 keyBase = CAIP10.txStorageKey(txHash, chainIdBase);
        bytes32 keyMainnet = CAIP10.txStorageKey(txHash, chainIdMainnet);

        assertTrue(keyBase != keyMainnet, "Transaction keys should differ by chain");
    }

    function test_ContractStorageKey_Format() public pure {
        address contractAddr = 0x742d35cc6634c0532925A3b844Bc9e7595f0ABcd;
        bytes32 chainId = keccak256("eip155:8453");

        bytes32 key = CAIP10.contractStorageKey(contractAddr, chainId);
        bytes32 expected = keccak256(abi.encode(contractAddr, chainId));

        assertEq(key, expected);
    }

    function test_ContractStorageKey_ChainSpecific() public pure {
        address contractAddr = 0x742d35cc6634c0532925A3b844Bc9e7595f0ABcd;
        bytes32 chainIdBase = keccak256("eip155:8453");
        bytes32 chainIdMainnet = keccak256("eip155:1");

        bytes32 keyBase = CAIP10.contractStorageKey(contractAddr, chainIdBase);
        bytes32 keyMainnet = CAIP10.contractStorageKey(contractAddr, chainIdMainnet);

        assertTrue(keyBase != keyMainnet, "Contract keys should differ by chain");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CAIP-2 HASH HELPER TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Caip2Hash_Evm() public pure {
        bytes32 hash = CAIP10Evm.caip2Hash(8453);
        bytes32 expected = keccak256("eip155:8453");

        assertEq(hash, expected);
    }

    function test_Caip2Hash_EvmMainnet() public pure {
        bytes32 hash = CAIP10Evm.caip2Hash(1);
        bytes32 expected = keccak256("eip155:1");

        assertEq(hash, expected);
    }

    function test_Caip2Hash_StringBased() public pure {
        bytes32 hash = CAIP10.caip2Hash("solana", "mainnet");
        bytes32 expected = keccak256("solana:mainnet");

        assertEq(hash, expected);
    }

    function test_Caip2Hash_Bitcoin() public pure {
        bytes32 hash = CAIP10.caip2Hash("bip122", "000000000019d6689c085ae165831e93");
        bytes32 expected = keccak256("bip122:000000000019d6689c085ae165831e93");

        assertEq(hash, expected);
    }

    function test_Caip2Hash_CrossChainConsistency() public pure {
        // Verify that EVM caip2Hash matches what you'd get from string-based
        bytes32 evmHash = CAIP10Evm.caip2Hash(8453);
        bytes32 stringHash = CAIP10.caip2Hash("eip155", "8453");

        assertEq(evmHash, stringHash, "EVM and string-based caip2Hash should match");
    }
}
