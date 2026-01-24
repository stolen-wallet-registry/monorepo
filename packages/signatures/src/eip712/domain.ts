/**
 * EIP-712 domain configuration for SWR registries.
 */

import type { TypedDataDomain, Address } from 'viem';

// ═══════════════════════════════════════════════════════════════════════════
// STOLEN WALLET REGISTRY (SWR)
// ═══════════════════════════════════════════════════════════════════════════

/** EIP-712 domain name for StolenWalletRegistry */
export const EIP712_DOMAIN_NAME = 'StolenWalletRegistry';

/** EIP-712 domain version for StolenWalletRegistry */
export const EIP712_DOMAIN_VERSION = '4';

/**
 * Get EIP-712 domain for StolenWalletRegistry.
 *
 * @param chainId - The chain ID
 * @param verifyingContract - The contract address
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

// ═══════════════════════════════════════════════════════════════════════════
// STOLEN TRANSACTION REGISTRY (STR)
// ═══════════════════════════════════════════════════════════════════════════

/** EIP-712 domain name for StolenTransactionRegistry */
export const TX_EIP712_DOMAIN_NAME = 'StolenTransactionRegistry';

/** EIP-712 domain version for StolenTransactionRegistry */
export const TX_EIP712_DOMAIN_VERSION = '4';

/**
 * Get EIP-712 domain for StolenTransactionRegistry.
 *
 * @param chainId - The chain ID
 * @param verifyingContract - The contract address
 * @returns EIP-712 domain object
 */
export function getTxEIP712Domain(chainId: number, verifyingContract: Address): TypedDataDomain {
  return {
    name: TX_EIP712_DOMAIN_NAME,
    version: TX_EIP712_DOMAIN_VERSION,
    chainId: BigInt(chainId),
    verifyingContract,
  };
}
