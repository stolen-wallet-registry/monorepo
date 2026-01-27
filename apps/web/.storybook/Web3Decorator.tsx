/**
 * Web3 decorator for Storybook.
 *
 * Wraps stories with WagmiProvider and QueryClientProvider for components
 * that use wagmi hooks (useEnsName, useAccount, etc.).
 *
 * Usage in stories:
 * ```tsx
 * import { withWeb3 } from '../../../.storybook/Web3Decorator';
 *
 * export default {
 *   decorators: [withWeb3],
 *   // ...
 * };
 * ```
 */

import type { Decorator } from '@storybook/react-vite';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { mainnet } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Minimal wagmi config for Storybook - mainnet only for ENS resolution
// Note: We need at least one connector due to wagmi's type requirements
const storybookConfig = createConfig({
  chains: [mainnet],
  connectors: [injected()],
  transports: {
    [mainnet.id]: http('https://eth.llamarpc.com'),
  },
});

// Cast to any to bypass the app's wagmi type augmentation in src/lib/wagmi.ts
// This is safe for Storybook where we only need ENS resolution
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const typedConfig = storybookConfig as any;

// Shared QueryClient for Storybook
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Disable retries in Storybook for faster feedback
      retry: false,
      // Keep data fresh but don't refetch constantly
      staleTime: 5 * 60 * 1000,
    },
  },
});

/**
 * Decorator that wraps stories with Web3 providers (wagmi + TanStack Query).
 *
 * Use this for components that use wagmi hooks like useEnsName, useAccount, etc.
 */
export const withWeb3: Decorator = (Story) => {
  return (
    <WagmiProvider config={typedConfig}>
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    </WagmiProvider>
  );
};
