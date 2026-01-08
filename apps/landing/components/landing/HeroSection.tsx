'use client';

import { Suspense, lazy } from 'react';

import { Button, HyperText, TypingAnimation, Skeleton } from '@swr/ui';

import { ErrorBoundary } from '@/components/ui/error-boundary';
import { RegistrySearchPreview } from './RegistrySearchPreview';

const Globe = lazy(() => import('./Globe').then((mod) => ({ default: mod.Globe })));

/**
 * App URL for "Launch App" links.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:5173';

/**
 * Rotating taglines for the hero section.
 * Emphasizes coordination, global nature, and key use cases.
 */
const TAGLINES = [
  'A coordination tool for fraud response.',
  'Global. Borderless. On-chain.',
  'Lost your seed phrase? Register the wallet.',
  'Signed a malicious message? Report it.',
  'Competing entities sharing fraud intelligence.',
];

function GlobeSkeleton() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[280px] sm:max-w-[320px]">
      <Skeleton className="size-full rounded-full" />
    </div>
  );
}

export function HeroSection(): React.JSX.Element {
  return (
    <section className="relative flex min-h-[calc(100vh-5rem)] flex-col items-center justify-start overflow-hidden px-4 pt-4 pb-8 text-center">
      {/* Background gradient effect */}
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-transparent via-transparent to-background/80" />

      {/* Content container */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Main headline with HyperText scramble effect */}
        {/* Note: Using h1 wrapper instead of as="h1" to avoid SSR hydration mismatch with motion.create */}
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
          <HyperText duration={1200} delay={300} startOnView animateOnHover>
            STOLEN WALLET REGISTRY
          </HyperText>
        </h1>

        {/* Rotating taglines with typewriter effect */}
        <div className="mt-2 h-7 sm:mt-3 sm:h-8">
          <TypingAnimation
            words={TAGLINES}
            className="text-base text-muted-foreground sm:text-lg md:text-xl"
            typeSpeed={40}
            deleteSpeed={25}
            pauseDelay={2500}
            loop
            showCursor
            cursorStyle="line"
          />
        </div>

        {/* Globe visualization */}
        <div className="relative mt-2 h-[200px] w-full max-w-[280px] sm:mt-4 sm:h-[240px] sm:max-w-[300px] md:h-[280px] md:max-w-[340px]">
          <ErrorBoundary fallback={<GlobeSkeleton />}>
            <Suspense fallback={<GlobeSkeleton />}>
              <Globe className="opacity-90" />
            </Suspense>
          </ErrorBoundary>
        </div>

        {/* Registry Search Preview - Wider */}
        <ErrorBoundary fallback={<div className="mt-16 w-full max-w-xl sm:mt-20" />}>
          <RegistrySearchPreview className="mt-16 w-full max-w-xl sm:mt-20" />
        </ErrorBoundary>

        {/* CTA Buttons */}
        <div className="relative z-10 mt-3 flex flex-col gap-3 sm:mt-4 sm:flex-row">
          <Button asChild size="lg" className="min-w-[140px]">
            <a
              href={APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Launch App (opens in new tab)"
            >
              Launch App
            </a>
          </Button>
          <Button variant="outline" size="lg" asChild className="min-w-[140px]">
            <a href="#cross-chain">Learn More</a>
          </Button>
        </div>
      </div>
    </section>
  );
}
