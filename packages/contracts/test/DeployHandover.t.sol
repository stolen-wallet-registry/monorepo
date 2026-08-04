// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { Deploy } from "../script/Deploy.s.sol";
import { OperatorRegistry } from "../src/OperatorRegistry.sol";
import { FeeManager } from "../src/FeeManager.sol";
import { TranslationRegistry } from "../src/soulbound/TranslationRegistry.sol";
import { TimelockOwnable } from "../src/libraries/TimelockOwnable.sol";

/// @notice Test-only surface over Deploy's parameterized handover internals
/// @dev The public entry points (proposeHandover / activateHandover / verifyOwnership) read every
///      input from `vm.envOr`. Env vars are process-global while forge runs tests concurrently, so
///      driving them with `vm.setEnv` produces an order-dependent, racy suite — observed
///      first-hand: DAO_OWNER set by one test leaked into others. The internals take their inputs
///      as arguments precisely so this harness can drive them deterministically. The env-reading
///      wrappers are thin and unchanged in behaviour.
contract DeployHarness is Deploy {
    function propose(address dao, address[] memory addrs, address translations) external {
        _validateDao(dao, msg.sender);
        _proposeHandover(dao, _targets(addrs), translations);
    }

    function activate(address dao, address[] memory addrs) external {
        _validateDao(dao, msg.sender);
        _activateHandover(dao, _targets(addrs));
    }

    function verify(address dao, address[] memory addrs, address translations) external view {
        _verifyOwnership(dao, _targets(addrs), translations);
    }

    function validateDao(address dao, address deployerAddr) external pure {
        _validateDao(dao, deployerAddr);
    }

    /// @dev Drive {Deploy._requireSetupComplete} on a single synthetic target. `envKey` is
    ///      caller-supplied so each test can pick a unique one: the opt-out is read from the
    ///      process-global environment, and a shared key would race across concurrent tests.
    function requireSetupComplete(address addr, string memory envKey) external view {
        _requireSetupComplete(SetupTarget(addr, "target", envKey));
    }

    function _targets(address[] memory addrs) internal pure returns (SetupTarget[] memory targets) {
        targets = new SetupTarget[](addrs.length);
        for (uint256 i = 0; i < addrs.length; i++) {
            targets[i] = SetupTarget(addrs[i], "target", "TARGET");
        }
    }
}

/// @title DeployHandoverTest
/// @notice V23 — the deploy script must actually hand ownership to a DAO, verifiably.
/// @dev Before this fix every contract was left owned by the deploying EOA forever: one hot key
///      that could revoke every operator, un-trust every spoke, pause everything and cancel every
///      pending proposal in a single transaction. The per-setter timelock is worthless while one
///      key holds all of them.
///
///      The two things that are easy to get wrong here, and that these tests pin:
///        1. The handover only PROPOSES an Ownable2Step transfer. Ownership does not move until
///           the DAO calls acceptOwnership(). A script that stopped at propose/activate and
///           declared victory would ship a system still owned by the EOA.
///        2. A wrong DAO address must be recoverable. It is, precisely because of (1).
contract DeployHandoverTest is Test {
    DeployHarness internal script;

    address internal deployer;
    address internal dao;

    OperatorRegistry internal operatorRegistry;
    FeeManager internal feeManager;
    TranslationRegistry internal translations;

    address[] internal targets;

    function setUp() public {
        vm.warp(1_704_067_200);

        script = new DeployHarness();
        // The script contract itself is the "deployer EOA" here: in production the calls are made
        // under vm.startBroadcast(deployerPrivateKey); in this harness they are made by `script`.
        deployer = address(script);
        dao = makeAddr("daoMultisig");

        vm.startPrank(deployer);
        operatorRegistry = new OperatorRegistry(deployer);
        feeManager = new FeeManager(deployer, address(0));
        translations = new TranslationRegistry(deployer);
        vm.stopPrank();

        // No address(0) entry: an unset target is now a hard failure unless explicitly opted out
        // of, and that behaviour has its own dedicated tests below.
        targets = [address(operatorRegistry), address(feeManager)];
    }

    function _finalize() internal {
        vm.startPrank(deployer);
        operatorRegistry.completeSetup();
        feeManager.completeSetup();
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // THE FULL HANDOVER
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice propose → 2 days → activate → DAO accepts → verify passes.
    /// @dev The end state is what matters: owner() == dao AND pendingOwner() == 0 on every
    ///      timelocked target, and the plain Ownable2Step target transferred immediately.
    function test_V23_FullHandoverCompletes() public {
        _finalize();

        script.propose(dao, targets, address(translations));

        // Ownership has NOT moved on the timelocked targets — this is a proposal, nothing more.
        assertEq(operatorRegistry.owner(), deployer);
        assertEq(operatorRegistry.pendingOwner(), address(0));
        // The plain Ownable2Step target is already in handshake.
        assertEq(translations.pendingOwner(), dao);

        vm.warp(block.timestamp + operatorRegistry.ACTIVATION_DELAY());
        script.activate(dao, targets);

        // Still not moved — the Ownable2Step handshake has only started.
        assertEq(operatorRegistry.owner(), deployer, "activate must not move ownership by itself");
        assertEq(operatorRegistry.pendingOwner(), dao);
        assertEq(feeManager.pendingOwner(), dao);

        vm.startPrank(dao);
        operatorRegistry.acceptOwnership();
        feeManager.acceptOwnership();
        translations.acceptOwnership();
        vm.stopPrank();

        script.verify(dao, targets, address(translations));

        assertEq(operatorRegistry.owner(), dao);
        assertEq(feeManager.owner(), dao);
        assertEq(translations.owner(), dao);
    }

    /// @notice verify() fails loudly on a half-finished handover.
    /// @dev Security-critical: the whole value of the gate is that a deployment where the DAO
    ///      never accepted cannot be mistaken for a completed handover. Without it the EOA
    ///      silently retains full control of a system everyone believes is DAO-owned.
    function test_V23_VerifyRejectsUnacceptedHandover() public {
        _finalize();
        script.propose(dao, targets, address(translations));
        vm.warp(block.timestamp + operatorRegistry.ACTIVATION_DELAY());
        script.activate(dao, targets);

        // DAO has not called acceptOwnership() on anything.
        vm.expectRevert(bytes("target: owner is not DAO_OWNER - handover incomplete"));
        script.verify(dao, targets, address(translations));
    }

    /// @notice verify() fails if any target still has a dangling pending transfer.
    /// @dev Pins the SECOND require in `_verifyOwnership`, which is unreachable while any target
    ///      still fails the owner check. The previous version of this test left feeManager at
    ///      owner=deployer, so it tripped "owner is not DAO_OWNER" — the same assertion
    ///      test_V23_VerifyRejectsUnacceptedHandover already makes. The pendingOwner require had
    ///      zero coverage and could have been deleted without failing CI.
    ///
    ///      The realistic shape of this failure is a SECOND handover left in flight: custody
    ///      reads as DAO-owned, but an accepted transfer would move it again with no further
    ///      approval, so a deployment gate must refuse it.
    function test_V23_VerifyRejectsDanglingPendingOwner() public {
        _finalize();
        script.propose(dao, targets, address(translations));
        vm.warp(block.timestamp + operatorRegistry.ACTIVATION_DELAY());
        script.activate(dao, targets);

        vm.startPrank(dao);
        operatorRegistry.acceptOwnership();
        feeManager.acceptOwnership();
        translations.acceptOwnership();
        vm.stopPrank();

        // The owner check now passes, so the pendingOwner check is the only thing left to fail.
        script.verify(dao, targets, address(translations));

        address successor = makeAddr("successorMultisig");
        vm.startPrank(dao);
        feeManager.proposeOwnershipTransfer(successor);
        vm.warp(block.timestamp + feeManager.ACTIVATION_DELAY());
        feeManager.activateOwnershipTransfer(successor);
        vm.stopPrank();

        assertEq(feeManager.owner(), dao, "Precondition: owner check must pass so pendingOwner is reached");
        assertEq(feeManager.pendingOwner(), successor, "Precondition: a pending transfer must be open");

        vm.expectRevert(bytes("target: a pending owner transfer is still open"));
        script.verify(dao, targets, address(translations));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // UNSET DEPLOY TARGETS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice A target whose env var was never set is a hard failure, not a silent skip.
    /// @dev This used to `return` on address(0), which made `verifySetup()` print success for a
    ///      contract nobody had verified. `finalizeSetup()` skips the same address for the same
    ///      reason, so the two failures co-occur: the contract ships with its immediate setters
    ///      open — `setBaseFee`, `setTrustedSource`, `setAuthorizedSender` all one-transaction
    ///      owner calls — and the post-deploy gate exits 0.
    function test_UnsetTargetIsRejectedRatherThanSkipped() public {
        vm.expectRevert(
            bytes(
                "target: SWR_TEST_UNSET_NEVER_SET is unset - set it to the deployed address,"
                " or set SKIP_SWR_TEST_UNSET_NEVER_SET=true to deliberately exclude this contract"
            )
        );
        script.requireSetupComplete(address(0), "SWR_TEST_UNSET_NEVER_SET");
    }

    /// @notice A genuinely-absent contract can be excluded, but only deliberately.
    /// @dev A hub-only deployment with no soulbounds is legitimate. The opt-out makes that a
    ///      recorded decision in the deploy environment rather than an omission nobody notices.
    ///      The env key is unique to this test: forge runs tests concurrently against a
    ///      process-global environment, so a shared key would race.
    function test_UnsetTargetCanBeExplicitlyOptedOut() public {
        vm.setEnv("SKIP_SWR_TEST_OPTOUT_PROBE", "true");
        script.requireSetupComplete(address(0), "SWR_TEST_OPTOUT_PROBE");
    }

    /// @notice The opt-out only covers absence — a configured-but-unfinalized contract still fails.
    /// @dev Otherwise `SKIP_*` would double as a way to wave through a live contract that never
    ///      had `completeSetup()` called, which is the exact state the gate exists to catch.
    function test_OptOutDoesNotExcuseUnfinalizedContract() public {
        vm.setEnv("SKIP_SWR_TEST_OPTOUT_PROBE_2", "true");
        vm.expectRevert(bytes("target: setupComplete is false - run finalizeSetup()"));
        script.requireSetupComplete(address(operatorRegistry), "SWR_TEST_OPTOUT_PROBE_2");
    }

    /// @notice The handover itself is timelocked — activate cannot follow propose in one block.
    function test_V23_HandoverIsTimelocked() public {
        _finalize();
        script.propose(dao, targets, address(translations));

        vm.expectRevert(TimelockOwnable.TimelockOwnable__TooEarly.selector);
        script.activate(dao, targets);
    }

    /// @notice Handing over a system whose immediate setters are still open is refused.
    /// @dev Ordering is the trap: transferOwnership is immediate BEFORE completeSetup(), so a
    ///      handover run too early would move custody with no delay and leave the DAO holding a
    ///      contract whose trust boundaries an attacker can still change in one transaction.
    function test_V23_ProposeRequiresFinalizedSetup() public {
        // completeSetup() has not been called on either timelocked target.
        vm.expectRevert(bytes("target: setupComplete is false - run finalizeSetup()"));
        script.propose(dao, targets, address(translations));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BAD DAO ADDRESSES
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice A zero DAO address is rejected rather than silently no-oping.
    function test_V23_ZeroDaoRejected() public {
        vm.expectRevert(bytes("DAO_OWNER env var is zero address"));
        script.validateDao(address(0), deployer);
    }

    /// @notice DAO == deployer is rejected: that is not a handover.
    /// @dev Without this the script "succeeds" while leaving the single hot key in charge — the
    ///      exact state V23 exists to eliminate, now disguised by a green deploy log.
    function test_V23_DaoEqualsDeployerRejected() public {
        vm.expectRevert(bytes("DAO_OWNER equals the deployer EOA - that is not a handover"));
        script.validateDao(deployer, deployer);
    }

    /// @notice A wrong-but-valid DAO address is recoverable right up until it accepts.
    /// @dev This is the reason the script stops at "pending owner" rather than force-transferring.
    ///      transferOwnership(address(0)) stays immediate even after completeSetup (clearing a
    ///      pending transfer only ever narrows access), so the deployer can abort and re-run
    ///      against the correct address. After acceptOwnership() it is NOT recoverable — hence
    ///      verify() as a gate rather than an afterthought.
    function test_V23_WrongDaoIsRecoverableBeforeAcceptance() public {
        _finalize();
        address wrongDao = makeAddr("typoAddress");

        script.propose(wrongDao, targets, address(0));
        vm.warp(block.timestamp + operatorRegistry.ACTIVATION_DELAY());
        script.activate(wrongDao, targets);
        assertEq(operatorRegistry.pendingOwner(), wrongDao);

        // Abort: clearing the pending owner is immediate.
        vm.startPrank(deployer);
        operatorRegistry.transferOwnership(address(0));
        feeManager.transferOwnership(address(0));
        vm.stopPrank();
        assertEq(operatorRegistry.pendingOwner(), address(0));

        // The typo'd address can no longer take custody.
        vm.prank(wrongDao);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", wrongDao));
        operatorRegistry.acceptOwnership();
        assertEq(operatorRegistry.owner(), deployer, "deployer retains control after the abort");

        // And the correct handover can be re-run from scratch.
        vm.warp(block.timestamp + operatorRegistry.ACTIVATION_EXPIRY() + 1); // let the stale proposal lapse
        script.propose(dao, targets, address(0));
        vm.warp(block.timestamp + operatorRegistry.ACTIVATION_DELAY());
        script.activate(dao, targets);
        vm.startPrank(dao);
        operatorRegistry.acceptOwnership();
        feeManager.acceptOwnership();
        vm.stopPrank();
        script.verify(dao, targets, address(0));
    }
}
