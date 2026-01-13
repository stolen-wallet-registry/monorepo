'use client';

import { Building2, FileStack, Code2, Users, ShieldCheck, Clock } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  TextAnimate,
  Badge,
} from '@swr/ui';

const OPERATOR_FEATURES = [
  {
    title: 'Batch Submissions',
    description:
      'Batch-submit stolen wallets and fraudulent transactions on behalf of victims. Aggregate fraud intelligence from multiple sources into efficient single transactions.',
    icon: <FileStack className="size-6" aria-hidden="true" />,
  },
  {
    title: 'Fraudulent Contracts',
    description:
      'Exclusive authority to catalog malicious smart contracts. Users can flag suspicious contracts, but only approved operators can formalize registry entries.',
    icon: <Code2 className="size-6" aria-hidden="true" />,
  },
  {
    title: 'Higher Trust Signal',
    description:
      'Operator attestations carry elevated trust in the registry. Your submissions are weighted higher in fraud detection algorithms.',
    icon: <ShieldCheck className="size-6" aria-hidden="true" />,
  },
];

const POTENTIAL_OPERATORS = [
  { name: 'Exchanges', examples: 'Coinbase, Kraken, Binance, Gemini' },
  { name: 'Security Firms', examples: 'Chainalysis, SEAL Team, Elliptic' },
  { name: 'Wallets', examples: 'MetaMask, Rainbow, Ledger' },
  { name: 'Protocols & DAOs', examples: 'Uniswap, Aave, MakerDAO' },
];

const OPERATOR_DESCRIPTION =
  'Any DAO approved organization committed to sharing reliable, trustworthy information on stolen wallets, ' +
  'fraudulent transactions, and malicious contracts. Operators coordinate openly to help ' +
  'off-ramps track and recover stolen funds across the ecosystem.';

export function OperatorsSection() {
  return (
    <section
      id="operators"
      className="border-t border-border/50 bg-gradient-to-b from-muted/20 to-background px-4 py-16 md:py-24"
    >
      <div className="mx-auto max-w-6xl">
        {/* Section heading */}
        <div className="mb-12 text-center md:mb-16">
          <Badge variant="secondary" className="mb-4">
            <Clock className="mr-1 size-3" />
            Coming Soon
          </Badge>
          <TextAnimate
            as="h2"
            animation="blurInUp"
            by="word"
            className="text-3xl font-bold tracking-tight md:text-4xl"
            startOnView
            once
          >
            Trusted Operator Program
          </TextAnimate>
          <TextAnimate
            as="p"
            animation="fadeIn"
            by="word"
            delay={0.3}
            className="mx-auto mt-4 max-w-3xl text-muted-foreground"
            startOnView
            once
          >
            DAO-approved entities with elevated on-chain registry access. Batch-submit fraud
            reports, catalog malicious contracts, and coordinate with other operators to protect the
            ecosystem at scale.
          </TextAnimate>
        </div>

        {/* Operator features */}
        <div className="mb-12 grid gap-6 md:grid-cols-3">
          {OPERATOR_FEATURES.map((feature) => (
            <Card
              key={feature.title}
              className="border-border/50 transition-all duration-300 hover:border-primary/30 hover:shadow-md"
            >
              <CardHeader className="pb-2">
                <div className="mb-3 flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {feature.icon}
                </div>
                <CardTitle className="text-lg">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm leading-relaxed">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Who can become an operator */}
        <div className="rounded-xl border border-border/50 bg-background p-6 md:p-8">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Users className="size-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold">Who Can Become an Operator?</h3>
              <p className="mt-1 text-sm text-muted-foreground">{OPERATOR_DESCRIPTION}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {POTENTIAL_OPERATORS.map((operator) => (
              <div key={operator.name} className="rounded-lg bg-muted/50 p-4">
                <div className="mb-1 flex items-center gap-2">
                  <Building2 className="size-4 text-primary" />
                  <span className="font-medium">{operator.name}</span>
                </div>
                <p className="text-xs text-muted-foreground">{operator.examples}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                Operator onboarding launching Q2 2025.
              </span>
              <br />
              Interested in becoming an operator? Join the discussion in our governance forum.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
