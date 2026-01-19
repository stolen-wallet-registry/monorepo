import { http, createConfig } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import {
  anvilHub,
  anvilSpoke,
  baseSepolia,
  optimismSepolia,
  toWagmiChain,
  getRpcUrl,
} from '@swr/chains';
import type { Chain } from 'wagmi/chains';
import { logger } from '@/lib/logger';

// ═══════════════════════════════════════════════════════════════════════════
// ENVIRONMENT MODES
// ═══════════════════════════════════════════════════════════════════════════

/** Whether cross-chain mode is enabled (set via VITE_CROSSCHAIN=true) */
export const isCrossChainMode = import.meta.env.VITE_CROSSCHAIN === 'true';

/** Whether testnet mode is enabled (set via VITE_TESTNET=true) */
export const isTestnetMode = import.meta.env.VITE_TESTNET === 'true';

// Log mode at startup for debugging chain configuration issues
if (import.meta.env.DEV) {
  logger.wallet.info('wagmi mode initialized', {
    mode: isTestnetMode ? 'TESTNET' : isCrossChainMode ? 'CROSSCHAIN' : 'LOCAL',
    VITE_CROSSCHAIN: import.meta.env.VITE_CROSSCHAIN,
    VITE_TESTNET: import.meta.env.VITE_TESTNET,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CHAIN DEFINITIONS (derived from @swr/chains)
// ═══════════════════════════════════════════════════════════════════════════

// Convert NetworkConfig to wagmi Chain objects
const anvilHubChain = toWagmiChain(anvilHub);
const anvilSpokeChain = toWagmiChain(anvilSpoke);
const baseSepoliaChain = toWagmiChain(baseSepolia);
const optimismSepoliaChain = toWagmiChain(optimismSepolia);

// Legacy exports for backward compatibility during migration
export { anvilHubChain as anvilHub, anvilSpokeChain as anvilSpoke };
export const localhost = anvilHubChain;

// Build chains array based on mode
const getChains = (): readonly [Chain, ...Chain[]] => {
  // Testnet mode: Base Sepolia (hub) + Optimism Sepolia (spoke)
  if (isTestnetMode) {
    return [baseSepoliaChain, optimismSepoliaChain] as const;
  }

  // Local cross-chain mode: Anvil Hub + Anvil Spoke
  if (isCrossChainMode) {
    return [anvilHubChain, anvilSpokeChain] as const;
  }

  // Default local development: Anvil Hub only
  return [anvilHubChain] as const;
};

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// WalletConnect project ID (optional)
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

// Build transports based on mode
// NOTE: Batching is disabled for local Anvil chains to avoid viem parsing issues
const getTransports = () => {
  // Testnet mode: Base Sepolia + Optimism Sepolia (batching OK for real RPCs)
  if (isTestnetMode) {
    return {
      [baseSepolia.chainId]: http(getRpcUrl(baseSepolia.chainId)),
      [optimismSepolia.chainId]: http(getRpcUrl(optimismSepolia.chainId)),
    };
  }

  const hubRpc = getRpcUrl(anvilHub.chainId);
  // Disable batching for local Anvil - causes viem to misinterpret responses
  const localHttpOptions = { batch: false };

  const base = {
    [anvilHub.chainId]: http(hubRpc, localHttpOptions),
  };

  if (isCrossChainMode) {
    const spokeRpc = getRpcUrl(anvilSpoke.chainId);
    // Log RPC URLs for debugging
    if (import.meta.env.DEV) {
      logger.wallet.debug('Transport RPCs configured', {
        hub: { chainId: anvilHub.chainId, rpc: hubRpc },
        spoke: { chainId: anvilSpoke.chainId, rpc: spokeRpc },
        batchingDisabled: true,
      });
    }
    return {
      ...base,
      [anvilSpoke.chainId]: http(spokeRpc, localHttpOptions),
    };
  }

  return base;
};

// Supported chains (dynamic based on mode)
export const chains = getChains();

// Log configured chains for debugging
if (import.meta.env.DEV) {
  logger.wallet.debug('Configured chains', {
    chains: chains.map((c) => ({ id: c.id, name: c.name })),
  });
}

// Create config with conditional WalletConnect
export const config = walletConnectProjectId
  ? createConfig({
      chains,
      connectors: [injected(), walletConnect({ projectId: walletConnectProjectId })],
      transports: getTransports(),
    })
  : createConfig({
      chains,
      connectors: [injected()],
      transports: getTransports(),
    });

// Type augmentation for wagmi
declare module 'wagmi' {
  interface Register {
    config: typeof config;
  }
}
