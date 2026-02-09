// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { SoulboundReceiver } from "../src/soulbound/SoulboundReceiver.sol";
import { ISoulboundReceiver } from "../src/interfaces/ISoulboundReceiver.sol";
import { WalletSoulbound } from "../src/soulbound/WalletSoulbound.sol";
import { SupportSoulbound } from "../src/soulbound/SupportSoulbound.sol";
import { TranslationRegistry } from "../src/soulbound/TranslationRegistry.sol";
import { MockMailbox } from "./mocks/MockMailbox.sol";

/// @notice Mock wallet registry for SoulboundReceiver tests
/// @dev WalletSoulbound now uses IWalletRegistry interface (isWalletRegistered/isWalletPending)
contract MockWalletRegistry {
    mapping(address => bool) public registered;
    mapping(address => bool) public pending;

    function setRegistered(address wallet, bool value) external {
        registered[wallet] = value;
    }

    function setPending(address wallet, bool value) external {
        pending[wallet] = value;
    }

    function isWalletRegistered(address wallet) external view returns (bool) {
        return registered[wallet];
    }

    function isWalletPending(address wallet) external view returns (bool) {
        return pending[wallet];
    }
}

contract SoulboundReceiverTest is Test {
    SoulboundReceiver receiver;
    WalletSoulbound walletSoulbound;
    SupportSoulbound supportSoulbound;
    MockWalletRegistry mockRegistry;
    TranslationRegistry translations;
    MockMailbox mailbox;

    address owner;
    address spokeForwarder;
    address registeredWallet;

    uint32 constant HUB_CHAIN_ID = 84_532; // Base Sepolia
    uint32 constant SPOKE_DOMAIN = 11_155_420; // Optimism Sepolia
    uint256 constant MIN_WEI = 0.01 ether;

    function setUp() public {
        vm.chainId(HUB_CHAIN_ID);

        owner = makeAddr("owner");
        spokeForwarder = makeAddr("spokeForwarder");
        registeredWallet = makeAddr("registeredWallet");

        vm.startPrank(owner);

        // Deploy mock mailbox
        mailbox = new MockMailbox(HUB_CHAIN_ID);

        // Deploy translation registry (has built-in English)
        translations = new TranslationRegistry(owner);

        // Deploy mock wallet registry
        mockRegistry = new MockWalletRegistry();

        // Deploy soulbound contracts
        walletSoulbound =
            new WalletSoulbound(address(mockRegistry), address(translations), owner, "stolenwallet.xyz", owner);

        supportSoulbound = new SupportSoulbound(MIN_WEI, address(translations), owner, "stolenwallet.xyz", owner);

        // Deploy receiver
        receiver = new SoulboundReceiver(owner, address(mailbox), address(walletSoulbound), address(supportSoulbound));

        // Set trusted forwarder
        receiver.setTrustedForwarder(SPOKE_DOMAIN, spokeForwarder);

        // Authorize receiver to mint support tokens (for cross-chain mints)
        supportSoulbound.setAuthorizedMinter(address(receiver), true);

        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Constructor_SetsCorrectState() public view {
        assertEq(receiver.mailbox(), address(mailbox));
        assertEq(receiver.walletSoulbound(), address(walletSoulbound));
        assertEq(receiver.supportSoulbound(), address(supportSoulbound));
    }

    function test_Constructor_RevertsOnZeroMailbox() public {
        vm.expectRevert(ISoulboundReceiver.SoulboundReceiver__ZeroAddress.selector);
        new SoulboundReceiver(owner, address(0), address(walletSoulbound), address(supportSoulbound));
    }

    function test_Constructor_RevertsOnZeroWalletSoulbound() public {
        vm.expectRevert(ISoulboundReceiver.SoulboundReceiver__ZeroAddress.selector);
        new SoulboundReceiver(owner, address(mailbox), address(0), address(supportSoulbound));
    }

    function test_Constructor_RevertsOnZeroSupportSoulbound() public {
        vm.expectRevert(ISoulboundReceiver.SoulboundReceiver__ZeroAddress.selector);
        new SoulboundReceiver(owner, address(mailbox), address(walletSoulbound), address(0));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WALLET MINT TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_HandleWalletMint_Success() public {
        // Mark wallet as registered in mock
        mockRegistry.setRegistered(registeredWallet, true);

        // Encode mint request
        bytes memory payload = abi.encode(
            uint8(1), // MSG_TYPE_WALLET
            registeredWallet,
            address(0),
            uint256(0)
        );

        // Simulate mailbox calling handle
        mailbox.simulateReceive(address(receiver), SPOKE_DOMAIN, bytes32(uint256(uint160(spokeForwarder))), payload);

        // Verify wallet soulbound was minted
        assertTrue(walletSoulbound.hasMinted(registeredWallet));
        assertEq(walletSoulbound.balanceOf(registeredWallet), 1);
    }

    function test_HandleWalletMint_RevertsOnUntrustedForwarder() public {
        address untrustedForwarder = makeAddr("untrusted");

        bytes memory payload = abi.encode(uint8(1), registeredWallet, address(0), uint256(0));

        vm.expectRevert(ISoulboundReceiver.SoulboundReceiver__UntrustedForwarder.selector);
        mailbox.simulateReceive(address(receiver), SPOKE_DOMAIN, bytes32(uint256(uint160(untrustedForwarder))), payload);
    }

    function test_HandleWalletMint_RevertsOnNotMailbox() public {
        bytes memory payload = abi.encode(uint8(1), registeredWallet, address(0), uint256(0));

        vm.prank(makeAddr("attacker"));
        vm.expectRevert(ISoulboundReceiver.SoulboundReceiver__OnlyMailbox.selector);
        receiver.handle(SPOKE_DOMAIN, bytes32(uint256(uint160(spokeForwarder))), payload);
    }

    function test_HandleWalletMint_RevertsIfWalletNotRegistered() public {
        // Don't register the wallet - it should fail
        bytes memory payload = abi.encode(uint8(1), registeredWallet, address(0), uint256(0));

        vm.expectRevert(ISoulboundReceiver.SoulboundReceiver__WalletMintFailed.selector);
        mailbox.simulateReceive(address(receiver), SPOKE_DOMAIN, bytes32(uint256(uint160(spokeForwarder))), payload);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SUPPORT MINT TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Test that cross-chain support mint successfully mints to the supporter
    /// @dev Uses mintTo() which doesn't require ETH - donation is tracked via metadata.
    function test_HandleSupportMint_Success() public {
        address supporter = makeAddr("supporter");
        uint256 donation = 0.05 ether;

        bytes memory payload = abi.encode(
            uint8(2), // MSG_TYPE_SUPPORT
            supporter,
            supporter,
            donation
        );

        // Should succeed - receiver is authorized to mint
        mailbox.simulateReceive(address(receiver), SPOKE_DOMAIN, bytes32(uint256(uint160(spokeForwarder))), payload);

        // Verify token was minted to supporter
        assertEq(supportSoulbound.balanceOf(supporter), 1);
        assertEq(supportSoulbound.tokenDonation(1), donation);
    }

    /// @notice Test that support mint fails when receiver is not authorized
    function test_HandleSupportMint_RevertsWhenNotAuthorized() public {
        // Revoke minter authorization
        vm.prank(owner);
        supportSoulbound.setAuthorizedMinter(address(receiver), false);

        address supporter = makeAddr("supporter2");
        uint256 donation = 0.05 ether;

        bytes memory payload = abi.encode(
            uint8(2), // MSG_TYPE_SUPPORT
            supporter,
            supporter,
            donation
        );

        // Should fail - receiver is no longer authorized
        vm.expectRevert(ISoulboundReceiver.SoulboundReceiver__SupportMintFailed.selector);
        mailbox.simulateReceive(address(receiver), SPOKE_DOMAIN, bytes32(uint256(uint160(spokeForwarder))), payload);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_SetTrustedForwarder_Success() public {
        address newForwarder = makeAddr("newForwarder");
        uint32 newDomain = 42_161; // Arbitrum

        vm.prank(owner);
        receiver.setTrustedForwarder(newDomain, newForwarder);

        assertEq(receiver.trustedForwarders(newDomain), newForwarder);
    }

    function test_SetTrustedForwarder_OnlyOwner() public {
        vm.prank(makeAddr("attacker"));
        vm.expectRevert();
        receiver.setTrustedForwarder(SPOKE_DOMAIN, makeAddr("malicious"));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INVALID MESSAGE TYPE TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Handle_RevertsOnInvalidMintType() public {
        bytes memory payload = abi.encode(
            uint8(99), // Invalid type
            registeredWallet,
            address(0),
            uint256(0)
        );

        vm.expectRevert(ISoulboundReceiver.SoulboundReceiver__InvalidMintType.selector);
        mailbox.simulateReceive(address(receiver), SPOKE_DOMAIN, bytes32(uint256(uint160(spokeForwarder))), payload);
    }
}
