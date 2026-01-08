/**
 * Shared chain configuration for the Stolen Wallet Registry.
 *
 * This file centralizes chain-specific data to avoid duplication across packages.
 * When adding new chains, update this file and ensure consistency with:
 * - apps/web/src/lib/wagmi.ts (wagmi chain config)
 * - packages/ui/src/lib/registry/query.ts (CHAIN_CONFIGS for viem clients)
 */

/**
 * Local development chain IDs (Anvil instances).
 * Excluded from bridge explorers and external services.
 */
export const LOCAL_DEV_CHAINS = [31337, 31338] as const;

/**
 * Check if a chain ID is a local development chain.
 */
export function isLocalDevChain(chainId: number): boolean {
  return LOCAL_DEV_CHAINS.includes(chainId as (typeof LOCAL_DEV_CHAINS)[number]);
}

/**
 * Block explorer base URLs for supported chains.
 *
 * Note: For wagmi-integrated apps, prefer using the dynamic chain.blockExplorers
 * from wagmi config. This static map is for packages without wagmi dependency.
 */
export const CHAIN_EXPLORERS: Record<number, string> = {
  // Mainnets
  1: 'https://etherscan.io',
  8453: 'https://basescan.org',
  10: 'https://optimistic.etherscan.io',
  42161: 'https://arbiscan.io',
  137: 'https://polygonscan.com',
  // Testnets
  84532: 'https://sepolia.basescan.org',
  11155420: 'https://sepolia-optimism.etherscan.io',
  11155111: 'https://sepolia.etherscan.io',
};

/**
 * Get block explorer URL for an address on a given chain.
 *
 * @param chainId - The chain ID
 * @param address - The address to look up
 * @returns The explorer URL or null if chain not supported
 */
export function getExplorerAddressUrl(chainId: number, address: string): string | null {
  const baseUrl = CHAIN_EXPLORERS[chainId];
  if (!baseUrl) return null;
  return `${baseUrl}/address/${address}`;
}

/**
 * Get block explorer URL for a transaction on a given chain.
 *
 * @param chainId - The chain ID
 * @param txHash - The transaction hash
 * @returns The explorer URL or null if chain not supported
 */
export function getExplorerTxUrl(chainId: number, txHash: string): string | null {
  const baseUrl = CHAIN_EXPLORERS[chainId];
  if (!baseUrl) return null;
  return `${baseUrl}/tx/${txHash}`;
}

/**
 * Get the block explorer name for a chain.
 *
 * @param chainId - The chain ID
 * @returns The explorer name or 'Explorer' as default
 */
export function getExplorerName(chainId: number): string {
  const names: Record<number, string> = {
    1: 'Etherscan',
    8453: 'Basescan',
    10: 'Optimism Explorer',
    42161: 'Arbiscan',
    137: 'Polygonscan',
    84532: 'Basescan Sepolia',
    11155420: 'Optimism Sepolia Explorer',
    11155111: 'Sepolia Etherscan',
  };
  return names[chainId] ?? 'Explorer';
}
