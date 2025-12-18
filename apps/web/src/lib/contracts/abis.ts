// Re-export ABI from generated package
// Source: packages/contracts → packages/abis (via export-abi script)
//
// To regenerate after contract changes:
//   pnpm --filter @swr/contracts build
//   pnpm --filter @swr/contracts export-abi

export { StolenWalletRegistryABI as stolenWalletRegistryAbi } from '@swr/abis';
export { FeeManagerABI as feeManagerAbi } from '@swr/abis';
export { RegistryHubABI as registryHubAbi } from '@swr/abis';
