import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Menu, X } from 'lucide-react';
import { Button } from '@swr/ui';

import {
  AnimatedThemeToggler,
  type ThemeTogglerHandle,
} from '@/components/ui/animated-theme-toggler';
import { ThemeVariantToggle } from '@/components/composed/ThemeVariantToggle';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { useTheme } from '@/providers/useTheme';

/**
 * Homepage URL for "Stolen Wallet Registry" logo link.
 * Links back to the marketing landing page.
 */
const HOMEPAGE_URL = import.meta.env.VITE_HOMEPAGE_URL ?? 'http://localhost:3000';

export function Header() {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const themeTogglerRef = useRef<ThemeTogglerHandle>(null);
  const { setTriggerThemeAnimation } = useTheme();

  // Register the theme toggler's trigger function with context
  // We register a WRAPPER function that calls through the ref, ensuring
  // we always invoke the latest triggerVariantSwitch (which may change
  // when themeVariant changes due to useCallback dependencies)
  useEffect(() => {
    logger.ui.debug('Registering triggerThemeAnimation wrapper with context', {
      component: 'Header',
    });
    setTriggerThemeAnimation((variant, colorScheme) => {
      if (themeTogglerRef.current) {
        themeTogglerRef.current.triggerVariantSwitch(variant, colorScheme);
      } else {
        logger.ui.warn('themeTogglerRef.current is null when triggering animation', {
          component: 'Header',
          requestedVariant: variant,
        });
      }
    });
    return () => {
      logger.ui.debug('Cleanup: unregistering triggerThemeAnimation', {
        component: 'Header',
      });
      setTriggerThemeAnimation(null);
    };
  }, [setTriggerThemeAnimation]);

  const navItems = [
    { href: '/', label: 'Register', matchPaths: ['/', '/register', '/registration'] },
    { href: '/search', label: 'Search', matchPaths: ['/search'] },
    { href: '/dashboard', label: 'Dashboard', matchPaths: ['/dashboard'] },
    { href: '/soulbound', label: 'Support SWR', matchPaths: ['/soulbound'] },
  ];

  // Check if current location matches any of the paths for a nav item
  const isActive = (matchPaths: string[]) =>
    matchPaths.some((path) => location === path || location.startsWith(path + '/'));

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
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 cursor-pointer',
                  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  isActive(item.matchPaths)
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
              >
                {item.label}
              </Link>
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
          <ThemeVariantToggle />
          <AnimatedThemeToggler
            ref={themeTogglerRef}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 w-9"
          />
          <ConnectButton />
        </div>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <nav className="sm:hidden border-t border-border p-2">
          <div className="flex flex-col gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'inline-flex items-center rounded-md text-sm font-medium h-9 px-4 py-2 w-full cursor-pointer',
                  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  isActive(item.matchPaths)
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
