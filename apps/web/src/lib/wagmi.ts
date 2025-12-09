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

// Create config with conditional WalletConnect
export const config = walletConnectProjectId
  ? createConfig({
      chains,
      connectors: [injected(), walletConnect({ projectId: walletConnectProjectId })],
      transports: {
        [localhost.id]: http('http://127.0.0.1:8545'),
        [sepolia.id]: http(),
      },
    })
  : createConfig({
      chains,
      connectors: [injected()],
      transports: {
        [localhost.id]: http('http://127.0.0.1:8545'),
        [sepolia.id]: http(),
      },
    });

// Type augmentation for wagmi
declare module 'wagmi' {
  interface Register {
    config: typeof config;
  }
}
