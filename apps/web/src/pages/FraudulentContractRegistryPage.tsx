/**
 * Fraudulent Contract Registry page - public overview and cli guide.
 */

import { Link } from 'wouter';
import { ArrowLeft, Database, Search, ShieldCheck, Terminal } from 'lucide-react';

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@swr/ui';
import { OperatorSubmitGuide } from '@/components/dashboard';

const SWR_CLI_URL = 'https://github.com/stolen-wallet-registry/cli';

const HIGHLIGHTS = [
  {
    title: 'Public transparency',
    description:
      'Anyone can view recent registrations, operator listings, and stats on the dashboard.',
    icon: <Search className="h-5 w-5" aria-hidden="true" />,
  },
  {
    title: 'Operator submissions',
    description:
      'Approved operators submit batch registrations via the SWR cli and Safe Transaction Builder.',
    icon: <ShieldCheck className="h-5 w-5" aria-hidden="true" />,
  },
  {
    title: 'Indexed and searchable',
    description:
      'Registrations are on-chain and indexed for quick lookups in the Search page and by responder teams (off-ramps, wallets, security firms) tracking potential recovery cases.',
    icon: <Database className="h-5 w-5" aria-hidden="true" />,
  },
];

export function FraudulentContractRegistryPage() {
  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-8 space-y-10">
      {/* Back link */}
      <Button variant="outline" size="sm" asChild>
        <Link href="/">
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>
      </Button>

      {/* Header */}
      <div className="text-center space-y-4">
        <Badge variant="secondary">Public registry</Badge>
        <h1 className="text-4xl font-bold tracking-tight">Fraudulent Contract Registry</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Public registry for malicious smart contracts. Anyone can search indexed data and view
          submissions on the dashboard. Approved operators submit batches via the{' '}
          <a
            href={SWR_CLI_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary/80"
          >
            SWR cli
          </a>
          .
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button asChild>
            <Link href="/dashboard?tab=operators">View Operators</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/search">Search Registry</Link>
          </Button>
        </div>
      </div>

      {/* Highlights */}
      <div className="grid gap-6 md:grid-cols-3">
        {HIGHLIGHTS.map((item) => (
          <Card key={item.title} className="border-border/60">
            <CardHeader className="pb-2">
              <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {item.icon}
              </div>
              <CardTitle className="text-lg">{item.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-sm leading-relaxed">
                {item.description}
              </CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* cli guide */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="text-2xl font-semibold">cli submission guide</h2>
        </div>
        <p className="text-muted-foreground">
          Operators submit batches using the SWR cli. The cli builds a Safe-compatible batch that
          can be uploaded to Safe Transaction Builder for signing and execution.
        </p>
        <OperatorSubmitGuide />
      </div>
    </div>
  );
}
