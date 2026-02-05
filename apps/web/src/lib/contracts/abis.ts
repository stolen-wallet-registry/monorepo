// Re-export ABI from generated package
// Source: packages/contracts → packages/abis (via export-abi script)
//
// To regenerate after contract changes:
//   pnpm --filter @swr/contracts build
//   pnpm --filter @swr/contracts export-abi

// ═══════════════════════════════════════════════════════════════════════════
// V2 HUB + SEPARATE REGISTRIES ABIs
// ═══════════════════════════════════════════════════════════════════════════

// Hub + Separate Registries (core V2 architecture)
export { FraudRegistryHubV2ABI as fraudRegistryHubV2Abi } from '@swr/abis';
export { WalletRegistryV2ABI as walletRegistryV2Abi } from '@swr/abis';
export { TransactionRegistryV2ABI as transactionRegistryV2Abi } from '@swr/abis';
export { ContractRegistryV2ABI as contractRegistryV2Abi } from '@swr/abis';
export { OperatorSubmitterV2ABI as operatorSubmitterV2Abi } from '@swr/abis';
export { CrossChainInboxV2ABI as crossChainInboxV2Abi } from '@swr/abis';

// Spoke contracts
export { SpokeRegistryV2ABI as spokeRegistryV2Abi } from '@swr/abis';

// ═══════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE ABIs
// ═══════════════════════════════════════════════════════════════════════════

export { FeeManagerABI as feeManagerAbi } from '@swr/abis';
export { OperatorRegistryABI as operatorRegistryAbi } from '@swr/abis';
export { HyperlaneAdapterABI as hyperlaneAdapterAbi } from '@swr/abis';

// ═══════════════════════════════════════════════════════════════════════════
// SOULBOUND ABIs
// ═══════════════════════════════════════════════════════════════════════════

export { TranslationRegistryABI as translationRegistryAbi } from '@swr/abis';
export { WalletSoulboundABI as walletSoulboundAbi } from '@swr/abis';
export { SupportSoulboundABI as supportSoulboundAbi } from '@swr/abis';
export { SpokeSoulboundForwarderABI as spokeSoulboundForwarderAbi } from '@swr/abis';
export { SoulboundReceiverABI as soulboundReceiverAbi } from '@swr/abis';
