import { zeroAddress } from 'viem';
import type { Address } from '@/lib/types/ethereum';
import { anvilHub, baseSepolia, isSpokeChain } from '@swr/chains';
import { getSpokeAddress } from './crosschain-addresses';

// ═══════════════════════════════════════════════════════════════════════════
// DETERMINISTIC ADDRESSES
// ═══════════════════════════════════════════════════════════════════════════
// Anvil default deployer (0xf39F...2266) produces deterministic addresses.
// Both Deploy.s.sol and DeployCrossChain.s.sol deploy core contracts in the
// SAME ORDER so addresses are identical:
//
//   0: MockAggregator         → 0x5FbDB2315678afecb367f032d93F642f64180aa3
//   1: FeeManager             → 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
//   2: RegistryHub            → 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
//   3: StolenWalletReg        → 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
//   4: StolenTransactionReg   → 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
//   5-6: (setRegistry txs)
//
// Cross-chain deploy adds after core:
//   7: CrossChainInbox   → 0x5FC8d32690cc91D4c39d9d3abcBD16989F875707
// ═══════════════════════════════════════════════════════════════════════════

export const CONTRACT_ADDRESSES = {
  stolenWalletRegistry: {
    [anvilHub.chainId]: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9' as Address,
    // Base Sepolia (testnet hub) - fill after deployment
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  stolenTransactionRegistry: {
    [anvilHub.chainId]: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9' as Address,
    // Base Sepolia (testnet hub) - fill after deployment
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  feeManager: {
    [anvilHub.chainId]: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' as Address,
    // Base Sepolia (testnet hub) - fill after deployment
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  registryHub: {
    [anvilHub.chainId]: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0' as Address,
    // Base Sepolia (testnet hub) - fill after deployment
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  // Soulbound contracts - deployed via DeployCrossChain.s.sol (hub chain only)
  // Languages seeded separately via SeedLanguages.s.sol (keeps addresses deterministic)
  translationRegistry: {
    [anvilHub.chainId]: '0x610178dA211FEF7D417bC0e6FeD39F05609AD788' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  walletSoulbound: {
    [anvilHub.chainId]: '0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  supportSoulbound: {
    [anvilHub.chainId]: '0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
} as const;

export type ContractName = keyof typeof CONTRACT_ADDRESSES;

// Get contract address for a chain, with env override support
export function getContractAddress(contract: ContractName, chainId: number): Address {
  // Check for env override first (registry only for backward compat)
  if (contract === 'stolenWalletRegistry') {
    if (chainId === anvilHub.chainId && import.meta.env.VITE_CONTRACT_ADDRESS_LOCALHOST) {
      return import.meta.env.VITE_CONTRACT_ADDRESS_LOCALHOST as Address;
    }
  }

  // Check for contract-specific env overrides
  const envKey = `VITE_${contract.toUpperCase()}_ADDRESS_${chainId}`;
  const envValue = (import.meta.env as Record<string, string | undefined>)[envKey];
  if (envValue) {
    return envValue as Address;
  }

  const addresses = CONTRACT_ADDRESSES[contract];
  const address = addresses[chainId as keyof typeof addresses];
  if (!address || address === zeroAddress) {
    throw new Error(`No ${contract} address configured for chain ID ${chainId}`);
  }
  return address;
}

// Backward compatibility: get StolenWalletRegistry address
export function getStolenWalletRegistryAddress(chainId: number): Address {
  return getContractAddress('stolenWalletRegistry', chainId);
}

// Convenience getters for other contracts
export function getFeeManagerAddress(chainId: number): Address {
  return getContractAddress('feeManager', chainId);
}

export function getRegistryHubAddress(chainId: number): Address {
  return getContractAddress('registryHub', chainId);
}

export function getStolenTransactionRegistryAddress(chainId: number): Address {
  return getContractAddress('stolenTransactionRegistry', chainId);
}

// Soulbound contract getters
export function getTranslationRegistryAddress(chainId: number): Address {
  return getContractAddress('translationRegistry', chainId);
}

export function getWalletSoulboundAddress(chainId: number): Address {
  return getContractAddress('walletSoulbound', chainId);
}

export function getSupportSoulboundAddress(chainId: number): Address {
  return getContractAddress('supportSoulbound', chainId);
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED REGISTRY ADDRESS (Hub or Spoke depending on chain)
// ═══════════════════════════════════════════════════════════════════════════

export type RegistryType = 'hub' | 'spoke';

/**
 * Get the appropriate registry address for the current chain.
 * - Hub chains: returns StolenWalletRegistry address
 * - Spoke chains: returns SpokeRegistry address
 */
export function getRegistryAddress(chainId: number): Address {
  if (isSpokeChain(chainId)) {
    return getSpokeAddress('spokeRegistry', chainId);
  }
  return getStolenWalletRegistryAddress(chainId);
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
