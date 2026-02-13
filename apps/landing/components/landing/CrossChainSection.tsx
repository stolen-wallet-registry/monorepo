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
            Fraud data flows from any chain to a unified on-chain registry, then broadcasts to
            exchanges, wallets, and security tools worldwide. EVM wallet entries use a wildcard key
            so one registration covers every EVM chain.
          </TextAnimate>
          <a
            href="https://standards.chainagnostic.org/CAIPs/caip-10"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            Learn about CAIP-10 address format
            <ExternalLink className="size-3.5" />
          </a>
        </div>

        {/* Visualization */}
        <CrossChainVisualizationWithSuspense showHeader={false} showLabels={true} />
      </div>
    </section>
  );
}
