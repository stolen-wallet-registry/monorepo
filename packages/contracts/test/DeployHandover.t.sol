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

    function _targets(address[] memory addrs) internal pure returns (SetupTarget[] memory targets) {
        targets = new SetupTarget[](addrs.length);
        for (uint256 i = 0; i < addrs.length; i++) {
            targets[i] = SetupTarget(addrs[i], "target");
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

        // One unset entry, to pin that address(0) targets are skipped rather than reverting.
        targets = [address(operatorRegistry), address(feeManager), address(0)];
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
    /// @dev Catches the case where the DAO accepted some contracts and not others — a system in
    ///      split custody is not a handover, and must not read as one.
    function test_V23_VerifyRejectsDanglingPendingOwner() public {
        _finalize();
        script.propose(dao, targets, address(translations));
        vm.warp(block.timestamp + operatorRegistry.ACTIVATION_DELAY());
        script.activate(dao, targets);

        vm.startPrank(dao);
        operatorRegistry.acceptOwnership();
        translations.acceptOwnership();
        vm.stopPrank();

        // feeManager is still owner=deployer, pendingOwner=dao.
        vm.expectRevert(bytes("target: owner is not DAO_OWNER - handover incomplete"));
        script.verify(dao, targets, address(translations));
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
