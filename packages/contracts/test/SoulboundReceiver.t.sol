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

/// @notice A recipient that rejects every incoming ETH transfer.
/// @dev Used to drive `sweep`'s failure branch. A plain EOA cannot: it always accepts ETH, so the
///      low-level call succeeds and `SoulboundReceiver__SweepFailed` stays unreachable.
contract RejectsEth {
    receive() external payable {
        revert("RejectsEth: no");
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

    /// @notice NotRegistered reverts so Hyperlane re-delivers — and does NOT consult pending state.
    /// @dev This is the realistic hub state for a spoke-origin mint: `isWalletPending` is false,
    ///      because a spoke registration acknowledges into `SpokeRegistry._pendingAcknowledgements`
    ///      on the SPOKE and reaches the hub via `WalletRegistry.registerFromHub`, which never
    ///      creates a hub-side pending row. The explicit `assertFalse` below is the point of the
    ///      test: the revert must hold with pending FALSE, which is what the old pending-gated
    ///      implementation got wrong (it consumed here).
    function test_HandleWalletMint_RevertsWhenNotRegistered() public {
        assertFalse(mockRegistry.isWalletRegistered(registeredWallet), "Precondition: not registered");
        assertFalse(mockRegistry.isWalletPending(registeredWallet), "Precondition: no hub-side pending row");

        bytes memory payload = abi.encode(uint8(1), registeredWallet, address(0), uint256(0));

        vm.expectRevert(ISoulboundReceiver.SoulboundReceiver__WalletMintFailed.selector);
        mailbox.simulateReceive(address(receiver), SPOKE_DOMAIN, bytes32(uint256(uint160(spokeForwarder))), payload);
    }

    /// @notice A mint message delivered BEFORE its registration message is retried, not dropped.
    /// @dev The whole reason the pending gate was removed. Hyperlane does not order independent
    ///      messages, so `requestWalletMint` on the spoke can land on the hub ahead of the
    ///      registration it depends on. Both arrive from the same spoke; neither carries proof of
    ///      the other.
    ///
    ///      Under the old pending-gated code this delivery was CONSUMED: hub `isWalletPending` is
    ///      false for every spoke registrant, so the "still in flight" branch was unreachable. The
    ///      user's bridge fee bought nothing and the token was never minted unless a human noticed
    ///      the `MintFailed` log and sent a second hub-side transaction. Now the delivery reverts,
    ///      stays undelivered, and the re-delivery mints once the registration lands — no human in
    ///      the loop.
    function test_HandleWalletMint_MintBeforeRegistrationIsRetriedNotDropped() public {
        // 1. The mint request wins the race. Hub has no record of this wallet at all.
        assertFalse(mockRegistry.isWalletRegistered(registeredWallet));
        assertFalse(mockRegistry.isWalletPending(registeredWallet));

        vm.expectRevert(ISoulboundReceiver.SoulboundReceiver__WalletMintFailed.selector);
        _deliverWallet(registeredWallet);

        assertEq(walletSoulbound.balanceOf(registeredWallet), 0, "nothing minted yet");
        assertFalse(walletSoulbound.hasMinted(registeredWallet), "the mint slot must not be burnt");

        // 2. The registration message lands (registerFromHub writes the entry directly).
        mockRegistry.setRegistered(registeredWallet, true);

        // 3. Hyperlane re-delivers the identical body and it now succeeds, with no manual step.
        _deliverWallet(registeredWallet);
        assertEq(walletSoulbound.balanceOf(registeredWallet), 1, "the retry minted the token");
        assertTrue(walletSoulbound.hasMinted(registeredWallet));
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

    /// @notice A recipient that cannot receive ETH reverts the sweep instead of losing the balance.
    /// @dev Pins `SoulboundReceiver__SweepFailed`, the branch that makes `sweep`'s low-level call
    ///      safe. Without the success check the call's failure would be swallowed: `Swept` would
    ///      be emitted for a transfer that never happened, and the owner would believe the funds
    ///      were recovered while they sat in the contract. This is the reachable case after the
    ///      DAO handover, when the owner names a multisig or Governor whose fallback is
    ///      non-payable or gas-limited — the exact scenario `sweep(address to)` takes an explicit
    ///      recipient for.
    function test_Sweep_RevertsWhenRecipientRejectsEth() public {
        address recipient = address(new RejectsEth());
        vm.deal(address(receiver), 1 ether);

        vm.prank(owner);
        vm.expectRevert(ISoulboundReceiver.SoulboundReceiver__SweepFailed.selector);
        receiver.sweep(recipient);

        assertEq(address(receiver).balance, 1 ether, "a failed sweep must leave the balance intact");
        assertEq(recipient.balance, 0, "the rejecting recipient received nothing");

        // The balance is not stranded: naming a recipient that CAN receive still works.
        address payable good = payable(makeAddr("goodRecipient"));
        vm.prank(owner);
        receiver.sweep(good);
        assertEq(good.balance, 1 ether, "a second sweep to a valid recipient recovers the balance");
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

    /// @notice NotRegistered reverts identically whether or not a hub-side pending row exists.
    /// @dev Regression guard for "do not reintroduce a hub-side pending check". The outcome must
    ///      be a function of the revert CAUSE alone, never of `isWalletPending`, because that
    ///      value is structurally false for every wallet that can reach this handler (spoke
    ///      registrations never create a hub-side pending row) — so any implementation that
    ///      consults it silently drops legitimate out-of-order mints.
    ///
    ///      Driving BOTH flag values through the same assertion is what makes this a guard rather
    ///      than a restatement: an implementation gated on the flag passes one leg and fails the
    ///      other. The pending=false leg is the one the old code failed.
    function test_V9_WalletMint_NotRegisteredRevertsRegardlessOfPendingFlag() public {
        address pendingWallet = makeAddr("pendingWallet");
        address notPendingWallet = makeAddr("notPendingWallet");
        mockRegistry.setPending(pendingWallet, true);
        assertFalse(mockRegistry.isWalletPending(notPendingWallet));

        vm.expectRevert(ISoulboundReceiver.SoulboundReceiver__WalletMintFailed.selector);
        _deliverWallet(pendingWallet);

        vm.expectRevert(ISoulboundReceiver.SoulboundReceiver__WalletMintFailed.selector);
        _deliverWallet(notPendingWallet);

        // Registration lands for both; the retry succeeds — neither message was ever consumed.
        mockRegistry.setPending(pendingWallet, false);
        mockRegistry.setRegistered(pendingWallet, true);
        mockRegistry.setRegistered(notPendingWallet, true);

        _deliverWallet(pendingWallet);
        _deliverWallet(notPendingWallet);
        assertTrue(walletSoulbound.hasMinted(pendingWallet));
        assertTrue(walletSoulbound.hasMinted(notPendingWallet));
    }

    /// @notice The hub-side permissionless mint remains the manual recovery for consumed messages.
    /// @dev Nothing about the consume path can strand a legitimately registered wallet: `mintTo`
    ///      is open to anyone, so the wallet (or a helper) can always mint directly.
    ///
    ///      The recovery must be exercised against a message that was ACTUALLY consumed, so this
    ///      drives the full griefing sequence: the wallet is registered on the hub, an attacker
    ///      front-runs the bridged request with a direct permissionless mint, and the delivery is
    ///      then consumed by the `AlreadyMinted` branch. `AlreadyMinted` is the only terminal
    ///      cause reachable here — `mintTo` checks registration BEFORE `hasMinted`, so a
    ///      front-run against a registered wallet can never surface as `NotRegistered` (which is
    ///      retried, not consumed). Only then is the direct mint shown to be the way out.
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
