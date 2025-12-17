import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Search, Menu, X } from 'lucide-react';
import { Button } from '@swr/ui';

import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler';
import { cn } from '@/lib/utils';

/**
 * Homepage URL for "Stolen Wallet Registry" logo link.
 * Links back to the marketing landing page.
 */
const HOMEPAGE_URL = import.meta.env.VITE_HOMEPAGE_URL ?? 'http://localhost:3000';

export function Header() {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { href: '/', label: 'Register', icon: null },
    { href: '/search', label: 'Search', icon: <Search className="h-4 w-4 mr-1.5" /> },
  ];

  return (
    <header className="border-b border-border">
      <div className="flex justify-between items-center p-4">
        <div className="flex items-center gap-6">
          <a
            href={HOMEPAGE_URL}
            className="text-xl font-bold transition-colors hover:text-primary"
            aria-label="Go to homepage"
            target="_blank"
            rel="noopener noreferrer"
          >
            Stolen Wallet Registry
          </a>
          {/* Desktop Navigation */}
          <nav className="hidden sm:flex items-center gap-1">
            {navItems.map((item) => (
              <Button
                key={item.href}
                variant="ghost"
                size="sm"
                asChild
                className={cn(
                  'text-muted-foreground hover:text-foreground',
                  location === item.href && 'text-foreground bg-accent'
                )}
              >
                <Link href={item.href}>
                  {item.icon}
                  {item.label}
                </Link>
              </Button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Mobile Menu Toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="sm:hidden h-9 w-9 p-0"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <AnimatedThemeToggler className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 w-9" />
          <ConnectButton />
        </div>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <nav className="sm:hidden border-t border-border p-2">
          <div className="flex flex-col gap-1">
            {navItems.map((item) => (
              <Button
                key={item.href}
                variant="ghost"
                size="sm"
                asChild
                className={cn(
                  'w-full justify-start text-muted-foreground hover:text-foreground',
                  location === item.href && 'text-foreground bg-accent'
                )}
                onClick={() => setMobileMenuOpen(false)}
              >
                <Link href={item.href}>
                  {item.icon}
                  {item.label}
                </Link>
              </Button>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
