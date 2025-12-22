// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { HyperlaneAdapter } from "../src/crosschain/adapters/HyperlaneAdapter.sol";
import { IBridgeAdapter } from "../src/interfaces/IBridgeAdapter.sol";
import { MockMailbox } from "./mocks/MockMailbox.sol";
import { MockInterchainGasPaymaster } from "./mocks/MockInterchainGasPaymaster.sol";

contract HyperlaneAdapterTest is Test {
    HyperlaneAdapter adapter;
    MockMailbox mailbox;
    MockInterchainGasPaymaster gasPaymaster;

    address owner = address(0x1);
    address user = address(0x2);

    uint32 constant LOCAL_DOMAIN = 11_155_420; // Optimism Sepolia
    uint32 constant HUB_DOMAIN = 84_532; // Base Sepolia

    function setUp() public {
        mailbox = new MockMailbox(LOCAL_DOMAIN);
        gasPaymaster = new MockInterchainGasPaymaster();

        vm.prank(owner);
        adapter = new HyperlaneAdapter(owner, address(mailbox), address(gasPaymaster));

        // Configure supported domain
        vm.prank(owner);
        adapter.setDomainSupport(HUB_DOMAIN, true);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Constructor_SetsImmutables() public view {
        assertEq(address(adapter.mailbox()), address(mailbox));
        assertEq(address(adapter.gasPaymaster()), address(gasPaymaster));
        assertEq(adapter.owner(), owner);
    }

    function test_BridgeName() public view {
        assertEq(adapter.bridgeName(), "Hyperlane");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DOMAIN SUPPORT TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_SupportsChain_Enabled() public view {
        assertTrue(adapter.supportsChain(HUB_DOMAIN));
    }

    function test_SupportsChain_Disabled() public view {
        assertFalse(adapter.supportsChain(999));
    }

    function test_SetDomainSupport_OnlyOwner() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", user));
        adapter.setDomainSupport(999, true);
    }

    function test_SetDomainSupport_Success() public {
        uint32 newDomain = 42_161; // Arbitrum One

        vm.expectEmit(true, false, false, true);
        emit HyperlaneAdapter.DomainSupportUpdated(newDomain, true);

        vm.prank(owner);
        adapter.setDomainSupport(newDomain, true);

        assertTrue(adapter.supportsChain(newDomain));
    }

    function test_AddDomains_Batch() public {
        uint32[] memory domains = new uint32[](3);
        domains[0] = 1;
        domains[1] = 10;
        domains[2] = 137;

        vm.prank(owner);
        adapter.addDomains(domains);

        assertTrue(adapter.supportsChain(1));
        assertTrue(adapter.supportsChain(10));
        assertTrue(adapter.supportsChain(137));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // QUOTE MESSAGE TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_QuoteMessage_UnsupportedChain_Reverts() public {
        vm.expectRevert(IBridgeAdapter.BridgeAdapter__UnsupportedChain.selector);
        adapter.quoteMessage(999, "test");
    }

    function test_QuoteMessage_Success() public view {
        uint256 quote = adapter.quoteMessage(HUB_DOMAIN, "test");

        // Default gas amount is 200,000, default gas price is 1 gwei
        uint256 expected = 200_000 * 1 gwei;
        assertEq(quote, expected);
    }

    function test_QuoteMessage_CustomGasAmount() public {
        vm.prank(owner);
        adapter.setGasAmount(HUB_DOMAIN, 500_000);

        uint256 quote = adapter.quoteMessage(HUB_DOMAIN, "test");
        assertEq(quote, 500_000 * 1 gwei);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SEND MESSAGE TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_SendMessage_UnsupportedChain_Reverts() public {
        vm.expectRevert(IBridgeAdapter.BridgeAdapter__UnsupportedChain.selector);
        adapter.sendMessage(999, bytes32(uint256(1)), "test");
    }

    function test_SendMessage_InsufficientFee_Reverts() public {
        bytes32 recipient = bytes32(uint256(uint160(address(0x3))));

        vm.expectRevert(IBridgeAdapter.BridgeAdapter__InsufficientFee.selector);
        adapter.sendMessage{ value: 1 }(HUB_DOMAIN, recipient, "test");
    }

    function test_SendMessage_Success() public {
        bytes32 recipient = bytes32(uint256(uint160(address(0x3))));
        bytes memory payload = "registration_data";
        uint256 fee = adapter.quoteMessage(HUB_DOMAIN, payload);

        vm.deal(user, fee);
        vm.prank(user);

        // Don't check messageId - it's dynamic
        vm.expectEmit(false, true, false, true);
        emit IBridgeAdapter.MessageSent(bytes32(0), HUB_DOMAIN, recipient, payload);

        bytes32 messageId = adapter.sendMessage{ value: fee }(HUB_DOMAIN, recipient, payload);

        // Verify message was dispatched
        assertEq(mailbox.lastDestination(), HUB_DOMAIN);
        assertEq(mailbox.lastRecipient(), recipient);
        assertEq(mailbox.lastMessage(), payload);
        assertEq(messageId, mailbox.lastMessageId());
    }

    function test_SendMessage_RefundsExcess() public {
        bytes32 recipient = bytes32(uint256(uint160(address(0x3))));
        bytes memory payload = "test";
        uint256 fee = adapter.quoteMessage(HUB_DOMAIN, payload);
        uint256 excess = 0.1 ether;

        vm.deal(user, fee + excess);
        uint256 balanceBefore = user.balance;

        vm.prank(user);
        adapter.sendMessage{ value: fee + excess }(HUB_DOMAIN, recipient, payload);

        // User should have received refund of excess
        assertEq(user.balance, balanceBefore - fee);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GAS AMOUNT CONFIGURATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_SetGasAmount_OnlyOwner() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", user));
        adapter.setGasAmount(HUB_DOMAIN, 300_000);
    }

    function test_SetGasAmount_Success() public {
        vm.expectEmit(true, false, false, true);
        emit HyperlaneAdapter.GasAmountUpdated(HUB_DOMAIN, 300_000);

        vm.prank(owner);
        adapter.setGasAmount(HUB_DOMAIN, 300_000);

        assertEq(adapter.gasAmounts(HUB_DOMAIN), 300_000);
    }

    function test_DefaultGasAmount() public view {
        assertEq(adapter.DEFAULT_GAS_AMOUNT(), 200_000);
    }
}
