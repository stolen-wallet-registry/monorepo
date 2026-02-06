/**
 * Registry metadata for ABI and function name lookups.
 *
 * Consolidates the ABI selection and function name mapping logic that was
 * previously duplicated across 15+ hooks. Use this instead of inline ternaries.
 *
 * V2 Architecture: Hub + Separate Registries
 * - WalletRegistryV2: Wallet-specific registration
 * - TransactionRegistryV2: Transaction batch registration
 * - ContractRegistryV2: Contract address registration (operator-only)
 * - SpokeRegistryV2: Cross-chain spoke contracts (all variants)
 *
 * @example
 * ```ts
 * // Before (duplicated in each hook)
 * const abi = registryType === 'spoke' ? spokeRegistryV2Abi : walletRegistryV2Abi;
 * const functionName = registryType === 'spoke' ? 'acknowledgeLocal' : 'acknowledge';
 *
 * // After (using metadata)
 * const { abi, functions } = getRegistryMetadata('wallet', registryType);
 * const functionName = functions.acknowledge;
 * ```
 */

import {
  walletRegistryV2Abi,
  transactionRegistryV2Abi,
  contractRegistryV2Abi,
  spokeRegistryV2Abi,
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
    | typeof walletRegistryV2Abi
    | typeof transactionRegistryV2Abi
    | typeof contractRegistryV2Abi
    | typeof spokeRegistryV2Abi;
  /** Function name mappings */
  functions: RegistryFunctions;
}

// ═══════════════════════════════════════════════════════════════════════════
// V2 REGISTRY METADATA (HUB + SEPARATE REGISTRIES)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * V2 Registry metadata organized by variant (wallet/transaction/contract) and chain role (hub/spoke).
 *
 * V2 changes:
 * - Hub: Separate registries for wallet, transaction, and contract
 * - Wallet registration: WalletRegistryV2 with `acknowledge` / `register`
 * - Transaction registration: TransactionRegistryV2 with `acknowledgeTransactions` / `registerTransactions`
 * - Contract registration: ContractRegistryV2 with operator-only `registerContracts`
 * - Spoke: SpokeRegistryV2 handles all variants with cross-chain messaging
 */
const V2_REGISTRY_METADATA: Record<RegistryVariant, Record<RegistryType, RegistryMetadata>> = {
  wallet: {
    hub: {
      abi: walletRegistryV2Abi,
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
    hub: {
      abi: transactionRegistryV2Abi,
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
      abi: spokeRegistryV2Abi,
      functions: {
        acknowledge: 'acknowledgeTransactions',
        register: 'registerTransactions',
        generateHashStruct: 'generateHashStruct',
        getDeadlines: 'getDeadlines',
        nonces: 'nonces',
        quoteRegistration: 'quoteRegistration',
        quoteFeeBreakdown: 'quoteFeeBreakdown',
        isPending: 'isPending',
        // Spoke has no local registration state — it only forwards to hub.
        // We map to isPending so callers get a "not yet registered" signal.
        isRegistered: 'isPending',
        getAcknowledgement: 'getAcknowledgement',
        // Spoke never stores final registration; return acknowledgement as best-effort data.
        getRegistration: 'getAcknowledgement',
      },
    },
  },
  contract: {
    // Contract registry is operator-only, single-phase (no acknowledgement/grace period).
    // Placeholder mappings exist so callers using the generic RegistryFunctions interface
    // don't need special-case logic — they'll hit the contract and get a revert or no-op
    // rather than a missing function name at compile time.
    hub: {
      abi: contractRegistryV2Abi,
      functions: {
        acknowledge: 'registerContracts', // No acknowledgement phase — maps to register
        register: 'registerContracts',
        generateHashStruct: 'generateHashStruct', // Not used — placeholder for interface
        getDeadlines: 'getDeadlines', // Not used — placeholder for interface
        nonces: 'nonces', // Not used — placeholder for interface
        quoteRegistration: 'quoteRegistration',
        quoteFeeBreakdown: 'quoteRegistration', // ContractRegistryV2 has no separate breakdown
        isPending: 'isContractRegistered', // No pending state — always returns registered or not
        isRegistered: 'isContractRegistered',
        getAcknowledgement: 'getContractEntry',
        getRegistration: 'getContractEntry',
      },
    },
    spoke: {
      // Contract registration is NOT supported on spoke chains — SpokeRegistryV2
      // has no contract-specific functions. These mappings use generic spoke functions
      // as best-effort fallbacks. Callers should not invoke contract registration on spoke.
      abi: spokeRegistryV2Abi,
      functions: {
        acknowledge: 'acknowledgeLocal', // Fallback — no contract ack on spoke
        register: 'registerLocal', // Fallback — no contract reg on spoke
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
 * Get V2 registry metadata for a specific variant and chain role.
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
  return V2_REGISTRY_METADATA[variant][chainRole];
}
