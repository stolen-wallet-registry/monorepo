'use client';

import { Search, ShieldAlert, Banknote, ListFilter, Eye, Database } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, TextAnimate } from '@swr/ui';

const LISTENER_USE_CASES = [
  {
    title: 'Fund Recovery',
    description:
      'Track stolen assets across chains. When funds move through registered wallets or transactions, off-ramps and exchanges can freeze or flag them before they exit.',
    icon: <Banknote className="size-6" aria-hidden="true" />,
  },
  {
    title: 'Airdrop Filtering',
    description:
      'Clean airdrop recipient lists by checking wallet addresses against the registry. Keep token distributions from reaching compromised or malicious wallets.',
    icon: <ListFilter className="size-6" aria-hidden="true" />,
  },
  {
    title: 'Contract Warnings',
    description:
      'Wallets and dApps can warn users before they interact with a flagged contract. A simple lookup before signing can prevent approvals to known malicious addresses.',
    icon: <ShieldAlert className="size-6" aria-hidden="true" />,
  },
  {
    title: 'Compliance Screening',
    description:
      'Exchanges and on-ramps can screen incoming deposits against registered wallets and transactions. A real-time data source for fraud-aware compliance workflows.',
    icon: <Search className="size-6" aria-hidden="true" />,
  },
  {
    title: 'Threat Monitoring',
    description:
      'Security tools can subscribe to registry events and surface new fraud reports as they happen. Real-time alerts when wallets, transactions, or contracts are flagged.',
    icon: <Eye className="size-6" aria-hidden="true" />,
  },
  {
    title: 'Open',
    description:
      'All registry data is on-chain and publicly indexed. No API keys, no gatekeepers. Anyone can query the data and decide how to use it.',
    icon: <Database className="size-6" aria-hidden="true" />,
  },
];

export function WhySWRSection() {
  return (
    <section id="why-swr" className="border-t border-border/50 px-4 py-16 md:py-24">
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
            A Data Layer for Fraud Intelligence
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
            SWR is an open registry. It aggregates fraud data from individuals and operators — what
            happens with that data is up to the listeners. Exchanges, wallets, security tools, and
            protocols each decide how to respond.
          </TextAnimate>
        </div>

        {/* Use case cards */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {LISTENER_USE_CASES.map((useCase) => (
            <Card
              key={useCase.title}
              className="border-border/50 transition-all duration-300 hover:border-primary/30 hover:shadow-md"
            >
              <CardHeader className="pb-2">
                <div className="mb-3 flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {useCase.icon}
                </div>
                <CardTitle className="text-lg">{useCase.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm leading-relaxed">
                  {useCase.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
