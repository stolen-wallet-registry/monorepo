import { http, createConfig } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import { mainnet } from 'wagmi/chains';
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

// ═══════════════════════════════════════════════════════════════════════════
// ENS CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

/** Whether ENS resolution is enabled */
export const isEnsEnabled = true;

/**
 * Mainnet RPC URL for ENS resolution only.
 * ENS requires mainnet even when app operates on testnets/local chains.
 *
 * Priority:
 * 1. VITE_MAINNET_RPC_URL (explicit override)
 * 2. VITE_ALCHEMY_API_KEY (construct Alchemy URL)
 * 3. Public RPC fallback (rate-limited, for development only)
 */
function getMainnetRpcUrl(): string {
  if (import.meta.env.VITE_MAINNET_RPC_URL) {
    return import.meta.env.VITE_MAINNET_RPC_URL;
  }
  if (import.meta.env.VITE_ALCHEMY_API_KEY) {
    return `https://eth-mainnet.g.alchemy.com/v2/${import.meta.env.VITE_ALCHEMY_API_KEY}`;
  }
  // Fallback: public RPC (rate-limited, not for production)
  return 'https://eth.llamarpc.com';
}

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
// IMPORTANT: mainnet is included ONLY for ENS resolution, not for transactions
const getChains = (): readonly [Chain, ...Chain[]] => {
  // Determine app chains based on mode (always at least one chain)
  const [firstChain, ...restChains]: [Chain, ...Chain[]] = isTestnetMode
    ? [baseSepoliaChain, optimismSepoliaChain]
    : isCrossChainMode
      ? [anvilHubChain, anvilSpokeChain]
      : [anvilHubChain];

  // Add mainnet for ENS resolution (always needed for useEnsName, useEnsAddress, etc.)
  if (isEnsEnabled) {
    return [firstChain, ...restChains, mainnet] as const;
  }

  return [firstChain, ...restChains] as const;
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
  let appTransports: Record<number, ReturnType<typeof http>>;

  if (isTestnetMode) {
    appTransports = {
      [baseSepolia.chainId]: http(getRpcUrl(baseSepolia.chainId)),
      [optimismSepolia.chainId]: http(getRpcUrl(optimismSepolia.chainId)),
    };
  } else {
    const hubRpc = getRpcUrl(anvilHub.chainId);

    appTransports = {
      [anvilHub.chainId]: http(hubRpc),
    };

    if (isCrossChainMode) {
      const spokeRpc = getRpcUrl(anvilSpoke.chainId);
      // Log RPC URLs for debugging
      if (import.meta.env.DEV) {
        logger.wallet.debug('Transport RPCs configured', {
          hub: { chainId: anvilHub.chainId, rpc: hubRpc },
          spoke: { chainId: anvilSpoke.chainId, rpc: spokeRpc },
        });
      }
      appTransports[anvilSpoke.chainId] = http(spokeRpc);
    }
  }

  // Add mainnet transport for ENS resolution
  if (isEnsEnabled) {
    return {
      ...appTransports,
      [mainnet.id]: http(getMainnetRpcUrl()),
    };
  }

  return appTransports;
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
