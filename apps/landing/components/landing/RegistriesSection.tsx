'use client';

import { Wallet, FileText, Code2 } from 'lucide-react';

import { TextAnimate } from '@swr/ui';

import { RegistryCard } from './RegistryCard';

const REGISTRIES = [
  {
    title: 'Stolen Wallets',
    description:
      'Anyone can register wallets they no longer control. Self-attestation with wallet signature provides high trust signal. Operators can batch-submit on behalf of victims.',
    status: 'active' as const,
    icon: <Wallet className="size-6" />,
  },
  {
    title: 'Stolen Transactions',
    description:
      'Anyone can report specific fraudulent transactions like phishing attacks, address poisoning, or unauthorized transfers. Operators can batch-submit.',
    status: 'active' as const,
    icon: <FileText className="size-6" />,
  },
  {
    title: 'Fraudulent Contracts',
    description:
      'Operator-only registry for cataloging malicious smart contracts. Approved operators can batch-submit known scam patterns via the Dashboard. Data is searchable by anyone.',
    status: 'operator-only' as const,
    icon: <Code2 className="size-6" />,
  },
];

export function RegistriesSection() {
  return (
    <section id="registries" className="border-t border-border/50 px-4 py-16 md:py-24">
      <div className="mx-auto max-w-6xl">
        {/* Section heading */}
        <div className="mb-12 text-center md:mb-16">
          <TextAnimate
            as="h2"
            animation="slideUp"
            by="word"
            className="text-3xl font-bold tracking-tight md:text-4xl"
            startOnView
            once
          >
            Three Registries. One Mission.
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
            An on-chain coordination system for tracking stolen wallets, fraudulent transactions,
            and malicious contracts. Data stored on-chain—immutable, censorship-resistant, and
            accessible to any wallet or service without permission.
          </TextAnimate>
        </div>

        {/* Registry cards grid */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {REGISTRIES.map((registry) => (
            <RegistryCard key={registry.title} {...registry} />
          ))}
        </div>
      </div>
    </section>
  );
}
