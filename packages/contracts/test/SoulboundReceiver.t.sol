// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { SoulboundReceiver } from "../src/soulbound/SoulboundReceiver.sol";
import { ISoulboundReceiver } from "../src/interfaces/ISoulboundReceiver.sol";
import { WalletSoulbound } from "../src/soulbound/WalletSoulbound.sol";
import { SupportSoulbound } from "../src/soulbound/SupportSoulbound.sol";
import { StolenWalletRegistry } from "../src/registries/StolenWalletRegistry.sol";
import { TranslationRegistry } from "../src/soulbound/TranslationRegistry.sol";
import { MockMailbox } from "./mocks/MockMailbox.sol";

contract SoulboundReceiverTest is Test {
    SoulboundReceiver receiver;
    WalletSoulbound walletSoulbound;
    SupportSoulbound supportSoulbound;
    StolenWalletRegistry walletRegistry;
    TranslationRegistry translations;
    MockMailbox mailbox;

    address owner;
    address spokeForwarder;
    address registeredWallet;
    uint256 registeredWalletPk;

    uint32 constant HUB_CHAIN_ID = 84_532; // Base Sepolia
    uint32 constant SPOKE_DOMAIN = 11_155_420; // Optimism Sepolia
    uint256 constant MIN_WEI = 0.01 ether;

    bytes32 private constant ACK_TYPEHASH =
        keccak256("AcknowledgementOfRegistry(address owner,address forwarder,uint256 nonce,uint256 deadline)");
    bytes32 private constant REG_TYPEHASH =
        keccak256("Registration(address owner,address forwarder,uint256 nonce,uint256 deadline)");
    bytes32 private constant TYPE_HASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    function setUp() public {
        vm.chainId(HUB_CHAIN_ID);

        owner = makeAddr("owner");
        spokeForwarder = makeAddr("spokeForwarder");
        registeredWalletPk = 0xA11CE;
        registeredWallet = vm.addr(registeredWalletPk);

        vm.startPrank(owner);

        // Deploy mock mailbox
        mailbox = new MockMailbox(HUB_CHAIN_ID);

        // Deploy translation registry (has built-in English)
        translations = new TranslationRegistry();

        // Deploy wallet registry
        walletRegistry = new StolenWalletRegistry(address(0), address(0), 5, 20);

        // Deploy soulbound contracts
        walletSoulbound = new WalletSoulbound(address(walletRegistry), address(translations), owner, "stolenwallet.xyz");

        supportSoulbound = new SupportSoulbound(MIN_WEI, address(translations), owner, "stolenwallet.xyz");

        // Deploy receiver
        receiver = new SoulboundReceiver(owner, address(mailbox), address(walletSoulbound), address(supportSoulbound));

        // Set trusted forwarder
        receiver.setTrustedForwarder(SPOKE_DOMAIN, spokeForwarder);

        // Authorize receiver to mint support tokens (for cross-chain mints)
        supportSoulbound.setAuthorizedMinter(address(receiver), true);

        // Fund receiver for support mints
        vm.deal(address(receiver), 1 ether);

        vm.stopPrank();
    }

    function _registerWallet(address wallet, uint256 pk) internal {
        // Register wallet using two-phase flow
        address forwarder = wallet;

        // Phase 1: Acknowledgement
        _doAcknowledge(wallet, forwarder, pk);

        // Skip to grace period
        (,, uint256 startBlock,,,) = walletRegistry.getDeadlines(wallet);
        vm.roll(startBlock + 1);

        // Phase 2: Registration
        _doRegister(wallet, forwarder, pk);
    }

    function _doAcknowledge(address wallet, address forwarder, uint256 pk) internal {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = walletRegistry.nonces(wallet);
        bytes32 structHash = keccak256(abi.encode(ACK_TYPEHASH, wallet, forwarder, nonce, deadline));
        bytes32 domainSep = keccak256(
            abi.encode(
                TYPE_HASH, keccak256("StolenWalletRegistry"), keccak256("4"), block.chainid, address(walletRegistry)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSep, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);

        vm.prank(forwarder);
        walletRegistry.acknowledge(deadline, nonce, wallet, v, r, s);
    }

    function _doRegister(address wallet, address forwarder, uint256 pk) internal {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = walletRegistry.nonces(wallet);
        bytes32 structHash = keccak256(abi.encode(REG_TYPEHASH, wallet, forwarder, nonce, deadline));
        bytes32 domainSep = keccak256(
            abi.encode(
                TYPE_HASH, keccak256("StolenWalletRegistry"), keccak256("4"), block.chainid, address(walletRegistry)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSep, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);

        vm.prank(forwarder);
        walletRegistry.register(deadline, nonce, wallet, v, r, s);
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
        // Register the wallet first
        _registerWallet(registeredWallet, registeredWalletPk);

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
