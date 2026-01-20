/**
 * Registry metadata for ABI and function name lookups.
 *
 * Consolidates the ABI selection and function name mapping logic that was
 * previously duplicated across 15+ hooks. Use this instead of inline ternaries.
 *
 * @example
 * ```ts
 * // Before (duplicated in each hook)
 * const abi = registryType === 'spoke' ? spokeRegistryAbi : stolenWalletRegistryAbi;
 * const functionName = registryType === 'spoke' ? 'acknowledgeLocal' : 'acknowledge';
 *
 * // After (using metadata)
 * const { abi, functions } = getRegistryMetadata('wallet', registryType);
 * const functionName = functions.acknowledge;
 * ```
 */

import {
  stolenWalletRegistryAbi,
  spokeRegistryAbi,
  stolenTransactionRegistryAbi,
  spokeTransactionRegistryAbi,
} from './abis';
import type { RegistryType } from './addresses';

export type RegistryVariant = 'wallet' | 'transaction';

/**
 * Function name mappings for registry operations.
 * Hub and spoke contracts use different function names for some operations.
 */
export interface RegistryFunctions {
  /** Acknowledgement function (phase 1) */
  acknowledge: string;
  /** Registration function (phase 2) */
  register: string;
  /** Get deadline and hash struct for signing */
  generateHashStruct: string;
  /** Get grace period timing info */
  getDeadlines: string;
  /** Get current nonce for address */
  nonces: string;
  /** Quote registration fee (single value) */
  quoteRegistration: string;
  /** Quote fee breakdown (spoke only, with bridge fee) */
  quoteFeeBreakdown: string;
  /** Check if address is pending acknowledgement */
  isPending: string;
  /** Check if address is registered */
  isRegistered: string;
  /** Get acknowledgement data */
  getAcknowledgement: string;
  /** Get registration data */
  getRegistration: string;
}

/**
 * Complete metadata for a registry variant + chain role combination.
 */
export interface RegistryMetadata {
  /** The ABI for this registry */
  abi:
    | typeof stolenWalletRegistryAbi
    | typeof spokeRegistryAbi
    | typeof stolenTransactionRegistryAbi
    | typeof spokeTransactionRegistryAbi;
  /** Function name mappings */
  functions: RegistryFunctions;
}

/**
 * Registry metadata organized by variant (wallet/transaction) and chain role (hub/spoke).
 */
const REGISTRY_METADATA: Record<RegistryVariant, Record<RegistryType, RegistryMetadata>> = {
  wallet: {
    hub: {
      abi: stolenWalletRegistryAbi,
      functions: {
        acknowledge: 'acknowledge',
        register: 'register',
        generateHashStruct: 'generateHashStruct',
        getDeadlines: 'getDeadlines',
        nonces: 'nonces',
        quoteRegistration: 'quoteRegistration',
        quoteFeeBreakdown: 'quoteRegistration', // Hub doesn't have breakdown, use single value
        isPending: 'isPending',
        isRegistered: 'isRegistered',
        getAcknowledgement: 'getAcknowledgement',
        getRegistration: 'getRegistration',
      },
    },
    spoke: {
      abi: spokeRegistryAbi,
      functions: {
        acknowledge: 'acknowledgeLocal',
        register: 'registerLocal',
        generateHashStruct: 'generateHashStruct',
        getDeadlines: 'getDeadlines',
        nonces: 'nonces',
        quoteRegistration: 'quoteRegistration',
        quoteFeeBreakdown: 'quoteFeeBreakdown',
        isPending: 'isPending',
        isRegistered: 'isRegistered',
        getAcknowledgement: 'getAcknowledgement',
        getRegistration: 'getRegistration',
      },
    },
  },
  transaction: {
    hub: {
      abi: stolenTransactionRegistryAbi,
      functions: {
        acknowledge: 'acknowledge',
        register: 'register',
        generateHashStruct: 'generateHashStruct',
        getDeadlines: 'getDeadlines',
        nonces: 'nonces',
        quoteRegistration: 'quoteRegistration',
        quoteFeeBreakdown: 'quoteRegistration', // Hub doesn't have breakdown
        isPending: 'isPending',
        isRegistered: 'isBatchRegistered',
        getAcknowledgement: 'getAcknowledgement',
        getRegistration: 'getBatch',
      },
    },
    spoke: {
      abi: spokeTransactionRegistryAbi,
      functions: {
        acknowledge: 'acknowledgeLocal',
        register: 'registerLocal',
        generateHashStruct: 'generateHashStruct',
        getDeadlines: 'getDeadlines',
        nonces: 'nonces',
        quoteRegistration: 'quoteRegistration',
        quoteFeeBreakdown: 'quoteFeeBreakdown',
        isPending: 'isPending',
        isRegistered: 'isBatchRegistered',
        getAcknowledgement: 'getAcknowledgement',
        getRegistration: 'getBatch',
      },
    },
  },
};

/**
 * Get registry metadata for a specific variant and chain role.
 *
 * @param variant - 'wallet' or 'transaction'
 * @param chainRole - 'hub' or 'spoke'
 * @returns Registry metadata with ABI and function names
 */
export function getRegistryMetadata(
  variant: RegistryVariant,
  chainRole: RegistryType
): RegistryMetadata {
  return REGISTRY_METADATA[variant][chainRole];
}
