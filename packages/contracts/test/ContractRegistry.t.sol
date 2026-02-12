// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

import { ContractRegistry } from "../src/registries/ContractRegistry.sol";
import { IContractRegistry } from "../src/interfaces/IContractRegistry.sol";
import { CAIP10Evm } from "../src/libraries/CAIP10Evm.sol";

/// @title ContractRegistryTest
/// @notice Comprehensive tests for ContractRegistry: constructor, admin, modifier edge cases,
///         operator batch registration (happy path, reverts, skip logic, multi-batch),
///         typed and CAIP-10 string view functions, and chain-specific storage.
contract ContractRegistryTest is Test {
    using Strings for uint256;

    ContractRegistry public registry;

    address public owner;
    address public operatorSubmitter;

    bytes32 public operatorId = keccak256("testOperator");
    uint64 internal constant CHAIN_ID = 8453; // Base
    bytes32 internal chainId;

    function setUp() public {
        vm.warp(1_704_067_200); // 2024-01-01

        owner = address(this);
        operatorSubmitter = makeAddr("operatorSubmitter");

        chainId = CAIP10Evm.caip2Hash(CHAIN_ID);

        registry = new ContractRegistry(owner);
        registry.setOperatorSubmitter(operatorSubmitter);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    function _toIdentifier(address addr) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(addr)));
    }

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

    function _buildContractCaip10(address addr, uint64 cid) internal pure returns (string memory) {
        return string(abi.encodePacked("eip155:", uint256(cid).toString(), ":", _addressToLowerHex(addr)));
    }

    /// @dev Register a single contract via the operator path and return its identifier
    function _registerContract(address contractAddr) internal returns (bytes32) {
        bytes32[] memory identifiers = new bytes32[](1);
        identifiers[0] = _toIdentifier(contractAddr);
        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        vm.prank(operatorSubmitter);
        registry.registerContractsFromOperator(operatorId, identifiers, chainIds);

        return identifiers[0];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Constructor sets the owner correctly and batch count starts at 0
    function test_Constructor_Success() public {
        address newOwner = makeAddr("newOwner");
        ContractRegistry r = new ContractRegistry(newOwner);
        assertEq(r.owner(), newOwner);
        assertEq(r.contractBatchCount(), 0);
    }

    /// @notice OZ Ownable rejects address(0) as owner before our custom check
    function test_Constructor_RejectsZeroOwner() public {
        vm.expectRevert(abi.encodeWithSignature("OwnableInvalidOwner(address)", address(0)));
        new ContractRegistry(address(0));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN - setOperatorSubmitter
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice setOperatorSubmitter updates state and emits OperatorSubmitterUpdated
    function test_SetOperatorSubmitter_Success() public {
        address newSubmitter = makeAddr("newSubmitter");

        vm.expectEmit(false, false, false, true);
        emit IContractRegistry.OperatorSubmitterUpdated(operatorSubmitter, newSubmitter);

        registry.setOperatorSubmitter(newSubmitter);

        assertEq(registry.operatorSubmitter(), newSubmitter);
    }

    /// @notice setOperatorSubmitter rejects zero address
    function test_SetOperatorSubmitter_RejectsZeroAddress() public {
        vm.expectRevert(IContractRegistry.ContractRegistry__ZeroAddress.selector);
        registry.setOperatorSubmitter(address(0));
    }

    /// @notice setOperatorSubmitter rejects non-owner callers
    function test_SetOperatorSubmitter_RejectsNonOwner() public {
        address nonOwner = makeAddr("nonOwner");

        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", nonOwner));
        vm.prank(nonOwner);
        registry.setOperatorSubmitter(makeAddr("any"));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MODIFIER - onlyOperatorSubmitter
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Reverts when operatorSubmitter has never been set (address(0))
    /// @dev The modifier checks `msg.sender != operatorSubmitter || operatorSubmitter == address(0)`,
    ///      so even address(0) calling would fail on the second condition.
    function test_RegisterContracts_RejectsWhenOperatorSubmitterNotSet() public {
        ContractRegistry fresh = new ContractRegistry(owner);

        bytes32[] memory identifiers = new bytes32[](1);
        identifiers[0] = _toIdentifier(makeAddr("c1"));
        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        vm.expectRevert(IContractRegistry.ContractRegistry__OnlyOperatorSubmitter.selector);
        fresh.registerContractsFromOperator(operatorId, identifiers, chainIds);
    }

    /// @notice Reverts when caller is not the set operatorSubmitter
    function test_RegisterContracts_RejectsNonOperatorSubmitter() public {
        address randomCaller = makeAddr("random");

        bytes32[] memory identifiers = new bytes32[](1);
        identifiers[0] = _toIdentifier(makeAddr("c1"));
        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        vm.expectRevert(IContractRegistry.ContractRegistry__OnlyOperatorSubmitter.selector);
        vm.prank(randomCaller);
        registry.registerContractsFromOperator(operatorId, identifiers, chainIds);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OPERATOR BATCH REGISTRATION — HAPPY PATH
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Successful registration of 3 contracts: per-entry events, batch event, entry data, batch metadata
    function test_RegisterContracts_Success() public {
        address c1 = makeAddr("contract1");
        address c2 = makeAddr("contract2");
        address c3 = makeAddr("contract3");

        bytes32[] memory identifiers = new bytes32[](3);
        identifiers[0] = _toIdentifier(c1);
        identifiers[1] = _toIdentifier(c2);
        identifiers[2] = _toIdentifier(c3);

        bytes32[] memory chainIds = new bytes32[](3);
        chainIds[0] = chainId;
        chainIds[1] = chainId;
        chainIds[2] = chainId;

        // Per-entry events fire during loop, batch event fires after
        vm.expectEmit(true, true, true, true);
        emit IContractRegistry.ContractRegistered(identifiers[0], chainId, operatorId, 1);
        vm.expectEmit(true, true, true, true);
        emit IContractRegistry.ContractRegistered(identifiers[1], chainId, operatorId, 1);
        vm.expectEmit(true, true, true, true);
        emit IContractRegistry.ContractRegistered(identifiers[2], chainId, operatorId, 1);

        vm.expectEmit(true, true, false, true);
        emit IContractRegistry.ContractBatchCreated(1, operatorId, 3);

        vm.prank(operatorSubmitter);
        uint256 batchId = registry.registerContractsFromOperator(operatorId, identifiers, chainIds);

        assertEq(batchId, 1, "First batch should have ID 1");

        // Verify entry data for c1
        IContractRegistry.ContractEntry memory entry = registry.getContractEntry(c1, chainId);
        assertEq(entry.registeredAt, uint64(block.timestamp));
        assertEq(entry.reportedChainId, chainId);
        assertEq(entry.operatorId, operatorId);
        assertEq(entry.batchId, 1);

        // Verify batch metadata
        IContractRegistry.ContractBatch memory batch = registry.getContractBatch(1);
        assertEq(batch.operatorId, operatorId);
        assertEq(batch.timestamp, uint64(block.timestamp));
        assertEq(batch.contractCount, 3);

        // Verify all three are registered
        assertTrue(registry.isContractRegistered(c1, chainId));
        assertTrue(registry.isContractRegistered(c2, chainId));
        assertTrue(registry.isContractRegistered(c3, chainId));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OPERATOR BATCH REGISTRATION — REVERT CASES
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Reverts on empty batch
    function test_RegisterContracts_RejectsEmptyBatch() public {
        bytes32[] memory identifiers = new bytes32[](0);
        bytes32[] memory chainIds = new bytes32[](0);

        vm.expectRevert(IContractRegistry.ContractRegistry__EmptyBatch.selector);
        vm.prank(operatorSubmitter);
        registry.registerContractsFromOperator(operatorId, identifiers, chainIds);
    }

    /// @notice Reverts when identifiers and chainIds arrays have different lengths
    function test_RegisterContracts_RejectsArrayLengthMismatch() public {
        bytes32[] memory identifiers = new bytes32[](2);
        identifiers[0] = _toIdentifier(makeAddr("c1"));
        identifiers[1] = _toIdentifier(makeAddr("c2"));
        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        vm.expectRevert(IContractRegistry.ContractRegistry__ArrayLengthMismatch.selector);
        vm.prank(operatorSubmitter);
        registry.registerContractsFromOperator(operatorId, identifiers, chainIds);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OPERATOR BATCH REGISTRATION — SKIP LOGIC
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Zero identifiers are silently skipped; batch event reports actual registration count
    function test_RegisterContracts_SkipsZeroIdentifiers() public {
        address c1 = makeAddr("contract1");

        bytes32[] memory identifiers = new bytes32[](3);
        identifiers[0] = _toIdentifier(c1);
        identifiers[1] = bytes32(0); // zero — skipped
        identifiers[2] = bytes32(0); // zero — skipped

        bytes32[] memory chainIds = new bytes32[](3);
        chainIds[0] = chainId;
        chainIds[1] = chainId;
        chainIds[2] = chainId;

        // Per-entry event fires before batch event (loop runs first)
        vm.expectEmit(true, true, true, true);
        emit IContractRegistry.ContractRegistered(identifiers[0], chainId, operatorId, 1);

        // Batch event reports actualCount = 1 (only non-zero, non-duplicate entries)
        vm.expectEmit(true, true, false, true);
        emit IContractRegistry.ContractBatchCreated(1, operatorId, 1);

        vm.prank(operatorSubmitter);
        registry.registerContractsFromOperator(operatorId, identifiers, chainIds);

        assertTrue(registry.isContractRegistered(c1, chainId));
        assertFalse(registry.isContractRegistered(address(0), chainId));
    }

    /// @notice Batch of all-duplicates reverts with EmptyBatch (no wasted batch IDs)
    function test_RegisterContracts_SkipsDuplicates() public {
        address c1 = makeAddr("dupContract");

        // First registration
        _registerContract(c1);
        assertTrue(registry.isContractRegistered(c1, chainId));

        // Capture original entry
        IContractRegistry.ContractEntry memory original = registry.getContractEntry(c1, chainId);

        // Second registration (same contract) — all entries are duplicates, reverts
        bytes32[] memory identifiers = new bytes32[](1);
        identifiers[0] = _toIdentifier(c1);
        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        vm.expectRevert(IContractRegistry.ContractRegistry__EmptyBatch.selector);
        vm.prank(operatorSubmitter);
        registry.registerContractsFromOperator(operatorId, identifiers, chainIds);

        // Entry should retain original data (not overwritten)
        IContractRegistry.ContractEntry memory after_ = registry.getContractEntry(c1, chainId);
        assertEq(after_.batchId, original.batchId, "Entry should retain original batchId");
        assertEq(after_.operatorId, original.operatorId);
        assertEq(after_.registeredAt, original.registeredAt);
    }

    /// @notice Mixed batch: zeros, duplicates, and valid entries together
    function test_RegisterContracts_MixedValidAndInvalid() public {
        address existing = makeAddr("existing");
        address newC1 = makeAddr("new1");
        address newC2 = makeAddr("new2");

        // Pre-register one
        _registerContract(existing);

        // Batch with: zero, duplicate, new, zero, new
        bytes32[] memory identifiers = new bytes32[](5);
        identifiers[0] = bytes32(0); // skip: zero
        identifiers[1] = _toIdentifier(existing); // skip: duplicate
        identifiers[2] = _toIdentifier(newC1); // register
        identifiers[3] = bytes32(0); // skip: zero
        identifiers[4] = _toIdentifier(newC2); // register

        bytes32[] memory chainIds = new bytes32[](5);
        for (uint256 i = 0; i < 5; i++) {
            chainIds[i] = chainId;
        }

        // Per-entry events fire before batch event (newC1 and newC2 only)
        vm.expectEmit(true, true, true, true);
        emit IContractRegistry.ContractRegistered(_toIdentifier(newC1), chainId, operatorId, 2);
        vm.expectEmit(true, true, true, true);
        emit IContractRegistry.ContractRegistered(_toIdentifier(newC2), chainId, operatorId, 2);
        vm.expectEmit(true, true, false, true);
        emit IContractRegistry.ContractBatchCreated(2, operatorId, 2);

        vm.prank(operatorSubmitter);
        registry.registerContractsFromOperator(operatorId, identifiers, chainIds);

        assertTrue(registry.isContractRegistered(newC1, chainId));
        assertTrue(registry.isContractRegistered(newC2, chainId));

        // Batch reports actual registrations (2), not array length (5)
        IContractRegistry.ContractBatch memory batch = registry.getContractBatch(2);
        assertEq(batch.contractCount, 2);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MULTI-BATCH
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Multiple batches: batchId increments correctly, contractBatchCount tracks
    function test_RegisterContracts_MultipleBatches() public {
        address c1 = makeAddr("batch1contract");
        address c2 = makeAddr("batch2contract");

        _registerContract(c1);
        assertEq(registry.contractBatchCount(), 1);

        bytes32[] memory identifiers = new bytes32[](1);
        identifiers[0] = _toIdentifier(c2);
        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        vm.prank(operatorSubmitter);
        uint256 batchId = registry.registerContractsFromOperator(operatorId, identifiers, chainIds);

        assertEq(batchId, 2, "Second batch should have ID 2");
        assertEq(registry.contractBatchCount(), 2);

        // Each entry references its own batch
        assertEq(registry.getContractEntry(c1, chainId).batchId, 1);
        assertEq(registry.getContractEntry(c2, chainId).batchId, 2);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TYPED VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice isContractRegistered(address,bytes32) returns true for registered, false for unregistered
    function test_IsContractRegistered_Typed() public {
        address c = makeAddr("registered");
        assertFalse(registry.isContractRegistered(c, chainId));

        _registerContract(c);
        assertTrue(registry.isContractRegistered(c, chainId));

        assertFalse(registry.isContractRegistered(makeAddr("unregistered"), chainId));
    }

    /// @notice getContractEntry(address,bytes32) returns correct data for registered, empty for unregistered
    function test_GetContractEntry_Typed() public {
        address c = makeAddr("entryCheck");
        _registerContract(c);

        IContractRegistry.ContractEntry memory entry = registry.getContractEntry(c, chainId);
        assertEq(entry.registeredAt, uint64(block.timestamp));
        assertEq(entry.reportedChainId, chainId);
        assertEq(entry.operatorId, operatorId);
        assertEq(entry.batchId, 1);

        // Unregistered returns empty
        IContractRegistry.ContractEntry memory empty = registry.getContractEntry(makeAddr("ghost"), chainId);
        assertEq(empty.registeredAt, 0);
        assertEq(empty.reportedChainId, bytes32(0));
        assertEq(empty.operatorId, bytes32(0));
        assertEq(empty.batchId, 0);
    }

    /// @notice getContractBatch returns correct data for existing, empty for nonexistent
    function test_GetContractBatch() public {
        _registerContract(makeAddr("batchData"));

        IContractRegistry.ContractBatch memory batch = registry.getContractBatch(1);
        assertEq(batch.operatorId, operatorId);
        assertEq(batch.timestamp, uint64(block.timestamp));
        assertEq(batch.contractCount, 1);

        // Nonexistent batch
        IContractRegistry.ContractBatch memory empty = registry.getContractBatch(999);
        assertEq(empty.operatorId, bytes32(0));
        assertEq(empty.timestamp, 0);
        assertEq(empty.contractCount, 0);
    }

    /// @notice contractBatchCount is 0 initially, increments with each batch
    function test_ContractBatchCount() public {
        assertEq(registry.contractBatchCount(), 0);

        _registerContract(makeAddr("count1"));
        assertEq(registry.contractBatchCount(), 1);

        _registerContract(makeAddr("count2"));
        assertEq(registry.contractBatchCount(), 2);

        _registerContract(makeAddr("count3"));
        assertEq(registry.contractBatchCount(), 3);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STRING VIEW FUNCTIONS (CAIP-10)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice isContractRegistered(string) returns true for registered, false for unregistered
    function test_IsContractRegistered_String() public {
        address c = makeAddr("stringCheck");
        _registerContract(c);

        string memory caip10 = _buildContractCaip10(c, CHAIN_ID);
        assertTrue(registry.isContractRegistered(caip10));

        // Unregistered returns false
        string memory unregistered = _buildContractCaip10(makeAddr("ghost"), CHAIN_ID);
        assertFalse(registry.isContractRegistered(unregistered));
    }

    /// @notice getContractEntry(string) returns correct data matching the typed interface
    function test_GetContractEntry_String() public {
        address c = makeAddr("stringEntry");
        _registerContract(c);

        string memory caip10 = _buildContractCaip10(c, CHAIN_ID);
        IContractRegistry.ContractEntry memory entry = registry.getContractEntry(caip10);

        assertEq(entry.registeredAt, uint64(block.timestamp));
        assertEq(entry.reportedChainId, chainId);
        assertEq(entry.operatorId, operatorId);
        assertEq(entry.batchId, 1);

        // Cross-check: string and typed views return identical data
        IContractRegistry.ContractEntry memory typedEntry = registry.getContractEntry(c, chainId);
        assertEq(entry.registeredAt, typedEntry.registeredAt);
        assertEq(entry.reportedChainId, typedEntry.reportedChainId);
        assertEq(entry.operatorId, typedEntry.operatorId);
        assertEq(entry.batchId, typedEntry.batchId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CHAIN-SPECIFIC STORAGE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Same contract address on different chains stored separately (chain-specific keys)
    function test_ChainSpecificRegistration() public {
        address c1 = makeAddr("multichain");
        bytes32 baseChainId = CAIP10Evm.caip2Hash(uint64(8453)); // Base
        bytes32 opChainId = CAIP10Evm.caip2Hash(uint64(10)); // Optimism

        // Register on Base only
        bytes32[] memory identifiers = new bytes32[](1);
        identifiers[0] = _toIdentifier(c1);
        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = baseChainId;

        vm.prank(operatorSubmitter);
        registry.registerContractsFromOperator(operatorId, identifiers, chainIds);

        // Registered on Base
        assertTrue(registry.isContractRegistered(c1, baseChainId));
        // NOT registered on Optimism
        assertFalse(registry.isContractRegistered(c1, opChainId));

        // Register on Optimism
        chainIds[0] = opChainId;
        vm.prank(operatorSubmitter);
        registry.registerContractsFromOperator(operatorId, identifiers, chainIds);

        // Both chains now registered
        assertTrue(registry.isContractRegistered(c1, baseChainId));
        assertTrue(registry.isContractRegistered(c1, opChainId));

        // Entries have distinct chain IDs
        IContractRegistry.ContractEntry memory baseEntry = registry.getContractEntry(c1, baseChainId);
        IContractRegistry.ContractEntry memory opEntry = registry.getContractEntry(c1, opChainId);
        assertEq(baseEntry.reportedChainId, baseChainId);
        assertEq(opEntry.reportedChainId, opChainId);

        // They reference different batches (batch 1 = Base, batch 2 = Optimism)
        assertEq(baseEntry.batchId, 1);
        assertEq(opEntry.batchId, 2);
    }
}
