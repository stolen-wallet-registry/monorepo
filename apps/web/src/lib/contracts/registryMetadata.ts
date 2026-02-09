/**
 * Registry metadata for ABI and function name lookups.
 *
 * Consolidates the ABI selection and function name mapping logic that was
 * previously duplicated across 15+ hooks. Use this instead of inline ternaries.
 *
 * Architecture: Hub + Separate Registries
 * - WalletRegistry: Wallet-specific registration
 * - TransactionRegistry: Transaction batch registration
 * - ContractRegistry: Contract address registration (operator-only)
 * - SpokeRegistry: Cross-chain spoke contracts (all variants)
 *
 * @example
 * ```ts
 * // Before (duplicated in each hook)
 * const abi = registryType === 'spoke' ? spokeRegistryAbi : transactionRegistryAbi;
 * const functionName = registryType === 'spoke' ? 'acknowledgeTransactionBatch' : 'acknowledgeTransactions';
 *
 * // After (using metadata)
 * const { abi, functions } = getRegistryMetadata('transaction', registryType);
 * const functionName = functions.acknowledge;
 * ```
 */

import {
  walletRegistryAbi,
  transactionRegistryAbi,
  contractRegistryAbi,
  spokeRegistryAbi,
} from './abis';
import type { RegistryType, RegistryVariant } from './addresses';

export type { RegistryVariant } from './addresses';

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
  /** Quote total registration fee — unified across hub and spoke */
  quoteRegistration: string;
  /** Quote fee breakdown (bridgeFee, registrationFee, total, bridgeName) — unified across hub and spoke */
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
    | typeof walletRegistryAbi
    | typeof transactionRegistryAbi
    | typeof contractRegistryAbi
    | typeof spokeRegistryAbi;
  /** Function name mappings */
  functions: RegistryFunctions;
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRY METADATA (HUB + SEPARATE REGISTRIES)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Registry metadata organized by variant (wallet/transaction/contract) and chain role (hub/spoke).
 *
 * Architecture:
 * - Hub: Separate registries for wallet, transaction, and contract
 * - Wallet registration: WalletRegistry with `acknowledge` / `register`
 * - Transaction registration: TransactionRegistry with `acknowledgeTransactions` / `registerTransactions`
 * - Contract registration: ContractRegistry with operator-only `registerContracts`
 * - Spoke: SpokeRegistry handles all variants with cross-chain messaging
 */
const REGISTRY_METADATA: Record<RegistryVariant, Record<RegistryType, RegistryMetadata>> = {
  wallet: {
    hub: {
      abi: walletRegistryAbi,
      functions: {
        acknowledge: 'acknowledge',
        register: 'register',
        generateHashStruct: 'generateHashStruct',
        getDeadlines: 'getDeadlines',
        nonces: 'nonces',
        quoteRegistration: 'quoteRegistration',
        quoteFeeBreakdown: 'quoteFeeBreakdown',
        isPending: 'isWalletPending',
        isRegistered: 'isWalletRegistered',
        getAcknowledgement: 'getAcknowledgementData',
        getRegistration: 'getWalletEntry',
      },
    },
    spoke: {
      abi: spokeRegistryAbi,
      functions: {
        acknowledge: 'acknowledge',
        register: 'register',
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
      abi: transactionRegistryAbi,
      functions: {
        acknowledge: 'acknowledgeTransactions',
        register: 'registerTransactions',
        generateHashStruct: 'generateTransactionHashStruct',
        getDeadlines: 'getTransactionDeadlines',
        nonces: 'transactionNonces',
        quoteRegistration: 'quoteRegistration',
        quoteFeeBreakdown: 'quoteFeeBreakdown',
        isPending: 'isPending',
        isRegistered: 'isTransactionRegistered',
        getAcknowledgement: 'getTransactionAcknowledgementData',
        getRegistration: 'getTransactionEntry',
      },
    },
    spoke: {
      abi: spokeRegistryAbi,
      functions: {
        acknowledge: 'acknowledgeTransactionBatch',
        register: 'registerTransactionBatch',
        generateHashStruct: 'generateTransactionHashStruct',
        getDeadlines: 'getDeadlines',
        nonces: 'nonces',
        quoteRegistration: 'quoteRegistration',
        quoteFeeBreakdown: 'quoteFeeBreakdown',
        isPending: 'isPendingTransactionBatch',
        // Spoke has no local registration state — it only forwards to hub.
        // We map to isPendingTransactionBatch so callers get a "not yet registered" signal.
        isRegistered: 'isPendingTransactionBatch',
        getAcknowledgement: 'getTransactionAcknowledgement',
        // Spoke never stores final registration; return acknowledgement as best-effort data.
        getRegistration: 'getTransactionAcknowledgement',
      },
    },
  },
  contract: {
    // Contract registry is operator-only, single-phase (no acknowledgement/grace period).
    // Placeholder mappings exist so callers using the generic RegistryFunctions interface
    // don't need special-case logic — they'll hit the contract and get a revert or no-op
    // rather than a missing function name at compile time.
    hub: {
      abi: contractRegistryAbi,
      functions: {
        acknowledge: 'registerContracts', // No acknowledgement phase — maps to register
        register: 'registerContracts',
        generateHashStruct: 'generateHashStruct', // Not used — placeholder for interface
        getDeadlines: 'getDeadlines', // Not used — placeholder for interface
        nonces: 'nonces', // Not used — placeholder for interface
        quoteRegistration: 'quoteRegistration',
        quoteFeeBreakdown: 'quoteRegistration', // ContractRegistry has no separate breakdown
        isPending: 'isContractRegistered', // No pending state — always returns registered or not
        isRegistered: 'isContractRegistered',
        getAcknowledgement: 'getContractEntry',
        getRegistration: 'getContractEntry',
      },
    },
    spoke: {
      // Contract registration is NOT supported on spoke chains — SpokeRegistry
      // has no contract-specific functions. These mappings use generic spoke functions
      // as best-effort fallbacks. Callers should not invoke contract registration on spoke.
      abi: spokeRegistryAbi,
      functions: {
        acknowledge: 'acknowledge', // Fallback — no contract ack on spoke
        register: 'register', // Fallback — no contract reg on spoke
        generateHashStruct: 'generateHashStruct',
        getDeadlines: 'getDeadlines',
        nonces: 'nonces',
        quoteRegistration: 'quoteRegistration',
        quoteFeeBreakdown: 'quoteFeeBreakdown',
        isPending: 'isPending', // Generic spoke pending check
        isRegistered: 'isPending', // Spoke has no registration state
        getAcknowledgement: 'getAcknowledgement',
        getRegistration: 'getAcknowledgement', // Spoke has no registration data
      },
    },
  },
};

/**
 * Get registry metadata for a specific variant and chain role.
 * This is the primary function to use for all integrations.
 *
 * @param variant - 'wallet', 'transaction', or 'contract'
 * @param chainRole - 'hub' or 'spoke'
 * @returns Registry metadata with ABI and function names
 */
export function getRegistryMetadata(
  variant: RegistryVariant,
  chainRole: RegistryType
): RegistryMetadata {
  return REGISTRY_METADATA[variant][chainRole];
}
