// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title RegistryCapabilities
/// @notice Shared capability bit constants for operator permissions
/// @dev Single source of truth for capability bits used by:
///      - OperatorRegistry (defines which capabilities exist)
///      - StolenWalletRegistry (checks WALLET_REGISTRY capability)
///      - StolenTransactionRegistry (checks TX_REGISTRY capability)
///      - FraudulentContractRegistry (checks CONTRACT_REGISTRY capability)
library RegistryCapabilities {
    /// @notice Capability bit for StolenWalletRegistry submissions
    uint8 internal constant WALLET_REGISTRY = 0x01;

    /// @notice Capability bit for StolenTransactionRegistry submissions
    uint8 internal constant TX_REGISTRY = 0x02;

    /// @notice Capability bit for FraudulentContractRegistry submissions
    uint8 internal constant CONTRACT_REGISTRY = 0x04;

    /// @notice All registry capabilities combined
    uint8 internal constant ALL_REGISTRIES = 0x07;
}
