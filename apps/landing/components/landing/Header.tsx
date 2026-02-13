'use client';

import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';

import { Button, cn } from '@swr/ui';

import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler';

/**
 * App URL for "Launch App" links.
 * Configured via NEXT_PUBLIC_APP_URL environment variable.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:5173';

const NAV_LINKS: { href: string; label: string; external?: boolean }[] = [
  { href: '#cross-chain', label: 'Cross-Chain' },
  { href: '#registries', label: 'Registries' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#operators', label: 'Operators' },
];

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between border-b border-border/50 bg-background/80 px-6 py-4 backdrop-blur-sm">
      {/* Logo */}
      <Link href="/" className="text-xl font-bold tracking-tight">
        SWR
      </Link>

      {/* Desktop Navigation */}
      <nav className="hidden items-center gap-6 md:flex">
        {NAV_LINKS.map(({ href, label, external }) =>
          external ? (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {label}
            </a>
          ) : (
            <Link
              key={href}
              href={href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {label}
            </Link>
          )
        )}
      </nav>

      {/* Right side actions */}
      <div className="flex items-center gap-3">
        <AnimatedThemeToggler />
        <Button asChild className="hidden sm:inline-flex">
          <a href={APP_URL} target="_blank" rel="noopener noreferrer">
            Launch App
          </a>
        </Button>

        {/* Mobile menu button */}
        <button
          type="button"
          className="inline-flex size-10 items-center justify-center rounded-md text-foreground md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Mobile Navigation Menu */}
      <div
        className={cn(
          'absolute left-0 right-0 top-full border-b border-border/50 bg-background/95 backdrop-blur-sm md:hidden',
          mobileMenuOpen ? 'block' : 'hidden'
        )}
      >
        <nav className="flex flex-col px-6 py-4">
          {NAV_LINKS.map(({ href, label, external }) =>
            external ? (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setMobileMenuOpen(false)}
              >
                {label}
              </a>
            ) : (
              <Link
                key={href}
                href={href}
                className="py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setMobileMenuOpen(false)}
              >
                {label}
              </Link>
            )
          )}
          <Button asChild className="mt-4 w-full sm:hidden">
            <a href={APP_URL} target="_blank" rel="noopener noreferrer">
              Launch App
            </a>
          </Button>
        </nav>
      </div>
    </header>
  );
}
