/**
 * Card component for minting a SupportSoulbound token with a donation.
 *
 * Allows anyone to support the registry by donating and receiving
 * a commemorative soulbound token.
 */

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@swr/ui';
import { getExplorerTxUrl } from '@/components/composed/ExplorerLink';
import { SoulboundPreviewModal } from '@/components/composed/SoulboundPreviewModal';
import { MintedTokenDisplay } from '@/components/composed/MintedTokenDisplay';
import { CrossChainMintStatusCard } from '@/components/composed/soulbound-mint/CrossChainMintStatusCard';
import { useMemo } from 'react';
import { DonationAmountField } from './DonationAmountField';
import { SupportMintActions } from './SupportMintActions';
import { SupportMintSuccessCard, SupportPreviousTokens } from './SupportMintedTokens';
import { useSupportMintFlow } from './useSupportMintFlow';
import { cn } from '@/lib/utils';
import { Loader2, Heart } from 'lucide-react';
import type { Hash } from '@/lib/types/ethereum';

export interface SupportSoulboundMintCardProps {
  /** Callback when mint succeeds */
  onSuccess?: (txHash: Hash) => void;
  /** Additional class names */
  className?: string;
}

/**
 * Card for minting a SupportSoulbound token with donation.
 *
 * @example
 * ```tsx
 * <SupportSoulboundMintCard
 *   onSuccess={(hash) => console.log('Thank you!', hash)}
 * />
 * ```
 */
export function SupportSoulboundMintCard({ onSuccess, className }: SupportSoulboundMintCardProps) {
  const {
    language,
    setLanguage,
    ethInput,
    usdInput,
    donationWei,
    minWei,
    isLoadingMin,
    isValidAmount,
    ethPrice,
    handleEthChange,
    handleUsdChange,
    handlePresetClick,
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
    supportSoulboundAddress,
    existingTokenIds,
    latestTokenId,
    isLoadingTokens,
    isFetchingTokens,
    hasPreviousTokens,
    handleReset,
  } = useSupportMintFlow(onSuccess);

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

  // Cross-chain mint confirmation state (message dispatched, waiting for hub mint)
  if (isCrossChainConfirmed && crossChainHash) {
    const isConfirmedOnHub = isMintedOnHub || confirmationStatus === 'confirmed';
    const isPolling = confirmationStatus === 'polling' || confirmationStatus === 'waiting';
    const isTimeout = confirmationStatus === 'timeout';
    const elapsedSeconds = Math.floor(elapsedTime / 1000);

    return (
      <CrossChainMintStatusCard
        className={className}
        icon={<Heart className="h-5 w-5 text-pink-500" fill="currentColor" />}
        title="Support the Registry"
        isConfirmedOnHub={isConfirmedOnHub}
        isPolling={isPolling}
        isTimeout={isTimeout}
        elapsedSeconds={elapsedSeconds}
        successMessage={`Success! Your support token has been minted on ${hubChainName}.`}
        pendingMessage={`Cross-chain request sent! Waiting for confirmation on ${hubChainName}...`}
        tokenDisplay={
          latestTokenId !== null && supportSoulboundAddress ? (
            <MintedTokenDisplay
              contractAddress={supportSoulboundAddress}
              tokenId={latestTokenId}
              type="support"
              size={320}
            />
          ) : null
        }
        spokeChainName={mintedSpokeChainName}
        spokeHash={crossChainHash}
        spokeExplorerHref={getExplorerTxUrl(mintedSpokeChainId ?? hubChainId, crossChainHash)}
        messageId={messageId}
        explorerUrl={explorerUrl}
        footerNote={`The Hyperlane relayer will deliver your donation request to ${hubChainName}. Your donation is held on ${mintedSpokeChainName} and will be collected by the treasury.`}
        resetLabel={isConfirmedOnHub ? 'Make Another Donation' : 'Done'}
        onReset={handleReset}
      />
    );
  }

  // Direct hub mint success state
  if (isConfirmed && hash) {
    return (
      <SupportMintSuccessCard
        className={className}
        contractAddress={supportSoulboundAddress}
        latestTokenId={latestTokenId}
        isLoadingTokens={isLoadingTokens}
        isFetchingTokens={isFetchingTokens}
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
          <Heart className="h-5 w-5 text-pink-500" fill="currentColor" />
          Support the Registry
        </CardTitle>
        <CardDescription>
          Donate to support the registry and receive a commemorative soulbound token
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Donation amount inputs */}
        <DonationAmountField
          ethInput={ethInput}
          usdInput={usdInput}
          onEthChange={handleEthChange}
          onUsdChange={handleUsdChange}
          onPresetClick={handlePresetClick}
          isMinting={isMinting}
          ethPrice={ethPrice}
          showMinimumWarning={!isLoadingMin && minWei > 0n && donationWei > 0n && !isValidAmount}
          minWei={minWei}
        />

        {/* Preview button only - language is auto-detected, modal allows override */}
        <SoulboundPreviewModal
          type="support"
          initialLanguage={language}
          onLanguageChange={setLanguage}
          className="w-full"
        />

        <SupportMintActions
          chain={chain}
          ethInput={ethInput}
          isValidAmount={isValidAmount}
          hubMint={hubMint}
          crossChainMint={crossChainMint}
          cost={cost}
          isSwitching={isSwitching}
          onMint={handleMint}
          onCrossChainMint={handleCrossChainMint}
          onSwitchChain={handleSwitchChain}
        />

        {/* Show previously minted tokens */}
        {hasPreviousTokens && supportSoulboundAddress && (
          <SupportPreviousTokens
            contractAddress={supportSoulboundAddress}
            tokenIds={existingTokenIds}
          />
        )}
        {(isLoadingTokens || isFetchingTokens) && !isConfirmed && (
          <div className="flex justify-center py-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
