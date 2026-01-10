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

// ═══════════════════════════════════════════════════════════════════════════
// ENVIRONMENT MODES
// ═══════════════════════════════════════════════════════════════════════════

/** Whether cross-chain mode is enabled (set via VITE_CROSSCHAIN=true) */
export const isCrossChainMode = import.meta.env.VITE_CROSSCHAIN === 'true';

/** Whether testnet mode is enabled (set via VITE_TESTNET=true) */
export const isTestnetMode = import.meta.env.VITE_TESTNET === 'true';

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
const getTransports = () => {
  // Testnet mode: Base Sepolia + Optimism Sepolia
  if (isTestnetMode) {
    return {
      [baseSepolia.chainId]: http(getRpcUrl(baseSepolia.chainId)),
      [optimismSepolia.chainId]: http(getRpcUrl(optimismSepolia.chainId)),
    };
  }

  const base = {
    [anvilHub.chainId]: http(getRpcUrl(anvilHub.chainId)),
  };

  if (isCrossChainMode) {
    return {
      ...base,
      [anvilSpoke.chainId]: http(getRpcUrl(anvilSpoke.chainId)),
    };
  }

  return base;
};

// Supported chains (dynamic based on mode)
export const chains = getChains();

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
