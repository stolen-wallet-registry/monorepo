/**
 * Registry metadata for ABI and function name lookups.
 *
 * Consolidates the ABI selection and function name mapping logic that was
 * previously duplicated across 15+ hooks. Use this instead of inline ternaries.
 *
 * @example
 * ```ts
 * // Before (duplicated in each hook)
 * const abi = registryType === 'spoke' ? spokeRegistryV2Abi : fraudRegistryV2Abi;
 * const functionName = registryType === 'spoke' ? 'acknowledgeLocal' : 'acknowledge';
 *
 * // After (using metadata)
 * const { abi, functions } = getRegistryMetadata('wallet', registryType);
 * const functionName = functions.acknowledge;
 * ```
 */

import {
  // V2 ABIs (primary)
  fraudRegistryV2Abi,
  spokeRegistryV2Abi,
  // V1 ABIs (deprecated - kept for reference)
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
    | typeof fraudRegistryV2Abi
    | typeof spokeRegistryV2Abi
    | typeof stolenWalletRegistryAbi
    | typeof spokeRegistryAbi
    | typeof stolenTransactionRegistryAbi
    | typeof spokeTransactionRegistryAbi;
  /** Function name mappings */
  functions: RegistryFunctions;
}

// ═══════════════════════════════════════════════════════════════════════════
// V2 REGISTRY METADATA (PRIMARY)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * V2 Registry metadata organized by variant (wallet/transaction) and chain role (hub/spoke).
 *
 * V2 changes:
 * - Hub: FraudRegistryV2 handles both wallet and transaction registries
 * - Wallet registration: `acknowledge` / `register` (no longer `acknowledge`/`register` with different ABI)
 * - Transaction registration: `acknowledgeTransactionBatch` / `registerTransactionBatch`
 * - New query functions: `getEvmWalletDetails`, `getTransactionEntry`
 */
const V2_REGISTRY_METADATA: Record<RegistryVariant, Record<RegistryType, RegistryMetadata>> = {
  wallet: {
    hub: {
      abi: fraudRegistryV2Abi,
      functions: {
        acknowledge: 'acknowledge',
        register: 'register',
        generateHashStruct: 'generateHashStruct',
        getDeadlines: 'getDeadlines',
        nonces: 'nonces',
        quoteRegistration: 'quoteRegistration',
        quoteFeeBreakdown: 'quoteRegistration', // Hub doesn't have breakdown
        isPending: 'isPending',
        isRegistered: 'isRegistered',
        getAcknowledgement: 'getAcknowledgement',
        getRegistration: 'getEvmWalletDetails', // V2 uses getEvmWalletDetails
      },
    },
    spoke: {
      abi: spokeRegistryV2Abi,
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
    // V2: Transaction registry is part of FraudRegistryV2 (same contract as wallet)
    hub: {
      abi: fraudRegistryV2Abi,
      functions: {
        acknowledge: 'acknowledgeTransactionBatch', // V2 name
        register: 'registerTransactionBatch', // V2 name
        generateHashStruct: 'generateTxHashStruct', // V2 name
        getDeadlines: 'getTxDeadlines', // V2 name
        nonces: 'txNonces', // V2: separate nonce for tx
        quoteRegistration: 'quoteTxRegistration',
        quoteFeeBreakdown: 'quoteTxRegistration',
        isPending: 'isTxBatchPending',
        isRegistered: 'isTransactionRegistered',
        getAcknowledgement: 'getTxAcknowledgement',
        getRegistration: 'getTransactionEntry',
      },
    },
    spoke: {
      abi: spokeRegistryV2Abi,
      functions: {
        acknowledge: 'acknowledgeTransactionBatch',
        register: 'registerTransactionBatch',
        generateHashStruct: 'generateTxHashStruct',
        getDeadlines: 'getTxDeadlines',
        nonces: 'txNonces',
        quoteRegistration: 'quoteRegistration',
        quoteFeeBreakdown: 'quoteFeeBreakdown',
        isPending: 'isTxBatchPending',
        isRegistered: 'isBatchRegistered',
        getAcknowledgement: 'getTxAcknowledgement',
        getRegistration: 'getBatch',
      },
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// V1 REGISTRY METADATA (DEPRECATED - kept for reference)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @deprecated Use V2_REGISTRY_METADATA for new integrations
 */
const V1_REGISTRY_METADATA: Record<RegistryVariant, Record<RegistryType, RegistryMetadata>> = {
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
        quoteFeeBreakdown: 'quoteRegistration',
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
        quoteFeeBreakdown: 'quoteRegistration',
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
 * Get V2 registry metadata for a specific variant and chain role.
 * This is the primary function to use for new integrations.
 *
 * @param variant - 'wallet' or 'transaction'
 * @param chainRole - 'hub' or 'spoke'
 * @returns Registry metadata with ABI and function names
 */
export function getRegistryMetadata(
  variant: RegistryVariant,
  chainRole: RegistryType
): RegistryMetadata {
  return V2_REGISTRY_METADATA[variant][chainRole];
}

/**
 * @deprecated Use getRegistryMetadata for V2 contracts
 * Get V1 registry metadata (kept for migration period).
 */
export function getV1RegistryMetadata(
  variant: RegistryVariant,
  chainRole: RegistryType
): RegistryMetadata {
  return V1_REGISTRY_METADATA[variant][chainRole];
}
