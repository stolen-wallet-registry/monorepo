import type { ReactNode } from 'react';

import { Header } from './Header';
import { Footer } from './Footer';
import { ConnectedWalletStatus } from '@/components/composed/ConnectedWalletStatus';

interface LayoutProps {
  children: ReactNode;
}

/**
 * Main application layout shell.
 * Provides consistent header, wallet status alert, main content area, and footer.
 */
export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Header />
      <div className="px-4 md:px-8 pt-4">
        <ConnectedWalletStatus className="max-w-4xl mx-auto mb-4" />
      </div>
      <main className="p-4 md:p-8 pt-0 flex-1">{children}</main>
      <Footer />
    </div>
  );
}
