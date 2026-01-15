// Re-export ABI from generated package
// Source: packages/contracts → packages/abis (via export-abi script)
//
// To regenerate after contract changes:
//   pnpm --filter @swr/contracts build
//   pnpm --filter @swr/contracts export-abi

// Hub contracts
export { StolenWalletRegistryABI as stolenWalletRegistryAbi } from '@swr/abis';
export { FeeManagerABI as feeManagerAbi } from '@swr/abis';
export { RegistryHubABI as registryHubAbi } from '@swr/abis';
export { CrossChainInboxABI as crossChainInboxAbi } from '@swr/abis';

// Spoke contracts (cross-chain)
export { SpokeRegistryABI as spokeRegistryAbi } from '@swr/abis';
export { HyperlaneAdapterABI as hyperlaneAdapterAbi } from '@swr/abis';

// Soulbound contracts
export { TranslationRegistryABI as translationRegistryAbi } from '@swr/abis';
export { WalletSoulboundABI as walletSoulboundAbi } from '@swr/abis';
export { SupportSoulboundABI as supportSoulboundAbi } from '@swr/abis';
