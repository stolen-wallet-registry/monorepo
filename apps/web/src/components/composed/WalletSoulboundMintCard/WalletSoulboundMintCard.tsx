/**
 * Card component for minting a WalletSoulbound token.
 *
 * Displays eligibility status, language selector, and mint button.
 * Only eligible (registered/pending) wallets can mint.
 */

import { useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Alert,
  AlertDescription,
} from '@swr/ui';
import { useCanMint, useHasMinted, useMintWalletSoulbound } from '@/hooks/soulbound';
import { LanguageSelector } from '@/components/composed/LanguageSelector';
import { SoulboundPreviewModal } from '@/components/composed/SoulboundPreviewModal';
import { cn, sanitizeErrorMessage } from '@/lib/utils';
import { Loader2, Check, AlertCircle, Award } from 'lucide-react';
import type { Address, Hash } from '@/lib/types/ethereum';

export interface WalletSoulboundMintCardProps {
  /** Wallet address to mint for */
  wallet: Address;
  /** Callback when mint succeeds */
  onSuccess?: (txHash: Hash) => void;
  /** Additional class names */
  className?: string;
}

/**
 * Card for minting a WalletSoulbound token.
 *
 * Checks eligibility and allows minting with language selection.
 *
 * @example
 * ```tsx
 * <WalletSoulboundMintCard
 *   wallet={registeredWallet}
 *   onSuccess={(hash) => console.log('Minted!', hash)}
 * />
 * ```
 */
export function WalletSoulboundMintCard({
  wallet,
  onSuccess,
  className,
}: WalletSoulboundMintCardProps) {
  const [language, setLanguage] = useState('en');

  const { canMint, reason, isLoading: isCheckingEligibility } = useCanMint({ address: wallet });
  const { hasMinted, isLoading: isCheckingMinted } = useHasMinted({ address: wallet });
  const { mint, isPending, isConfirming, isConfirmed, isError, error, hash, reset } =
    useMintWalletSoulbound();

  const isLoading = isCheckingEligibility || isCheckingMinted;
  const isMinting = isPending || isConfirming;

  const handleMint = async () => {
    try {
      const txHash = await mint({ wallet, language });
      onSuccess?.(txHash);
    } catch {
      // Error is handled by the hook
    }
  };

  // Already minted state
  if (hasMinted && !isLoading) {
    return (
      <Card className={cn('', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-primary" />
            Wallet Soulbound Token
          </CardTitle>
          <CardDescription>Commemorative NFT for registered stolen wallets</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Check className="h-4 w-4" />
            <AlertDescription>This wallet has already minted its soulbound token.</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Success state
  if (isConfirmed && hash) {
    return (
      <Card className={cn('', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-primary" />
            Wallet Soulbound Token
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950">
            <Check className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700 dark:text-green-300">
              Successfully minted your Wallet Soulbound token!
            </AlertDescription>
          </Alert>
          <p className="text-sm text-muted-foreground">
            Transaction: {hash.slice(0, 10)}...{hash.slice(-8)}
          </p>
          <Button variant="outline" onClick={reset} className="w-full">
            Done
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="h-5 w-5 text-primary" />
          Wallet Soulbound Token
        </CardTitle>
        <CardDescription>
          Mint a commemorative non-transferable NFT for your registered wallet
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Not eligible */}
        {!isLoading && !canMint && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {reason || 'This wallet is not eligible to mint a soulbound token.'}
            </AlertDescription>
          </Alert>
        )}

        {/* Eligible - show mint UI */}
        {!isLoading && canMint && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Language</label>
                <SoulboundPreviewModal
                  type="wallet"
                  initialLanguage={language}
                  onLanguageChange={setLanguage}
                />
              </div>
              <LanguageSelector
                value={language}
                onChange={setLanguage}
                disabled={isMinting}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                The language for your on-chain SVG artwork
              </p>
            </div>

            {/* Error state */}
            {isError && error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{sanitizeErrorMessage(error)}</AlertDescription>
              </Alert>
            )}

            <Button onClick={handleMint} disabled={isMinting} className="w-full" size="lg">
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Confirm in wallet...
                </>
              ) : isConfirming ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Minting...
                </>
              ) : (
                'Mint Soulbound Token'
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Free to mint - you only pay gas
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
