/**
 * P2P Role Selection page.
 *
 * Users choose whether they are the registeree (wallet owner) or relayer (gas payer).
 */

import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useAccount } from 'wagmi';
import { ArrowLeft, User, HandHelping } from 'lucide-react';

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@swr/ui';
import { useRegistrySearch } from '@/hooks/indexer';

interface RoleCardProps {
  title: string;
  description: string;
  icon: ReactNode;
  details: string[];
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
}

function RoleCard({
  title,
  description,
  icon,
  details,
  onClick,
  disabled,
  disabledReason,
}: RoleCardProps) {
  return (
    <Card
      className={`transition-all ${disabled ? 'opacity-50' : 'hover:border-primary hover:shadow-md'}`}
    >
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
        <Button className="w-full mt-6" onClick={onClick} disabled={disabled}>
          Select
        </Button>
        {disabled && disabledReason && (
          <p className="text-xs text-yellow-600 dark:text-yellow-400 text-center mt-2">
            {disabledReason}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function P2PRoleSelectionPage() {
  const [, setLocation] = useLocation();
  const { isConnected, address } = useAccount();

  const { data: searchResult } = useRegistrySearch(address ?? '');
  const connectedWalletRegistered =
    searchResult?.type === 'address' && searchResult.foundInWalletRegistry;

  // Redirect if not connected
  useEffect(() => {
    if (!isConnected) setLocation('/');
  }, [isConnected, setLocation]);

  if (!isConnected) return null;

  const handleBack = () => {
    setLocation('/');
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8">
      <Button variant="outline" onClick={handleBack} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Home
      </Button>

      <div className="text-center space-y-4 mb-8">
        <h1 className="text-3xl font-bold tracking-tight">P2P Relay Registration</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          P2P relay allows someone to register their stolen wallet with help from a friend or
          volunteer who pays the gas fees.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <RoleCard
          title="I'm the Registeree"
          description="My wallet was stolen and I need help registering it"
          icon={<User className="h-8 w-8" />}
          details={[
            'Sign messages with your stolen wallet',
            'Connect to a relayer via peer-to-peer',
            'Your relayer pays all gas fees',
            'No funds needed in your stolen wallet',
          ]}
          onClick={() => setLocation('/registration/wallet/p2p-relay/registeree')}
          disabled={connectedWalletRegistered}
          disabledReason="Your connected wallet is already registered."
        />

        <RoleCard
          title="I'm the Relayer"
          description="I want to help someone register their stolen wallet"
          icon={<HandHelping className="h-8 w-8" />}
          details={[
            'Share your Peer ID with the registeree',
            'Receive their signatures via P2P',
            'Submit transactions and pay gas fees',
            'Help protect on-chain activity',
          ]}
          onClick={() => setLocation('/registration/wallet/p2p-relay/relayer')}
        />
      </div>
    </div>
  );
}
