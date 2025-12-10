import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { config } from '@/lib/wagmi';
import { useTheme } from '@/providers/useTheme';
import { createRainbowKitTheme } from '@/lib/rainbowkit-theme';
import '@rainbow-me/rainbowkit/styles.css';
import { type ReactNode, useState, useMemo } from 'react';

interface Web3ProviderProps {
  children: ReactNode;
}

// Inner component that can access ThemeProvider context
function RainbowKitWrapper({ children }: { children: ReactNode }) {
  const { resolvedColorScheme, themeVariant } = useTheme();

  // Memoize theme to avoid unnecessary re-renders
  const theme = useMemo(
    () => createRainbowKitTheme(resolvedColorScheme, themeVariant),
    [resolvedColorScheme, themeVariant]
  );

  return <RainbowKitProvider theme={theme}>{children}</RainbowKitProvider>;
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
