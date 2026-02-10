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
    [anvilHub.chainId]: '0xf6FcdE2a63E1B9208eB5947a9Ab1dcb6E9e174d5' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address, // TBD
  },
  walletRegistry: {
    [anvilHub.chainId]: '0x62C4B01F3a7f0c239fcE6FE7d63e1c39526820A5' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  transactionRegistry: {
    [anvilHub.chainId]: '0x1D1C79d846B6411a6fb37a4D709C481a3390eAa7' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  contractRegistry: {
    [anvilHub.chainId]: '0x93264320fa69Bacc011ce517C31719D0bB94C18c' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  operatorSubmitter: {
    [anvilHub.chainId]: '0x4e86dDDd8b9ebbbec3b7ebD85012E9e94c632EB4' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  crossChainInbox: {
    [anvilHub.chainId]: '0x44F3A2cDa6251B4189d516D6876F4cDdBec1299a' as Address,
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
    [anvilHub.chainId]: '0x237284b2A866bf4dcFC53D28B170dfb302f0E039' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  walletSoulbound: {
    [anvilHub.chainId]: '0x71eC4505C934ea79B48e96d9e4973aAe0BF63831' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  supportSoulbound: {
    [anvilHub.chainId]: '0x68235223A3CeDBEE832A0147d7bE94673b61689F' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  soulboundReceiver: {
    [anvilHub.chainId]: '0xa55c9cB501a4F8c4aD8AAd2Ca7C9bFa47e17dFEb' as Address,
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
