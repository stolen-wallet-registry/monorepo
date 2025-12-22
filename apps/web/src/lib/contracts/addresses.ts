import type { Address } from '@/lib/types/ethereum';
import { localhost, anvilHub } from '@/lib/wagmi';
import { sepolia } from 'wagmi/chains';
import { isSpokeChain, getSpokeAddress } from './crosschain-addresses';

// Contract addresses by contract name and chain ID
// After running deploy script, update these addresses accordingly
export const CONTRACT_ADDRESSES = {
  stolenWalletRegistry: {
    [localhost.id]: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9' as Address, // Fourth deployed
    [anvilHub.id]: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9' as Address, // Same as localhost for hub
    [sepolia.id]: '0x0000000000000000000000000000000000000000' as Address,
  },
  feeManager: {
    [localhost.id]: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' as Address, // Second deployed
    [anvilHub.id]: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' as Address,
    [sepolia.id]: '0x0000000000000000000000000000000000000000' as Address,
  },
  registryHub: {
    [localhost.id]: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0' as Address, // Third deployed
    [anvilHub.id]: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0' as Address,
    [sepolia.id]: '0x0000000000000000000000000000000000000000' as Address,
  },
} as const;

export type ContractName = keyof typeof CONTRACT_ADDRESSES;

// Get contract address for a chain, with env override support
export function getContractAddress(contract: ContractName, chainId: number): Address {
  // Check for env override first (registry only for backward compat)
  if (contract === 'stolenWalletRegistry') {
    if (chainId === localhost.id && import.meta.env.VITE_CONTRACT_ADDRESS_LOCALHOST) {
      return import.meta.env.VITE_CONTRACT_ADDRESS_LOCALHOST as Address;
    }
    if (chainId === sepolia.id && import.meta.env.VITE_CONTRACT_ADDRESS_SEPOLIA) {
      return import.meta.env.VITE_CONTRACT_ADDRESS_SEPOLIA as Address;
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
  if (!address || address === '0x0000000000000000000000000000000000000000') {
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
export { isSpokeChain, isHubChain } from './crosschain-addresses';
