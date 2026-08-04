// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { SpokeSoulboundForwarder } from "../src/spoke/SpokeSoulboundForwarder.sol";
import { ISpokeSoulboundForwarder } from "../src/interfaces/ISpokeSoulboundForwarder.sol";
import { HyperlaneAdapter } from "../src/crosschain/adapters/HyperlaneAdapter.sol";
import { TimelockOwnable } from "../src/libraries/TimelockOwnable.sol";
import { MockMailbox } from "./mocks/MockMailbox.sol";

contract SpokeSoulboundForwarderTest is Test {
    SpokeSoulboundForwarder forwarder;
    HyperlaneAdapter adapter;
    MockMailbox mailbox;

    address owner;
    address user;
    address hubReceiver;

    uint32 constant SPOKE_CHAIN_ID = 11_155_420; // Optimism Sepolia
    uint32 constant HUB_DOMAIN = 84_532; // Base Sepolia
    uint256 constant MIN_DONATION = 0.01 ether;

    function setUp() public {
        vm.chainId(SPOKE_CHAIN_ID);

        owner = makeAddr("owner");
        user = makeAddr("user");
        hubReceiver = makeAddr("hubReceiver");
        vm.deal(user, 10 ether);

        mailbox = new MockMailbox(SPOKE_CHAIN_ID);

        vm.startPrank(owner);
        adapter = new HyperlaneAdapter(owner, address(mailbox));
        adapter.setDomainSupport(HUB_DOMAIN, true);

        forwarder = new SpokeSoulboundForwarder(
            owner, address(adapter), HUB_DOMAIN, bytes32(uint256(uint160(hubReceiver))), MIN_DONATION
        );
        adapter.setAuthorizedSender(address(forwarder), true);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Constructor_SetsCorrectState() public view {
        assertEq(forwarder.hubDomain(), HUB_DOMAIN);
        assertEq(forwarder.hubReceiver(), bytes32(uint256(uint160(hubReceiver))));
        assertEq(forwarder.minDonation(), MIN_DONATION);
    }

    function test_Constructor_RevertsOnZeroBridgeAdapter() public {
        vm.expectRevert(ISpokeSoulboundForwarder.SpokeSoulboundForwarder__ZeroAddress.selector);
        new SpokeSoulboundForwarder(owner, address(0), HUB_DOMAIN, bytes32(uint256(uint160(hubReceiver))), MIN_DONATION);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WALLET MINT TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_RequestWalletMint_Success() public {
        address wallet = makeAddr("wallet");
        uint256 fee = forwarder.quoteCrossChainFee();

        vm.prank(user);
        forwarder.requestWalletMint{ value: fee }(wallet);

        // Verify message was dispatched
        assertGt(mailbox.messageCount(), 0);
        assertEq(mailbox.lastDestination(), HUB_DOMAIN);
    }

    function test_RequestWalletMint_RevertsOnZeroWallet() public {
        uint256 fee = forwarder.quoteCrossChainFee();

        vm.prank(user);
        vm.expectRevert(ISpokeSoulboundForwarder.SpokeSoulboundForwarder__ZeroAddress.selector);
        forwarder.requestWalletMint{ value: fee }(address(0));
    }

    function test_RequestWalletMint_RevertsOnInsufficientPayment() public {
        address wallet = makeAddr("wallet");
        uint256 fee = forwarder.quoteCrossChainFee();

        vm.prank(user);
        vm.expectRevert(ISpokeSoulboundForwarder.SpokeSoulboundForwarder__InsufficientPayment.selector);
        forwarder.requestWalletMint{ value: fee - 1 }(wallet);
    }

    function test_RequestWalletMint_RefundsExcess() public {
        address wallet = makeAddr("wallet");
        uint256 fee = forwarder.quoteCrossChainFee();
        uint256 excess = 0.5 ether;
        uint256 balanceBefore = user.balance;

        vm.prank(user);
        forwarder.requestWalletMint{ value: fee + excess }(wallet);

        // User should get excess back
        assertEq(user.balance, balanceBefore - fee);
    }

    function test_RequestWalletMint_RevertsIfHubNotConfigured() public {
        vm.prank(owner);
        SpokeSoulboundForwarder unconfigured = new SpokeSoulboundForwarder(
            owner,
            address(adapter),
            HUB_DOMAIN,
            bytes32(0), // No hub receiver
            MIN_DONATION
        );

        vm.prank(user);
        vm.expectRevert(ISpokeSoulboundForwarder.SpokeSoulboundForwarder__HubNotConfigured.selector);
        unconfigured.requestWalletMint{ value: 1 ether }(makeAddr("wallet"));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SUPPORT MINT TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_RequestSupportMint_Success() public {
        uint256 donation = 0.05 ether;
        uint256 total = forwarder.quoteSupportMintFee(donation);

        vm.prank(user);
        forwarder.requestSupportMint{ value: total }(donation);

        // Verify message was dispatched
        assertGt(mailbox.messageCount(), 0);
        // Verify donation accumulated on contract
        assertEq(address(forwarder).balance, donation);
    }

    function test_RequestSupportMint_RevertsOnDonationBelowMinimum() public {
        uint256 donation = MIN_DONATION - 1;
        uint256 fee = forwarder.quoteCrossChainFee();

        vm.prank(user);
        vm.expectRevert(ISpokeSoulboundForwarder.SpokeSoulboundForwarder__DonationBelowMinimum.selector);
        forwarder.requestSupportMint{ value: fee + donation }(donation);
    }

    function test_RequestSupportMint_RevertsOnInsufficientPayment() public {
        uint256 donation = 0.05 ether;
        uint256 total = forwarder.quoteSupportMintFee(donation);

        vm.prank(user);
        vm.expectRevert(ISpokeSoulboundForwarder.SpokeSoulboundForwarder__InsufficientPayment.selector);
        forwarder.requestSupportMint{ value: total - 1 }(donation);
    }

    function test_RequestSupportMint_RefundsExcess() public {
        uint256 donation = 0.05 ether;
        uint256 total = forwarder.quoteSupportMintFee(donation);
        uint256 excess = 0.5 ether;
        uint256 balanceBefore = user.balance;

        vm.prank(user);
        forwarder.requestSupportMint{ value: total + excess }(donation);

        // User should get excess back
        assertEq(user.balance, balanceBefore - total);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE QUOTE TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_QuoteCrossChainFee_ReturnsValidFee() public view {
        uint256 fee = forwarder.quoteCrossChainFee();
        assertGt(fee, 0);
    }

    function test_QuoteSupportMintFee_IncludesDonation() public view {
        uint256 donation = 0.05 ether;
        uint256 crossChainFee = forwarder.quoteCrossChainFee();
        uint256 supportFee = forwarder.quoteSupportMintFee(donation);

        assertEq(supportFee, crossChainFee + donation);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_SetHubConfig_Success() public {
        address newReceiver = makeAddr("newReceiver");
        uint32 newDomain = 1;

        vm.prank(owner);
        forwarder.setHubConfig(newDomain, bytes32(uint256(uint160(newReceiver))));

        assertEq(forwarder.hubDomain(), newDomain);
        assertEq(forwarder.hubReceiver(), bytes32(uint256(uint160(newReceiver))));
    }

    /// @notice Repointing the hub receiver post-setup requires the timelock.
    /// @dev SECURITY (C-5). `hubReceiver` is where every paid mint request lands.
    ///      `setHubConfig(d, bytes32(0))` bricks both mint paths on the HubNotConfigured check,
    ///      and a garbage domain burns real bridge fees on messages nothing will ever handle —
    ///      neither is recoverable for users who already paid. This contract was plain
    ///      Ownable2Step, so that was a one-transaction owner call; the deploy script's comment
    ///      claiming it "cannot repoint a registry" was simply wrong.
    function test_SetHubConfig_BlockedAfterSetup() public {
        vm.prank(owner);
        forwarder.completeSetup();

        vm.prank(owner);
        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        forwarder.setHubConfig(999, bytes32(0));

        assertTrue(forwarder.hubReceiver() != bytes32(0), "Hub receiver must be unchanged");
    }

    /// @notice The propose → wait → activate path repoints after the full delay.
    function test_SetHubConfig_ViaTimelock() public {
        vm.prank(owner);
        forwarder.completeSetup();

        uint32 newDomain = 1;
        bytes32 newReceiver = bytes32(uint256(uint160(makeAddr("newReceiver"))));

        vm.prank(owner);
        forwarder.proposeHubConfig(newDomain, newReceiver);

        vm.warp(block.timestamp + forwarder.ACTIVATION_DELAY() - 1);
        vm.prank(owner);
        vm.expectRevert(TimelockOwnable.TimelockOwnable__TooEarly.selector);
        forwarder.activateHubConfig(newDomain, newReceiver);

        vm.warp(block.timestamp + 1);
        vm.prank(owner);
        forwarder.activateHubConfig(newDomain, newReceiver);

        assertEq(forwarder.hubDomain(), newDomain);
        assertEq(forwarder.hubReceiver(), newReceiver);
    }

    /// @notice Activation applies only the exact configuration that was proposed.
    /// @dev Both members are part of the action key, so a proposal for one domain cannot be
    ///      activated against another — otherwise the two-day public delay would say nothing
    ///      about what actually gets written at the end of it.
    function test_ActivateHubConfig_RejectsUnproposedValues() public {
        vm.prank(owner);
        forwarder.completeSetup();

        bytes32 receiver = bytes32(uint256(uint160(makeAddr("proposedReceiver"))));
        vm.prank(owner);
        forwarder.proposeHubConfig(1, receiver);
        vm.warp(block.timestamp + forwarder.ACTIVATION_DELAY());

        vm.prank(owner);
        vm.expectRevert(TimelockOwnable.TimelockOwnable__NotProposed.selector);
        forwarder.activateHubConfig(2, receiver);

        vm.prank(owner);
        vm.expectRevert(TimelockOwnable.TimelockOwnable__NotProposed.selector);
        forwarder.activateHubConfig(1, bytes32(uint256(uint160(makeAddr("attacker")))));
    }

    function test_SetMinDonation_Success() public {
        uint256 newMin = 0.02 ether;

        vm.prank(owner);
        forwarder.setMinDonation(newMin);

        assertEq(forwarder.minDonation(), newMin);
    }

    function test_WithdrawDonations_Success() public {
        // First accumulate some donations
        uint256 donation = 0.05 ether;
        uint256 total = forwarder.quoteSupportMintFee(donation);

        vm.prank(user);
        forwarder.requestSupportMint{ value: total }(donation);

        assertEq(address(forwarder).balance, donation);

        // Withdraw
        address treasury = makeAddr("treasury");
        vm.prank(owner);
        forwarder.withdrawDonations(treasury, donation);

        assertEq(treasury.balance, donation);
        assertEq(address(forwarder).balance, 0);
    }

    function test_WithdrawDonations_RevertsOnZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(ISpokeSoulboundForwarder.SpokeSoulboundForwarder__ZeroAddress.selector);
        forwarder.withdrawDonations(address(0), 1 ether);
    }

    function test_WithdrawDonations_RevertsOnInsufficientBalance() public {
        // Contract has 0 balance, try to withdraw 1 ether
        vm.prank(owner);
        vm.expectRevert(ISpokeSoulboundForwarder.SpokeSoulboundForwarder__InsufficientBalance.selector);
        forwarder.withdrawDonations(makeAddr("treasury"), 1 ether);
    }

    function test_SetHubConfig_OnlyOwner() public {
        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker));
        forwarder.setHubConfig(1, bytes32(uint256(1)));
    }

    function test_SetMinDonation_OnlyOwner() public {
        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker));
        forwarder.setMinDonation(0.1 ether);
    }

    /// @notice Only the owner can move accumulated donations out of the contract.
    /// @dev SECURITY. This test previously used a bare `vm.expectRevert()` against a contract
    ///      `setUp` never funded, so it was satisfied by the `InsufficientBalance` guard and
    ///      passed with `onlyOwner` deleted — a vacuous test on the one function that moves user
    ///      donations. The contract is funded first so the balance guard cannot fire, and the
    ///      access-control selector is pinned so only the access control can satisfy it.
    function test_WithdrawDonations_OnlyOwner() public {
        vm.deal(address(forwarder), 5 ether);

        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker));
        forwarder.withdrawDonations(makeAddr("treasury"), 1 ether);

        assertEq(address(forwarder).balance, 5 ether, "Donations must be untouched");
    }

    function test_SetMinDonation_EmitsEvent() public {
        uint256 oldMin = forwarder.minDonation();
        uint256 newMin = 0.1 ether;

        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit ISpokeSoulboundForwarder.MinDonationUpdated(oldMin, newMin);
        forwarder.setMinDonation(newMin);
    }
}
