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

    /// @notice Thrown when renouncing ownership after setup is complete
    /// @dev Renouncing would permanently freeze every timelocked setter AND every emergency
    ///      revoke lever, so it is disabled once the contract is live.
    error TimelockOwnable__RenounceDisabled();

    /// @notice Thrown when proposing an ownership transfer to the zero address
    error TimelockOwnable__ZeroAddress();

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
        if (pendingActivations[actionKey] == 0) revert TimelockOwnable__NotProposed();
        delete pendingActivations[actionKey];
        emit ActionCancelled(actionKey);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OWNERSHIP (timelocked after setup)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Compute the action key for an ownership transfer proposal
    /// @param newOwner The address that would become pending owner on activation
    /// @return The timelock action key
    function ownershipTransferKey(address newOwner) public pure returns (bytes32) {
        return keccak256(abi.encode("transferOwnership", newOwner));
    }

    /// @notice Start an ownership transfer — immediate during setup, timelocked afterwards
    /// @dev Custody of the timelock is itself a trust boundary: an owner key that can hand over
    ///      ownership in one transaction can hand over every *non*-timelocked lever at once
    ///      (revoke operators, pause, cancelAction on pending proposals, redirect fees), which
    ///      makes the 2-day delay on individual setters meaningless. After completeSetup() the
    ///      only path is propose → wait ACTIVATION_DELAY → activate.
    ///      Passing address(0) is always allowed: that clears a pending transfer and only ever
    ///      narrows access, so it stays immediate like every other revoke in this system.
    /// @param newOwner The proposed new owner, or address(0) to clear a pending transfer
    function transferOwnership(address newOwner) public virtual override onlyOwner {
        if (newOwner != address(0) && setupComplete) revert TimelockOwnable__SetupAlreadyComplete();
        super.transferOwnership(newOwner);
    }

    /// @notice Propose an ownership transfer (2-day delay before activation)
    /// @param newOwner The address that will become pending owner on activation
    function proposeOwnershipTransfer(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert TimelockOwnable__ZeroAddress();
        _proposeAction(ownershipTransferKey(newOwner));
    }

    /// @notice Activate a previously proposed ownership transfer
    /// @dev Only starts the Ownable2Step handshake — `newOwner` must still call
    ///      `acceptOwnership()`. Until then the current owner can cancel it immediately via
    ///      `transferOwnership(address(0))`.
    /// @param newOwner The address proposed via proposeOwnershipTransfer
    function activateOwnershipTransfer(address newOwner) external onlyOwner {
        _activateAction(ownershipTransferKey(newOwner));
        super.transferOwnership(newOwner);
    }

    /// @notice Renouncing ownership is permanently disabled once setup is complete
    /// @dev Without an owner, every timelocked setter and every emergency revoke lever
    ///      (revokeOperator, un-trust a spoke, pause) becomes uncallable forever — a worse
    ///      end state than a compromised key, which the DAO can at least time out.
    function renounceOwnership() public virtual override onlyOwner {
        if (setupComplete) revert TimelockOwnable__RenounceDisabled();
        super.renounceOwnership();
    }
}
