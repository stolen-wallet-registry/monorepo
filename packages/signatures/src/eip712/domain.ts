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

/** EIP-712 domain name for FraudRegistryV2 (Hub) */
export const V2_EIP712_DOMAIN_NAME = 'FraudRegistryV2';

/** EIP-712 domain version for FraudRegistryV2 */
export const V2_EIP712_DOMAIN_VERSION = '4';

/** EIP-712 domain name for SpokeRegistryV2 (Spoke) - matches V1 for compatibility */
export const SPOKE_V2_EIP712_DOMAIN_NAME = 'StolenWalletRegistry';

/**
 * Get EIP-712 domain for FraudRegistryV2 (Hub).
 *
 * @param chainId - The chain ID
 * @param verifyingContract - The FraudRegistryV2 contract address
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
