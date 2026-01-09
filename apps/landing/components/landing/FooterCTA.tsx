'use client';

import { Button, TextAnimate } from '@swr/ui';

/**
 * App URL for "Launch App" links.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:5173';

/**
 * Docs URL for documentation links.
 */
const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL ?? 'http://localhost:5174';

export function FooterCTA() {
  return (
    <section className="border-t border-border/50 bg-gradient-to-b from-muted/30 to-background px-4 py-16 text-center md:py-24">
      <div className="mx-auto max-w-2xl">
        <TextAnimate
          as="h2"
          animation="fadeIn"
          by="word"
          className="text-3xl font-bold tracking-tight md:text-4xl"
          startOnView
          once
        >
          Ready to protect the ecosystem?
        </TextAnimate>
        <TextAnimate
          as="p"
          animation="fadeIn"
          by="word"
          delay={0.3}
          className="mt-4 text-muted-foreground"
          startOnView
          once
        >
          Join the global effort to make on-chain activity safer for everyone.
        </TextAnimate>

        <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
          <Button size="lg" asChild className="min-w-[160px]">
            <a
              href={APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Launch App (opens in new tab)"
            >
              Launch App
            </a>
          </Button>
          <Button size="lg" variant="outline" asChild className="min-w-[160px]">
            <a
              href="https://github.com/stolen-wallet-registry/monorepo"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View on GitHub (opens in new tab)"
            >
              View on GitHub
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border/50 px-6 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            Stolen Wallet Registry - A public good for fraud prevention
          </p>
          <nav className="flex items-center gap-4 text-sm">
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Docs
            </a>
            <a
              href="https://github.com/stolen-wallet-registry/monorepo"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              GitHub
            </a>
          </nav>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Built with transparency. Open source. Cross-chain.
        </p>
      </div>
    </footer>
  );
}
