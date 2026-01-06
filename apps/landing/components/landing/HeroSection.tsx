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
  'A coordination tool for Web3 security.',
  'Global. Borderless. On-chain.',
  'Lost your seed phrase? Register the wallet.',
  'Signed a malicious message? Report it.',
  'Competing entities sharing fraud intelligence.',
];

function GlobeSkeleton() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[350px] sm:max-w-[400px]">
      <Skeleton className="size-full rounded-full" />
    </div>
  );
}

export function HeroSection(): React.JSX.Element {
  return (
    <section className="relative flex min-h-[85vh] flex-col items-center justify-center overflow-hidden px-4 py-16 text-center md:py-24">
      {/* Background gradient effect */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/80" />

      {/* Content container */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Main headline with HyperText scramble effect */}
        {/* Note: Using h1 wrapper instead of as="h1" to avoid SSR hydration mismatch with motion.create */}
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
          <HyperText duration={1200} delay={300} startOnView animateOnHover>
            STOLEN WALLET REGISTRY
          </HyperText>
        </h1>

        {/* Rotating taglines with typewriter effect */}
        <div className="mt-6 h-12">
          <TypingAnimation
            words={TAGLINES}
            className="text-lg text-muted-foreground sm:text-xl md:text-2xl"
            typeSpeed={40}
            deleteSpeed={25}
            pauseDelay={2500}
            loop
            showCursor
            cursorStyle="line"
          />
        </div>

        {/* Globe visualization */}
        <div className="relative mt-8 h-[250px] w-full max-w-[350px] overflow-hidden sm:h-[300px] sm:max-w-[400px] md:mt-12 md:h-[400px]">
          <ErrorBoundary fallback={<GlobeSkeleton />}>
            <Suspense fallback={<GlobeSkeleton />}>
              <Globe className="opacity-90" />
            </Suspense>
          </ErrorBoundary>
        </div>

        {/* Registry Search Preview */}
        <RegistrySearchPreview className="mt-8 w-full max-w-md md:mt-12" />

        {/* CTA Buttons */}
        <div className="relative z-10 mt-8 flex flex-col gap-4 sm:flex-row md:mt-12">
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
