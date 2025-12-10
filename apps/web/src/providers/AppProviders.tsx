import type { ReactNode } from 'react';

import { ThemeProvider } from './ThemeProvider';
import { Web3Provider } from './Web3Provider';

interface AppProvidersProps {
  children: ReactNode;
}

/**
 * Composite provider that wraps the entire application.
 * Order matters: ThemeProvider must wrap Web3Provider so RainbowKit can access theme context.
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ThemeProvider defaultTheme="system" storageKey="swr-ui-theme">
      <Web3Provider>{children}</Web3Provider>
    </ThemeProvider>
  );
}
