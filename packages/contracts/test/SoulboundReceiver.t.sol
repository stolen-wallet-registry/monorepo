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

        // Deploy soulbound contracts (owner serves as both feeCollector and initialOwner for test simplicity)
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
        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", attacker));
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

    // ═══════════════════════════════════════════════════════════════════════════
    // SWEEP TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Owner can recover ETH a misbehaving hook forwarded with a message.
    /// @dev handle() is payable (Hyperlane v3 interface) but our dispatches send 0 value;
    ///      without sweep(), anything forwarded anyway would be locked forever.
    function test_Sweep_RecoversHeldEth() public {
        vm.deal(address(receiver), 1 ether);
        uint256 before = owner.balance;

        vm.prank(owner);
        receiver.sweep();

        assertEq(address(receiver).balance, 0);
        assertEq(owner.balance, before + 1 ether);
    }

    /// @notice Non-owner cannot sweep
    function test_Sweep_OnlyOwner() public {
        address attacker = makeAddr("attacker");

        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", attacker));
        vm.prank(attacker);
        receiver.sweep();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // V9 — MINT FAILURE MUST NOT BRICK THE MESSAGE
    // ═══════════════════════════════════════════════════════════════════════════
    //
    // Hyperlane marks a message delivered inside `Mailbox.process`, in the same transaction as
    // `handle`. If `handle` reverts, that write is rolled back and the identical body is
    // re-delivered forever; the message is never consumed and its bridge fee is burnt. So the
    // question for every failure cause is: is a retry the recovery, or is the retry the bug?
    //
    //   PERMANENT causes  -> emit MintFailed and return, consuming the message.
    //   TRANSIENT causes  -> revert, so Hyperlane re-delivers.
    //
    // The fix must do BOTH; getting only one half right is why this is tested from both sides.

    function _walletPayload(address wallet) internal pure returns (bytes memory) {
        return abi.encode(uint8(1), wallet, address(0), uint256(0));
    }

    function _deliverWallet(address wallet) internal {
        mailbox.simulateReceive(
            address(receiver), SPOKE_DOMAIN, bytes32(uint256(uint160(spokeForwarder))), _walletPayload(wallet)
        );
    }

    /// @notice An already-minted wallet consumes the bridged message instead of bricking it.
    /// @dev This is the finding. `WalletSoulbound.mintTo` is permissionless, so anyone can
    ///      front-run a bridged request with a direct hub-side mint for ~80k gas; pre-fix that
    ///      made the bridged message permanently undeliverable — a griefing primitive costing the
    ///      attacker nothing and the victim their bridge fee. The same collision happens with zero
    ///      malice when two spokes request the same wallet. Against the pre-fix code this reverts.
    function test_V9_WalletMint_AlreadyMinted_ConsumesMessage() public {
        mockRegistry.setRegistered(registeredWallet, true);

        // Someone mints directly on the hub first.
        walletSoulbound.mintTo(registeredWallet);
        assertTrue(walletSoulbound.hasMinted(registeredWallet));

        // The bridged request now fails permanently — it must be consumed, loudly, not reverted.
        vm.expectEmit(false, false, false, false, address(receiver));
        emit ISoulboundReceiver.MintFailed(
            ISoulboundReceiver.MintType.WALLET, registeredWallet, SPOKE_DOMAIN, hex"00000000"
        );
        _deliverWallet(registeredWallet);

        assertEq(walletSoulbound.balanceOf(registeredWallet), 1, "must not double-mint");
    }

    /// @notice Re-delivering a message that already succeeded is consumed, never double-minted.
    /// @dev Replay protection is layered: Hyperlane's own delivered-set is the first line, and
    ///      `hasMinted` is the second. This pins the second, because the V9 fix is precisely a
    ///      decision to stop reverting — so `hasMinted` is now the only thing standing between a
    ///      replayed body and a second token.
    function test_V9_WalletMint_ReplayDoesNotMintTwice() public {
        mockRegistry.setRegistered(registeredWallet, true);

        _deliverWallet(registeredWallet);
        assertEq(walletSoulbound.balanceOf(registeredWallet), 1);

        _deliverWallet(registeredWallet); // same body again — consumed via AlreadyMinted
        assertEq(walletSoulbound.balanceOf(registeredWallet), 1, "replay must not mint a second token");
        assertEq(walletSoulbound.totalSupply(), 1);
    }

    /// @notice NotRegistered still reverts, because there the retry IS the recovery mechanism.
    /// @dev A mint request that races ahead of the wallet's registration message is transient:
    ///      Hyperlane's re-delivery resolves it once registration lands. Consuming it would
    ///      silently drop a mint that was always going to become valid.
    function test_V9_WalletMint_NotRegisteredStillRevertsThenSucceedsOnRetry() public {
        vm.expectRevert(ISoulboundReceiver.SoulboundReceiver__WalletMintFailed.selector);
        _deliverWallet(registeredWallet);

        // Registration lands, the retry now succeeds — the message was never consumed.
        mockRegistry.setRegistered(registeredWallet, true);
        _deliverWallet(registeredWallet);
        assertTrue(walletSoulbound.hasMinted(registeredWallet));
    }

    /// @notice The hub-side permissionless mint remains the manual recovery for consumed messages.
    /// @dev Nothing about the consume path can strand a legitimately registered wallet: `mintTo`
    ///      is open to anyone, so the wallet (or a helper) can always mint directly.
    function test_V9_ConsumedMessageStillRecoverableViaDirectMint() public {
        address other = makeAddr("otherWallet");
        mockRegistry.setRegistered(other, true);

        vm.prank(makeAddr("goodSamaritan"));
        walletSoulbound.mintTo(other);
        assertEq(walletSoulbound.balanceOf(other), 1);
    }

    /// @notice A permanent support-mint failure (zero supporter) is consumed, not reverted.
    function test_V9_SupportMint_ZeroSupporter_ConsumesMessage() public {
        bytes memory payload = abi.encode(uint8(2), address(0), address(0), uint256(0.05 ether));

        // No revert expected — the message is consumed.
        mailbox.simulateReceive(address(receiver), SPOKE_DOMAIN, bytes32(uint256(uint160(spokeForwarder))), payload);

        assertEq(supportSoulbound.totalSupply(), 0, "nothing minted");
    }

    /// @notice An un-authorized receiver still reverts — the owner can re-authorize and retry.
    /// @dev Transient by the same test as NotRegistered: an owner action makes the identical
    ///      message succeed, so discarding it would lose a valid mint. (The revert itself is
    ///      already covered by test_HandleSupportMint_RevertsWhenNotAuthorized; this pins that the
    ///      retry actually completes afterwards.)
    function test_V9_SupportMint_NotAuthorized_RetrySucceedsAfterReauthorization() public {
        vm.prank(owner);
        supportSoulbound.setAuthorizedMinter(address(receiver), false);

        address supporter = makeAddr("supporter3");
        bytes memory payload = abi.encode(uint8(2), supporter, supporter, uint256(0.05 ether));

        vm.expectRevert(ISoulboundReceiver.SoulboundReceiver__SupportMintFailed.selector);
        mailbox.simulateReceive(address(receiver), SPOKE_DOMAIN, bytes32(uint256(uint160(spokeForwarder))), payload);

        vm.prank(owner);
        supportSoulbound.setAuthorizedMinter(address(receiver), true);

        mailbox.simulateReceive(address(receiver), SPOKE_DOMAIN, bytes32(uint256(uint160(spokeForwarder))), payload);
        assertEq(supportSoulbound.balanceOf(supporter), 1);
    }
}
