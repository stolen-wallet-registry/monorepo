/**
 * EIP-712 domain configuration for SWR registries.
 */

import type { TypedDataDomain, Address } from 'viem';

// ═══════════════════════════════════════════════════════════════════════════
// EIP-712 DOMAIN CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** EIP-712 domain name for all registries (hub + spoke) */
export const EIP712_DOMAIN_NAME = 'StolenWalletRegistry';

/** EIP-712 domain version for all registries */
export const EIP712_DOMAIN_VERSION = '4';

/**
 * Get EIP-712 domain for hub registries (WalletRegistry, TransactionRegistry).
 *
 * @param chainId - The chain ID
 * @param verifyingContract - The registry contract address
 * @returns EIP-712 domain object
 */
export function getEIP712Domain(chainId: number, verifyingContract: Address): TypedDataDomain {
  return {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId: BigInt(chainId),
    verifyingContract,
  };
}

/**
 * Get EIP-712 domain for SpokeRegistry (spoke chains).
 * Uses "StolenWalletRegistry" domain name for backward compatibility.
 *
 * @param chainId - The chain ID
 * @param verifyingContract - The SpokeRegistry contract address
 * @returns EIP-712 domain object
 */
export function getSpokeEIP712Domain(chainId: number, verifyingContract: Address): TypedDataDomain {
  return {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId: BigInt(chainId),
    verifyingContract,
  };
}
