/**
 * Transaction registration method selection page.
 *
 * Entry point for users to choose their transaction registration method.
 */

import { useLocation, Link } from 'wouter';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ArrowLeft } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from '@swr/ui';
import { RegistrationMethodSelector } from '@/components/composed/RegistrationMethodSelector';
import {
  useTransactionRegistrationStore,
  type TransactionRegistrationType,
} from '@/stores/transactionRegistrationStore';

export function TransactionHomePage() {
  const [, setLocation] = useLocation();
  const { isConnected } = useAccount();
  const { setRegistrationType } = useTransactionRegistrationStore();
  const p2pAvailable = Boolean(import.meta.env.VITE_RELAY_MULTIADDR);

  const handleMethodSelect = (type: TransactionRegistrationType) => {
    setRegistrationType(type);

    // Navigate to the appropriate registration flow
    switch (type) {
      case 'standard':
        setLocation('/registration/transactions/standard');
        break;
      case 'selfRelay':
        setLocation('/registration/transactions/self-relay');
        break;
      case 'p2pRelay':
        setLocation('/registration/transactions/p2p-relay');
        break;
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Back link */}
      <Button variant="outline" size="sm" asChild>
        <Link href="/">
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>
      </Button>

      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">Report Fraudulent Transactions</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Register fraudulent transactions on-chain to help prevent fraud and enable recovery
          assistance.
        </p>
      </div>

      {!isConnected ? (
        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <CardTitle>Connect Your Wallet</CardTitle>
            <CardDescription>Connect a wallet to begin the registration process.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <ConnectButton />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-semibold mb-2">Choose Registration Method</h2>
            <p className="text-muted-foreground">
              Select the method that best fits your situation.
            </p>
          </div>

          <RegistrationMethodSelector
            onSelect={handleMethodSelect}
            p2pAvailable={p2pAvailable}
            registryType="transaction"
          />
        </div>
      )}
    </div>
  );
}
