'use client';

import { Button, TextAnimate } from '@swr/ui';

/**
 * App URL for "Launch App" links.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:5173';

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
          Join the global effort to make Web3 safer for everyone.
        </TextAnimate>

        <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
          <Button size="lg" asChild className="min-w-[160px]">
            <a href={APP_URL} target="_blank" rel="noopener noreferrer">
              Launch App
            </a>
          </Button>
          <Button size="lg" variant="outline" asChild className="min-w-[160px]">
            <a
              href="https://github.com/stolen-wallet-registry"
              target="_blank"
              rel="noopener noreferrer"
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
    <footer className="border-t border-border/50 px-6 py-8 text-center">
      <p className="text-sm text-muted-foreground">
        Stolen Wallet Registry - A public good for Web3 security
      </p>
      <p className="mt-2 text-xs text-muted-foreground/70">
        Built with transparency. Open source. Cross-chain.
      </p>
    </footer>
  );
}
