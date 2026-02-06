/**
 * EIP-712 domain configuration for SWR registries.
 */

import type { TypedDataDomain, Address } from 'viem';

// ═══════════════════════════════════════════════════════════════════════════
// V1 STOLEN WALLET REGISTRY (DEPRECATED)
// ═══════════════════════════════════════════════════════════════════════════

/** @deprecated Use V2_EIP712_DOMAIN_NAME for new integrations */
export const EIP712_DOMAIN_NAME = 'StolenWalletRegistry';

/** @deprecated Use V2_EIP712_DOMAIN_VERSION for new integrations */
export const EIP712_DOMAIN_VERSION = '4';

/**
 * @deprecated Use getV2EIP712Domain or getSpokeV2EIP712Domain for new integrations
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
// V1 STOLEN TRANSACTION REGISTRY (DEPRECATED)
// ═══════════════════════════════════════════════════════════════════════════

/** @deprecated Use V2_EIP712_DOMAIN_NAME for new integrations */
export const TX_EIP712_DOMAIN_NAME = 'StolenTransactionRegistry';

/** @deprecated Use V2_EIP712_DOMAIN_VERSION for new integrations */
export const TX_EIP712_DOMAIN_VERSION = '4';

/**
 * @deprecated Use getV2EIP712Domain for new integrations
 */
export function getTxEIP712Domain(chainId: number, verifyingContract: Address): TypedDataDomain {
  return {
    name: TX_EIP712_DOMAIN_NAME,
    version: TX_EIP712_DOMAIN_VERSION,
    chainId: BigInt(chainId),
    verifyingContract,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// V2 FRAUD REGISTRY (PRIMARY)
// ═══════════════════════════════════════════════════════════════════════════

/** EIP-712 domain name for all V2 registries (hub + spoke) */
export const V2_EIP712_DOMAIN_NAME = 'StolenWalletRegistry';

/** EIP-712 domain version for all V2 registries */
export const V2_EIP712_DOMAIN_VERSION = '4';

/** @deprecated Use V2_EIP712_DOMAIN_NAME — hub and spoke now share the same domain name */
export const SPOKE_V2_EIP712_DOMAIN_NAME = V2_EIP712_DOMAIN_NAME;

/**
 * Get EIP-712 domain for V2 hub registries (WalletRegistryV2, TransactionRegistryV2).
 *
 * @param chainId - The chain ID
 * @param verifyingContract - The registry contract address
 * @returns EIP-712 domain object
 */
export function getV2EIP712Domain(chainId: number, verifyingContract: Address): TypedDataDomain {
  return {
    name: V2_EIP712_DOMAIN_NAME,
    version: V2_EIP712_DOMAIN_VERSION,
    chainId: BigInt(chainId),
    verifyingContract,
  };
}

/**
 * Get EIP-712 domain for SpokeRegistryV2 (Spoke chains).
 * Uses "StolenWalletRegistry" domain name for backward compatibility.
 *
 * @param chainId - The chain ID
 * @param verifyingContract - The SpokeRegistryV2 contract address
 * @returns EIP-712 domain object
 */
export function getSpokeV2EIP712Domain(
  chainId: number,
  verifyingContract: Address
): TypedDataDomain {
  return {
    name: SPOKE_V2_EIP712_DOMAIN_NAME,
    version: V2_EIP712_DOMAIN_VERSION,
    chainId: BigInt(chainId),
    verifyingContract,
  };
}
