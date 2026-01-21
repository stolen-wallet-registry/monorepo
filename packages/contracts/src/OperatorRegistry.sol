// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { IOperatorRegistry } from "./interfaces/IOperatorRegistry.sol";

/// @title OperatorRegistry
/// @notice Manages DAO-approved operators who can batch-submit fraud data to registries
/// @dev Owner should be DAO multisig or governance contract
contract OperatorRegistry is IOperatorRegistry, Ownable2Step {
    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Capability bit for StolenWalletRegistry submissions
    uint8 public constant override WALLET_REGISTRY = 0x01;

    /// @notice Capability bit for StolenTransactionRegistry submissions
    uint8 public constant override TX_REGISTRY = 0x02;

    /// @notice Capability bit for FraudulentContractRegistry submissions
    uint8 public constant override CONTRACT_REGISTRY = 0x04;

    /// @notice All registry capabilities combined
    uint8 public constant override ALL_REGISTRIES = 0x07;

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

    /// @param _owner Initial owner (should be DAO or multisig)
    constructor(address _owner) Ownable(_owner) { }

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS (DAO only)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IOperatorRegistry
    function approveOperator(address operator, uint8 capabilities, string calldata identifier)
        external
        override
        onlyOwner
    {
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
