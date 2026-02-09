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
    [anvilHub.chainId]: '0x396c850B9eC24a28e7556B7eb9C962F7bA836400' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address, // TBD
  },
  walletRegistry: {
    [anvilHub.chainId]: '0x80C139C37468DbffB2109cc337467c2887F7EA40' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  transactionRegistry: {
    [anvilHub.chainId]: '0xbd41310C6CFe0Aec2Ddd017681417F0614618fC3' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  contractRegistry: {
    [anvilHub.chainId]: '0xDc89d5d4Fec4159fC9EEA7d471cdafEe88cDec0D' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  operatorSubmitter: {
    [anvilHub.chainId]: '0xc94f95C6b90BE297cbC27B32439c56a42097ca22' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  crossChainInbox: {
    [anvilHub.chainId]: '0x2F3EA898e8d179dC21Bb6835428207335Cc3F72d' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  // Infrastructure
  operatorRegistry: {
    [anvilHub.chainId]: '0xB4F23F67DBbFa190415F3584A8fE8c1fF9BAeA35' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  feeManager: {
    [anvilHub.chainId]: '0xE14aa15D8d9a3f3FEb78563166E931284510d96C' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  // Soulbound contracts
  translationRegistry: {
    [anvilHub.chainId]: '0x3c010A2B6b943512e8710997EE6E07a42746062f' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  walletSoulbound: {
    [anvilHub.chainId]: '0x3A8ca11Ae18877bdAa8cF447861d98b26C50CC90' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  supportSoulbound: {
    [anvilHub.chainId]: '0xbeB9D0Be51B997FB5092E4b2D518F0A0AeeDeD04' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  soulboundReceiver: {
    [anvilHub.chainId]: '0xC0422EaC6F09C7eCa4e8076EE8329E0586F4C31C' as Address,
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
