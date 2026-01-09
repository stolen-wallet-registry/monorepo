import type { Address } from '@/lib/types/ethereum';
import { anvilHub } from '@/lib/wagmi';
import { sepolia } from 'wagmi/chains';
import { isSpokeChain, getSpokeAddress } from './crosschain-addresses';

// ═══════════════════════════════════════════════════════════════════════════
// DETERMINISTIC ADDRESSES
// ═══════════════════════════════════════════════════════════════════════════
// Anvil default deployer (0xf39F...2266) produces deterministic addresses.
// Both Deploy.s.sol and DeployCrossChain.s.sol deploy core contracts in the
// SAME ORDER so addresses are identical:
//
//   0: MockAggregator    → 0x5FbDB2315678afecb367f032d93F642f64180aa3
//   1: FeeManager        → 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
//   2: RegistryHub       → 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
//   3: StolenWalletReg   → 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
//   4: (setRegistry tx)
//
// Cross-chain deploy adds after core:
//   5: MockMailbox       → 0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6
//   6: CrossChainInbox   → 0x8A791620dd6260079BF849Dc5567aDC3F2FdC318
// ═══════════════════════════════════════════════════════════════════════════

export const CONTRACT_ADDRESSES = {
  stolenWalletRegistry: {
    [anvilHub.id]: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9' as Address,
    [sepolia.id]: '0x0000000000000000000000000000000000000000' as Address,
  },
  feeManager: {
    [anvilHub.id]: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' as Address,
    [sepolia.id]: '0x0000000000000000000000000000000000000000' as Address,
  },
  registryHub: {
    [anvilHub.id]: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0' as Address,
    [sepolia.id]: '0x0000000000000000000000000000000000000000' as Address,
  },
} as const;

export type ContractName = keyof typeof CONTRACT_ADDRESSES;

// Get contract address for a chain, with env override support
export function getContractAddress(contract: ContractName, chainId: number): Address {
  // Check for env override first (registry only for backward compat)
  if (contract === 'stolenWalletRegistry') {
    if (chainId === anvilHub.id && import.meta.env.VITE_CONTRACT_ADDRESS_LOCALHOST) {
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
