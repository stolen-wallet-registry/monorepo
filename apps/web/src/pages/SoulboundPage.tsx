/**
 * Soulbound page - Mint commemorative soulbound tokens.
 *
 * Allows users to:
 * - Mint a WalletSoulbound token (if they have a registered wallet)
 * - Donate and mint a SupportSoulbound token (anyone)
 */

import { useState } from 'react';
import { Link } from 'wouter';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ArrowLeft, Award, Heart, Info } from 'lucide-react';

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
  const [showWalletInput, setShowWalletInput] = useState(false);

  // Handle address input for minting to a different wallet
  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
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
          Mint commemorative non-transferable tokens to mark your registration or support the
          registry.
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
            <div className="flex items-center gap-2">
              <Award className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-semibold">Wallet Soulbound</h2>
            </div>
            <p className="text-muted-foreground">
              Mint a soulbound token for a registered stolen wallet. One per wallet, forever
              non-transferable.
            </p>

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
                    value={walletToMint ?? ''}
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
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Heart className="h-6 w-6 text-pink-500" />
              <h2 className="text-2xl font-semibold">Support Soulbound</h2>
            </div>
            <p className="text-muted-foreground">
              Support the registry with a donation and receive a commemorative soulbound token.
              Unlimited mints per wallet.
            </p>

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
            Soulbound tokens (ERC-5192) are non-transferable NFTs that remain permanently bound to
            their original recipient. They serve as on-chain proof of identity or achievement.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h4 className="font-medium text-foreground mb-1">Wallet Soulbound</h4>
              <p>
                Commemorates your registration in the Stolen Wallet Registry. Each registered wallet
                can mint exactly one token, free of gas.
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
        </CardContent>
      </Card>
    </div>
  );
}
