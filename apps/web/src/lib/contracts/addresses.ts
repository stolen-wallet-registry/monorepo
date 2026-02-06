import { zeroAddress, isAddress } from 'viem';
import type { Address } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';
import { anvilHub, baseSepolia, isSpokeChain } from '@swr/chains';
import { getSpokeContractAddress } from './crosschain-addresses';

// ═══════════════════════════════════════════════════════════════════════════
// HUB + SEPARATE REGISTRIES ARCHITECTURE
// ═══════════════════════════════════════════════════════════════════════════
// Deployed via `pnpm deploy:crosschain` (script/Deploy.s.sol)
//
// Architecture:
//   FraudRegistryHub       - Entry point, cross-chain routing, fee aggregation
//   WalletRegistry         - Wallet registration (two-phase EIP-712)
//   TransactionRegistry    - Transaction batch registration
//   ContractRegistry       - Fraudulent contract registry (operator-only)
//   OperatorSubmitter      - Operator batch submissions
//   CrossChainInbox        - Cross-chain message receiver
// ═══════════════════════════════════════════════════════════════════════════

export const CONTRACT_ADDRESSES = {
  // Hub + Separate Registries (core architecture)
  fraudRegistryHub: {
    [anvilHub.chainId]: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address, // TBD
  },
  walletRegistry: {
    [anvilHub.chainId]: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  transactionRegistry: {
    [anvilHub.chainId]: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  contractRegistry: {
    [anvilHub.chainId]: '0x0165878A594ca255338adfa4d48449f69242Eb8F' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  operatorSubmitter: {
    [anvilHub.chainId]: '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  crossChainInbox: {
    [anvilHub.chainId]: '0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  // Infrastructure
  operatorRegistry: {
    [anvilHub.chainId]: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  feeManager: {
    [anvilHub.chainId]: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  // Soulbound contracts
  translationRegistry: {
    [anvilHub.chainId]: '0x3Aa5ebB10DC797CAC828524e59A333d0A371443c' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  walletSoulbound: {
    [anvilHub.chainId]: '0xc6e7DF5E7b4f2A278906862b61205850344D4e7d' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  supportSoulbound: {
    [anvilHub.chainId]: '0x59b670e9fA9D0A427751Af201D676719a970857b' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  soulboundReceiver: {
    [anvilHub.chainId]: '0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
} as const;

export type ContractName = keyof typeof CONTRACT_ADDRESSES;

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT ADDRESS GETTERS
// ═══════════════════════════════════════════════════════════════════════════

/** Get any contract address by name */
export function getContractAddress(contract: ContractName, chainId: number): Address {
  const logContext = 'getContractAddress';

  // Check for env override
  const envKey = `VITE_${contract.toUpperCase()}_ADDRESS_${chainId}`;
  const envValue = (import.meta.env as Record<string, string | undefined>)[envKey];
  if (envValue) {
    if (!isAddress(envValue)) {
      logger.contract.error(`${logContext}: Invalid address format in env override`, {
        contract,
        chainId,
        envKey,
        envValue,
      });
      throw new Error(`Invalid address format in ${envKey}: ${envValue}`);
    }
    return envValue as Address;
  }

  const addresses = CONTRACT_ADDRESSES[contract];
  const address = addresses[chainId as keyof typeof addresses];
  if (!address || address === zeroAddress) {
    throw new Error(`No ${contract} address configured for chain ID ${chainId}`);
  }
  return address;
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRY-SPECIFIC GETTERS
// ═══════════════════════════════════════════════════════════════════════════

/** Get FraudRegistryHub address (entry point for lookups and cross-chain) */
export function getFraudRegistryHubAddress(chainId: number): Address {
  return getContractAddress('fraudRegistryHub', chainId);
}

/** Get WalletRegistry address (wallet registration) */
export function getWalletRegistryAddress(chainId: number): Address {
  return getContractAddress('walletRegistry', chainId);
}

/** Get TransactionRegistry address (transaction batch registration) */
export function getTransactionRegistryAddress(chainId: number): Address {
  return getContractAddress('transactionRegistry', chainId);
}

/** Get ContractRegistry address (fraudulent contract registry) */
export function getContractRegistryAddress(chainId: number): Address {
  return getContractAddress('contractRegistry', chainId);
}

/** Get OperatorSubmitter address (operator batch submissions) */
export function getOperatorSubmitterAddress(chainId: number): Address {
  return getContractAddress('operatorSubmitter', chainId);
}

/** Get CrossChainInbox address */
export function getCrossChainInboxAddress(chainId: number): Address {
  return getContractAddress('crossChainInbox', chainId);
}

// ═══════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE GETTERS
// ═══════════════════════════════════════════════════════════════════════════

export function getOperatorRegistryAddress(chainId: number): Address {
  return getContractAddress('operatorRegistry', chainId);
}

export function getFeeManagerAddress(chainId: number): Address {
  return getContractAddress('feeManager', chainId);
}

// ═══════════════════════════════════════════════════════════════════════════
// SOULBOUND GETTERS
// ═══════════════════════════════════════════════════════════════════════════

export function getTranslationRegistryAddress(chainId: number): Address {
  return getContractAddress('translationRegistry', chainId);
}

export function getWalletSoulboundAddress(chainId: number): Address {
  return getContractAddress('walletSoulbound', chainId);
}

export function getSupportSoulboundAddress(chainId: number): Address {
  return getContractAddress('supportSoulbound', chainId);
}

export function getSoulboundReceiverAddress(chainId: number): Address {
  return getContractAddress('soulboundReceiver', chainId);
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED REGISTRY ADDRESS (Hub or Spoke depending on chain)
// ═══════════════════════════════════════════════════════════════════════════

export type RegistryType = 'hub' | 'spoke';
export type RegistryVariant = 'wallet' | 'transaction' | 'contract';

/**
 * Get the appropriate registry address for the current chain.
 * - Hub chains: returns the specific registry (WalletRegistry, TransactionRegistry, etc.)
 * - Spoke chains: returns SpokeRegistry (handles all variants)
 */
export function getRegistryAddress(chainId: number, variant: RegistryVariant = 'wallet'): Address {
  if (isSpokeChain(chainId)) {
    return getSpokeContractAddress('spokeRegistry', chainId);
  }

  switch (variant) {
    case 'wallet':
      return getWalletRegistryAddress(chainId);
    case 'transaction':
      return getTransactionRegistryAddress(chainId);
    case 'contract':
      return getContractRegistryAddress(chainId);
  }
}

/**
 * Determine which registry type to use for a chain.
 * Used for selecting correct ABI and function names.
 */
export function getRegistryType(chainId: number): RegistryType {
  return isSpokeChain(chainId) ? 'spoke' : 'hub';
}

// Re-export cross-chain helpers for convenience
export { isSpokeChain, isHubChain } from '@swr/chains';
