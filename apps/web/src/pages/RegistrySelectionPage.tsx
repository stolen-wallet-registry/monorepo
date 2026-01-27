/**
 * Registry selection page - Entry point for the app.
 *
 * Users choose which registry type they want to interact with.
 */

import { useLocation } from 'wouter';
import { Wallet, FileText, Code2 } from 'lucide-react';
import { RegistryCard } from '@/components/composed/RegistryCard';

const REGISTRIES = [
  {
    id: 'wallet',
    title: 'Stolen Wallets',
    description:
      'Register wallets you no longer control. Self-attestation with wallet signature provides high trust signal for fraud prevention.',
    icon: <Wallet className="size-6" />,
    path: '/register/wallet',
  },
  {
    id: 'transaction',
    title: 'Stolen Transactions',
    description:
      'Report specific fraudulent transactions like phishing attacks, address poisoning, or unauthorized transfers.',
    icon: <FileText className="size-6" />,
    path: '/register/transactions',
  },
  {
    id: 'contract',
    title: 'Fraudulent Contracts',
    description:
      'Public registry for malicious smart contracts. Anyone can search indexed data and view submissions on the dashboard. Approved operators submit batches via the SWR cli.',
    icon: <Code2 className="size-6" />,
    badge: { label: 'Operators Only', variant: 'outline' as const },
    path: '/registry/contracts',
  },
];

export function RegistrySelectionPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-8 md:py-16">
      {/* Header */}
      <div className="mb-12 text-center md:mb-16">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Stolen Wallet Registry</h1>
        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
          An on-chain coordination system for tracking stolen wallets, fraudulent transactions, and
          malicious contracts. Choose the type of fraud you want to report.
        </p>
      </div>

      {/* Registry cards grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {REGISTRIES.map((registry) => (
          <RegistryCard
            key={registry.id}
            title={registry.title}
            description={registry.description}
            icon={registry.icon}
            badge={registry.badge}
            onClick={() => setLocation(registry.path)}
          />
        ))}
      </div>
    </div>
  );
}
