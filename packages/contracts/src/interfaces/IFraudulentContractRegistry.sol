// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IFraudulentContractRegistry
/// @author Stolen Wallet Registry Team
/// @notice Interface for the Fraudulent Contract Registry subregistry (STUB - Phase 3)
/// @dev Operator-only submissions for cataloging malicious smart contracts.
///      Supports batch submissions and removal mechanisms for false positives.
///
/// IMPLEMENTATION NOTES (for future development):
/// - Operator-only: Only DAO-approved operators can submit
/// - Batch support: Efficient registration of multiple contracts
/// - Removal mechanism: Handle false positives with governance
/// - Metadata: Store contract type, chain, first seen block, etc.
interface IFraudulentContractRegistry {
    // Placeholder - detailed interface to be designed in Phase 3
    // See PRPs/03-contract-architecture-expansion.md for requirements

    /// @notice Check if a contract is registered as fraudulent
    /// @param contractAddress The contract address to query (CAIP-10 format in future)
    /// @return True if the contract is registered as fraudulent
    function isRegistered(address contractAddress) external view returns (bool);
}
