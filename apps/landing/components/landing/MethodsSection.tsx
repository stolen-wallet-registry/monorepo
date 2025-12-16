'use client';

import { UserCheck, ArrowLeftRight, Users } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  TextAnimate,
  cn,
} from '@swr/ui';

const METHODS = [
  {
    title: 'Standard',
    description: 'Sign and pay from the same wallet you are registering as compromised.',
    useCase: 'Wallet compromised but you still have temporary access',
    icon: <UserCheck className="size-6" aria-hidden="true" />,
    highlight: false,
  },
  {
    title: 'Self-Relay',
    description: 'Sign with compromised wallet, pay gas fees from a different wallet.',
    useCase: 'Wallet drained but you have another funded wallet',
    icon: <ArrowLeftRight className="size-6" aria-hidden="true" />,
    highlight: true,
  },
  {
    title: 'P2P Relay',
    description: 'Sign with compromised wallet, trusted friend pays gas via libp2p relay.',
    useCase: 'Wallet completely compromised, no funds available',
    icon: <Users className="size-6" aria-hidden="true" />,
    highlight: false,
  },
];

export function MethodsSection() {
  return (
    <section id="methods" className="border-t border-border/50 px-4 py-16 md:py-24">
      <div className="mx-auto max-w-6xl">
        {/* Section heading */}
        <div className="mb-12 text-center md:mb-16">
          <TextAnimate
            as="h2"
            animation="scaleUp"
            by="word"
            className="text-3xl font-bold tracking-tight md:text-4xl"
            startOnView
            once
          >
            Multiple Ways to Register
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
            No matter your situation, there is a registration method that works for you.
          </TextAnimate>
        </div>

        {/* Method cards grid */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {METHODS.map((method) => (
            <Card
              key={method.title}
              className={cn(
                'relative overflow-hidden transition-all duration-300 hover:shadow-lg',
                method.highlight
                  ? 'border-primary/30 hover:border-primary/50'
                  : 'border-border/50 hover:border-border'
              )}
            >
              {method.highlight && (
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/0 via-primary to-primary/0" />
              )}
              <CardHeader className="pb-2">
                <div
                  className={cn(
                    'mb-3 flex size-12 items-center justify-center rounded-lg',
                    method.highlight
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {method.icon}
                </div>
                <CardTitle className="text-lg">{method.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <CardDescription className="text-sm leading-relaxed">
                  {method.description}
                </CardDescription>
                <div className="rounded-md bg-muted/50 px-3 py-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    <span className="font-semibold">Use case:</span> {method.useCase}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
