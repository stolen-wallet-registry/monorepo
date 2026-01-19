/**
 * Soulbound page - Mint soulbound tokens.
 *
 * Allows users to:
 * - Mint a WalletSoulbound token (proof of registration, visible on NFT platforms)
 * - Donate and mint a SupportSoulbound token (anyone)
 */

import { useState } from 'react';
import { Link } from 'wouter';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ArrowLeft, Info } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Alert,
  AlertDescription,
} from '@swr/ui';
import { AddressInput } from '@/components/composed/AddressInput';
import { WalletSoulboundMintCard } from '@/components/composed/WalletSoulboundMintCard';
import { SupportSoulboundMintCard } from '@/components/composed/SupportSoulboundMintCard';
import type { Address } from '@/lib/types/ethereum';
import { isAddress } from 'viem';

export function SoulboundPage() {
  const { isConnected, address: connectedAddress } = useAccount();
  const [walletToMint, setWalletToMint] = useState<Address | undefined>(undefined);
  const [walletInput, setWalletInput] = useState('');
  const [showWalletInput, setShowWalletInput] = useState(false);

  // Handle address input for minting to a different wallet
  // Store raw input separately so partial addresses don't clear the field
  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setWalletInput(value);
    if (isAddress(value)) {
      setWalletToMint(value);
    } else {
      setWalletToMint(undefined);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Back link */}
      <Button variant="outline" size="sm" asChild>
        <Link href="/">
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>
      </Button>

      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">Soulbound Tokens</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Mint non-transferable soulbound tokens to mark your registration or support the registry
          infrastructure.
        </p>
      </div>

      {/* Connect wallet prompt */}
      {!isConnected && (
        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <CardTitle>Connect Your Wallet</CardTitle>
            <CardDescription>Connect a wallet to mint soulbound tokens.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <ConnectButton />
          </CardContent>
        </Card>
      )}

      {/* Main content - connected */}
      {isConnected && (
        <div className="grid gap-8 md:grid-cols-2">
          {/* Wallet Soulbound Section */}
          <div className="space-y-4">
            {/* Info alert */}
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Only wallets registered as stolen in the registry are eligible to mint.
              </AlertDescription>
            </Alert>

            {/* Toggle between connected wallet and custom address */}
            {!showWalletInput ? (
              <div className="space-y-3">
                {connectedAddress && <WalletSoulboundMintCard wallet={connectedAddress} />}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowWalletInput(true)}
                  className="w-full"
                >
                  Mint for a different wallet
                </Button>
              </div>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Mint for Another Wallet</CardTitle>
                  <CardDescription>
                    Enter the address of a registered wallet you want to mint for.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <AddressInput
                    value={walletInput}
                    onChange={handleAddressChange}
                    placeholder="0x..."
                  />
                  {walletToMint && <WalletSoulboundMintCard wallet={walletToMint} />}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowWalletInput(false);
                      setWalletToMint(undefined);
                      setWalletInput('');
                    }}
                    className="w-full"
                  >
                    Use connected wallet instead
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Support Soulbound Section */}
          <div>
            <SupportSoulboundMintCard />
          </div>
        </div>
      )}

      {/* Info section */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-lg">About Soulbound Tokens</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            Soulbound tokens (
            <a
              href="https://eips.ethereum.org/EIPS/eip-5192"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:text-primary/80"
            >
              ERC-5192
            </a>
            ) are non-transferable NFTs that remain permanently bound to their original recipient.
            They serve as on-chain proof of identity or achievement.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h4 className="font-medium text-foreground mb-1">Wallet Soulbound</h4>
              <p>
                Optional on-chain proof of your registration. Each registered wallet can mint
                exactly one token—you only pay gas.
              </p>
            </div>
            <div>
              <h4 className="font-medium text-foreground mb-1">Support Soulbound</h4>
              <p>
                Shows your support for fraud prevention in Web3. Mint as many as you like with each
                donation.
              </p>
            </div>
          </div>
          <div className="pt-4 border-t">
            <h4 className="font-medium text-foreground mb-1">Built for a Global Community</h4>
            <p>
              These tokens feature on-chain internationalization using SVG's native{' '}
              <a
                href="https://developer.mozilla.org/en-US/docs/Web/SVG/Element/switch"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:text-primary/80"
              >
                systemLanguage
              </a>{' '}
              feature. All 20+ translations are embedded directly in the on-chain artwork, allowing
              wallets and NFT platforms to automatically display text in the viewer's preferred
              language. If we're building borderless technology, it should be accessible to
              everyone.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
