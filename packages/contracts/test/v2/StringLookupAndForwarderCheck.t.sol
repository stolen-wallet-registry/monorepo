// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

import { TransactionRegistryV2 } from "../../src/v2/registries/TransactionRegistryV2.sol";
import { ITransactionRegistryV2 } from "../../src/v2/interfaces/ITransactionRegistryV2.sol";
import { ContractRegistryV2 } from "../../src/v2/registries/ContractRegistryV2.sol";
import { IContractRegistryV2 } from "../../src/v2/interfaces/IContractRegistryV2.sol";
import { WalletRegistryV2 } from "../../src/v2/registries/WalletRegistryV2.sol";
import { IWalletRegistryV2 } from "../../src/v2/interfaces/IWalletRegistryV2.sol";
import { FraudRegistryHubV2 } from "../../src/v2/FraudRegistryHubV2.sol";
import { CAIP10Evm } from "../../src/v2/libraries/CAIP10Evm.sol";

/// @title StringLookupAndForwarderCheckTest
/// @notice Tests for:
///   - Issue 1: CAIP-10 string lookup must match typed lookup (register via typed, query via string)
///   - Issue 3: forwarder == address(0) must revert in acknowledge functions
contract StringLookupAndForwarderCheckTest is Test {
    using Strings for uint256;
    using Strings for address;

    TransactionRegistryV2 public txRegistry;
    ContractRegistryV2 public contractRegistry;
    WalletRegistryV2 public walletRegistry;
    FraudRegistryHubV2 public hub;

    address public owner;
    address public operatorSubmitter;
    bytes32 public operatorId = keccak256("testOperator");

    // Test data
    uint64 public constant CHAIN_ID = 8453; // Base
    uint256 internal constant GRACE_BLOCKS = 10;
    uint256 internal constant DEADLINE_BLOCKS = 50;

    function setUp() public {
        vm.warp(1_704_067_200); // 2024-01-01

        owner = address(this);
        operatorSubmitter = makeAddr("operatorSubmitter");

        // Deploy registries
        txRegistry = new TransactionRegistryV2(owner, address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);
        contractRegistry = new ContractRegistryV2(owner);
        walletRegistry = new WalletRegistryV2(owner, address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);

        // Deploy hub
        hub = new FraudRegistryHubV2(owner, owner);
        hub.setWalletRegistry(address(walletRegistry));
        hub.setTransactionRegistry(address(txRegistry));
        hub.setContractRegistry(address(contractRegistry));

        // Set operator submitter on registries
        txRegistry.setOperatorSubmitter(operatorSubmitter);
        contractRegistry.setOperatorSubmitter(operatorSubmitter);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Build a chain-qualified reference string for a tx hash: "eip155:{chainId}:0x{hex}"
    function _buildTxRef(bytes32 txHash, uint64 chainId) internal pure returns (string memory) {
        return string(abi.encodePacked("eip155:", uint256(chainId).toString(), ":", _bytes32ToHexString(txHash)));
    }

    /// @dev Build a CAIP-10 string for a contract address: "eip155:{chainId}:0x{hex}"
    function _buildContractCaip10(address addr, uint64 chainId) internal pure returns (string memory) {
        return string(abi.encodePacked("eip155:", uint256(chainId).toString(), ":", _addressToLowerHex(addr)));
    }

    /// @dev Convert bytes32 to "0x" + 64 lowercase hex chars
    function _bytes32ToHexString(bytes32 value) internal pure returns (string memory) {
        bytes memory buffer = new bytes(66);
        buffer[0] = "0";
        buffer[1] = "x";
        bytes memory alphabet = "0123456789abcdef";
        for (uint256 i = 0; i < 32; i++) {
            buffer[2 + i * 2] = alphabet[uint8(value[i]) >> 4];
            buffer[3 + i * 2] = alphabet[uint8(value[i]) & 0x0f];
        }
        return string(buffer);
    }

    /// @dev Convert address to "0x" + 40 lowercase hex chars
    function _addressToLowerHex(address addr) internal pure returns (string memory) {
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

    // ═══════════════════════════════════════════════════════════════════════════
    // ISSUE 1: TRANSACTION REGISTRY STRING LOOKUP
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Register via typed interface, query via string — must return true
    function test_isTransactionRegistered_stringLookup_matchesTypedLookup() public {
        bytes32 txHash = keccak256("fraudulent_tx_1");
        bytes32 chainId = CAIP10Evm.caip2Hash(CHAIN_ID);

        // Register via operator (typed interface)
        bytes32[] memory hashes = new bytes32[](1);
        hashes[0] = txHash;
        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        vm.prank(operatorSubmitter);
        txRegistry.registerTransactionsFromOperator(operatorId, hashes, chainIds);

        // Verify typed lookup works
        assertTrue(txRegistry.isTransactionRegistered(txHash, chainId), "Typed lookup should find tx");

        // Verify string lookup works (this was broken before the fix)
        string memory ref = _buildTxRef(txHash, CHAIN_ID);
        assertTrue(txRegistry.isTransactionRegistered(ref), "String lookup should find tx");
    }

    /// @notice getTransactionEntry via string should return correct data
    function test_getTransactionEntry_stringLookup_returnsCorrectData() public {
        bytes32 txHash = keccak256("fraudulent_tx_2");
        bytes32 chainId = CAIP10Evm.caip2Hash(CHAIN_ID);

        bytes32[] memory hashes = new bytes32[](1);
        hashes[0] = txHash;
        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        vm.prank(operatorSubmitter);
        txRegistry.registerTransactionsFromOperator(operatorId, hashes, chainIds);

        // Query via string
        string memory ref = _buildTxRef(txHash, CHAIN_ID);
        ITransactionRegistryV2.TransactionEntry memory entry = txRegistry.getTransactionEntry(ref);

        assertGt(entry.registeredAt, 0, "registeredAt should be set");
        assertEq(entry.reportedChainId, chainId, "reportedChainId should match");
    }

    /// @notice Multiple transactions on different chains, each queryable by string
    function test_isTransactionRegistered_stringLookup_multipleChains() public {
        bytes32 txHash1 = keccak256("tx_base");
        bytes32 txHash2 = keccak256("tx_optimism");
        bytes32 chainIdBase = CAIP10Evm.caip2Hash(8453);
        bytes32 chainIdOp = CAIP10Evm.caip2Hash(10);

        bytes32[] memory hashes = new bytes32[](2);
        hashes[0] = txHash1;
        hashes[1] = txHash2;
        bytes32[] memory chainIds = new bytes32[](2);
        chainIds[0] = chainIdBase;
        chainIds[1] = chainIdOp;

        vm.prank(operatorSubmitter);
        txRegistry.registerTransactionsFromOperator(operatorId, hashes, chainIds);

        // Both should be queryable via string
        assertTrue(txRegistry.isTransactionRegistered(_buildTxRef(txHash1, 8453)), "Base tx string lookup");
        assertTrue(txRegistry.isTransactionRegistered(_buildTxRef(txHash2, 10)), "OP tx string lookup");

        // Unregistered tx should return false
        assertFalse(
            txRegistry.isTransactionRegistered(_buildTxRef(keccak256("nonexistent"), 8453)),
            "Unregistered tx should return false"
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ISSUE 1: CONTRACT REGISTRY STRING LOOKUP
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Register via typed interface, query via string — must return true
    function test_isContractRegistered_stringLookup_matchesTypedLookup() public {
        address maliciousContract = makeAddr("maliciousContract");
        bytes32 chainId = CAIP10Evm.caip2Hash(CHAIN_ID);
        bytes32 identifier = bytes32(uint256(uint160(maliciousContract)));

        // Register via operator (typed interface)
        bytes32[] memory identifiers = new bytes32[](1);
        identifiers[0] = identifier;
        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        vm.prank(operatorSubmitter);
        contractRegistry.registerContractsFromOperator(operatorId, identifiers, chainIds);

        // Verify typed lookup works
        assertTrue(
            contractRegistry.isContractRegistered(maliciousContract, chainId), "Typed lookup should find contract"
        );

        // Verify string lookup works (this was broken before the fix)
        string memory caip10 = _buildContractCaip10(maliciousContract, CHAIN_ID);
        assertTrue(contractRegistry.isContractRegistered(caip10), "String lookup should find contract");
    }

    /// @notice getContractEntry via string should return correct data
    function test_getContractEntry_stringLookup_returnsCorrectData() public {
        address maliciousContract = makeAddr("maliciousContract2");
        bytes32 chainId = CAIP10Evm.caip2Hash(CHAIN_ID);
        bytes32 identifier = bytes32(uint256(uint160(maliciousContract)));

        bytes32[] memory identifiers = new bytes32[](1);
        identifiers[0] = identifier;
        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        vm.prank(operatorSubmitter);
        contractRegistry.registerContractsFromOperator(operatorId, identifiers, chainIds);

        // Query via string
        string memory caip10 = _buildContractCaip10(maliciousContract, CHAIN_ID);
        IContractRegistryV2.ContractEntry memory entry = contractRegistry.getContractEntry(caip10);

        assertGt(entry.registeredAt, 0, "registeredAt should be set");
        assertEq(entry.reportedChainId, chainId, "reportedChainId should match");
        assertEq(entry.operatorId, operatorId, "operatorId should match");
    }

    /// @notice Multiple contracts on different chains, each queryable by string
    function test_isContractRegistered_stringLookup_multipleChains() public {
        address contract1 = makeAddr("contract1");
        address contract2 = makeAddr("contract2");
        bytes32 chainIdBase = CAIP10Evm.caip2Hash(8453);
        bytes32 chainIdArb = CAIP10Evm.caip2Hash(42_161);

        bytes32[] memory identifiers = new bytes32[](2);
        identifiers[0] = bytes32(uint256(uint160(contract1)));
        identifiers[1] = bytes32(uint256(uint160(contract2)));
        bytes32[] memory chainIds = new bytes32[](2);
        chainIds[0] = chainIdBase;
        chainIds[1] = chainIdArb;

        vm.prank(operatorSubmitter);
        contractRegistry.registerContractsFromOperator(operatorId, identifiers, chainIds);

        assertTrue(
            contractRegistry.isContractRegistered(_buildContractCaip10(contract1, 8453)), "Base contract string lookup"
        );
        assertTrue(
            contractRegistry.isContractRegistered(_buildContractCaip10(contract2, 42_161)), "Arb contract string lookup"
        );

        // Unregistered contract should return false
        assertFalse(
            contractRegistry.isContractRegistered(_buildContractCaip10(makeAddr("unknown"), 8453)),
            "Unregistered contract should return false"
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ISSUE 1: HUB isRegistered STRING LOOKUP (end-to-end)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Hub's isRegistered(string) should find transactions registered via typed interface
    function test_hubIsRegistered_stringLookup_findsTxAndContract() public {
        // Register a transaction
        bytes32 txHash = keccak256("hub_test_tx");
        bytes32 txChainId = CAIP10Evm.caip2Hash(CHAIN_ID);

        bytes32[] memory txHashes = new bytes32[](1);
        txHashes[0] = txHash;
        bytes32[] memory txChainIds = new bytes32[](1);
        txChainIds[0] = txChainId;

        vm.prank(operatorSubmitter);
        txRegistry.registerTransactionsFromOperator(operatorId, txHashes, txChainIds);

        // Register a contract
        address malicious = makeAddr("hubTestContract");
        bytes32 contractChainId = CAIP10Evm.caip2Hash(CHAIN_ID);

        bytes32[] memory contractIds = new bytes32[](1);
        contractIds[0] = bytes32(uint256(uint160(malicious)));
        bytes32[] memory contractChainIds = new bytes32[](1);
        contractChainIds[0] = contractChainId;

        vm.prank(operatorSubmitter);
        contractRegistry.registerContractsFromOperator(operatorId, contractIds, contractChainIds);

        // Query via hub string interface
        string memory txRef = _buildTxRef(txHash, CHAIN_ID);
        assertTrue(hub.isRegistered(txRef), "Hub should find tx via string");

        string memory contractCaip10 = _buildContractCaip10(malicious, CHAIN_ID);
        assertTrue(hub.isRegistered(contractCaip10), "Hub should find contract via string");

        // Non-existent should return false
        assertFalse(hub.isRegistered(_buildTxRef(keccak256("nope"), CHAIN_ID)), "Hub should not find unregistered tx");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ISSUE 3: FORWARDER ZERO-ADDRESS CHECK
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice WalletRegistryV2.acknowledge should revert when forwarder is address(0)
    /// @dev Zero-address check happens before signature verification, so dummy sig values suffice
    function test_walletAcknowledge_revertsOnZeroForwarder() public {
        address registeree = makeAddr("registeree");

        vm.expectRevert(IWalletRegistryV2.WalletRegistryV2__ZeroAddress.selector);
        walletRegistry.acknowledge(
            registeree,
            address(0), // zero forwarder
            CHAIN_ID,
            uint64(block.timestamp - 1 hours),
            block.timestamp + 1 hours,
            27,
            bytes32(uint256(1)),
            bytes32(uint256(2)) // dummy sig
        );
    }

    /// @notice TransactionRegistryV2.acknowledgeTransactions should revert when forwarder is address(0)
    /// @dev Zero-address check happens before signature verification, so dummy sig values suffice
    function test_txAcknowledge_revertsOnZeroForwarder() public {
        address reporter = makeAddr("reporter");
        bytes32 dataHash = keccak256("dummy");
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(CHAIN_ID);

        vm.expectRevert(ITransactionRegistryV2.TransactionRegistryV2__ZeroAddress.selector);
        txRegistry.acknowledgeTransactions(
            reporter,
            address(0), // zero forwarder
            block.timestamp + 1 hours,
            dataHash,
            reportedChainId,
            1, // txCount
            27,
            bytes32(uint256(1)),
            bytes32(uint256(2)) // dummy sig
        );
    }
}
