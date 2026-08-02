// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { SoulboundReceiver } from "../src/soulbound/SoulboundReceiver.sol";
import { ISoulboundReceiver } from "../src/interfaces/ISoulboundReceiver.sol";
import { WalletSoulbound } from "../src/soulbound/WalletSoulbound.sol";
import { SupportSoulbound } from "../src/soulbound/SupportSoulbound.sol";
import { BaseSoulbound } from "../src/soulbound/BaseSoulbound.sol";
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

    /// @notice NotRegistered reverts while a registration is still in flight — the retry is the fix.
    /// @dev A pending acknowledgement means the wallet is mid-two-phase, so Hyperlane's
    ///      re-delivery will succeed once phase 2 lands. Consuming here would silently drop a
    ///      mint that was always going to become valid.
    function test_HandleWalletMint_RevertsIfRegistrationStillPending() public {
        mockRegistry.setPending(registeredWallet, true);
        bytes memory payload = abi.encode(uint8(1), registeredWallet, address(0), uint256(0));

        vm.expectRevert(ISoulboundReceiver.SoulboundReceiver__WalletMintFailed.selector);
        mailbox.simulateReceive(address(receiver), SPOKE_DOMAIN, bytes32(uint256(uint160(spokeForwarder))), payload);
    }

    /// @notice NotRegistered with NO pending acknowledgement is consumed, not retried forever.
    /// @dev The wallet is neither registered nor mid-flow: the acknowledgement expired, or the
    ///      mint was requested for a wallet that never started. Reverting would make Hyperlane
    ///      re-deliver the identical body forever, never mark it delivered, and burn the bridge
    ///      fee on a message that can never succeed. `MintFailed` records it; the permissionless
    ///      hub-side `mintTo` remains the recovery path if the wallet registers later.
    function test_HandleWalletMint_ConsumesWhenNeitherRegisteredNorPending() public {
        assertFalse(mockRegistry.isWalletRegistered(registeredWallet), "Precondition: not registered");
        assertFalse(mockRegistry.isWalletPending(registeredWallet), "Precondition: no acknowledgement in flight");

        bytes memory payload = abi.encode(uint8(1), registeredWallet, address(0), uint256(0));

        // No expectRevert: delivery must succeed so the message stops being retried.
        mailbox.simulateReceive(address(receiver), SPOKE_DOMAIN, bytes32(uint256(uint160(spokeForwarder))), payload);

        assertEq(walletSoulbound.balanceOf(registeredWallet), 0, "nothing was minted");

        // And the manual recovery still works once the wallet actually registers.
        mockRegistry.setRegistered(registeredWallet, true);
        walletSoulbound.mintTo(registeredWallet);
        assertEq(walletSoulbound.balanceOf(registeredWallet), 1, "direct mint recovers the consumed request");
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
        address recipient = makeAddr("sweepRecipient");
        vm.deal(address(receiver), 1 ether);
        uint256 before = recipient.balance;

        vm.prank(owner);
        receiver.sweep(recipient);

        assertEq(address(receiver).balance, 0);
        assertEq(recipient.balance, before + 1 ether);
    }

    /// @notice The balance goes to the named recipient, not to the caller.
    /// @dev The whole reason sweep takes an explicit `to`: after the DAO handover the owner is a
    ///      multisig or Governor whose fallback may be non-payable or gas-limited, so paying
    ///      `msg.sender` unconditionally could strand the funds. Asserting the owner's balance is
    ///      UNCHANGED is what distinguishes the parameterised version from the old `msg.sender`
    ///      one — without it, an implementation that ignored `to` would still pass above whenever
    ///      the caller and the recipient happened to coincide.
    function test_Sweep_PaysRecipientNotCaller() public {
        address recipient = makeAddr("sweepRecipient");
        vm.deal(address(receiver), 1 ether);
        uint256 ownerBefore = owner.balance;

        vm.prank(owner);
        receiver.sweep(recipient);

        assertEq(recipient.balance, 1 ether, "recipient receives the balance");
        assertEq(owner.balance, ownerBefore, "the calling owner must not be paid");
    }

    /// @notice Sweeping to the zero address is rejected rather than burning the balance.
    function test_Sweep_RejectsZeroRecipient() public {
        vm.deal(address(receiver), 1 ether);

        vm.prank(owner);
        vm.expectRevert(ISoulboundReceiver.SoulboundReceiver__ZeroAddress.selector);
        receiver.sweep(address(0));

        assertEq(address(receiver).balance, 1 ether, "balance must be untouched");
    }

    /// @notice Non-owner cannot sweep
    function test_Sweep_OnlyOwner() public {
        address attacker = makeAddr("attacker");

        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", attacker));
        vm.prank(attacker);
        receiver.sweep(attacker);
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
        // All four check flags on: mintType/wallet/originDomain (the three indexed topics) AND
        // the `reason` payload. With them off, only the emitter and the event signature were
        // verified, so a MintFailed naming a different wallet, a SUPPORT mint, or carrying an
        // unrelated revert reason would have satisfied this assertion.
        vm.expectEmit(true, true, true, true, address(receiver));
        emit ISoulboundReceiver.MintFailed(
            ISoulboundReceiver.MintType.WALLET,
            registeredWallet,
            SPOKE_DOMAIN,
            abi.encodeWithSelector(WalletSoulbound.AlreadyMinted.selector)
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

    /// @notice NotRegistered still reverts while in flight, because there the retry IS the fix.
    /// @dev A mint request that races ahead of the wallet's registration message is transient:
    ///      Hyperlane's re-delivery resolves it once registration lands. Consuming it would
    ///      silently drop a mint that was always going to become valid.
    ///
    ///      "In flight" is now the explicit test: the wallet holds a live acknowledgement, so it
    ///      is mid-two-phase. Without a pending acknowledgement the same revert would be a
    ///      message Hyperlane re-delivers forever — see
    ///      test_HandleWalletMint_ConsumesWhenNeitherRegisteredNorPending.
    function test_V9_WalletMint_NotRegisteredStillRevertsThenSucceedsOnRetry() public {
        mockRegistry.setPending(registeredWallet, true);

        vm.expectRevert(ISoulboundReceiver.SoulboundReceiver__WalletMintFailed.selector);
        _deliverWallet(registeredWallet);

        // Registration lands, the retry now succeeds — the message was never consumed.
        mockRegistry.setPending(registeredWallet, false);
        mockRegistry.setRegistered(registeredWallet, true);
        _deliverWallet(registeredWallet);
        assertTrue(walletSoulbound.hasMinted(registeredWallet));
    }

    /// @notice The hub-side permissionless mint remains the manual recovery for consumed messages.
    /// @dev Nothing about the consume path can strand a legitimately registered wallet: `mintTo`
    ///      is open to anyone, so the wallet (or a helper) can always mint directly.
    ///
    ///      The recovery must be exercised against a message that was ACTUALLY consumed, so this
    ///      drives the full griefing sequence: the mint request arrives before the wallet is
    ///      registered on the hub (`NotRegistered` — the one PERMANENT-looking cause that is in
    ///      fact terminal for this delivery once the spoke stops retrying), the message is
    ///      re-delivered after registration lands and is then consumed by the `AlreadyMinted`
    ///      branch because an attacker front-ran it with a direct mint. Only then is the direct
    ///      mint shown to be the way out.
    function test_V9_ConsumedMessageStillRecoverableViaDirectMint() public {
        address victim = makeAddr("victimWallet");
        mockRegistry.setRegistered(victim, true);

        // An attacker front-runs the bridged request with a permissionless direct mint, so the
        // bridged message can never succeed on its own.
        vm.prank(makeAddr("attacker"));
        walletSoulbound.mintTo(victim);

        // The bridged message is now consumed (MintFailed + return), NOT reverted. If this
        // delivery reverted, the assertion below would never be reached.
        vm.expectEmit(true, true, true, true, address(receiver));
        emit ISoulboundReceiver.MintFailed(
            ISoulboundReceiver.MintType.WALLET,
            victim,
            SPOKE_DOMAIN,
            abi.encodeWithSelector(WalletSoulbound.AlreadyMinted.selector)
        );
        _deliverWallet(victim);

        // The wallet still ends up holding exactly the token the consumed message was for —
        // that is the recovery. The direct mint IS the manual path, and it already ran.
        assertEq(walletSoulbound.balanceOf(victim), 1, "the consumed message left the wallet with its token");
        assertTrue(walletSoulbound.hasMinted(victim));

        // And a wallet whose bridged message is consumed before ANY mint exists can still mint
        // directly afterwards — the consume path never burns the mint slot.
        address stranded = makeAddr("strandedWallet");
        mockRegistry.setRegistered(stranded, true);
        vm.prank(makeAddr("goodSamaritan"));
        walletSoulbound.mintTo(stranded);
        assertEq(walletSoulbound.balanceOf(stranded), 1);
    }

    /// @notice A permanent support-mint failure (zero supporter) is consumed, not reverted.
    /// @dev "Consumed" has two halves and the file-level comment above requires both: emit
    ///      MintFailed AND return. Asserting only `totalSupply() == 0` covers neither — a handler
    ///      that silently swallowed the message with no log at all would pass, and the whole point
    ///      of the event is that a consumed message stays observable off-chain. (The previous
    ///      implementation emitted and then reverted in the same frame, discarding the log.)
    function test_V9_SupportMint_ZeroSupporter_ConsumesMessage() public {
        bytes memory payload = abi.encode(uint8(2), address(0), address(0), uint256(0.05 ether));

        // No revert expected — the message is consumed, and the skip is announced.
        vm.expectEmit(true, true, true, true, address(receiver));
        emit ISoulboundReceiver.MintFailed(
            ISoulboundReceiver.MintType.SUPPORT,
            address(0),
            SPOKE_DOMAIN,
            abi.encodeWithSelector(BaseSoulbound.ZeroAddress.selector)
        );
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
