/**
 * Contract address getters.
 *
 * Single source of truth for resolving SWR contract addresses.
 * All addresses are read from network configurations.
 * Getters throw on missing/undeployed contracts for fail-fast behavior.
 */

import type { Address, HubContracts, SpokeContracts } from '../types';
import { getNetworkOrUndefined } from '../networks';
import { isSpokeChain } from './roles';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type RegistryType = 'hub' | 'spoke';
export type RegistryVariant = 'wallet' | 'transaction' | 'contract';

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function getHubContracts(chainId: number): HubContracts {
  const network = getNetworkOrUndefined(chainId);
  if (!network || network.role !== 'hub' || !network.hubContracts) {
    throw new Error(`No hub contracts configured for chain ${chainId}`);
  }
  return network.hubContracts;
}

function getRequiredHubField(field: keyof HubContracts, chainId: number): Address {
  const contracts = getHubContracts(chainId);
  const address = contracts[field];
  if (!address) {
    throw new Error(`No ${field} address configured for hub chain ${chainId}`);
  }
  return address;
}

function getSpokeContracts(chainId: number): SpokeContracts {
  const network = getNetworkOrUndefined(chainId);
  if (!network || network.role !== 'spoke' || !network.spokeContracts) {
    throw new Error(`No spoke contracts configured for chain ${chainId}`);
  }
  return network.spokeContracts;
}

// ═══════════════════════════════════════════════════════════════════════════
// HUB CONTRACT GETTERS
// ═══════════════════════════════════════════════════════════════════════════

export function getWalletRegistryAddress(chainId: number): Address {
  return getRequiredHubField('stolenWalletRegistry', chainId);
}

export function getTransactionRegistryAddress(chainId: number): Address {
  return getRequiredHubField('stolenTransactionRegistry', chainId);
}

export function getContractRegistryAddress(chainId: number): Address {
  return getRequiredHubField('fraudulentContractRegistry', chainId);
}

export function getFraudRegistryHubAddress(chainId: number): Address {
  return getRequiredHubField('registryHub', chainId);
}

export function getOperatorSubmitterAddress(chainId: number): Address {
  return getRequiredHubField('operatorSubmitter', chainId);
}

export function getCrossChainInboxAddress(chainId: number): Address {
  return getRequiredHubField('crossChainInbox', chainId);
}

export function getOperatorRegistryAddress(chainId: number): Address {
  return getRequiredHubField('operatorRegistry', chainId);
}

export function getFeeManagerAddress(chainId: number): Address {
  return getRequiredHubField('feeManager', chainId);
}

export function getTranslationRegistryAddress(chainId: number): Address {
  return getRequiredHubField('translationRegistry', chainId);
}

export function getWalletSoulboundAddress(chainId: number): Address {
  return getRequiredHubField('walletSoulbound', chainId);
}

export function getSupportSoulboundAddress(chainId: number): Address {
  return getRequiredHubField('supportSoulbound', chainId);
}

export function getSoulboundReceiverAddress(chainId: number): Address {
  return getRequiredHubField('soulboundReceiver', chainId);
}

// ═══════════════════════════════════════════════════════════════════════════
// SPOKE CONTRACT GETTERS
// ═══════════════════════════════════════════════════════════════════════════

export function getSpokeRegistryAddress(chainId: number): Address {
  return getSpokeContracts(chainId).spokeRegistry;
}

export function getSpokeFeeManagerAddress(chainId: number): Address {
  return getSpokeContracts(chainId).feeManager;
}

export function getSpokeSoulboundForwarderAddress(chainId: number): Address | null {
  if (!isSpokeChain(chainId)) return null;
  const network = getNetworkOrUndefined(chainId);
  if (!network || network.role !== 'spoke' || !network.spokeContracts) return null;
  return network.spokeContracts.spokeSoulboundForwarder ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED REGISTRY HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the appropriate registry address for a chain.
 * - Hub chains: returns the specific registry (WalletRegistry, TransactionRegistry, etc.)
 * - Spoke chains: returns SpokeRegistry (handles all variants)
 */
export function getRegistryAddress(chainId: number, variant: RegistryVariant = 'wallet'): Address {
  if (isSpokeChain(chainId)) {
    return getSpokeRegistryAddress(chainId);
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
