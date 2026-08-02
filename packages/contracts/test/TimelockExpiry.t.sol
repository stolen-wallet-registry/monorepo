// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { TimelockOwnable } from "../src/libraries/TimelockOwnable.sol";
import { OperatorRegistry } from "../src/OperatorRegistry.sol";

/// @notice Minimal concrete TimelockOwnable so the library's propose/activate mechanics can be
///         exercised directly, independent of any one contract's setter semantics.
contract TimelockHarness is TimelockOwnable {
    uint256 public value;

    constructor(address initialOwner) Ownable(initialOwner) { }

    function key(uint256 v) public pure returns (bytes32) {
        return keccak256(abi.encode("setValue", v));
    }

    function proposeValue(uint256 v) external onlyOwner {
        _proposeAction(key(v));
    }

    function activateValue(uint256 v) external onlyOwner {
        _activateAction(key(v));
        value = v;
    }
}

/// @title TimelockExpiryTest
/// @notice V15 — timelock proposals must not stay activatable forever.
/// @dev Before this fix `pendingActivations` was write-once-live-forever: a proposal armed on day
///      0 was still activatable years later in a single transaction, with a zero-length reaction
///      window. That collapses the 2-day delay to zero for any attacker who compromises the owner
///      key after a proposal was armed, and it means proposals armed by the deploying EOA survive
///      the DAO handover as inherited loaded guns (see V23).
contract TimelockExpiryTest is Test {
    TimelockHarness internal h;
    address internal owner;

    function setUp() public {
        vm.warp(1_704_067_200); // 2024-01-01 — avoid timestamp 0 edge cases
        owner = address(this);
        h = new TimelockHarness(owner);
        h.completeSetup();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // THE CORE FIX
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice A proposal left un-activated past ACTIVATION_EXPIRY can no longer be activated.
    /// @dev This is the finding itself. Against the pre-fix code this activation SUCCEEDS, which
    ///      is exactly the "loaded gun" state: the delay has long since elapsed, so the action is
    ///      one transaction away with no community reaction window at all.
    function test_Expiry_ActivateAfterWindowReverts() public {
        h.proposeValue(42);

        vm.warp(block.timestamp + h.ACTIVATION_DELAY() + h.ACTIVATION_EXPIRY() + 1);

        vm.expectRevert(TimelockOwnable.TimelockOwnable__Expired.selector);
        h.activateValue(42);
        assertEq(h.value(), 0, "expired proposal must not apply");
    }

    /// @notice The window is inclusive of its final second — activating ON the deadline works.
    /// @dev `block.timestamp == activationTime + ACTIVATION_EXPIRY` is the LAST valid instant, not
    ///      one before it; test_Expiry_ActivateAfterWindowReverts covers the very next second. The
    ///      two together pin the bound as `<=` rather than `<`.
    function test_Expiry_ActivateAtExactBoundarySucceeds() public {
        h.proposeValue(42);

        vm.warp(block.timestamp + h.ACTIVATION_DELAY() + h.ACTIVATION_EXPIRY());

        h.activateValue(42);
        assertEq(h.value(), 42);
    }

    /// @notice The whole activatable window is open, not just its edges.
    function test_Expiry_ActivateMidWindowSucceeds() public {
        h.proposeValue(7);
        vm.warp(block.timestamp + h.ACTIVATION_DELAY() + 1 days);
        h.activateValue(7);
        assertEq(h.value(), 7);
    }

    /// @notice Too-early still reverts TooEarly, not Expired — the two bounds do not overlap.
    function test_Expiry_TooEarlyIsStillTooEarly() public {
        h.proposeValue(1);
        vm.warp(block.timestamp + h.ACTIVATION_DELAY() - 1);
        vm.expectRevert(TimelockOwnable.TimelockOwnable__TooEarly.selector);
        h.activateValue(1);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EXPIRY MUST NOT WEDGE THE ACTION KEY
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice An expired proposal can be re-proposed without first cancelling it.
    /// @dev The obvious way to get this fix wrong is to add the expiry check to activate only.
    ///      Then a lapsed entry is non-zero forever, `_proposeAction` keeps reverting
    ///      AlreadyPending, and the action key is permanently wedged until someone remembers to
    ///      cancelAction it. Against the pre-fix code the second proposeValue reverts.
    function test_Expiry_ExpiredProposalCanBeReProposed() public {
        h.proposeValue(42);
        vm.warp(block.timestamp + h.ACTIVATION_DELAY() + h.ACTIVATION_EXPIRY() + 1);

        h.proposeValue(42); // replaces the lapsed entry

        // The replacement restarts the FULL delay — it does not inherit the old activation time.
        vm.expectRevert(TimelockOwnable.TimelockOwnable__TooEarly.selector);
        h.activateValue(42);

        vm.warp(block.timestamp + h.ACTIVATION_DELAY());
        h.activateValue(42);
        assertEq(h.value(), 42);
    }

    /// @notice A still-live proposal cannot be re-proposed (no delay reset by re-proposing).
    function test_Expiry_LiveProposalStillBlocksRePropose() public {
        h.proposeValue(42);
        vm.expectRevert(TimelockOwnable.TimelockOwnable__AlreadyPending.selector);
        h.proposeValue(42);

        // Still blocked at the last second of the window.
        vm.warp(block.timestamp + h.ACTIVATION_DELAY() + h.ACTIVATION_EXPIRY());
        vm.expectRevert(TimelockOwnable.TimelockOwnable__AlreadyPending.selector);
        h.proposeValue(42);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ALREADY-ACTIVATED PROPOSALS ARE UNAFFECTED
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Expiry applies to the pending entry only — it never rolls back an applied action.
    /// @dev Security-critical to pin: if expiry somehow reached applied state, a legitimately
    ///      activated trust-boundary change would silently revert itself 14 days later.
    function test_Expiry_ActivatedActionSurvivesTheWindow() public {
        h.proposeValue(99);
        vm.warp(block.timestamp + h.ACTIVATION_DELAY());
        h.activateValue(99);

        vm.warp(block.timestamp + 365 days);
        assertEq(h.value(), 99, "an applied action must not lapse");
        assertEq(h.pendingActivations(h.key(99)), 0, "activation must clear the pending entry");

        // And it cannot be replayed.
        vm.expectRevert(TimelockOwnable.TimelockOwnable__NotProposed.selector);
        h.activateValue(99);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // THE WINDOW CAN NEVER BE EMPTY
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Nothing can configure the timelock into a state where no proposal is activatable.
    /// @dev Both bounds are `constant`, so there is no owner lever that could set expiry below
    ///      the delay and make every proposal expire before it matures. Asserted rather than
    ///      assumed, because a later refactor to a settable expiry would be a denial-of-service
    ///      on every timelocked setter AND on the DAO handover itself.
    function test_Expiry_WindowIsAlwaysNonEmpty() public view {
        assertGt(h.ACTIVATION_EXPIRY(), 0, "expiry window must be non-empty");
        assertGe(h.ACTIVATION_EXPIRY(), h.ACTIVATION_DELAY(), "window must outlast the delay");
    }

    /// @notice activationExpiry() reports the real deadline and 0 when nothing is pending.
    function test_Expiry_ActivationExpiryView() public {
        bytes32 k = h.key(5);
        assertEq(h.activationExpiry(k), 0, "no proposal => 0");

        h.proposeValue(5);
        uint256 activationTime = block.timestamp + h.ACTIVATION_DELAY();
        assertEq(h.activationExpiry(k), activationTime + h.ACTIVATION_EXPIRY());

        vm.warp(activationTime);
        h.activateValue(5);
        assertEq(h.activationExpiry(k), 0, "activation clears it");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PROPOSALS CANNOT BE PRE-ARMED BEFORE completeSetup()
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Arming a proposal before setup is complete is rejected.
    /// @dev During setup the immediate setters are open, so a proposal buys nothing; its only
    ///      effect is to smuggle a pending action past the point where watchers start caring
    ///      about ActionProposed. Against the pre-fix code this call succeeds.
    function test_Expiry_ProposeBeforeCompleteSetupReverts() public {
        TimelockHarness fresh = new TimelockHarness(owner);
        vm.expectRevert(TimelockOwnable.TimelockOwnable__SetupNotComplete.selector);
        fresh.proposeValue(1);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // APPLIES TO REAL CONTRACTS AND TO EVERY PROPOSAL TYPE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice The ownership-transfer proposal expires like any other — this is the DAO handover.
    /// @dev V23 hands custody over via propose → wait → activate. If that proposal never expired,
    ///      a handover proposed and then abandoned would remain activatable indefinitely, so a
    ///      later owner-key compromise could hand the entire system to a stale address in one tx.
    function test_Expiry_OwnershipTransferProposalExpires() public {
        OperatorRegistry reg = new OperatorRegistry(owner);
        reg.completeSetup();
        address dao = makeAddr("dao");

        reg.proposeOwnershipTransfer(dao);
        vm.warp(block.timestamp + reg.ACTIVATION_DELAY() + reg.ACTIVATION_EXPIRY() + 1);

        vm.expectRevert(TimelockOwnable.TimelockOwnable__Expired.selector);
        reg.activateOwnershipTransfer(dao);
        assertEq(reg.pendingOwner(), address(0), "no handshake may have started");

        // Recoverable: re-propose and run the full delay again.
        reg.proposeOwnershipTransfer(dao);
        vm.warp(block.timestamp + reg.ACTIVATION_DELAY());
        reg.activateOwnershipTransfer(dao);
        assertEq(reg.pendingOwner(), dao);
    }

    /// @notice A non-ownership proposal type (operator approval) expires identically.
    /// @dev Every propose/activate pair in this codebase routes through _proposeAction /
    ///      _activateAction, so expiry is uniform by construction; this pins one non-ownership
    ///      case so a future contract-local bypass shows up as a failing test.
    function test_Expiry_OperatorApprovalProposalExpires() public {
        OperatorRegistry reg = new OperatorRegistry(owner);
        reg.completeSetup();
        address op = makeAddr("operator");

        reg.proposeOperator(op, 1, "acme");
        vm.warp(block.timestamp + reg.ACTIVATION_DELAY() + reg.ACTIVATION_EXPIRY() + 1);

        vm.expectRevert(TimelockOwnable.TimelockOwnable__Expired.selector);
        reg.activateOperator(op, 1, "acme");

        // The revert alone does not prove the escalation was not applied: assert the end state
        // too, matching test_Expiry_OwnershipTransferProposalExpires. A lapsed proposal that
        // reverted but had already written the operator would be the actual danger here.
        assertFalse(reg.isApproved(op), "an expired proposal must not have approved the operator");

        // Recoverable: re-propose and run the full delay again.
        reg.proposeOperator(op, 1, "acme");
        vm.warp(block.timestamp + reg.ACTIVATION_DELAY());
        reg.activateOperator(op, 1, "acme");
        assertTrue(reg.isApproved(op));
        assertEq(reg.getOperator(op).capabilities, 1);
    }
}
