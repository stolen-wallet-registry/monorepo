// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title TimelockOwnable
/// @author Stolen Wallet Registry Team
/// @notice Lightweight propose/activate timelock for critical owner functions
/// @dev Extends Ownable2Step with a 2-day activation delay on trust-boundary changes.
///      Emergency functions (pause, revoke) remain immediate.
///
///      Deployment lifecycle:
///      1. Deploy contract — setupComplete is false, immediate setters work
///      2. Wire all dependencies via immediate setters
///      3. Call completeSetup() — locks immediate setters, timelocked path required
///
///      After completeSetup(), trust-boundary changes require:
///      propose → wait ACTIVATION_DELAY → activate
abstract contract TimelockOwnable is Ownable2Step {
    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Required delay between proposal and activation
    uint256 public constant ACTIVATION_DELAY = 2 days;

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Maps action key to activation timestamp (0 = not proposed)
    mapping(bytes32 => uint256) public pendingActivations;

    /// @notice True after initial setup is complete — immediate setters are locked
    bool public setupComplete;

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when an action is proposed
    /// @param actionKey The unique key identifying the proposed action
    /// @param activationTime The earliest timestamp when the action can be activated
    event ActionProposed(bytes32 indexed actionKey, uint256 activationTime);

    /// @notice Emitted when a proposed action is activated
    /// @param actionKey The unique key of the activated action
    event ActionActivated(bytes32 indexed actionKey);

    /// @notice Emitted when a proposed action is cancelled
    /// @param actionKey The unique key of the cancelled action
    event ActionCancelled(bytes32 indexed actionKey);

    /// @notice Emitted when initial setup is completed and timelock enforcement begins
    event SetupCompleted();

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Thrown when trying to activate an action that was never proposed
    error TimelockOwnable__NotProposed();

    /// @notice Thrown when trying to activate before the delay has elapsed
    error TimelockOwnable__TooEarly();

    /// @notice Thrown when proposing an action that already has a pending proposal
    error TimelockOwnable__AlreadyPending();

    /// @notice Thrown when using an immediate setter after setup is complete
    error TimelockOwnable__SetupAlreadyComplete();

    // ═══════════════════════════════════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Modifier for immediate setters — only allowed during initial setup
    modifier onlyDuringSetup() {
        if (setupComplete) revert TimelockOwnable__SetupAlreadyComplete();
        _;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Propose an action — sets activation time to now + ACTIVATION_DELAY
    function _proposeAction(bytes32 actionKey) internal {
        if (pendingActivations[actionKey] != 0) revert TimelockOwnable__AlreadyPending();
        uint256 activationTime = block.timestamp + ACTIVATION_DELAY;
        pendingActivations[actionKey] = activationTime;
        emit ActionProposed(actionKey, activationTime);
    }

    /// @dev Activate a previously proposed action — reverts if too early or not proposed
    function _activateAction(bytes32 actionKey) internal {
        uint256 activationTime = pendingActivations[actionKey];
        if (activationTime == 0) revert TimelockOwnable__NotProposed();
        if (block.timestamp < activationTime) revert TimelockOwnable__TooEarly();
        delete pendingActivations[actionKey];
        emit ActionActivated(actionKey);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Mark initial setup as complete — locks immediate setters permanently
    /// @dev Call after all initial wiring (registries, trusted sources, minters) is done.
    ///      Irreversible — once called, all trust-boundary changes require timelock.
    function completeSetup() external onlyOwner {
        if (setupComplete) revert TimelockOwnable__SetupAlreadyComplete();
        setupComplete = true;
        emit SetupCompleted();
    }

    /// @notice Cancel a pending action proposal
    /// @param actionKey The key of the action to cancel
    function cancelAction(bytes32 actionKey) external onlyOwner {
        delete pendingActivations[actionKey];
        emit ActionCancelled(actionKey);
    }
}
