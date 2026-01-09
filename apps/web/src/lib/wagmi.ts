import { http, createConfig } from 'wagmi';
import { sepolia } from 'wagmi/chains';
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
  [sepolia.id]: 'https://rpc.sepolia.org',
};

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-CHAIN MODE
// ═══════════════════════════════════════════════════════════════════════════

/** Whether cross-chain mode is enabled (set via VITE_CROSSCHAIN=true) */
export const isCrossChainMode = import.meta.env.VITE_CROSSCHAIN === 'true';

// Build chains array based on mode
const getChains = (): readonly [Chain, ...Chain[]] => {
  if (isCrossChainMode) {
    return [anvilHub, anvilSpoke, sepolia] as const;
  }
  return [anvilHub, sepolia] as const;
};

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// WalletConnect project ID (optional)
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

// Build transports based on mode
const getTransports = () => {
  const base = {
    [anvilHub.id]: http(RPC_URLS[anvilHub.id]),
    [sepolia.id]: http(RPC_URLS[sepolia.id]),
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
