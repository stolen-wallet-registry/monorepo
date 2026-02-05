import { zeroAddress, isAddress } from 'viem';
import type { Address } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';
import {
  anvilHub,
  baseSepolia,
  isSpokeChain,
  getNetwork,
  type HubNetworkConfig,
} from '@swr/chains';
import { getSpokeV2Address } from './crosschain-addresses';

// ═══════════════════════════════════════════════════════════════════════════
// DETERMINISTIC ADDRESSES (V2 - DeployCrossChainV2.s.sol)
// ═══════════════════════════════════════════════════════════════════════════
// Anvil default deployer (0xf39F...2266) produces deterministic addresses based
// on `keccak256(rlp([deployer_address, nonce]))`. Addresses are stable given:
// - Fresh Anvil restart (nonce 0)
// - Same deployment script execution order
//
// V2 Contract addresses from `pnpm deploy:crosschain:v2`:
//   FraudRegistryV2             → 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
//   TranslationRegistry         → 0x8A791620dd6260079BF849Dc5567aDC3F2FdC318
//   WalletSoulbound             → 0x610178dA211FEF7D417bC0e6FeD39F05609AD788
//   SupportSoulbound            → 0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e
//   SoulboundReceiver           → 0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// V2 CONTRACT ADDRESSES (PRIMARY - FraudRegistryV2)
// ═══════════════════════════════════════════════════════════════════════════
// From `pnpm deploy:crosschain:v2` output
export const V2_CONTRACT_ADDRESSES = {
  fraudRegistryV2: {
    [anvilHub.chainId]: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address, // TBD
  },
  operatorRegistry: {
    [anvilHub.chainId]: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  operatorSubmitter: {
    [anvilHub.chainId]: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  crossChainInboxV2: {
    [anvilHub.chainId]: '0x0165878A594ca255338adfa4d48449f69242Eb8F' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  walletSoulbound: {
    [anvilHub.chainId]: '0x610178dA211FEF7D417bC0e6FeD39F05609AD788' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  supportSoulbound: {
    [anvilHub.chainId]: '0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  translationRegistry: {
    [anvilHub.chainId]: '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  soulboundReceiver: {
    [anvilHub.chainId]: '0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
} as const;

export type V2ContractName = keyof typeof V2_CONTRACT_ADDRESSES;

/** Get V2 contract address */
export function getV2ContractAddress(contract: V2ContractName, chainId: number): Address {
  const addresses = V2_CONTRACT_ADDRESSES[contract];
  const address = addresses[chainId as keyof typeof addresses];
  if (!address || address === zeroAddress) {
    throw new Error(`No ${contract} address configured for chain ID ${chainId}`);
  }
  return address;
}

/** Get FraudRegistryV2 address (main V2 registry) */
export function getFraudRegistryV2Address(chainId: number): Address {
  return getV2ContractAddress('fraudRegistryV2', chainId);
}

/** Get OperatorSubmitter address (V2 operator batch submissions) */
export function getOperatorSubmitterAddress(chainId: number): Address {
  return getV2ContractAddress('operatorSubmitter', chainId);
}

/** Get CrossChainInboxV2 address */
export function getCrossChainInboxV2Address(chainId: number): Address {
  return getV2ContractAddress('crossChainInboxV2', chainId);
}

// ═══════════════════════════════════════════════════════════════════════════
// V1 CONTRACT ADDRESSES (DEPRECATED - kept for transition)
// ═══════════════════════════════════════════════════════════════════════════

export const CONTRACT_ADDRESSES = {
  /** @deprecated Use fraudRegistryV2 for new integrations */
  stolenWalletRegistry: {
    [anvilHub.chainId]: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9' as Address,
    // Base Sepolia (testnet hub) - fill after deployment
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  /** @deprecated Use fraudRegistryV2 for new integrations */
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
    [anvilHub.chainId]: '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  walletSoulbound: {
    [anvilHub.chainId]: '0x610178dA211FEF7D417bC0e6FeD39F05609AD788' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  supportSoulbound: {
    [anvilHub.chainId]: '0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  // Operator Registry - manages DAO-approved operators for batch submissions
  operatorRegistry: {
    [anvilHub.chainId]: '0x0B306BF915C4d645ff596e518fAf3F9669b97016' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  // Fraudulent Contract Registry - operator-only registry for malicious contracts
  fraudulentContractRegistry: {
    [anvilHub.chainId]: '0x3Aa5ebB10DC797CAC828524e59A333d0A371443c' as Address,
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
} as const;

export type ContractName = keyof typeof CONTRACT_ADDRESSES;

// Get contract address for a chain, with env override support
export function getContractAddress(contract: ContractName, chainId: number): Address {
  const logContext = 'getContractAddress';

  // Check for env override first (registry only for backward compat)
  if (contract === 'stolenWalletRegistry') {
    const envOverride = import.meta.env.VITE_CONTRACT_ADDRESS_LOCALHOST;
    if (chainId === anvilHub.chainId && envOverride) {
      if (!isAddress(envOverride)) {
        logger.contract.error(
          `${logContext}: Invalid address format in VITE_CONTRACT_ADDRESS_LOCALHOST`,
          {
            contract,
            chainId,
            envValue: envOverride,
          }
        );
        throw new Error(
          `Invalid address format in VITE_CONTRACT_ADDRESS_LOCALHOST: ${envOverride}`
        );
      }
      return envOverride as Address;
    }
  }

  // Check for contract-specific env overrides
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

/**
 * Get OperatorRegistry address from @swr/chains (single source of truth).
 * Falls back to CONTRACT_ADDRESSES if not found in @swr/chains.
 */
export function getOperatorRegistryAddress(chainId: number): Address {
  const logContext = 'getOperatorRegistryAddress';

  // Try @swr/chains first (single source of truth)
  try {
    const network = getNetwork(chainId);
    if (network?.role === 'hub') {
      const hubNetwork = network as HubNetworkConfig;
      const operatorRegistryAddr = hubNetwork.hubContracts?.operatorRegistry;
      if (operatorRegistryAddr) {
        // Validate the address from @swr/chains
        if (!isAddress(operatorRegistryAddr) || operatorRegistryAddr === zeroAddress) {
          logger.contract.error(
            `${logContext}: Invalid operatorRegistry address from @swr/chains`,
            {
              chainId,
              value: operatorRegistryAddr,
            }
          );
          // Fall through to CONTRACT_ADDRESSES
        } else {
          return operatorRegistryAddr as Address;
        }
      }
    }
  } catch {
    // Network not found in @swr/chains, fall through to CONTRACT_ADDRESSES
  }

  // Fallback to hardcoded addresses for backward compatibility
  return getContractAddress('operatorRegistry', chainId);
}

export function getFraudulentContractRegistryAddress(chainId: number): Address {
  return getContractAddress('fraudulentContractRegistry', chainId);
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED REGISTRY ADDRESS (Hub or Spoke depending on chain)
// ═══════════════════════════════════════════════════════════════════════════

export type RegistryType = 'hub' | 'spoke';

/**
 * Get the appropriate registry address for the current chain (V2).
 * - Hub chains: returns FraudRegistryV2 address
 * - Spoke chains: returns SpokeRegistryV2 address
 */
export function getRegistryAddress(chainId: number): Address {
  if (isSpokeChain(chainId)) {
    return getSpokeV2Address('spokeRegistryV2', chainId);
  }
  return getFraudRegistryV2Address(chainId);
}

/**
 * Determine which registry type to use for a chain.
 * Used for selecting correct ABI and function names.
 */
export function getRegistryType(chainId: number): RegistryType {
  return isSpokeChain(chainId) ? 'spoke' : 'hub';
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED TRANSACTION REGISTRY ADDRESS (Hub or Spoke depending on chain)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the appropriate transaction registry address for the current chain (V2).
 * V2 unifies wallet and transaction registries - both use FraudRegistryV2 on hub.
 * - Hub chains: returns FraudRegistryV2 address (same as wallet)
 * - Spoke chains: returns SpokeRegistryV2 address
 */
export function getTransactionRegistryAddress(chainId: number): Address {
  if (isSpokeChain(chainId)) {
    return getSpokeV2Address('spokeRegistryV2', chainId);
  }
  return getFraudRegistryV2Address(chainId);
}

// Re-export cross-chain helpers for convenience
export { isSpokeChain, isHubChain } from '@swr/chains';
