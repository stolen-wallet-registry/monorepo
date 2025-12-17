// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IStolenTransactionRegistry
/// @author Stolen Wallet Registry Team
/// @notice Interface for the Stolen Transaction Registry subregistry (STUB - Phase 8)
/// @dev Marks specific fraudulent transactions (phishing, address poisoning, etc.)
///      Deferred due to higher gaming risk - requires robust dispute mechanism.
///
/// IMPLEMENTATION NOTES (for future development):
/// - Gaming risk: Higher than wallet registry, needs dispute resolution
/// - Transaction types: Phishing, address poisoning, fraudulent approvals
/// - Trust model: May weight operator submissions higher than individuals
/// - Dispute mechanism: TBD - on-chain arbitration vs DAO voting
interface IStolenTransactionRegistry {
    // Placeholder - detailed interface to be designed in Phase 8
    // See docs/manifesto.md for requirements and gaming concerns

    /// @notice Check if a transaction is registered as fraudulent
    /// @param txHash The transaction hash to query
    /// @return True if the transaction is registered as fraudulent
    function isRegistered(bytes32 txHash) external view returns (bool);
}
