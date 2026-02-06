// Re-export ABI from generated package
// Source: packages/contracts → packages/abis (via export-abi script)
//
// To regenerate after contract changes:
//   pnpm --filter @swr/contracts build
//   pnpm --filter @swr/contracts export-abi

// ═══════════════════════════════════════════════════════════════════════════
// HUB + SEPARATE REGISTRIES ABIs
// ═══════════════════════════════════════════════════════════════════════════

// Hub + Separate Registries (core architecture)
export { FraudRegistryHubABI as fraudRegistryHubAbi } from '@swr/abis';
export { WalletRegistryABI as walletRegistryAbi } from '@swr/abis';
export { TransactionRegistryABI as transactionRegistryAbi } from '@swr/abis';
export { ContractRegistryABI as contractRegistryAbi } from '@swr/abis';
export { OperatorSubmitterABI as operatorSubmitterAbi } from '@swr/abis';
export { CrossChainInboxABI as crossChainInboxAbi } from '@swr/abis';

// Spoke contracts
export { SpokeRegistryABI as spokeRegistryAbi } from '@swr/abis';

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
