// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Salts
/// @notice Deterministic salt constants for CREATE2 deployment.
/// @dev Each contract has a unique, human-readable salt derived from its role.
///      To redeploy a contract to a new address (e.g., after a code change on testnet),
///      bump the suffix: keccak256("SWR.WalletRegistry") → keccak256("SWR.WalletRegistry.2")
library Salts {
    // ═══════════ Hub Core ═══════════
    bytes32 internal constant FEE_MANAGER = keccak256("SWR.FeeManager");
    bytes32 internal constant OPERATOR_REGISTRY = keccak256("SWR.OperatorRegistry");
    bytes32 internal constant FRAUD_REGISTRY_HUB = keccak256("SWR.FraudRegistryHub");
    bytes32 internal constant WALLET_REGISTRY = keccak256("SWR.WalletRegistry");
    bytes32 internal constant TX_REGISTRY = keccak256("SWR.TransactionRegistry");
    bytes32 internal constant CONTRACT_REGISTRY = keccak256("SWR.ContractRegistry");
    bytes32 internal constant OPERATOR_SUBMITTER = keccak256("SWR.OperatorSubmitter");
    bytes32 internal constant CROSS_CHAIN_INBOX = keccak256("SWR.CrossChainInbox");

    // ═══════════ Hub Soulbound ═══════════
    bytes32 internal constant TRANSLATION_REGISTRY = keccak256("SWR.TranslationRegistry");
    bytes32 internal constant WALLET_SOULBOUND = keccak256("SWR.WalletSoulbound");
    bytes32 internal constant SUPPORT_SOULBOUND = keccak256("SWR.SupportSoulbound");
    bytes32 internal constant SOULBOUND_RECEIVER = keccak256("SWR.SoulboundReceiver");

    // ═══════════ Spoke ═══════════
    bytes32 internal constant HYPERLANE_ADAPTER = keccak256("SWR.HyperlaneAdapter");
    bytes32 internal constant SPOKE_REGISTRY = keccak256("SWR.SpokeRegistry");
    bytes32 internal constant SPOKE_SOULBOUND_FWD = keccak256("SWR.SpokeSoulboundForwarder");
    bytes32 internal constant SPOKE_FEE_MANAGER = keccak256("SWR.Spoke.FeeManager");

    // ═══════════ Local-only (not deployed on testnet/mainnet) ═══════════
    bytes32 internal constant MOCK_AGGREGATOR = keccak256("SWR.MockAggregator");
    bytes32 internal constant MOCK_AGGREGATOR_SPOKE = keccak256("SWR.Spoke.MockAggregator");
    bytes32 internal constant MOCK_GAS_PAYMASTER = keccak256("SWR.MockGasPaymaster");
    bytes32 internal constant MULTICALL3 = keccak256("SWR.Multicall3");
    bytes32 internal constant MULTICALL3_SPOKE = keccak256("SWR.Spoke.Multicall3");
}
