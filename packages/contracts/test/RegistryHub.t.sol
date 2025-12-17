// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console2 } from "forge-std/Test.sol";
import { RegistryHub } from "../src/RegistryHub.sol";
import { FeeManager } from "../src/FeeManager.sol";
import { StolenWalletRegistry } from "../src/registries/StolenWalletRegistry.sol";
import { IRegistryHub } from "../src/interfaces/IRegistryHub.sol";
import { IStolenWalletRegistry } from "../src/interfaces/IStolenWalletRegistry.sol";
import { MockAggregator } from "./mocks/MockAggregator.sol";

/// @title RegistryHubTest
/// @notice Comprehensive unit tests for RegistryHub
contract RegistryHubTest is Test {
    RegistryHub public hub;
    FeeManager public feeManager;
    StolenWalletRegistry public walletRegistry;
    MockAggregator public mockOracle;

    address public owner;
    address public user;
    address public recipient;

    // EIP-712 constants
    bytes32 private constant ACKNOWLEDGEMENT_TYPEHASH =
        keccak256("AcknowledgementOfRegistry(address owner,address forwarder,uint256 nonce,uint256 deadline)");
    bytes32 private constant REGISTRATION_TYPEHASH =
        keccak256("Registration(address owner,address forwarder,uint256 nonce,uint256 deadline)");
    bytes32 private constant TYPE_HASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    function setUp() public {
        owner = makeAddr("owner");
        user = makeAddr("user");
        recipient = makeAddr("recipient");

        vm.deal(owner, 10 ether);
        vm.deal(user, 10 ether);

        // Deploy mock oracle with $3000 ETH price
        mockOracle = new MockAggregator(300_000_000_000);

        // Deploy contracts
        vm.startPrank(owner);
        walletRegistry = new StolenWalletRegistry();
        feeManager = new FeeManager(owner, address(mockOracle));
        hub = new RegistryHub(owner, address(feeManager), address(walletRegistry));
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Constructor_WithAllParams() public view {
        assertEq(hub.owner(), owner);
        assertEq(hub.feeManager(), address(feeManager));
        assertEq(hub.getRegistry(hub.STOLEN_WALLET()), address(walletRegistry));
        assertFalse(hub.paused());
    }

    function test_Constructor_WithoutFeeManager() public {
        vm.prank(owner);
        RegistryHub noFeesHub = new RegistryHub(owner, address(0), address(walletRegistry));

        assertEq(noFeesHub.feeManager(), address(0));
        assertEq(noFeesHub.currentFeeWei(), 0);
    }

    function test_Constructor_WithoutRegistry() public {
        vm.prank(owner);
        RegistryHub noRegistryHub = new RegistryHub(owner, address(feeManager), address(0));

        assertEq(noRegistryHub.getRegistry(noRegistryHub.STOLEN_WALLET()), address(0));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REGISTRY TYPE CONSTANTS TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_RegistryTypeConstants() public view {
        assertEq(hub.stolenWalletRegistryType(), keccak256("STOLEN_WALLET_REGISTRY"));
        assertEq(hub.fraudulentContractRegistryType(), keccak256("FRAUDULENT_CONTRACT_REGISTRY"));
        assertEq(hub.stolenTransactionRegistryType(), keccak256("STOLEN_TRANSACTION_REGISTRY"));
    }

    function test_RegistryTypeConstants_MatchStorage() public view {
        assertEq(hub.stolenWalletRegistryType(), hub.STOLEN_WALLET());
        assertEq(hub.fraudulentContractRegistryType(), hub.FRAUDULENT_CONTRACT());
        assertEq(hub.stolenTransactionRegistryType(), hub.STOLEN_TRANSACTION());
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PAUSE TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Pause_OnlyOwner() public {
        vm.prank(user);
        vm.expectRevert();
        hub.setPaused(true);
    }

    function test_Pause_Success() public {
        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit IRegistryHub.HubPaused(true);

        hub.setPaused(true);
        assertTrue(hub.paused());
    }

    function test_Unpause_Success() public {
        vm.prank(owner);
        hub.setPaused(true);

        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit IRegistryHub.HubPaused(false);

        hub.setPaused(false);
        assertFalse(hub.paused());
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // QUERY PASSTHROUGH TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_IsWalletRegistered_ReturnsCorrectState() public view {
        // No registration yet
        assertFalse(hub.isWalletRegistered(user));
    }

    function test_IsWalletPending_ReturnsCorrectState() public view {
        // No acknowledgement yet
        assertFalse(hub.isWalletPending(user));
    }

    function test_IsWalletRegistered_NoRegistry() public {
        vm.prank(owner);
        RegistryHub noRegistryHub = new RegistryHub(owner, address(feeManager), address(0));

        // Should return false when no registry is configured
        assertFalse(noRegistryHub.isWalletRegistered(user));
    }

    function test_IsWalletPending_NoRegistry() public {
        vm.prank(owner);
        RegistryHub noRegistryHub = new RegistryHub(owner, address(feeManager), address(0));

        // Should return false when no registry is configured
        assertFalse(noRegistryHub.isWalletPending(user));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE HANDLING TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_CurrentFeeWei_WithFeeManager() public view {
        uint256 fee = hub.currentFeeWei();
        uint256 expectedFee = feeManager.currentFeeWei();
        assertEq(fee, expectedFee);
        assertGt(fee, 0);
    }

    function test_CurrentFeeWei_NoFeeManager() public {
        vm.prank(owner);
        RegistryHub noFeesHub = new RegistryHub(owner, address(0), address(walletRegistry));

        assertEq(noFeesHub.currentFeeWei(), 0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REGISTRY MANAGEMENT TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_SetRegistry_OnlyOwner() public {
        bytes32 registryType = hub.STOLEN_WALLET();
        vm.prank(user);
        vm.expectRevert();
        hub.setRegistry(registryType, address(0));
    }

    function test_SetRegistry_Success() public {
        StolenWalletRegistry newRegistry = new StolenWalletRegistry();
        bytes32 registryType = hub.STOLEN_WALLET();

        vm.expectEmit(true, true, true, true);
        emit IRegistryHub.RegistryUpdated(registryType, address(newRegistry));

        vm.prank(owner);
        hub.setRegistry(registryType, address(newRegistry));
        assertEq(hub.getRegistry(registryType), address(newRegistry));
    }

    function test_SetRegistry_Unregister() public {
        bytes32 registryType = hub.STOLEN_WALLET();
        vm.prank(owner);
        hub.setRegistry(registryType, address(0));

        assertEq(hub.getRegistry(registryType), address(0));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE MANAGER MANAGEMENT TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_SetFeeManager_OnlyOwner() public {
        vm.prank(user);
        vm.expectRevert();
        hub.setFeeManager(address(0));
    }

    function test_SetFeeManager_Success() public {
        FeeManager newFeeManager = new FeeManager(owner, address(mockOracle));

        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit IRegistryHub.FeeManagerUpdated(address(newFeeManager));

        hub.setFeeManager(address(newFeeManager));
        assertEq(hub.feeManager(), address(newFeeManager));
    }

    function test_SetFeeManager_ToZero() public {
        vm.prank(owner);
        hub.setFeeManager(address(0));

        assertEq(hub.feeManager(), address(0));
        assertEq(hub.currentFeeWei(), 0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ETH HANDLING TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_ReceiveEth() public {
        uint256 amount = 1 ether;

        vm.prank(user);
        (bool success,) = address(hub).call{ value: amount }("");

        assertTrue(success);
        assertEq(address(hub).balance, amount);
    }

    function test_WithdrawFees_OnlyOwner() public {
        // Send some ETH first
        vm.prank(user);
        (bool success,) = address(hub).call{ value: 1 ether }("");
        assertTrue(success);

        vm.prank(user);
        vm.expectRevert();
        hub.withdrawFees(recipient, 0.5 ether);
    }

    function test_WithdrawFees_Success() public {
        // Send some ETH first
        vm.prank(user);
        (bool success,) = address(hub).call{ value: 1 ether }("");
        assertTrue(success);

        uint256 withdrawAmount = 0.5 ether;
        uint256 recipientBalanceBefore = recipient.balance;

        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit IRegistryHub.FeesWithdrawn(recipient, withdrawAmount);

        hub.withdrawFees(recipient, withdrawAmount);

        assertEq(recipient.balance, recipientBalanceBefore + withdrawAmount);
        assertEq(address(hub).balance, 0.5 ether);
    }

    function test_WithdrawFees_FullBalance() public {
        // Send some ETH first
        vm.prank(user);
        (bool success,) = address(hub).call{ value: 1 ether }("");
        assertTrue(success);

        vm.prank(owner);
        hub.withdrawFees(recipient, 1 ether);

        assertEq(address(hub).balance, 0);
    }

    function test_WithdrawFees_ToContractThatRejects() public {
        // Send some ETH first
        vm.prank(user);
        (bool success,) = address(hub).call{ value: 1 ether }("");
        assertTrue(success);

        // Deploy a contract that rejects ETH
        RejectingContract rejecter = new RejectingContract();

        vm.prank(owner);
        vm.expectRevert(IRegistryHub.Hub__WithdrawalFailed.selector);
        hub.withdrawFees(address(rejecter), 0.5 ether);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OWNERSHIP TESTS (Ownable2Step)
    // ═══════════════════════════════════════════════════════════════════════════

    function test_TransferOwnership_TwoStep() public {
        address newOwner = makeAddr("newOwner");

        // Step 1: Current owner initiates transfer
        vm.prank(owner);
        hub.transferOwnership(newOwner);

        // Ownership hasn't changed yet
        assertEq(hub.owner(), owner);
        assertEq(hub.pendingOwner(), newOwner);

        // Step 2: New owner accepts
        vm.prank(newOwner);
        hub.acceptOwnership();

        assertEq(hub.owner(), newOwner);
        assertEq(hub.pendingOwner(), address(0));
    }

    function test_TransferOwnership_OnlyPendingOwnerCanAccept() public {
        address newOwner = makeAddr("newOwner");

        vm.prank(owner);
        hub.transferOwnership(newOwner);

        // Random user cannot accept
        vm.prank(user);
        vm.expectRevert();
        hub.acceptOwnership();
    }

    function test_TransferOwnership_CanCancel() public {
        address newOwner = makeAddr("newOwner");

        vm.prank(owner);
        hub.transferOwnership(newOwner);

        // Owner changes mind and transfers to different address
        address differentOwner = makeAddr("differentOwner");
        vm.prank(owner);
        hub.transferOwnership(differentOwner);

        // Original pending owner can no longer accept
        vm.prank(newOwner);
        vm.expectRevert();
        hub.acceptOwnership();

        // New pending owner can accept
        assertEq(hub.pendingOwner(), differentOwner);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GETREGISTRY TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_GetRegistry_ReturnsCorrectAddress() public view {
        assertEq(hub.getRegistry(hub.STOLEN_WALLET()), address(walletRegistry));
    }

    function test_GetRegistry_ReturnsZeroForUnregistered() public view {
        assertEq(hub.getRegistry(hub.FRAUDULENT_CONTRACT()), address(0));
        assertEq(hub.getRegistry(hub.STOLEN_TRANSACTION()), address(0));
        assertEq(hub.getRegistry(keccak256("RANDOM_REGISTRY")), address(0));
    }
}

/// @notice Helper contract that rejects ETH transfers
contract RejectingContract {
    receive() external payable {
        revert("No ETH accepted");
    }
}
