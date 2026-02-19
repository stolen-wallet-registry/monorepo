'use client';

import { ExternalLink } from 'lucide-react';

import { TextAnimate } from '@swr/ui';

import { CrossChainVisualizationWithSuspense } from './CrossChainVisualization';

export function CrossChainSection() {
  return (
    <section id="cross-chain" className="border-t border-border/50 px-4 py-16 md:py-24">
      <div className="mx-auto max-w-7xl">
        {/* Section heading */}
        <div className="mb-12 text-center md:mb-16">
          <TextAnimate
            as="h2"
            animation="blurInUp"
            by="word"
            className="text-3xl font-bold tracking-tight md:text-4xl"
            startOnView
            once
          >
            Cross-Chain Coordination
          </TextAnimate>
          <TextAnimate
            as="p"
            animation="fadeIn"
            by="word"
            delay={0.3}
            className="mx-auto mt-4 max-w-2xl text-muted-foreground"
            startOnView
            once
          >
            The registry stores lightweight fraud records in a chain-agnostic format based on
            CAIP-10 and the CAIP-363 draft for namespace-wide account references, giving tracing
            tools and off-ramps a single source of truth to identify and track fraudulent funds
            across networks.
          </TextAnimate>
          <div className="mt-3 flex flex-col items-center gap-1.5">
            <a
              href="https://standards.chainagnostic.org/CAIPs/caip-10"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              CAIP-10 address format
              <ExternalLink className="size-3.5" />
            </a>
            <a
              href="https://github.com/ChainAgnostic/CAIPs/pull/363"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              CAIP-363 namespace-wide references (draft)
              <ExternalLink className="size-3.5" />
            </a>
          </div>
        </div>

        {/* Visualization */}
        <CrossChainVisualizationWithSuspense showHeader={false} showLabels={true} />
      </div>
    </section>
  );
}
