import { render, type RenderOptions } from '@testing-library/react';
import { type ReactElement, type ReactNode } from 'react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { injected } from 'wagmi/connectors';
import { defineChain } from 'viem';

interface WrapperProps {
  children: ReactNode;
}

// Minimal test chain — avoids importing mainnet or @swr/chains (which needs Multicall3)
const testChain = defineChain({
  id: 31337,
  name: 'Test',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
});

const testConfig = createConfig({
  chains: [testChain],
  connectors: [injected()],
  transports: {
    [testChain.id]: http(),
  },
});

// Fresh QueryClient for each test to avoid state leakage
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  });
}

function AllProviders({ children }: WrapperProps) {
  const queryClient = createTestQueryClient();

  return (
    // wagmi 2.x WagmiProvider expects the app's full Config generic. A minimal
    // test chain created via defineChain doesn't satisfy that generic, so we cast
    // here. This is test-only — the runtime behavior is correct.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <WagmiProvider config={testConfig as any}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

function customRender(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: AllProviders, ...options });
}

// Re-export everything from testing-library
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';

// Override render with custom render
export { customRender as render };
