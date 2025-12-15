import { http, createConfig } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';
import type { Chain } from 'wagmi/chains';

// Custom localhost chain definition (Anvil/Hardhat default)
export const localhost: Chain = {
  id: 31337,
  name: 'Localhost',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8545'] },
  },
};

// Supported chains
export const chains = [localhost, sepolia] as const;

// WalletConnect project ID (optional)
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

/**
 * Get Sepolia RPC URL from environment or use public fallback.
 * In production, VITE_SEPOLIA_RPC_URL should be set to Alchemy/Infura.
 *
 * Example .env:
 *   VITE_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY
 */
function getSepoliaRpcUrl(): string {
  const envUrl = import.meta.env.VITE_SEPOLIA_RPC_URL;
  if (envUrl) {
    return envUrl;
  }
  // Warn in production if using public fallback
  if (import.meta.env.PROD) {
    console.warn(
      '[wagmi] VITE_SEPOLIA_RPC_URL not set. Using public RPC which may be rate-limited. ' +
        'Set VITE_SEPOLIA_RPC_URL to an Alchemy/Infura endpoint for production.'
    );
  }
  return 'https://rpc.sepolia.org';
}

// Create config with conditional WalletConnect
export const config = walletConnectProjectId
  ? createConfig({
      chains,
      connectors: [injected(), walletConnect({ projectId: walletConnectProjectId })],
      transports: {
        [localhost.id]: http('http://127.0.0.1:8545'),
        [sepolia.id]: http(getSepoliaRpcUrl()),
      },
    })
  : createConfig({
      chains,
      connectors: [injected()],
      transports: {
        [localhost.id]: http('http://127.0.0.1:8545'),
        [sepolia.id]: http(getSepoliaRpcUrl()),
      },
    });

// Type augmentation for wagmi
declare module 'wagmi' {
  interface Register {
    config: typeof config;
  }
}
