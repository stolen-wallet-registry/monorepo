'use client';

import { PenLine, Clock, CheckCircle2 } from 'lucide-react';

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

        {/* CAIP-10 address example */}
        <div className="mt-12 rounded-lg border border-border/50 bg-muted/30 p-6 text-center md:mt-16">
          <a
            href="https://standards.chainagnostic.org/CAIPs/caip-10"
            target="_blank"
            rel="noopener noreferrer"
            className="mb-3 inline-block text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-primary hover:underline"
          >
            Cross-Chain Address Format (CAIP-10)
          </a>
          <TextAnimate
            animation="blurIn"
            by="character"
            duration={3}
            className="font-mono text-sm text-foreground sm:text-base md:text-lg"
            startOnView
            once
          >
            eip155:1:0x742d35Cc6634C0532925a3b844Bc454e4438f44e
          </TextAnimate>
        </div>
      </div>
    </section>
  );
}
