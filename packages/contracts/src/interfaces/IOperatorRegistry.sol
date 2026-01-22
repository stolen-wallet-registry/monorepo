// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IOperatorRegistry
/// @author Stolen Wallet Registry Team
/// @notice Interface for managing DAO-approved operators who can batch-submit fraud data
interface IOperatorRegistry {
    // ═══════════════════════════════════════════════════════════════════════════
    // TYPES
    // ═══════════════════════════════════════════════════════════════════════════

    struct Operator {
        bool approved; // Is operator currently approved
        uint8 capabilities; // Bitmask: 0x01=wallet, 0x02=tx, 0x04=contract
        uint64 approvedAt; // Block number when approved
        uint64 revokedAt; // Block number when revoked (0 if active)
        string identifier; // Human-readable name (e.g., "Coinbase", "ZachXBT")
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Capability bit for wallet registry (0x01)
    /// @return The capability bit value
    function WALLET_REGISTRY() external pure returns (uint8); // solhint-disable-line func-name-mixedcase

    /// @notice Capability bit for transaction registry (0x02)
    /// @return The capability bit value
    function TX_REGISTRY() external pure returns (uint8); // solhint-disable-line func-name-mixedcase

    /// @notice Capability bit for contract registry (0x04)
    /// @return The capability bit value
    function CONTRACT_REGISTRY() external pure returns (uint8); // solhint-disable-line func-name-mixedcase

    /// @notice All registry capabilities combined (0x07)
    /// @return The combined capability bits
    function ALL_REGISTRIES() external pure returns (uint8); // solhint-disable-line func-name-mixedcase

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when a new operator is approved
    /// @param operator The operator address
    /// @param capabilities The capabilities bitmask granted
    /// @param identifier Human-readable identifier for the operator
    /// @param approvedAt Block number when approved
    event OperatorApproved(address indexed operator, uint8 capabilities, string identifier, uint64 approvedAt);

    /// @notice Emitted when an operator is revoked
    /// @param operator The operator address
    /// @param revokedAt Block number when revoked
    event OperatorRevoked(address indexed operator, uint64 revokedAt);

    /// @notice Emitted when an operator's capabilities are updated
    /// @param operator The operator address
    /// @param oldCapabilities Previous capabilities bitmask
    /// @param newCapabilities New capabilities bitmask
    event OperatorCapabilitiesUpdated(address indexed operator, uint8 oldCapabilities, uint8 newCapabilities);

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    error OperatorRegistry__ZeroAddress();
    error OperatorRegistry__AlreadyApproved();
    error OperatorRegistry__NotApproved();
    error OperatorRegistry__InvalidCapabilities();
    error OperatorRegistry__NotAuthorizedForRegistry(uint8 requiredCapability);

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS (DAO only)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Approve a new operator with specified capabilities
    /// @param operator Address to approve
    /// @param capabilities Bitmask of registry permissions
    /// @param identifier Human-readable name for the operator
    function approveOperator(address operator, uint8 capabilities, string calldata identifier) external;

    /// @notice Revoke an operator (immediate effect)
    /// @param operator Address to revoke
    function revokeOperator(address operator) external;

    /// @notice Update an operator's capabilities
    /// @param operator Address to update
    /// @param capabilities New capabilities bitmask
    function updateCapabilities(address operator, uint8 capabilities) external;

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Check if address is an approved operator
    /// @param operator Address to check
    /// @return True if operator is currently approved
    function isApproved(address operator) external view returns (bool);

    /// @notice Check if operator is approved for specific registry type
    /// @param operator Address to check
    /// @param registryType Registry capability bit (0x01, 0x02, or 0x04)
    /// @return True if operator has the specified capability
    function isApprovedFor(address operator, uint8 registryType) external view returns (bool);

    /// @notice Get full operator data
    /// @param operator Address to query
    /// @return Operator struct with all data
    function getOperator(address operator) external view returns (Operator memory);

    /// @notice Get operator's capabilities bitmask
    /// @param operator Address to query
    /// @return Capabilities bitmask
    function getCapabilities(address operator) external view returns (uint8);

    /// @notice Get total count of currently approved operators
    /// @return Count of approved operators
    function approvedOperatorCount() external view returns (uint256);
}
