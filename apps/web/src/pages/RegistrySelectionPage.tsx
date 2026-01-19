/**
 * Registry selection page - Entry point for the app.
 *
 * Users choose which registry type they want to interact with.
 * Currently only Stolen Wallets is active, others are coming soon.
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
    status: 'active' as const,
    icon: <Wallet className="size-6" />,
    path: '/register/wallet',
  },
  {
    id: 'transaction',
    title: 'Stolen Transactions',
    description:
      'Report specific fraudulent transactions like phishing attacks, address poisoning, or unauthorized transfers.',
    status: 'active' as const,
    icon: <FileText className="size-6" />,
    path: '/register/transactions',
  },
  {
    id: 'contract',
    title: 'Fraudulent Contracts',
    description:
      'Catalog malicious smart contract addresses. Operator-approved submissions for known scam patterns.',
    status: 'coming-soon' as const,
    icon: <Code2 className="size-6" />,
    path: null,
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
            status={registry.status}
            icon={registry.icon}
            onClick={registry.path ? () => setLocation(registry.path!) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
