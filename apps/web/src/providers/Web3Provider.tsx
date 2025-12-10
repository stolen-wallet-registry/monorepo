import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { RainbowKitProvider, darkTheme, lightTheme } from '@rainbow-me/rainbowkit';
import { config } from '@/lib/wagmi';
import { useTheme } from '@/providers/useTheme';
import '@rainbow-me/rainbowkit/styles.css';
import { type ReactNode, useState } from 'react';

interface Web3ProviderProps {
  children: ReactNode;
}

// RainbowKit theme configuration
const rainbowKitLightTheme = lightTheme({
  borderRadius: 'medium',
  fontStack: 'system',
});

const rainbowKitDarkTheme = darkTheme({
  borderRadius: 'medium',
  fontStack: 'system',
});

// Inner component that can access ThemeProvider context
function RainbowKitWrapper({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();

  return (
    <RainbowKitProvider
      theme={resolvedTheme === 'dark' ? rainbowKitDarkTheme : rainbowKitLightTheme}
    >
      {children}
    </RainbowKitProvider>
  );
}

export function Web3Provider({ children }: Web3ProviderProps) {
  // Create QueryClient inside component to avoid SSR issues
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            gcTime: 5 * 60 * 1000, // 5 minutes
          },
        },
      })
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitWrapper>{children}</RainbowKitWrapper>
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
