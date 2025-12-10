import type { ReactNode } from 'react';

import { Header } from './Header';

interface LayoutProps {
  children: ReactNode;
}

/**
 * Main application layout shell.
 * Provides consistent header and main content area.
 */
export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main className="p-8">{children}</main>
    </div>
  );
}
