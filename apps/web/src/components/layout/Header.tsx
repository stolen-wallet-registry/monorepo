import { ConnectButton } from '@rainbow-me/rainbowkit';

import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler';

export function Header() {
  return (
    <header className="flex justify-between items-center p-4 border-b border-border">
      <h1 className="text-xl font-bold">Stolen Wallet Registry</h1>
      <div className="flex items-center gap-4">
        <AnimatedThemeToggler className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 w-9" />
        <ConnectButton />
      </div>
    </header>
  );
}
