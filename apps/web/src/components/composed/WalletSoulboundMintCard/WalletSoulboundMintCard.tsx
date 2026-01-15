/**
 * Card component for minting a WalletSoulbound token.
 *
 * Displays eligibility status and mint button.
 * Only eligible (registered/pending) wallets can mint.
 */

import { useState, useEffect } from 'react';
import { useSwitchChain } from 'wagmi';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Alert,
  AlertDescription,
  Label,
} from '@swr/ui';
import {
  useCanMint,
  useHasMinted,
  useMintWalletSoulbound,
  useWalletTokenId,
} from '@/hooks/soulbound';
import { ExplorerLink, getExplorerTxUrl } from '@/components/composed/ExplorerLink';
import { SoulboundPreviewModal } from '@/components/composed/SoulboundPreviewModal';
import { MintedTokenDisplay } from '@/components/composed/MintedTokenDisplay';
import { cn, sanitizeErrorMessage } from '@/lib/utils';
import { getChainName } from '@/lib/chains/config';
import { getWalletSoulboundAddress } from '@/lib/contracts/addresses';
import { getBrowserLanguage } from '@/lib/browser';
import { Loader2, Check, AlertCircle, Award, ArrowRightLeft } from 'lucide-react';
import type { Address, Hash } from '@/lib/types/ethereum';

export interface WalletSoulboundMintCardProps {
  /** Wallet address to mint for */
  wallet: Address;
  /** Callback when mint transaction is submitted (not confirmed) */
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
  // Language defaults to browser language, can be overridden via preview modal
  const [language, setLanguage] = useState(getBrowserLanguage);

  const { canMint, reason, isLoading: isCheckingEligibility } = useCanMint({ address: wallet });
  const {
    hasMinted,
    isLoading: isCheckingMinted,
    refetch: refetchHasMinted,
  } = useHasMinted({
    address: wallet,
  });
  const {
    mint,
    isPending,
    isConfirming,
    isConfirmed,
    isError,
    error,
    hash,
    reset,
    isOnHubChain,
    hubChainId,
  } = useMintWalletSoulbound();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  // Get tokenId for displaying minted NFT (enabled when already minted OR after confirmation)
  const { tokenId, isLoading: isLoadingTokenId } = useWalletTokenId({
    wallet,
    enabled: hasMinted || isConfirmed,
  });

  // Resolve contract address safely (can throw for unconfigured chains)
  let walletSoulboundAddress: ReturnType<typeof getWalletSoulboundAddress> | undefined;
  try {
    walletSoulboundAddress = getWalletSoulboundAddress(hubChainId);
  } catch {
    walletSoulboundAddress = undefined;
  }

  const isLoading = isCheckingEligibility || isCheckingMinted;
  const isMinting = isPending || isConfirming;
  const hubChainName = getChainName(hubChainId);

  const handleSwitchChain = () => {
    switchChain({ chainId: hubChainId });
  };

  // Refetch hasMinted when mint confirms so "Done" shows correct state
  useEffect(() => {
    if (isConfirmed) {
      refetchHasMinted();
    }
  }, [isConfirmed, refetchHasMinted]);

  const handleMint = async () => {
    try {
      const txHash = await mint({ wallet });
      onSuccess?.(txHash);
    } catch {
      // Error is handled by the hook
    }
  };

  // Already minted state - show the minted NFT
  if (hasMinted && !isLoading) {
    return (
      <Card className={cn('', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-primary" />
            Wallet Soulbound Token
          </CardTitle>
          <CardDescription>On-chain proof your wallet is in the registry</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Check className="h-4 w-4" />
            <AlertDescription>This wallet has already minted its soulbound token.</AlertDescription>
          </Alert>

          {/* Display the minted NFT */}
          {tokenId > 0n && walletSoulboundAddress && (
            <div className="flex justify-center py-4">
              <MintedTokenDisplay
                contractAddress={walletSoulboundAddress!}
                tokenId={tokenId}
                type="wallet"
                size={320}
              />
            </div>
          )}
          {isLoadingTokenId && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
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

          {/* Display minted NFT */}
          {tokenId > 0n && walletSoulboundAddress && (
            <div className="flex justify-center py-4">
              <MintedTokenDisplay
                contractAddress={walletSoulboundAddress!}
                tokenId={tokenId}
                type="wallet"
                size={320}
              />
            </div>
          )}
          {isLoadingTokenId && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Transaction</Label>
            <ExplorerLink value={hash} href={getExplorerTxUrl(hubChainId, hash)} />
          </div>
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
          Optionally mint a soulbound token as on-chain proof of your registration
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
          <>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {reason || 'This wallet is not eligible to mint a soulbound token.'}
              </AlertDescription>
            </Alert>
            {/* Still allow preview even when not eligible */}
            <div className="flex justify-end">
              <SoulboundPreviewModal
                type="wallet"
                initialLanguage={language}
                onLanguageChange={setLanguage}
              />
            </div>
          </>
        )}

        {/* Eligible - show mint UI */}
        {!isLoading && canMint && (
          <>
            {/* Preview button only - language is auto-detected, modal allows override */}
            <div className="flex justify-end">
              <SoulboundPreviewModal
                type="wallet"
                initialLanguage={language}
                onLanguageChange={setLanguage}
              />
            </div>

            {/* Wrong chain warning */}
            {!isOnHubChain && (
              <Alert>
                <ArrowRightLeft className="h-4 w-4" />
                <AlertDescription>
                  Wallet soulbound tokens are minted on {hubChainName}. Please switch chains to
                  mint.
                </AlertDescription>
              </Alert>
            )}

            {/* Error state */}
            {isError && error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{sanitizeErrorMessage(error)}</AlertDescription>
              </Alert>
            )}

            {/* Show switch button when on wrong chain, mint button when on hub */}
            {!isOnHubChain ? (
              <Button
                onClick={handleSwitchChain}
                disabled={isSwitching}
                className="w-full"
                size="lg"
              >
                {isSwitching ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Switching...
                  </>
                ) : (
                  <>
                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                    Switch to {hubChainName}
                  </>
                )}
              </Button>
            ) : (
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
            )}

            <p className="text-xs text-center text-muted-foreground">
              Free to mint - you only pay gas
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
