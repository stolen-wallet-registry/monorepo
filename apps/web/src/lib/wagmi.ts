import { http, createConfig } from 'wagmi';
import { baseSepolia, optimismSepolia } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';
import type { Chain } from 'wagmi/chains';

// ═══════════════════════════════════════════════════════════════════════════
// CHAIN DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/** Hub chain (Anvil default) - primary chain for registrations */
export const anvilHub: Chain = {
  id: 31337,
  name: 'Anvil Hub',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8545'] },
  },
};

/** Spoke chain (Anvil secondary) - for cross-chain testing */
export const anvilSpoke: Chain = {
  id: 31338,
  name: 'Anvil Spoke',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8546'] },
  },
};

// Legacy alias for backward compatibility
export const localhost = anvilHub;

// Single source of truth for RPC URLs (public only).
const RPC_URLS: Record<number, string> = {
  [anvilHub.id]: 'http://127.0.0.1:8545',
  [anvilSpoke.id]: 'http://127.0.0.1:8546',
  [baseSepolia.id]: 'https://sepolia.base.org',
  [optimismSepolia.id]: 'https://sepolia.optimism.io',
};

// ═══════════════════════════════════════════════════════════════════════════
// ENVIRONMENT MODES
// ═══════════════════════════════════════════════════════════════════════════

/** Whether cross-chain mode is enabled (set via VITE_CROSSCHAIN=true) */
export const isCrossChainMode = import.meta.env.VITE_CROSSCHAIN === 'true';

/** Whether testnet mode is enabled (set via VITE_TESTNET=true) */
export const isTestnetMode = import.meta.env.VITE_TESTNET === 'true';

// Build chains array based on mode
const getChains = (): readonly [Chain, ...Chain[]] => {
  // Testnet mode: Base Sepolia (hub) + Optimism Sepolia (spoke)
  if (isTestnetMode) {
    return [baseSepolia, optimismSepolia] as const;
  }

  // Local cross-chain mode: Anvil Hub + Anvil Spoke
  if (isCrossChainMode) {
    return [anvilHub, anvilSpoke] as const;
  }

  // Default local development: Anvil Hub only
  return [anvilHub] as const;
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
      [baseSepolia.id]: http(RPC_URLS[baseSepolia.id]),
      [optimismSepolia.id]: http(RPC_URLS[optimismSepolia.id]),
    };
  }

  const base = {
    [anvilHub.id]: http(RPC_URLS[anvilHub.id]),
  };

  if (isCrossChainMode) {
    return {
      ...base,
      [anvilSpoke.id]: http(RPC_URLS[anvilSpoke.id]),
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
