// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { OperatorRegistry } from "../src/OperatorRegistry.sol";
import { IOperatorRegistry } from "../src/interfaces/IOperatorRegistry.sol";

/// @title OperatorRegistryTest
/// @notice Unit and fuzz tests for OperatorRegistry
contract OperatorRegistryTest is Test {
    OperatorRegistry public registry;

    // Test accounts
    address public owner;
    address public operatorA;
    address public operatorB;
    address public nonOwner;

    // Events to test
    event OperatorApproved(address indexed operator, uint8 capabilities, string identifier, uint64 approvedAt);
    event OperatorRevoked(address indexed operator, uint64 revokedAt);
    event OperatorCapabilitiesUpdated(address indexed operator, uint8 oldCapabilities, uint8 newCapabilities);

    function setUp() public {
        owner = makeAddr("owner");
        operatorA = makeAddr("operatorA");
        operatorB = makeAddr("operatorB");
        nonOwner = makeAddr("nonOwner");

        vm.prank(owner);
        registry = new OperatorRegistry(owner);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Constants() public view {
        assertEq(registry.WALLET_REGISTRY(), 0x01);
        assertEq(registry.TX_REGISTRY(), 0x02);
        assertEq(registry.CONTRACT_REGISTRY(), 0x04);
        assertEq(registry.ALL_REGISTRIES(), 0x07);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // APPROVE OPERATOR
    // ═══════════════════════════════════════════════════════════════════════════

    function test_ApproveOperator_WithAllCapabilities() public {
        vm.expectEmit(true, false, false, true);
        emit OperatorApproved(operatorA, 0x07, "Coinbase", uint64(block.number));

        vm.prank(owner);
        registry.approveOperator(operatorA, 0x07, "Coinbase");

        assertTrue(registry.isApproved(operatorA));
        assertEq(registry.getCapabilities(operatorA), 0x07);
        assertEq(registry.approvedOperatorCount(), 1);

        IOperatorRegistry.Operator memory op = registry.getOperator(operatorA);
        assertTrue(op.approved);
        assertEq(op.capabilities, 0x07);
        assertEq(op.approvedAt, uint64(block.number));
        assertEq(op.revokedAt, 0);
        assertEq(op.identifier, "Coinbase");
    }

    function test_ApproveOperator_WithWalletOnly() public {
        vm.prank(owner);
        registry.approveOperator(operatorA, 0x01, "WalletOnlyOp");

        assertTrue(registry.isApprovedFor(operatorA, 0x01));
        assertFalse(registry.isApprovedFor(operatorA, 0x02));
        assertFalse(registry.isApprovedFor(operatorA, 0x04));
    }

    function test_ApproveOperator_WithContractOnly() public {
        vm.prank(owner);
        registry.approveOperator(operatorA, 0x04, "ContractOnlyOp");

        assertFalse(registry.isApprovedFor(operatorA, 0x01));
        assertFalse(registry.isApprovedFor(operatorA, 0x02));
        assertTrue(registry.isApprovedFor(operatorA, 0x04));
    }

    function test_ApproveOperator_WithMixedCapabilities() public {
        // Wallet + TX (0x01 | 0x02 = 0x03)
        vm.prank(owner);
        registry.approveOperator(operatorA, 0x03, "MixedOp");

        assertTrue(registry.isApprovedFor(operatorA, 0x01));
        assertTrue(registry.isApprovedFor(operatorA, 0x02));
        assertFalse(registry.isApprovedFor(operatorA, 0x04));
        // Combined check
        assertTrue(registry.isApprovedFor(operatorA, 0x03));
    }

    function test_ApproveOperator_MultipleOperators() public {
        vm.startPrank(owner);
        registry.approveOperator(operatorA, 0x07, "OpA");
        registry.approveOperator(operatorB, 0x01, "OpB");
        vm.stopPrank();

        assertEq(registry.approvedOperatorCount(), 2);
        assertTrue(registry.isApproved(operatorA));
        assertTrue(registry.isApproved(operatorB));
    }

    function test_ApproveOperator_RevertIf_ZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(IOperatorRegistry.OperatorRegistry__ZeroAddress.selector);
        registry.approveOperator(address(0), 0x07, "Zero");
    }

    function test_ApproveOperator_RevertIf_AlreadyApproved() public {
        vm.startPrank(owner);
        registry.approveOperator(operatorA, 0x07, "First");

        vm.expectRevert(IOperatorRegistry.OperatorRegistry__AlreadyApproved.selector);
        registry.approveOperator(operatorA, 0x01, "Second");
        vm.stopPrank();
    }

    function test_ApproveOperator_RevertIf_InvalidCapabilities_Zero() public {
        vm.prank(owner);
        vm.expectRevert(IOperatorRegistry.OperatorRegistry__InvalidCapabilities.selector);
        registry.approveOperator(operatorA, 0x00, "Invalid");
    }

    function test_ApproveOperator_RevertIf_InvalidCapabilities_TooHigh() public {
        vm.prank(owner);
        vm.expectRevert(IOperatorRegistry.OperatorRegistry__InvalidCapabilities.selector);
        registry.approveOperator(operatorA, 0x08, "Invalid");
    }

    function test_ApproveOperator_RevertIf_NotOwner() public {
        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", nonOwner));
        registry.approveOperator(operatorA, 0x07, "NotOwner");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REVOKE OPERATOR
    // ═══════════════════════════════════════════════════════════════════════════

    function test_RevokeOperator() public {
        vm.startPrank(owner);
        registry.approveOperator(operatorA, 0x07, "ToRevoke");

        vm.expectEmit(true, false, false, true);
        emit OperatorRevoked(operatorA, uint64(block.number));

        registry.revokeOperator(operatorA);
        vm.stopPrank();

        assertFalse(registry.isApproved(operatorA));
        assertEq(registry.approvedOperatorCount(), 0);

        IOperatorRegistry.Operator memory op = registry.getOperator(operatorA);
        assertFalse(op.approved);
        assertEq(op.revokedAt, uint64(block.number));
        // Capabilities preserved for history
        assertEq(op.capabilities, 0x07);
    }

    /// @notice Verifies revocation is immediate - operator cannot be used after revoke in same block
    function test_RevokeOperator_ImmediateEffect() public {
        vm.startPrank(owner);
        registry.approveOperator(operatorA, 0x07, "Immediate");
        assertTrue(registry.isApproved(operatorA));

        registry.revokeOperator(operatorA);
        // Same block, should be revoked immediately
        assertFalse(registry.isApproved(operatorA));
        assertFalse(registry.isApprovedFor(operatorA, 0x01));
        vm.stopPrank();
    }

    function test_RevokeOperator_RevertIf_ZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(IOperatorRegistry.OperatorRegistry__ZeroAddress.selector);
        registry.revokeOperator(address(0));
    }

    function test_RevokeOperator_RevertIf_NotApproved() public {
        vm.prank(owner);
        vm.expectRevert(IOperatorRegistry.OperatorRegistry__NotApproved.selector);
        registry.revokeOperator(operatorA);
    }

    function test_RevokeOperator_RevertIf_AlreadyRevoked() public {
        vm.startPrank(owner);
        registry.approveOperator(operatorA, 0x07, "Revokable");
        registry.revokeOperator(operatorA);

        vm.expectRevert(IOperatorRegistry.OperatorRegistry__NotApproved.selector);
        registry.revokeOperator(operatorA);
        vm.stopPrank();
    }

    function test_RevokeOperator_RevertIf_NotOwner() public {
        vm.prank(owner);
        registry.approveOperator(operatorA, 0x07, "Protected");

        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", nonOwner));
        registry.revokeOperator(operatorA);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // UPDATE CAPABILITIES
    // ═══════════════════════════════════════════════════════════════════════════

    function test_UpdateCapabilities() public {
        vm.startPrank(owner);
        registry.approveOperator(operatorA, 0x01, "Upgradeable");

        vm.expectEmit(true, false, false, true);
        emit OperatorCapabilitiesUpdated(operatorA, 0x01, 0x07);

        registry.updateCapabilities(operatorA, 0x07);
        vm.stopPrank();

        assertEq(registry.getCapabilities(operatorA), 0x07);
        assertTrue(registry.isApprovedFor(operatorA, 0x04));
    }

    function test_UpdateCapabilities_Downgrade() public {
        vm.startPrank(owner);
        registry.approveOperator(operatorA, 0x07, "Downgradeable");
        registry.updateCapabilities(operatorA, 0x01);
        vm.stopPrank();

        assertEq(registry.getCapabilities(operatorA), 0x01);
        assertFalse(registry.isApprovedFor(operatorA, 0x02));
        assertFalse(registry.isApprovedFor(operatorA, 0x04));
    }

    function test_UpdateCapabilities_RevertIf_ZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(IOperatorRegistry.OperatorRegistry__ZeroAddress.selector);
        registry.updateCapabilities(address(0), 0x07);
    }

    function test_UpdateCapabilities_RevertIf_NotApproved() public {
        vm.prank(owner);
        vm.expectRevert(IOperatorRegistry.OperatorRegistry__NotApproved.selector);
        registry.updateCapabilities(operatorA, 0x07);
    }

    function test_UpdateCapabilities_RevertIf_InvalidCapabilities_Zero() public {
        vm.startPrank(owner);
        registry.approveOperator(operatorA, 0x07, "Valid");

        vm.expectRevert(IOperatorRegistry.OperatorRegistry__InvalidCapabilities.selector);
        registry.updateCapabilities(operatorA, 0x00);
        vm.stopPrank();
    }

    function test_UpdateCapabilities_RevertIf_InvalidCapabilities_TooHigh() public {
        vm.startPrank(owner);
        registry.approveOperator(operatorA, 0x07, "Valid");

        vm.expectRevert(IOperatorRegistry.OperatorRegistry__InvalidCapabilities.selector);
        registry.updateCapabilities(operatorA, 0x08);
        vm.stopPrank();
    }

    function test_UpdateCapabilities_RevertIf_NotOwner() public {
        vm.prank(owner);
        registry.approveOperator(operatorA, 0x01, "Protected");

        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", nonOwner));
        registry.updateCapabilities(operatorA, 0x07);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_IsApprovedFor_UnapprovedOperator() public view {
        assertFalse(registry.isApprovedFor(operatorA, 0x01));
        assertFalse(registry.isApprovedFor(operatorA, 0x02));
        assertFalse(registry.isApprovedFor(operatorA, 0x04));
    }

    function test_GetOperator_Nonexistent() public view {
        IOperatorRegistry.Operator memory op = registry.getOperator(operatorA);
        assertFalse(op.approved);
        assertEq(op.capabilities, 0);
        assertEq(op.approvedAt, 0);
        assertEq(op.revokedAt, 0);
        assertEq(bytes(op.identifier).length, 0);
    }

    function test_GetCapabilities_Nonexistent() public view {
        assertEq(registry.getCapabilities(operatorA), 0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OWNERSHIP (Ownable2Step)
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Ownership_InitialOwner() public view {
        assertEq(registry.owner(), owner);
    }

    function test_Ownership_TwoStepTransfer() public {
        address newOwner = makeAddr("newOwner");

        vm.prank(owner);
        registry.transferOwnership(newOwner);

        // Pending owner set, but ownership not transferred yet
        assertEq(registry.owner(), owner);
        assertEq(registry.pendingOwner(), newOwner);

        // New owner must accept
        vm.prank(newOwner);
        registry.acceptOwnership();

        assertEq(registry.owner(), newOwner);
        assertEq(registry.pendingOwner(), address(0));
    }

    function test_Ownership_OnlyPendingOwnerCanAccept() public {
        address newOwner = makeAddr("newOwner");

        vm.prank(owner);
        registry.transferOwnership(newOwner);

        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", nonOwner));
        registry.acceptOwnership();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FUZZ TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Fuzz test for valid capability combinations
    function testFuzz_ApproveOperator_ValidCapabilities(uint8 capabilities) public {
        // Bound to valid range [1, 7]
        capabilities = uint8(bound(capabilities, 1, 7));

        vm.prank(owner);
        registry.approveOperator(operatorA, capabilities, "FuzzOp");

        assertTrue(registry.isApproved(operatorA));
        assertEq(registry.getCapabilities(operatorA), capabilities);
    }

    /// @notice Fuzz test that invalid capabilities always revert
    function testFuzz_ApproveOperator_InvalidCapabilities(uint8 capabilities) public {
        // Outside valid range
        vm.assume(capabilities == 0 || capabilities > 7);

        vm.prank(owner);
        vm.expectRevert(IOperatorRegistry.OperatorRegistry__InvalidCapabilities.selector);
        registry.approveOperator(operatorA, capabilities, "FuzzOp");
    }

    /// @notice Fuzz test for operator count consistency
    function testFuzz_OperatorCount(uint8 numOperators) public {
        // Reasonable bound for test
        numOperators = uint8(bound(numOperators, 1, 50));

        vm.startPrank(owner);
        for (uint256 i = 0; i < numOperators; i++) {
            address op = address(uint160(i + 1000));
            registry.approveOperator(op, 0x07, "Op");
        }
        vm.stopPrank();

        assertEq(registry.approvedOperatorCount(), numOperators);
    }

    /// @notice Fuzz test for capability bit checks
    function testFuzz_IsApprovedFor_CapabilityBits(uint8 capabilities, uint8 checkBit) public {
        capabilities = uint8(bound(capabilities, 1, 7));
        checkBit = uint8(bound(checkBit, 1, 7));

        vm.prank(owner);
        registry.approveOperator(operatorA, capabilities, "BitCheck");

        bool expected = (capabilities & checkBit) == checkBit;
        assertEq(registry.isApprovedFor(operatorA, checkBit), expected);
    }

    /// @notice Zero registryType should always return false (no valid capability)
    function test_IsApprovedFor_ZeroRegistryType() public {
        vm.prank(owner);
        registry.approveOperator(operatorA, 0x07, "FullOp"); // All capabilities

        // Even with all capabilities, zero registryType check should fail
        assertFalse(registry.isApprovedFor(operatorA, 0));
    }
}
