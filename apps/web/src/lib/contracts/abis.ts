// Re-export ABI from generated package
// Source: packages/contracts → packages/abis (via export-abi script)
//
// To regenerate after contract changes:
//   pnpm --filter @swr/contracts build
//   pnpm --filter @swr/contracts export-abi

// ═══════════════════════════════════════════════════════════════════════════
// V2 ABIs (PRIMARY)
// ═══════════════════════════════════════════════════════════════════════════

// V2 Hub contracts
export { FraudRegistryV2ABI as fraudRegistryV2Abi } from '@swr/abis';
export { CrossChainInboxV2ABI as crossChainInboxV2Abi } from '@swr/abis';
export { OperatorSubmitterABI as operatorSubmitterAbi } from '@swr/abis';

// V2 Spoke contracts
export { SpokeRegistryV2ABI as spokeRegistryV2Abi } from '@swr/abis';

// ═══════════════════════════════════════════════════════════════════════════
// V1 ABIs (DEPRECATED - kept for transition)
// ═══════════════════════════════════════════════════════════════════════════

// V1 Hub contracts
/** @deprecated Use fraudRegistryV2Abi for new integrations */
export { StolenWalletRegistryABI as stolenWalletRegistryAbi } from '@swr/abis';
/** @deprecated Use fraudRegistryV2Abi for new integrations */
export { StolenTransactionRegistryABI as stolenTransactionRegistryAbi } from '@swr/abis';
export { FeeManagerABI as feeManagerAbi } from '@swr/abis';
/** @deprecated Use fraudRegistryV2Abi for new integrations */
export { RegistryHubABI as registryHubAbi } from '@swr/abis';
/** @deprecated Use crossChainInboxV2Abi for new integrations */
export { CrossChainInboxABI as crossChainInboxAbi } from '@swr/abis';
export { OperatorRegistryABI as operatorRegistryAbi } from '@swr/abis';
export { FraudulentContractRegistryABI as fraudulentContractRegistryAbi } from '@swr/abis';

// V1 Spoke contracts (cross-chain)
/** @deprecated Use spokeRegistryV2Abi for new integrations */
export { SpokeRegistryABI as spokeRegistryAbi } from '@swr/abis';
/** @deprecated Use spokeRegistryV2Abi for new integrations */
export { SpokeTransactionRegistryABI as spokeTransactionRegistryAbi } from '@swr/abis';
export { HyperlaneAdapterABI as hyperlaneAdapterAbi } from '@swr/abis';

// ═══════════════════════════════════════════════════════════════════════════
// SOULBOUND ABIs (shared between V1 and V2)
// ═══════════════════════════════════════════════════════════════════════════

// Soulbound contracts
export { TranslationRegistryABI as translationRegistryAbi } from '@swr/abis';
export { WalletSoulboundABI as walletSoulboundAbi } from '@swr/abis';
export { SupportSoulboundABI as supportSoulboundAbi } from '@swr/abis';

// Cross-chain soulbound contracts
export { SpokeSoulboundForwarderABI as spokeSoulboundForwarderAbi } from '@swr/abis';
export { SoulboundReceiverABI as soulboundReceiverAbi } from '@swr/abis';
