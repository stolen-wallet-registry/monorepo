// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IOperatorRegistry } from "./interfaces/IOperatorRegistry.sol";
import { RegistryCapabilities } from "./libraries/RegistryCapabilities.sol";
import { TimelockOwnable } from "./libraries/TimelockOwnable.sol";

/// @title OperatorRegistry
/// @author Stolen Wallet Registry Team
/// @notice Manages DAO-approved operators who can batch-submit fraud data to registries
/// @dev Owner should be DAO multisig or governance contract
contract OperatorRegistry is IOperatorRegistry, TimelockOwnable {
    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS (from RegistryCapabilities library - single source of truth)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Capability bit for StolenWalletRegistry submissions
    uint8 public constant override WALLET_REGISTRY = RegistryCapabilities.WALLET_REGISTRY;

    /// @notice Capability bit for StolenTransactionRegistry submissions
    uint8 public constant override TX_REGISTRY = RegistryCapabilities.TX_REGISTRY;

    /// @notice Capability bit for FraudulentContractRegistry submissions
    uint8 public constant override CONTRACT_REGISTRY = RegistryCapabilities.CONTRACT_REGISTRY;

    /// @notice All registry capabilities combined
    uint8 public constant override ALL_REGISTRIES = RegistryCapabilities.ALL_REGISTRIES;

    // ═══════════════════════════════════════════════════════════════════════════
    // STORAGE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Mapping of operator address to their data
    mapping(address => Operator) private _operators;

    /// @dev Count of currently approved operators
    uint256 private _approvedCount;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Initialize the operator registry
    /// @param _owner Initial owner (should be DAO or multisig)
    constructor(address _owner) Ownable(_owner) { }

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS (DAO only)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IOperatorRegistry
    /// @dev Immediate during initial setup, timelocked after completeSetup()
    function approveOperator(address operator, uint8 capabilities, string calldata identifier)
        external
        override
        onlyOwner
        onlyDuringSetup
    {
        _approveOperatorInternal(operator, capabilities, identifier);
    }

    /// @notice Propose an operator approval (2-day delay before activation)
    /// @param operator Address of the operator to approve
    /// @param capabilities Bitmask of registry capabilities (1=wallet, 2=tx, 4=contract)
    /// @param identifier Human-readable operator name
    function proposeOperator(address operator, uint8 capabilities, string calldata identifier) external onlyOwner {
        if (operator == address(0)) revert OperatorRegistry__ZeroAddress();
        if (capabilities == 0 || capabilities > ALL_REGISTRIES) {
            revert OperatorRegistry__InvalidCapabilities();
        }
        bytes32 key = keccak256(abi.encode("approveOperator", operator, capabilities, identifier));
        _proposeAction(key);
    }

    /// @notice Activate a previously proposed operator approval
    /// @param operator Address of the operator to approve
    /// @param capabilities Bitmask of registry capabilities (1=wallet, 2=tx, 4=contract)
    /// @param identifier Human-readable operator name
    function activateOperator(address operator, uint8 capabilities, string calldata identifier) external onlyOwner {
        bytes32 key = keccak256(abi.encode("approveOperator", operator, capabilities, identifier));
        _activateAction(key);
        _approveOperatorInternal(operator, capabilities, identifier);
    }

    function _approveOperatorInternal(address operator, uint8 capabilities, string calldata identifier) internal {
        if (operator == address(0)) revert OperatorRegistry__ZeroAddress();
        if (capabilities == 0 || capabilities > ALL_REGISTRIES) {
            revert OperatorRegistry__InvalidCapabilities();
        }

        Operator storage op = _operators[operator];
        if (op.approved) revert OperatorRegistry__AlreadyApproved();

        op.approved = true;
        op.capabilities = capabilities;
        op.approvedAt = uint64(block.number);
        op.revokedAt = 0;
        op.identifier = identifier;

        unchecked {
            ++_approvedCount;
        }

        emit OperatorApproved(operator, capabilities, identifier, uint64(block.number));
    }

    /// @inheritdoc IOperatorRegistry
    function revokeOperator(address operator) external override onlyOwner {
        if (operator == address(0)) revert OperatorRegistry__ZeroAddress();

        Operator storage op = _operators[operator];
        if (!op.approved) revert OperatorRegistry__NotApproved();

        op.approved = false;
        op.revokedAt = uint64(block.number);

        unchecked {
            --_approvedCount;
        }

        emit OperatorRevoked(operator, uint64(block.number));
    }

    /// @inheritdoc IOperatorRegistry
    function updateCapabilities(address operator, uint8 capabilities) external override onlyOwner {
        if (operator == address(0)) revert OperatorRegistry__ZeroAddress();
        if (capabilities == 0 || capabilities > ALL_REGISTRIES) {
            revert OperatorRegistry__InvalidCapabilities();
        }

        Operator storage op = _operators[operator];
        if (!op.approved) revert OperatorRegistry__NotApproved();

        uint8 oldCapabilities = op.capabilities;
        op.capabilities = capabilities;

        emit OperatorCapabilitiesUpdated(operator, oldCapabilities, capabilities);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IOperatorRegistry
    function isApproved(address operator) external view override returns (bool) {
        return _operators[operator].approved;
    }

    /// @inheritdoc IOperatorRegistry
    function isApprovedFor(address operator, uint8 registryType) external view override returns (bool) {
        // Reject zero registryType - no valid capability check
        if (registryType == 0) return false;
        Operator storage op = _operators[operator];
        if (!op.approved) return false;
        return (op.capabilities & registryType) == registryType;
    }

    /// @inheritdoc IOperatorRegistry
    function getOperator(address operator) external view override returns (Operator memory) {
        return _operators[operator];
    }

    /// @inheritdoc IOperatorRegistry
    function getCapabilities(address operator) external view override returns (uint8) {
        return _operators[operator].capabilities;
    }

    /// @inheritdoc IOperatorRegistry
    function approvedOperatorCount() external view override returns (uint256) {
        return _approvedCount;
    }
}
