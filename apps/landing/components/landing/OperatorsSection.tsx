'use client';

import { Building2, FileStack, Key, Terminal, Users, ExternalLink } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, TextAnimate } from '@swr/ui';

const OPERATOR_FEATURES = [
  {
    title: 'Batch Registration',
    description:
      'Submit wallets, transactions, and contracts in bulk. Operators pack hundreds of entries into a single transaction — built for organizations processing fraud data at scale.',
    icon: <FileStack className="size-6" aria-hidden="true" />,
  },
  {
    title: 'Per-Registry Permissions',
    description:
      'Each operator is approved for specific registries via capability bits. Wallet, transaction, and contract access are granted independently. The contract registry is operator-exclusive.',
    icon: <Key className="size-6" aria-hidden="true" />,
  },
  {
    title: 'CLI & Multisig Support',
    description:
      'Submit batches via command line or build unsigned transactions for Safe multisig approval. No private key required for the build step — teams review and sign together.',
    icon: <Terminal className="size-6" aria-hidden="true" />,
  },
];

const POTENTIAL_OPERATORS = [
  { name: 'Exchanges', examples: 'Coinbase, Kraken, Binance, Gemini' },
  { name: 'Security Firms', examples: 'Chainalysis, SEAL Team, Elliptic' },
  { name: 'Wallets', examples: 'MetaMask, Rainbow, Ledger' },
  { name: 'Protocols & DAOs', examples: 'Uniswap, Aave, MakerDAO' },
];

const OPERATOR_DESCRIPTION =
  'Any organization the DAO approves to submit fraud data. Operators are typically exchanges, ' +
  'security firms, wallet providers, or protocols with access to fraud intelligence at scale. ' +
  'Each operator gets permissioned access to specific registries based on their role.';

export function OperatorsSection() {
  return (
    <section
      id="operators"
      className="border-t border-border/50 bg-gradient-to-b from-muted/20 to-background px-4 py-16 md:py-24"
    >
      <div className="mx-auto max-w-6xl">
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
            DAO-approved organizations that batch-submit fraud data across the wallet, transaction,
            and contract registries. Operators bypass the individual two-phase signature flow,
            making bulk submissions gas-efficient.
          </TextAnimate>
          <a
            href="https://monorepo-docs-sepia.vercel.app/operator"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            Operator documentation
            <ExternalLink className="size-3.5" />
          </a>
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
        </div>
      </div>
    </section>
  );
}
