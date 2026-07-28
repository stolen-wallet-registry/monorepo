/**
 * Card component for minting a WalletSoulbound token.
 *
 * Displays eligibility status and mint button.
 * Only eligible (registered/pending) wallets can mint.
 */

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Alert,
  AlertDescription,
} from '@swr/ui';
import { getExplorerTxUrl } from '@/components/composed/ExplorerLink';
import { SoulboundPreviewModal } from '@/components/composed/SoulboundPreviewModal';
import { MintedTokenDisplay } from '@/components/composed/MintedTokenDisplay';
import { CrossChainMintStatusCard } from '@/components/composed/soulbound-mint/CrossChainMintStatusCard';
import { useMemo } from 'react';
import { WalletMintActions } from './WalletMintActions';
import { WalletAlreadyMintedCard, WalletMintSuccessCard } from './WalletMintedCard';
import { useWalletMintFlow } from './useWalletMintFlow';
import { cn } from '@/lib/utils';
import { Loader2, AlertCircle, Award } from 'lucide-react';
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
  const {
    language,
    setLanguage,
    canMint,
    reason,
    isLoading,
    hasMinted,
    walletSoulboundAddress,
    tokenId,
    isLoadingTokenId,
    isPending,
    isConfirming,
    isConfirmed,
    isError,
    error,
    hash,
    isOnHubChain,
    hubChainId,
    isMinting,
    handleMint,
    crossChainFee,
    isOnSpokeChain,
    isLoadingFee,
    isFeeError,
    feeError,
    isCrossChainPending,
    isCrossChainConfirming,
    isCrossChainConfirmed,
    isCrossChainError,
    crossChainError,
    crossChainHash,
    isCrossChainMinting,
    gasEstimate,
    isLoadingGas,
    ethPrice,
    handleCrossChainMint,
    confirmationStatus,
    messageId,
    explorerUrl,
    isMintedOnHub,
    elapsedTime,
    mintedSpokeChainId,
    hubChainName,
    currentChainName,
    mintedSpokeChainName,
    isSwitching,
    handleSwitchChain,
    handleReset,
  } = useWalletMintFlow(wallet, onSuccess);

  // Group the flow state into stable objects - inline literals would be new on every
  // render and defeat memoisation downstream.
  const chain = useMemo(
    () => ({ hubChainName, currentChainName, isOnHubChain, isOnSpokeChain }),
    [hubChainName, currentChainName, isOnHubChain, isOnSpokeChain]
  );
  const hubMint = useMemo(
    () => ({ isPending, isConfirming, isMinting, isError, error }),
    [isPending, isConfirming, isMinting, isError, error]
  );
  const crossChainMint = useMemo(
    () => ({
      isPending: isCrossChainPending,
      isConfirming: isCrossChainConfirming,
      isMinting: isCrossChainMinting,
      isError: isCrossChainError,
      error: crossChainError,
    }),
    [
      isCrossChainPending,
      isCrossChainConfirming,
      isCrossChainMinting,
      isCrossChainError,
      crossChainError,
    ]
  );
  const cost = useMemo(
    () => ({
      fee: crossChainFee,
      isLoadingFee,
      isFeeError,
      feeError,
      gas: gasEstimate,
      isLoadingGas,
      ethPrice,
    }),
    [crossChainFee, isLoadingFee, isFeeError, feeError, gasEstimate, isLoadingGas, ethPrice]
  );

  // Already minted state - show the minted NFT
  if (hasMinted && !isLoading) {
    return (
      <WalletAlreadyMintedCard
        className={className}
        contractAddress={walletSoulboundAddress}
        tokenId={tokenId}
        isLoadingTokenId={isLoadingTokenId}
      />
    );
  }

  // Cross-chain mint confirmation state (message dispatched, waiting for hub mint)
  if (isCrossChainConfirmed && crossChainHash) {
    const isConfirmedOnHub = isMintedOnHub || confirmationStatus === 'confirmed';
    const isPolling = confirmationStatus === 'polling' || confirmationStatus === 'waiting';
    const isTimeout = confirmationStatus === 'timeout';
    const elapsedSeconds = Math.floor(elapsedTime / 1000);

    return (
      <CrossChainMintStatusCard
        className={className}
        icon={<Award className="h-5 w-5 text-primary" />}
        title="Wallet Soulbound Token"
        isConfirmedOnHub={isConfirmedOnHub}
        isPolling={isPolling}
        isTimeout={isTimeout}
        elapsedSeconds={elapsedSeconds}
        successMessage={`Success! Your wallet soulbound token has been minted on ${hubChainName}.`}
        pendingMessage={`Cross-chain mint request sent! Waiting for confirmation on ${hubChainName}...`}
        tokenDisplay={
          tokenId > 0n && walletSoulboundAddress ? (
            <MintedTokenDisplay
              contractAddress={walletSoulboundAddress}
              tokenId={tokenId}
              type="wallet"
              size={320}
            />
          ) : null
        }
        spokeChainName={mintedSpokeChainName}
        spokeHash={crossChainHash}
        spokeExplorerHref={getExplorerTxUrl(mintedSpokeChainId ?? hubChainId, crossChainHash)}
        messageId={messageId}
        explorerUrl={explorerUrl}
        footerNote={`The Hyperlane relayer will deliver your mint request to ${hubChainName}. You can check back in a few minutes to see your minted token.`}
        resetLabel={isConfirmedOnHub ? 'Done' : 'Close'}
        onReset={handleReset}
      />
    );
  }

  // Direct hub mint success state
  if (isConfirmed && hash) {
    return (
      <WalletMintSuccessCard
        className={className}
        contractAddress={walletSoulboundAddress}
        tokenId={tokenId}
        isLoadingTokenId={isLoadingTokenId}
        hash={hash}
        hubChainId={hubChainId}
        onReset={handleReset}
      />
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
          Optionally mint a soulbound token as on-chain proof of your wallet registration
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
            <SoulboundPreviewModal
              type="wallet"
              initialLanguage={language}
              onLanguageChange={setLanguage}
              className="w-full"
            />
          </>
        )}

        {/* Eligible - show mint UI */}
        {!isLoading && canMint && (
          <>
            {/* Preview button only - language is auto-detected, modal allows override */}
            <SoulboundPreviewModal
              type="wallet"
              initialLanguage={language}
              onLanguageChange={setLanguage}
              className="w-full"
            />

            <WalletMintActions
              chain={chain}
              hubMint={hubMint}
              crossChainMint={crossChainMint}
              cost={cost}
              isSwitching={isSwitching}
              onMint={handleMint}
              onCrossChainMint={handleCrossChainMint}
              onSwitchChain={handleSwitchChain}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
