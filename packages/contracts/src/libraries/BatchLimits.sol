// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BatchLimits
/// @author Stolen Wallet Registry Team
/// @notice Batch-size bounds shared across the hub, spokes, and bridge adapters.
/// @dev A single definition so the three contracts that depend on this value cannot drift:
///      - `SpokeRegistry.MAX_CROSS_CHAIN_BATCH_SIZE` bounds what a spoke will acknowledge;
///      - `TransactionRegistry.MAX_TWO_PHASE_BATCH_SIZE` must be >= the spoke bound so a batch
///        acceptable on a spoke is always executable on the hub after bridging;
///      - `HyperlaneAdapter.setGasAmounts` must keep a maximum-size batch quotable under
///        `MAX_GAS_LIMIT`.
///      Grounded in the measured ~26,200 gas/entry: 800 entries ≈ 21M gas, which fits a
///      25M-gas block with headroom (see `test/GasMeasurement.t.sol`).
library BatchLimits {
    /// @notice Maximum number of entries in a cross-chain / two-phase batch
    uint256 internal constant MAX_CROSS_CHAIN_BATCH_SIZE = 800;
}
