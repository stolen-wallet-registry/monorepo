'use client';

import { useEffect, useState } from 'react';
import { PenLine, Clock, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { TextAnimate, cn } from '@swr/ui';

const STEPS = [
  {
    number: 1,
    title: 'Acknowledge',
    description: 'Sign intent to register your compromised wallet using EIP-712 typed data.',
    icon: <PenLine className="size-5" aria-hidden="true" />,
  },
  {
    number: 2,
    title: 'Wait',
    description: 'Grace period of 1-4 minutes prevents single-transaction phishing attacks.',
    icon: <Clock className="size-5" aria-hidden="true" />,
  },
  {
    number: 3,
    title: 'Register',
    description:
      'Complete registration within the time window. Entry is marked permanently in the registry.',
    icon: <CheckCircle2 className="size-5" aria-hidden="true" />,
  },
];

// CAIP-10 examples from diverse chains — cycles through to show cross-chain support
const CAIP_DISPLAY_EXAMPLES = [
  {
    value: 'eip155:_:0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    label: 'EVM wallet (wildcard)',
    color: 'text-[#627eea] dark:text-[#8b9eff]',
  },
  {
    value: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:7S3P4HxJpyyigGzodYwHtCxZyUQe9JiBMHyRWXArAaKv',
    label: 'Solana wallet',
    color: 'text-[#9945ff] dark:text-[#b980ff]',
  },
  {
    value: 'bip122:000000000019d6689c085ae165831e93:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    label: 'Bitcoin wallet',
    color: 'text-[#f7931a] dark:text-[#ffb54c]',
  },
  {
    value: 'cosmos:cosmoshub-4:cosmos1vk8e95f0f3z5yv0ew3w9q4z6d8y7x3p2s4m1n0',
    label: 'Cosmos wallet',
    color: 'text-[#6f7390] dark:text-[#a8adc0]',
  },
  {
    value: 'eip155:1:0xabc123def456789012345678901234567890abcdef1234567890abcdef123456',
    label: 'EVM transaction',
    color: 'text-[#627eea] dark:text-[#8b9eff]',
  },
];

const CYCLE_INTERVAL_MS = 3000;

// Truncate long CAIP values for display
function truncateDisplay(value: string): string {
  const parts = value.split(':');
  if (parts.length < 3) return value;
  const namespace = parts[0];
  let chainId = parts[1];
  const address = parts.slice(2).join(':');
  if (chainId.length > 12) chainId = `${chainId.slice(0, 8)}...`;
  const truncAddr = address.length > 16 ? `${address.slice(0, 6)}...${address.slice(-6)}` : address;
  return `${namespace}:${chainId}:${truncAddr}`;
}

function CaipCycler() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % CAIP_DISPLAY_EXAMPLES.length);
    }, CYCLE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const current = CAIP_DISPLAY_EXAMPLES[index];

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Cycling main example */}
      <div className="relative h-8 w-full overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <code className={cn('font-mono text-sm sm:text-base md:text-lg', current.color)}>
              {truncateDisplay(current.value)}
            </code>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Label */}
      <AnimatePresence mode="wait">
        <motion.span
          key={index}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="text-xs text-muted-foreground"
        >
          {current.label}
        </motion.span>
      </AnimatePresence>

      {/* Chain indicator dots */}
      <div className="flex gap-1.5">
        {CAIP_DISPLAY_EXAMPLES.map((_, i) => (
          <div
            key={i}
            className={cn(
              'size-1.5 rounded-full transition-all duration-300',
              i === index ? 'bg-primary scale-125' : 'bg-muted-foreground/30'
            )}
          />
        ))}
      </div>
    </div>
  );
}

function StepConnector() {
  return (
    <div className="hidden h-px flex-1 bg-gradient-to-r from-border via-border/50 to-border lg:block" />
  );
}

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="border-t border-border/50 px-4 py-16 md:py-24">
      <div className="mx-auto max-w-5xl">
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
            Two Signatures. One Safeguard.
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
            Our two-phase registration prevents phishing attacks by requiring deliberate action over
            time.
          </TextAnimate>
        </div>

        {/* Steps */}
        <div className="relative flex flex-col items-center gap-8 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
          {STEPS.map((step, index) => (
            <div
              key={step.number}
              className="flex w-full max-w-xs flex-col items-center lg:flex-1 lg:max-w-none"
            >
              {/* Step card */}
              <div className="group flex w-full flex-col items-center text-center">
                {/* Step number circle */}
                <div
                  className={cn(
                    'mb-4 flex size-14 items-center justify-center rounded-full border-2 transition-all duration-300',
                    'border-primary/30 bg-primary/5 text-primary group-hover:border-primary group-hover:bg-primary/10'
                  )}
                >
                  {step.icon}
                </div>

                {/* Step content */}
                <div className="px-2">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Step {step.number}
                  </span>
                  <h3 className="mb-2 text-lg font-semibold">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </div>

              {/* Connector line (hidden on mobile, shown between steps on desktop) */}
              {index < STEPS.length - 1 && <StepConnector />}
            </div>
          ))}
        </div>

        {/* CAIP-10 address examples — cycling through multiple chains */}
        <div className="mt-12 rounded-lg border border-border/50 bg-muted/30 p-6 text-center md:mt-16">
          <a
            href="https://standards.chainagnostic.org/CAIPs/caip-10"
            target="_blank"
            rel="noopener noreferrer"
            className="mb-4 inline-block text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-primary hover:underline"
          >
            Cross-Chain Identifier Format (CAIP-10)
          </a>

          <CaipCycler />

          <p className="mt-4 text-xs text-muted-foreground">
            Every chain has a standard identifier format. EVM wallets use a{' '}
            <strong className="font-semibold text-foreground">wildcard</strong> chain reference{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
              eip155:_:0x...
            </code>{' '}
            so one registration covers every EVM chain.
          </p>
          <a
            href="https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-363.md"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-xs text-muted-foreground hover:text-primary hover:underline"
          >
            Based on CAIP-363 (draft) — Namespace-Wide Account References
          </a>
        </div>
      </div>
    </section>
  );
}
