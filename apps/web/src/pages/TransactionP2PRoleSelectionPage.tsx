/**
 * P2P Role Selection page for Transaction Registration.
 *
 * Users choose whether they are the reporter (wallet owner) or relayer (gas payer).
 */

import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useAccount } from 'wagmi';
import { ArrowLeft, FileWarning, HandHelping } from 'lucide-react';

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@swr/ui';

interface RoleCardProps {
  title: string;
  description: string;
  icon: ReactNode;
  details: string[];
  onClick: () => void;
}

function RoleCard({ title, description, icon, details, onClick }: RoleCardProps) {
  return (
    <Card className="transition-all hover:border-primary hover:shadow-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 p-4 rounded-full bg-muted">{icon}</div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {details.map((detail, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-primary">•</span>
              {detail}
            </li>
          ))}
        </ul>
        <Button className="w-full mt-6" onClick={onClick}>
          Select
        </Button>
      </CardContent>
    </Card>
  );
}

export function TransactionP2PRoleSelectionPage() {
  const [, setLocation] = useLocation();
  const { isConnected } = useAccount();

  // Redirect if not connected
  useEffect(() => {
    if (!isConnected) setLocation('/');
  }, [isConnected, setLocation]);

  if (!isConnected) return null;

  const handleBack = () => {
    setLocation('/register/transactions');
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8">
      <Button variant="outline" onClick={handleBack} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Transaction Registry
      </Button>

      <div className="text-center space-y-4 mb-8">
        <h1 className="text-3xl font-bold tracking-tight">P2P Transaction Registration</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          P2P relay allows someone to register fraudulent transactions with help from a friend or
          volunteer who pays the gas fees.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <RoleCard
          title="I'm the Reporter"
          description="My transactions were fraudulent and I need help registering them"
          icon={<FileWarning className="h-8 w-8" />}
          details={[
            'Select fraudulent transactions from your wallet',
            'Sign messages with your wallet',
            'Connect to a relayer via peer-to-peer',
            'Your relayer pays all gas fees',
          ]}
          onClick={() => setLocation('/registration/transactions/p2p-relay/reporter')}
        />

        <RoleCard
          title="I'm the Relayer"
          description="I want to help someone register fraudulent transactions"
          icon={<HandHelping className="h-8 w-8" />}
          details={[
            'Share your Peer ID with the reporter',
            'Receive their signatures via P2P',
            'Submit transactions and pay gas fees',
            'Help protect on-chain activity',
          ]}
          onClick={() => setLocation('/registration/transactions/p2p-relay/relayer')}
        />
      </div>
    </div>
  );
}
