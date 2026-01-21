// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { RegistryHub } from "../src/RegistryHub.sol";
import { FeeManager } from "../src/FeeManager.sol";
import { StolenWalletRegistry } from "../src/registries/StolenWalletRegistry.sol";
import { IRegistryHub } from "../src/interfaces/IRegistryHub.sol";
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

    // Timing configuration (matching local Anvil - 13s blocks)
    uint256 internal constant GRACE_BLOCKS = 10;
    uint256 internal constant DEADLINE_BLOCKS = 50;

    function setUp() public {
        owner = makeAddr("owner");
        user = makeAddr("user");
        recipient = makeAddr("recipient");

        vm.deal(owner, 10 ether);
        vm.deal(user, 10 ether);

        // Deploy mock oracle with $3000 ETH price
        mockOracle = new MockAggregator(300_000_000_000);

        // Deploy contracts in correct order for fee collection
        vm.startPrank(owner);
        feeManager = new FeeManager(owner, address(mockOracle));
        hub = new RegistryHub(owner, address(feeManager), address(0));
        walletRegistry =
            new StolenWalletRegistry(owner, address(feeManager), address(hub), GRACE_BLOCKS, DEADLINE_BLOCKS);
        hub.setRegistry(hub.STOLEN_WALLET(), address(walletRegistry));
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Constructor wires owner, fee manager, and paused state; registry is set via setUp.
    function test_Constructor_WithAllParams() public view {
        assertEq(hub.owner(), owner);
        assertEq(hub.feeManager(), address(feeManager));
        assertFalse(hub.paused());
    }

    // Constructor should wire initial registry when passed.
    function test_Constructor_WithInitialRegistry() public {
        vm.startPrank(owner);
        // Deploy new hub with registry passed to constructor
        RegistryHub hubWithRegistry = new RegistryHub(owner, address(feeManager), address(walletRegistry));
        vm.stopPrank();

        // Verify constructor-passed registry is wired correctly
        assertEq(hubWithRegistry.getRegistry(hubWithRegistry.STOLEN_WALLET()), address(walletRegistry));
    }

    // Verify setUp correctly wires registry (documents that setUp calls setRegistry, not constructor).
    function test_SetUp_WiresRegistry() public view {
        assertEq(hub.getRegistry(hub.STOLEN_WALLET()), address(walletRegistry));
    }

    // Constructor should allow fee-free configuration.
    function test_Constructor_WithoutFeeManager() public {
        vm.prank(owner);
        RegistryHub noFeesHub = new RegistryHub(owner, address(0), address(walletRegistry));

        assertEq(noFeesHub.feeManager(), address(0));
        assertEq(noFeesHub.currentFeeWei(), 0);
    }

    // Constructor should allow deploying without an initial registry.
    function test_Constructor_WithoutRegistry() public {
        vm.prank(owner);
        RegistryHub noRegistryHub = new RegistryHub(owner, address(feeManager), address(0));

        assertEq(noRegistryHub.getRegistry(noRegistryHub.STOLEN_WALLET()), address(0));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REGISTRY TYPE CONSTANTS TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Registry type constants should match expected hashes.
    function test_RegistryTypeConstants() public view {
        assertEq(hub.stolenWalletRegistryType(), keccak256("STOLEN_WALLET_REGISTRY"));
        assertEq(hub.fraudulentContractRegistryType(), keccak256("FRAUDULENT_CONTRACT_REGISTRY"));
        assertEq(hub.stolenTransactionRegistryType(), keccak256("STOLEN_TRANSACTION_REGISTRY"));
    }

    // Public constant getters should match stored constants.
    function test_RegistryTypeConstants_MatchStorage() public view {
        assertEq(hub.stolenWalletRegistryType(), hub.STOLEN_WALLET());
        assertEq(hub.fraudulentContractRegistryType(), hub.FRAUDULENT_CONTRACT());
        assertEq(hub.stolenTransactionRegistryType(), hub.STOLEN_TRANSACTION());
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PAUSE TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Only owner should be able to pause the hub.
    function test_Pause_OnlyOwner() public {
        vm.startPrank(user);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", user));
        hub.setPaused(true);
        vm.stopPrank();
    }

    // Pausing should flip state and emit event.
    function test_Pause_Success() public {
        vm.startPrank(owner);
        vm.expectEmit(true, true, true, true);
        emit IRegistryHub.HubPaused(true);
        hub.setPaused(true);
        vm.stopPrank();

        assertTrue(hub.paused());
    }

    // Unpausing should flip state and emit event.
    function test_Unpause_Success() public {
        vm.prank(owner);
        hub.setPaused(true);

        vm.startPrank(owner);
        vm.expectEmit(true, true, true, true);
        emit IRegistryHub.HubPaused(false);
        hub.setPaused(false);
        vm.stopPrank();

        assertFalse(hub.paused());
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // QUERY PASSTHROUGH TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Passthrough query should return false before registration.
    function test_IsWalletRegistered_ReturnsCorrectState() public view {
        // No registration yet
        assertFalse(hub.isWalletRegistered(user));
    }

    // Passthrough pending query should return false before acknowledgement.
    function test_IsWalletPending_ReturnsCorrectState() public view {
        // No acknowledgement yet
        assertFalse(hub.isWalletPending(user));
    }

    // Passthrough should return false when registry is unset.
    function test_IsWalletRegistered_NoRegistry() public {
        vm.prank(owner);
        RegistryHub noRegistryHub = new RegistryHub(owner, address(feeManager), address(0));

        // Should return false when no registry is configured
        assertFalse(noRegistryHub.isWalletRegistered(user));
    }

    // Pending passthrough should return false when registry is unset.
    function test_IsWalletPending_NoRegistry() public {
        vm.prank(owner);
        RegistryHub noRegistryHub = new RegistryHub(owner, address(feeManager), address(0));

        // Should return false when no registry is configured
        assertFalse(noRegistryHub.isWalletPending(user));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE HANDLING TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // currentFeeWei should delegate to fee manager when configured.
    function test_CurrentFeeWei_WithFeeManager() public view {
        uint256 fee = hub.currentFeeWei();
        uint256 expectedFee = feeManager.currentFeeWei();
        assertEq(fee, expectedFee);
        assertGt(fee, 0);
    }

    // currentFeeWei should return 0 when fee manager is unset.
    function test_CurrentFeeWei_NoFeeManager() public {
        vm.prank(owner);
        RegistryHub noFeesHub = new RegistryHub(owner, address(0), address(walletRegistry));

        assertEq(noFeesHub.currentFeeWei(), 0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REGISTRY MANAGEMENT TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Only owner should be able to update registry addresses.
    function test_SetRegistry_OnlyOwner() public {
        bytes32 registryType = hub.STOLEN_WALLET();
        vm.startPrank(user);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", user));
        hub.setRegistry(registryType, address(0));
        vm.stopPrank();
    }

    // setRegistry should update mapping and emit event.
    function test_SetRegistry_Success() public {
        StolenWalletRegistry newRegistry =
            new StolenWalletRegistry(owner, address(feeManager), address(hub), GRACE_BLOCKS, DEADLINE_BLOCKS);
        bytes32 registryType = hub.STOLEN_WALLET();

        vm.startPrank(owner);
        vm.expectEmit(true, true, true, true);
        emit IRegistryHub.RegistryUpdated(registryType, address(newRegistry));
        hub.setRegistry(registryType, address(newRegistry));
        vm.stopPrank();

        assertEq(hub.getRegistry(registryType), address(newRegistry));
    }

    // setRegistry should allow clearing an entry.
    function test_SetRegistry_Unregister() public {
        bytes32 registryType = hub.STOLEN_WALLET();
        vm.prank(owner);
        hub.setRegistry(registryType, address(0));

        assertEq(hub.getRegistry(registryType), address(0));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE MANAGER MANAGEMENT TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Only owner should be able to set fee manager.
    function test_SetFeeManager_OnlyOwner() public {
        vm.startPrank(user);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", user));
        hub.setFeeManager(address(0));
        vm.stopPrank();
    }

    // setFeeManager should update state and emit event.
    function test_SetFeeManager_Success() public {
        FeeManager newFeeManager = new FeeManager(owner, address(mockOracle));

        vm.startPrank(owner);
        vm.expectEmit(true, true, true, true);
        emit IRegistryHub.FeeManagerUpdated(address(newFeeManager));
        hub.setFeeManager(address(newFeeManager));
        vm.stopPrank();

        assertEq(hub.feeManager(), address(newFeeManager));
    }

    // setFeeManager should allow disabling fees.
    function test_SetFeeManager_ToZero() public {
        vm.prank(owner);
        hub.setFeeManager(address(0));

        assertEq(hub.feeManager(), address(0));
        assertEq(hub.currentFeeWei(), 0);
    }

    // Only owner should be able to set cross-chain inbox.
    function test_SetCrossChainInbox_OnlyOwner() public {
        vm.startPrank(user);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", user));
        hub.setCrossChainInbox(address(0x123));
        vm.stopPrank();
    }

    // setCrossChainInbox should update state when called by owner.
    function test_SetCrossChainInbox_Success() public {
        address newInbox = makeAddr("crossChainInbox");

        vm.prank(owner);
        hub.setCrossChainInbox(newInbox);

        assertEq(hub.crossChainInbox(), newInbox);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ETH HANDLING TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Hub should be able to receive ETH.
    function test_ReceiveEth() public {
        uint256 amount = 1 ether;

        vm.prank(user);
        (bool success,) = address(hub).call{ value: amount }("");

        assertTrue(success);
        assertEq(address(hub).balance, amount);
    }

    // Only owner should be able to withdraw fees.
    function test_WithdrawFees_OnlyOwner() public {
        // Send some ETH first
        vm.prank(user);
        (bool success,) = address(hub).call{ value: 1 ether }("");
        assertTrue(success);

        vm.startPrank(user);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", user));
        hub.withdrawFees(recipient, 0.5 ether);
        vm.stopPrank();
    }

    // Withdraw should reject a zero recipient.
    function test_WithdrawFees_ZeroAddress_Reverts() public {
        // Fund the hub first so the revert is from zero address check, not insufficient balance
        vm.prank(user);
        (bool success,) = address(hub).call{ value: 1 ether }("");
        assertTrue(success);

        vm.prank(owner);
        vm.expectRevert(IRegistryHub.Hub__ZeroAddress.selector);
        hub.withdrawFees(address(0), 1);
    }

    // Withdraw should transfer requested amount and emit event.
    function test_WithdrawFees_Success() public {
        // Send some ETH first
        vm.prank(user);
        (bool success,) = address(hub).call{ value: 1 ether }("");
        assertTrue(success);

        uint256 withdrawAmount = 0.5 ether;
        uint256 recipientBalanceBefore = recipient.balance;

        vm.startPrank(owner);
        vm.expectEmit(true, true, true, true);
        emit IRegistryHub.FeesWithdrawn(recipient, withdrawAmount);
        hub.withdrawFees(recipient, withdrawAmount);
        vm.stopPrank();

        assertEq(recipient.balance, recipientBalanceBefore + withdrawAmount);
        assertEq(address(hub).balance, 0.5 ether);
    }

    // Withdraw should allow draining full balance.
    function test_WithdrawFees_FullBalance() public {
        // Send some ETH first
        vm.prank(user);
        (bool success,) = address(hub).call{ value: 1 ether }("");
        assertTrue(success);

        vm.prank(owner);
        hub.withdrawFees(recipient, 1 ether);

        assertEq(address(hub).balance, 0);
    }

    // Withdraw should revert when requesting more than available balance.
    function test_WithdrawFees_InsufficientBalance_Reverts() public {
        // Send some ETH first
        vm.prank(user);
        (bool success,) = address(hub).call{ value: 1 ether }("");
        assertTrue(success);

        vm.startPrank(owner);
        // Low-level call fails due to insufficient balance, which triggers Hub__WithdrawalFailed
        vm.expectRevert(IRegistryHub.Hub__WithdrawalFailed.selector);
        hub.withdrawFees(recipient, 2 ether);
        vm.stopPrank();
    }

    // Withdraw should revert if recipient rejects ETH.
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

    // Ownership transfer should require acceptOwnership by pending owner.
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

    // Only the pending owner should be able to accept ownership.
    function test_TransferOwnership_OnlyPendingOwnerCanAccept() public {
        address newOwner = makeAddr("newOwner");

        vm.prank(owner);
        hub.transferOwnership(newOwner);

        // Random user cannot accept
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", user));
        hub.acceptOwnership();
    }

    // Owner should be able to update pending owner before acceptance.
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
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", newOwner));
        hub.acceptOwnership();

        // New pending owner can accept
        assertEq(hub.pendingOwner(), differentOwner);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GETREGISTRY TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // getRegistry should return configured registry addresses.
    function test_GetRegistry_ReturnsCorrectAddress() public view {
        assertEq(hub.getRegistry(hub.STOLEN_WALLET()), address(walletRegistry));
    }

    // getRegistry should return zero for unknown types.
    function test_GetRegistry_ReturnsZeroForUnregistered() public view {
        assertEq(hub.getRegistry(hub.FRAUDULENT_CONTRACT()), address(0));
        assertEq(hub.getRegistry(hub.STOLEN_TRANSACTION()), address(0));
        assertEq(hub.getRegistry(keccak256("RANDOM_REGISTRY")), address(0));
    }

    // registerFromSpoke should revert if target registry is not configured.
    function test_RegisterFromSpoke_InvalidRegistry_Reverts() public {
        address inbox = makeAddr("inbox");
        vm.startPrank(owner);
        hub.setRegistry(hub.STOLEN_WALLET(), address(0));
        hub.setCrossChainInbox(inbox);
        vm.stopPrank();

        vm.expectRevert(IRegistryHub.Hub__InvalidRegistry.selector);
        vm.prank(inbox);
        hub.registerFromSpoke(user, 1, false, 1, bytes32(0));
    }

    // registerFromSpoke should revert if called by unauthorized address.
    function test_RegisterFromSpoke_UnauthorizedCaller_Reverts() public {
        address inbox = makeAddr("crossChainInbox");
        address unauthorized = makeAddr("unauthorized");

        vm.prank(owner);
        hub.setCrossChainInbox(inbox);

        vm.expectRevert(IRegistryHub.Hub__UnauthorizedInbox.selector);
        vm.prank(unauthorized);
        hub.registerFromSpoke(user, 1, false, 1, bytes32(0));
    }

    // registerFromSpoke should successfully register wallet when called by authorized inbox.
    function test_RegisterFromSpoke_Success() public {
        address inbox = makeAddr("crossChainInbox");
        address wallet = makeAddr("victimWallet");
        uint32 sourceChainId = 8453; // Base
        bytes32 messageId = keccak256("test-message");

        vm.prank(owner);
        hub.setCrossChainInbox(inbox);

        // Register via cross-chain inbox
        vm.prank(inbox);
        vm.expectEmit(true, true, true, true);
        emit IRegistryHub.CrossChainRegistration(wallet, sourceChainId, messageId);

        hub.registerFromSpoke(wallet, sourceChainId, false, 1, messageId);

        // Verify wallet is now registered
        assertTrue(hub.isWalletRegistered(wallet));
    }
}

/// @notice Helper contract that rejects ETH transfers
contract RejectingContract {
    receive() external payable {
        revert("No ETH accepted");
    }
}
