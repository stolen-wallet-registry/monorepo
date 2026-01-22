import type { Chain } from 'viem';
import {
  type Environment,
  type HubNetworkConfig,
  getHubChainIdForEnvironment,
  getNetwork,
  toWagmiChain,
} from '@swr/chains';

// ═══════════════════════════════════════════════════════════════════════════
// CLI ENVIRONMENT MAPPING
// ═══════════════════════════════════════════════════════════════════════════

/** CLI uses local/testnet/mainnet, @swr/chains uses development/staging/production */
export type CliEnvironment = 'local' | 'testnet' | 'mainnet';

const CLI_TO_CHAINS_ENV: Record<CliEnvironment, Environment> = {
  local: 'development',
  testnet: 'staging',
  mainnet: 'production',
};

// ═══════════════════════════════════════════════════════════════════════════
// NETWORK CONFIG (for CLI compatibility)
// ═══════════════════════════════════════════════════════════════════════════

export interface NetworkConfig {
  chain: Chain;
  rpcUrl: string;
  contracts: {
    registryHub: `0x${string}`;
    operatorRegistry: `0x${string}`;
    stolenWalletRegistry: `0x${string}`;
    stolenTransactionRegistry: `0x${string}`;
    fraudulentContractRegistry: `0x${string}`;
    feeManager: `0x${string}`;
  };
}

/**
 * Get configuration for the specified environment.
 * Uses @swr/chains as the single source of truth.
 */
export function getConfig(env: CliEnvironment): NetworkConfig {
  const chainsEnv = CLI_TO_CHAINS_ENV[env];
  const hubChainId = getHubChainIdForEnvironment(chainsEnv);
  const network = getNetwork(hubChainId) as HubNetworkConfig;

  if (!network.hubContracts) {
    throw new Error(`Contract addresses not configured for environment: ${env}`);
  }

  const contracts = network.hubContracts;

  return {
    chain: toWagmiChain(network),
    rpcUrl: network.rpcUrls[0],
    contracts: {
      registryHub: contracts.registryHub,
      operatorRegistry: contracts.operatorRegistry ?? '0x0000000000000000000000000000000000000000',
      stolenWalletRegistry: contracts.stolenWalletRegistry,
      stolenTransactionRegistry: contracts.stolenTransactionRegistry,
      fraudulentContractRegistry: contracts.fraudulentContractRegistry,
      feeManager: contracts.feeManager,
    },
  };
}
