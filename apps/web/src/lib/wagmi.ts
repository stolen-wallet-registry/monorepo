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

// Build chains array based on mode (L2 only — no mainnet)
const getChains = (): readonly [Chain, ...Chain[]] => {
  if (isTestnetMode) {
    return [baseSepoliaChain, optimismSepoliaChain];
  }
  if (isCrossChainMode) {
    return [anvilHubChain, anvilSpokeChain];
  }
  return [anvilHubChain];
};

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// WalletConnect project ID (optional)
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

// Build transports based on mode
// NOTE: Batching is disabled for local Anvil chains to avoid viem parsing issues
const getTransports = () => {
  if (isTestnetMode) {
    return {
      [baseSepolia.chainId]: http(getRpcUrl(baseSepolia.chainId)),
      [optimismSepolia.chainId]: http(getRpcUrl(optimismSepolia.chainId)),
    };
  }

  const hubRpc = getRpcUrl(anvilHub.chainId);
  const transports: Record<number, ReturnType<typeof http>> = {
    [anvilHub.chainId]: http(hubRpc),
  };

  if (isCrossChainMode) {
    const spokeRpc = getRpcUrl(anvilSpoke.chainId);
    if (import.meta.env.DEV) {
      logger.wallet.debug('Transport RPCs configured', {
        hub: { chainId: anvilHub.chainId, rpc: hubRpc },
        spoke: { chainId: anvilSpoke.chainId, rpc: spokeRpc },
      });
    }
    transports[anvilSpoke.chainId] = http(spokeRpc);
  }

  return transports;
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
