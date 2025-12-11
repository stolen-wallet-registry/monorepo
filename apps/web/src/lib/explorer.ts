/**
 * Block explorer URL utilities.
 *
 * Generates explorer URLs for transactions and addresses.
 */

/**
 * Explorer configurations by chain ID.
 */
const EXPLORERS: Record<number, { name: string; baseUrl: string }> = {
  // Localhost / Anvil
  31337: { name: 'Anvil', baseUrl: '' }, // No explorer for local

  // Ethereum
  1: { name: 'Etherscan', baseUrl: 'https://etherscan.io' },

  // Sepolia (Ethereum testnet)
  11155111: { name: 'Sepolia Etherscan', baseUrl: 'https://sepolia.etherscan.io' },

  // Goerli (Ethereum testnet - deprecated but still used)
  5: { name: 'Goerli Etherscan', baseUrl: 'https://goerli.etherscan.io' },

  // Base
  8453: { name: 'BaseScan', baseUrl: 'https://basescan.org' },

  // Base Sepolia
  84532: { name: 'Base Sepolia', baseUrl: 'https://sepolia.basescan.org' },

  // Optimism
  10: { name: 'Optimistic Etherscan', baseUrl: 'https://optimistic.etherscan.io' },

  // Arbitrum
  42161: { name: 'Arbiscan', baseUrl: 'https://arbiscan.io' },

  // Polygon
  137: { name: 'Polygonscan', baseUrl: 'https://polygonscan.com' },
};

/**
 * Get the block explorer URL for a transaction.
 *
 * @param chainId - The chain ID
 * @param txHash - The transaction hash
 * @returns The explorer URL or null if no explorer configured
 */
export function getExplorerTxUrl(chainId: number, txHash: `0x${string}`): string | null {
  const explorer = EXPLORERS[chainId];
  if (!explorer || !explorer.baseUrl) {
    return null;
  }
  return `${explorer.baseUrl}/tx/${txHash}`;
}

/**
 * Get the block explorer URL for an address.
 *
 * @param chainId - The chain ID
 * @param address - The address
 * @returns The explorer URL or null if no explorer configured
 */
export function getExplorerAddressUrl(chainId: number, address: `0x${string}`): string | null {
  const explorer = EXPLORERS[chainId];
  if (!explorer || !explorer.baseUrl) {
    return null;
  }
  return `${explorer.baseUrl}/address/${address}`;
}

/**
 * Get the block explorer name for a chain.
 *
 * @param chainId - The chain ID
 * @returns The explorer name or "Explorer" as default
 */
export function getExplorerName(chainId: number): string {
  return EXPLORERS[chainId]?.name ?? 'Explorer';
}
