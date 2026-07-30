// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { WalletRegistry } from "../src/registries/WalletRegistry.sol";
import { IWalletRegistry } from "../src/interfaces/IWalletRegistry.sol";
import { TimingConfig } from "../src/libraries/TimingConfig.sol";
import { EIP712TestHelper } from "./helpers/EIP712TestHelper.sol";

/// @notice Regression suite for the two-phase anti-phishing property (audit finding V1).
///
/// These tests began life as a working EXPLOIT. Before the fix, a phishing page could collect
/// both signatures seconds apart in a single visit — signing `nonce` and `nonce + 1`, since a
/// nonce is just a field in the signed struct and nothing prevented signing against one that
/// did not exist on-chain yet — and the attacker then submitted both itself, waiting out the
/// grace period unattended with the victim long gone. The delay was fully respected and the
/// registration was permanent and irreversible.
///
/// The registration signature now commits to `blockhash(windowBlock)` where `windowBlock` is at
/// or after the acknowledgement's grace-period start. That block does not exist — and so has no
/// hash — at acknowledgement time, which makes the second signature physically unproducible
/// early. The attack tests below therefore assert the attack now FAILS; the last test proves the
/// honest flow still succeeds, so the fix is not simply breaking everything.
contract AntiPhishingTest is EIP712TestHelper {
    WalletRegistry internal reg;

    uint256 internal victimPk;
    address internal victim;
    address internal attacker;

    uint64 internal constant CHAIN_ID = 1;
    uint256 internal constant GRACE_BLOCKS = 60;
    uint256 internal constant DEADLINE_BLOCKS = 300;

    function setUp() public {
        vm.warp(1_704_067_200);
        vm.roll(1_000_000);
        victimPk = uint256(keccak256("victim"));
        victim = vm.addr(victimPk);
        attacker = makeAddr("attacker");
        reg = new WalletRegistry(address(this), address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);
        vm.deal(attacker, 10 ether);
    }

    function _incident() internal view returns (uint64) {
        return uint64(block.timestamp - 1 days);
    }

    /// A signature deadline inside the newly-enforced MAX_SIGNATURE_LIFETIME bound.
    function _deadline() internal view returns (uint256) {
        return block.timestamp + 30 minutes;
    }

    /// @dev Sign and submit the acknowledgement against `target`, returning its grace start.
    ///      Extracted into its own frame so the phase-1 signature components never coexist on
    ///      the stack with phase 2's — these tests exceed the 16-slot limit otherwise, and this
    ///      project builds without via-ir.
    function _acknowledge(WalletRegistry target, uint64 incident, uint256 deadline)
        internal
        returns (uint256 graceStart)
    {
        (uint8 v, bytes32 r, bytes32 s) =
            _signWalletAck(victimPk, address(target), victim, attacker, CHAIN_ID, incident, 0, deadline);
        vm.prank(attacker);
        target.acknowledge(victim, attacker, CHAIN_ID, incident, deadline, 0, v, r, s);
        return target.getAcknowledgementData(victim).gracePeriodStart;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // THE ATTACK — must now fail
    // ═══════════════════════════════════════════════════════════════════════════

    /// The core exploit: victim signs BOTH messages in one sitting (same block, ~seconds apart
    /// in reality), attacker submits the acknowledgement, waits out the grace period alone, then
    /// tries to register. Pre-fix this succeeded. The victim cannot produce a valid registration
    /// signature at this point because the block it would have to commit to does not exist yet.
    function test_attack_bothSignaturesInOneSitting_cannotRegister() public {
        uint64 incident = _incident();
        uint256 deadline = _deadline();

        uint256 graceStart = _acknowledge(reg, incident, deadline);

        // Victim signs phase 2 immediately, in the same sitting. The only block references
        // available now are BELOW gracePeriodStart, so whatever they commit to is rejected.
        uint256 staleWindow = block.number - 1;
        (uint8 v2, bytes32 r2, bytes32 s2) =
            _signWalletReg(victimPk, address(reg), victim, attacker, CHAIN_ID, incident, 1, deadline, staleWindow);

        // Attacker waits out the grace period unattended, exactly as before.
        vm.roll(graceStart + 1);

        vm.prank(attacker);
        vm.expectRevert(TimingConfig.TimingConfig__WindowBlockBeforeGracePeriod.selector);
        reg.register(victim, attacker, CHAIN_ID, incident, deadline, 1, staleWindow, v2, r2, s2);

        assertFalse(reg.isWalletRegistered(victim), "victim must NOT be registered");
    }

    /// The attacker cannot escape the above by naming a block that will only exist later: at
    /// signing time such a block has no hash, so the victim cannot have committed to it, and
    /// substituting the number at submission fails the signature check (the number is unsigned
    /// calldata, but the signed hash binds it).
    function test_attack_cannotPreCommitToAFutureBlock() public {
        uint64 incident = _incident();
        uint256 deadline = _deadline();

        uint256 futureWindow = _acknowledge(reg, incident, deadline) + 1;

        // Victim signs now, committing to `blockhash(futureWindow)` — which is zero today.
        (uint8 v2, bytes32 r2, bytes32 s2) =
            _signWalletReg(victimPk, address(reg), victim, attacker, CHAIN_ID, incident, 1, deadline, futureWindow);
        assertEq(blockhash(futureWindow), bytes32(0), "future block must have no hash at signing time");

        // Once that block really exists its hash is NOT zero, so the pre-made signature is
        // over the wrong value and fails verification.
        vm.roll(futureWindow + 1);
        assertTrue(blockhash(futureWindow) != bytes32(0), "block hash must be real once mined");

        vm.prank(attacker);
        vm.expectRevert(IWalletRegistry.WalletRegistry__InvalidSignature.selector);
        reg.register(victim, attacker, CHAIN_ID, incident, deadline, 1, futureWindow, v2, r2, s2);

        assertFalse(reg.isWalletRegistered(victim), "victim must NOT be registered");
    }

    /// A third party can no longer open the window on the victim's behalf. This closes the
    /// timing-randomness grind (the submitter's address used to seed the grace/deadline offsets)
    /// and the nonce-burn griefing vector.
    function test_attack_thirdPartyCannotAcknowledge() public {
        uint64 incident = _incident();
        uint256 deadline = _deadline();
        address bystander = makeAddr("bystander");

        (uint8 v1, bytes32 r1, bytes32 s1) =
            _signWalletAck(victimPk, address(reg), victim, attacker, CHAIN_ID, incident, 0, deadline);

        vm.prank(bystander);
        vm.expectRevert(IWalletRegistry.WalletRegistry__InvalidForwarder.selector);
        reg.acknowledge(victim, attacker, CHAIN_ID, incident, deadline, 0, v1, r1, s1);
    }

    /// A harvested signature can no longer be held indefinitely: an unbounded `deadline` is
    /// rejected outright, so a hostile page cannot mint effectively non-expiring signatures.
    function test_attack_cannotMintNonExpiringSignature() public {
        uint64 incident = _incident();
        uint256 forever = type(uint64).max;

        (uint8 v1, bytes32 r1, bytes32 s1) =
            _signWalletAck(victimPk, address(reg), victim, attacker, CHAIN_ID, incident, 0, forever);

        vm.prank(attacker);
        vm.expectRevert(IWalletRegistry.WalletRegistry__DeadlineTooFarInFuture.selector);
        reg.acknowledge(victim, attacker, CHAIN_ID, incident, forever, 0, v1, r1, s1);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // THE HONEST FLOW — must still work
    // ═══════════════════════════════════════════════════════════════════════════

    /// Guards against the fix being vacuously "secure" by breaking registration outright: the
    /// legitimate sequence — acknowledge, wait, THEN sign phase 2 — still completes.
    function test_honestFlow_signingAfterGracePeriod_succeeds() public {
        uint64 incident = _incident();

        uint256 graceStart = _acknowledge(reg, incident, _deadline());

        // Grace period elapses, and only THEN does the victim sign phase 2 — the interaction
        // the two-phase design was always meant to require.
        uint256 windowBlock = _rollToWindow(graceStart);
        uint256 freshDeadline = _deadline();
        (uint8 v2, bytes32 r2, bytes32 s2) =
            _signWalletReg(victimPk, address(reg), victim, attacker, CHAIN_ID, incident, 1, freshDeadline, windowBlock);

        vm.prank(attacker);
        reg.register(victim, attacker, CHAIN_ID, incident, freshDeadline, 1, windowBlock, v2, r2, s2);

        assertTrue(reg.isWalletRegistered(victim), "honest registration must succeed");
    }

    /// The freshness reference ages out with `blockhash`, so a signature left unsubmitted for
    /// too long must be re-signed rather than silently accepted. Recoverable by design — the
    /// frontend surfaces a re-sign prompt.
    function test_honestFlow_windowBlockAgesOut() public {
        uint64 incident = _incident();
        // Deadline window wide enough to still be open 300 blocks later, so this test isolates
        // the blockhash-age check rather than tripping the registration deadline first.
        WalletRegistry longReg = new WalletRegistry(address(this), address(0), GRACE_BLOCKS, 5000);

        uint256 graceStart = _acknowledge(longReg, incident, _deadline());
        uint256 windowBlock = _rollToWindow(graceStart);
        uint256 freshDeadline = _deadline();
        (uint8 v2, bytes32 r2, bytes32 s2) = _signWalletReg(
            victimPk, address(longReg), victim, attacker, CHAIN_ID, incident, 1, freshDeadline, windowBlock
        );

        // Sat on the signature past the hash-availability window.
        vm.roll(windowBlock + TimingConfig.MAX_WINDOW_BLOCK_AGE + 1);

        vm.prank(attacker);
        vm.expectRevert(TimingConfig.TimingConfig__WindowBlockTooOld.selector);
        longReg.register(victim, attacker, CHAIN_ID, incident, freshDeadline, 1, windowBlock, v2, r2, s2);
    }
}
