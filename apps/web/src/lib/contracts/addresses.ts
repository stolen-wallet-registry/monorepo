import { zeroAddress, isAddress } from 'viem';
import type { Address } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';
import { anvilHub, baseSepolia, isSpokeChain } from '@swr/chains';
import { getSpokeV2Address } from './crosschain-addresses';

// ═══════════════════════════════════════════════════════════════════════════
// V2 HUB + SEPARATE REGISTRIES ARCHITECTURE
// ═══════════════════════════════════════════════════════════════════════════
// Deployed via `pnpm deploy:crosschain:v2` (script/v2/DeployV2.s.sol)
//
// Architecture:
//   FraudRegistryHubV2     - Entry point, cross-chain routing, fee aggregation
//   WalletRegistryV2       - Wallet registration (two-phase EIP-712)
//   TransactionRegistryV2  - Transaction batch registration
//   ContractRegistryV2     - Fraudulent contract registry (operator-only)
//   OperatorSubmitterV2    - Operator batch submissions
//   CrossChainInboxV2      - Cross-chain message receiver
// ═══════════════════════════════════════════════════════════════════════════

export const V2_CONTRACT_ADDRESSES = {
  // Hub + Separate Registries (core V2 architecture)
  fraudRegistryHubV2: {
    [anvilHub.chainId]: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address, // TBD
  },
  walletRegistryV2: {
    [anvilHub.chainId]: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  transactionRegistryV2: {
    [anvilHub.chainId]: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  contractRegistryV2: {
    [anvilHub.chainId]: '0x0165878A594ca255338adfa4d48449f69242Eb8F' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  operatorSubmitterV2: {
    [anvilHub.chainId]: '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  crossChainInboxV2: {
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

export type V2ContractName = keyof typeof V2_CONTRACT_ADDRESSES;

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT ADDRESS GETTERS
// ═══════════════════════════════════════════════════════════════════════════

/** Get any V2 contract address by name */
export function getV2ContractAddress(contract: V2ContractName, chainId: number): Address {
  const logContext = 'getV2ContractAddress';

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

  const addresses = V2_CONTRACT_ADDRESSES[contract];
  const address = addresses[chainId as keyof typeof addresses];
  if (!address || address === zeroAddress) {
    throw new Error(`No ${contract} address configured for chain ID ${chainId}`);
  }
  return address;
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRY-SPECIFIC GETTERS
// ═══════════════════════════════════════════════════════════════════════════

/** Get FraudRegistryHubV2 address (entry point for lookups and cross-chain) */
export function getFraudRegistryHubV2Address(chainId: number): Address {
  return getV2ContractAddress('fraudRegistryHubV2', chainId);
}

/** Get WalletRegistryV2 address (wallet registration) */
export function getWalletRegistryV2Address(chainId: number): Address {
  return getV2ContractAddress('walletRegistryV2', chainId);
}

/** Get TransactionRegistryV2 address (transaction batch registration) */
export function getTransactionRegistryV2Address(chainId: number): Address {
  return getV2ContractAddress('transactionRegistryV2', chainId);
}

/** Get ContractRegistryV2 address (fraudulent contract registry) */
export function getContractRegistryV2Address(chainId: number): Address {
  return getV2ContractAddress('contractRegistryV2', chainId);
}

/** Get OperatorSubmitterV2 address (operator batch submissions) */
export function getOperatorSubmitterV2Address(chainId: number): Address {
  return getV2ContractAddress('operatorSubmitterV2', chainId);
}

/** Get CrossChainInboxV2 address */
export function getCrossChainInboxV2Address(chainId: number): Address {
  return getV2ContractAddress('crossChainInboxV2', chainId);
}

// ═══════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE GETTERS
// ═══════════════════════════════════════════════════════════════════════════

export function getOperatorRegistryAddress(chainId: number): Address {
  return getV2ContractAddress('operatorRegistry', chainId);
}

export function getFeeManagerAddress(chainId: number): Address {
  return getV2ContractAddress('feeManager', chainId);
}

// ═══════════════════════════════════════════════════════════════════════════
// SOULBOUND GETTERS
// ═══════════════════════════════════════════════════════════════════════════

export function getTranslationRegistryAddress(chainId: number): Address {
  return getV2ContractAddress('translationRegistry', chainId);
}

export function getWalletSoulboundAddress(chainId: number): Address {
  return getV2ContractAddress('walletSoulbound', chainId);
}

export function getSupportSoulboundAddress(chainId: number): Address {
  return getV2ContractAddress('supportSoulbound', chainId);
}

export function getSoulboundReceiverAddress(chainId: number): Address {
  return getV2ContractAddress('soulboundReceiver', chainId);
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED REGISTRY ADDRESS (Hub or Spoke depending on chain)
// ═══════════════════════════════════════════════════════════════════════════

export type RegistryType = 'hub' | 'spoke';
export type RegistryVariant = 'wallet' | 'transaction' | 'contract';

/**
 * Get the appropriate registry address for the current chain.
 * - Hub chains: returns the specific registry (WalletRegistryV2, TransactionRegistryV2, etc.)
 * - Spoke chains: returns SpokeRegistryV2 (handles all variants)
 */
export function getRegistryAddress(chainId: number, variant: RegistryVariant = 'wallet'): Address {
  if (isSpokeChain(chainId)) {
    return getSpokeV2Address('spokeRegistryV2', chainId);
  }

  switch (variant) {
    case 'wallet':
      return getWalletRegistryV2Address(chainId);
    case 'transaction':
      return getTransactionRegistryV2Address(chainId);
    case 'contract':
      return getContractRegistryV2Address(chainId);
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
