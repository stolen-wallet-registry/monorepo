/**
 * CAIP types for multi-chain address handling.
 *
 * CAIP-2: Chain Identifier (e.g., "eip155:8453" for Base)
 * CAIP-10: Account Identifier (e.g., "eip155:8453:0x123...")
 *
 * @see https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md
 * @see https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-10.md
 */

/**
 * CAIP-2 chain identifier string.
 * Format: `{namespace}:{chainId}`
 *
 * @example "eip155:8453" (Base)
 * @example "eip155:1" (Ethereum Mainnet)
 * @example "solana:mainnet" (Solana)
 */
export type CAIP2 = string;

/**
 * CAIP-10 account identifier string.
 * Format: `{namespace}:{chainId}:{address}`
 *
 * @example "eip155:8453:0x742d35Cc6634C0532925a3b844Bc454e83c4b3a1"
 */
export type CAIP10 = string;

/**
 * Supported chain namespaces.
 */
export type ChainNamespace = 'eip155' | 'solana' | 'bip122';

/**
 * Parsed CAIP-2 components.
 */
export interface ParsedCAIP2 {
  namespace: string;
  chainId: string;
}

/**
 * Parsed CAIP-10 components.
 */
export interface ParsedCAIP10 {
  namespace: string;
  chainId: string;
  address: string;
}
