/**
 * Card component for minting a SupportSoulbound token with a donation.
 *
 * Allows anyone to support the registry by donating and receiving
 * a commemorative soulbound token.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
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
  Input,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@swr/ui';
import {
  useMinDonation,
  useMintSupportSoulbound,
  useSupportTokens,
  useQuoteCrossChainMintFee,
  useCrossChainSupportMint,
  useCrossChainMintGasEstimate,
  useCrossChainSoulboundConfirmation,
} from '@/hooks/soulbound';
import { useEthPrice } from '@/hooks/useEthPrice';
import { ExplorerLink, getExplorerTxUrl } from '@/components/composed/ExplorerLink';
import { SoulboundPreviewModal } from '@/components/composed/SoulboundPreviewModal';
import { MintedTokenDisplay } from '@/components/composed/MintedTokenDisplay';
import { cn, sanitizeErrorMessage } from '@/lib/utils';
import { getChainName } from '@/lib/chains/config';
import { getSupportSoulboundAddress } from '@/lib/contracts/addresses';
import { getBrowserLanguage } from '@/lib/browser';
import { useAccount, useSwitchChain } from 'wagmi';
import {
  Loader2,
  Check,
  AlertCircle,
  Heart,
  ArrowRightLeft,
  Send,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { formatEther, parseEther } from 'viem';
import type { Hash } from '@/lib/types/ethereum';

/** Preset donation amounts in ETH for quick selection */
const DONATION_PRESETS = [0.001, 0.005, 0.01, 0.05, 0.1] as const;

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
  // Language defaults to browser language, can be overridden via preview modal
  const [language, setLanguage] = useState(getBrowserLanguage);
  const [ethInput, setEthInput] = useState('0.01');
  const [usdInput, setUsdInput] = useState('');
  const lastInputRef = useRef<'eth' | 'usd'>('eth');
  // Capture spoke chain ID at mint time so confirmation uses correct chain even if user switches
  const [mintedSpokeChainId, setMintedSpokeChainId] = useState<number | undefined>(undefined);

  const { address: connectedAddress } = useAccount();
  const { minWei, isLoading: isLoadingMin } = useMinDonation();
  const { data: ethPriceData } = useEthPrice();
  // Direct hub mint hook
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
  } = useMintSupportSoulbound();

  // Cross-chain mint hooks (for spoke chains)
  const {
    data: crossChainFee,
    isOnSpokeChain,
    currentChainId,
    isLoading: isLoadingFee,
    isError: isFeeError,
    error: feeError,
  } = useQuoteCrossChainMintFee();
  const {
    requestMint: requestCrossChainMint,
    isPending: isCrossChainPending,
    isConfirming: isCrossChainConfirming,
    isConfirmed: isCrossChainConfirmed,
    isError: isCrossChainError,
    error: crossChainError,
    hash: crossChainHash,
    reset: resetCrossChain,
  } = useCrossChainSupportMint();

  // Cross-chain confirmation tracking (polls hub chain for mint completion)
  const {
    status: confirmationStatus,
    messageId,
    explorerUrl,
    isMintedOnHub,
    elapsedTime,
    reset: resetConfirmation,
  } = useCrossChainSoulboundConfirmation({
    spokeHash: crossChainHash,
    spokeChainId: mintedSpokeChainId,
    mintType: 'support',
    wallet: connectedAddress,
    enabled: isCrossChainConfirmed && !!crossChainHash && !!connectedAddress,
  });

  const { switchChain, isPending: isSwitching } = useSwitchChain();

  // Get tokens for displaying minted NFT (always enabled if connected)
  const {
    tokenIds: existingTokenIds,
    latestTokenId,
    refetch: refetchTokens,
    isLoading: isLoadingTokens,
    isFetching: isFetchingTokens,
  } = useSupportTokens({
    supporter: connectedAddress,
    enabled: !!connectedAddress,
  });

  // Check if user has any previously minted tokens
  const hasPreviousTokens = existingTokenIds.length > 0 && !isConfirmed;

  const hubChainName = getChainName(hubChainId);
  const currentChainName = currentChainId ? getChainName(currentChainId) : 'current chain';
  // Use the captured spoke chain for display after mint is initiated
  const mintedSpokeChainName = mintedSpokeChainId
    ? getChainName(mintedSpokeChainId)
    : currentChainName;
  const isCrossChainMinting = isCrossChainPending || isCrossChainConfirming;

  const handleSwitchChain = () => {
    switchChain({ chainId: hubChainId });
  };

  // Resolve contract address safely (mirrors hook pattern)
  let supportSoulboundAddress: ReturnType<typeof getSupportSoulboundAddress> | undefined;
  try {
    supportSoulboundAddress = getSupportSoulboundAddress(hubChainId);
  } catch {
    supportSoulboundAddress = undefined;
  }

  const isMinting = isPending || isConfirming;
  const ethPrice = ethPriceData?.usd ?? 0;

  // Parse ETH input to wei
  const donationWei = useMemo(() => {
    try {
      const value = parseFloat(ethInput);
      if (isNaN(value) || value <= 0) return 0n;
      return parseEther(value.toString());
    } catch {
      return 0n;
    }
  }, [ethInput]);

  // Gas estimate for cross-chain mint
  const { data: gasEstimate, isLoading: isLoadingGas } = useCrossChainMintGasEstimate({
    mintType: 'support',
    donationWei,
    feeWei: crossChainFee?.feeWei,
    enabled: isOnSpokeChain && !!crossChainFee && donationWei > 0n,
  });

  // Calculate USD from ETH
  const calculatedUsd = useMemo(() => {
    const ethValue = parseFloat(ethInput);
    if (isNaN(ethValue) || !ethPrice) return '';
    return (ethValue * ethPrice).toFixed(2);
  }, [ethInput, ethPrice]);

  // Update USD display when ETH changes (only if ETH was last input)
  useEffect(() => {
    if (lastInputRef.current === 'eth' && calculatedUsd) {
      setUsdInput(calculatedUsd);
    }
  }, [calculatedUsd]);

  // Handle ETH input change
  const handleEthChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    lastInputRef.current = 'eth';
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setEthInput(value);
    }
  }, []);

  // Handle USD input change and convert to ETH
  const handleUsdChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      lastInputRef.current = 'usd';
      const value = e.target.value;
      if (value === '' || /^\d*\.?\d*$/.test(value)) {
        setUsdInput(value);
        const usdValue = parseFloat(value);
        if (!isNaN(usdValue) && ethPrice > 0) {
          const ethValue = usdValue / ethPrice;
          setEthInput(ethValue.toFixed(6).replace(/\.?0+$/, ''));
        } else if (value === '') {
          setEthInput('');
        }
      }
    },
    [ethPrice]
  );

  // Handle preset button click
  const handlePresetClick = useCallback((amount: number) => {
    lastInputRef.current = 'eth';
    setEthInput(amount.toString());
  }, []);

  // Check if valid (meets minimum)
  const isValidAmount = donationWei > 0n && donationWei >= minWei;

  // Direct hub mint handler
  const handleMint = async () => {
    if (!isValidAmount) return;
    reset();

    try {
      const txHash = await mint({ donationWei });
      onSuccess?.(txHash);
    } catch {
      // Error is handled by the hook
    }
  };

  // Cross-chain mint handler
  const handleCrossChainMint = async () => {
    if (!isValidAmount || !crossChainFee) return;
    resetCrossChain();
    // Capture current chain at mint time so confirmation uses correct chain
    setMintedSpokeChainId(currentChainId);

    try {
      const txHash = await requestCrossChainMint({
        donationWei,
        feeWei: crossChainFee.feeWei,
      });
      onSuccess?.(txHash);
    } catch {
      // Error is handled by the hook
    }
  };

  // Reset handler for both mint types
  const handleReset = () => {
    reset();
    resetCrossChain();
    resetConfirmation();
    setMintedSpokeChainId(undefined);
  };

  // Refetch tokens after successful mint to get the new token ID.
  // Poll briefly to handle slow indexing and stop when the token shows up or attempts cap out.
  // Triggers for both direct hub mints (isConfirmed) and cross-chain mints (isMintedOnHub).
  useEffect(() => {
    if ((!isConfirmed && !isMintedOnHub) || latestTokenId !== null) {
      return;
    }

    const maxAttempts = 10;
    const intervalMs = 500;
    let attempts = 0;

    refetchTokens();

    const intervalId = setInterval(() => {
      attempts += 1;
      refetchTokens();

      if (latestTokenId !== null || attempts >= maxAttempts) {
        clearInterval(intervalId);
      }
    }, intervalMs);

    return () => clearInterval(intervalId);
  }, [isConfirmed, isMintedOnHub, latestTokenId, refetchTokens]);

  // Cross-chain mint confirmation state (message dispatched, waiting for hub mint)
  if (isCrossChainConfirmed && crossChainHash) {
    const isConfirmedOnHub = isMintedOnHub || confirmationStatus === 'confirmed';
    const isPolling = confirmationStatus === 'polling' || confirmationStatus === 'waiting';
    const isTimeout = confirmationStatus === 'timeout';
    const elapsedSeconds = Math.floor(elapsedTime / 1000);

    return (
      <Card className={cn('', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-pink-500" fill="currentColor" />
            Support the Registry
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Show different alert based on confirmation status */}
          {isConfirmedOnHub ? (
            <Alert className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950">
              <Check className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-700 dark:text-green-300">
                Success! Your support token has been minted on {hubChainName}.
              </AlertDescription>
            </Alert>
          ) : isTimeout ? (
            <Alert className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-700 dark:text-amber-300">
                Confirmation timeout. Your token may still be minting - check the explorer link
                below.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950">
              <Send className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-700 dark:text-blue-300">
                Cross-chain request sent! Waiting for confirmation on {hubChainName}...
                {isPolling && elapsedSeconds > 0 && (
                  <span className="ml-1">({elapsedSeconds}s)</span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Display minted token when confirmed */}
          {isConfirmedOnHub && latestTokenId !== null && supportSoulboundAddress && (
            <div className="flex justify-center py-4">
              <MintedTokenDisplay
                contractAddress={supportSoulboundAddress}
                tokenId={latestTokenId}
                type="support"
                size={320}
              />
            </div>
          )}

          {/* Show loading spinner while polling */}
          {isPolling && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Transaction links */}
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Transaction on {mintedSpokeChainName}
              </Label>
              <ExplorerLink
                value={crossChainHash}
                href={getExplorerTxUrl(mintedSpokeChainId ?? hubChainId, crossChainHash)}
              />
            </div>

            {/* Hyperlane explorer link */}
            {messageId && explorerUrl && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Track cross-chain message</Label>
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  View on Hyperlane Explorer
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>

          {!isConfirmedOnHub && (
            <p className="text-xs text-center text-muted-foreground">
              The Hyperlane relayer will deliver your donation request to {hubChainName}. Your
              donation is held on {mintedSpokeChainName} and will be collected by the treasury.
            </p>
          )}

          <Button variant="outline" onClick={handleReset} className="w-full">
            {isConfirmedOnHub ? 'Make Another Donation' : 'Done'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Direct hub mint success state
  if (isConfirmed && hash) {
    return (
      <Card className={cn('', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-pink-500" fill="currentColor" />
            Support the Registry
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950">
            <Check className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700 dark:text-green-300">
              Thank you for supporting the Stolen Wallet Registry!
            </AlertDescription>
          </Alert>

          {/* Display minted NFT - show spinner while fetching/refetching */}
          {latestTokenId !== null && supportSoulboundAddress && !isFetchingTokens && (
            <div className="flex justify-center py-4">
              <MintedTokenDisplay
                contractAddress={supportSoulboundAddress}
                tokenId={latestTokenId}
                type="support"
                size={320}
              />
            </div>
          )}
          {(isLoadingTokens || isFetchingTokens) && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Transaction</Label>
            <ExplorerLink value={hash} href={getExplorerTxUrl(hubChainId, hash)} />
          </div>
          <Button variant="outline" onClick={handleReset} className="w-full">
            Mint Another
          </Button>
        </CardContent>
      </Card>
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
        <div className="space-y-3">
          <div>
            <Label>Donation Amount</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Enter any amount you'd like to donate
            </p>
          </div>

          {/* ETH and USD inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <Input
                type="text"
                inputMode="decimal"
                value={ethInput}
                onChange={handleEthChange}
                disabled={isMinting}
                className="pr-12"
                placeholder="0.01"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                ETH
              </span>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
              <Input
                type="text"
                inputMode="decimal"
                value={usdInput}
                onChange={handleUsdChange}
                disabled={isMinting || !ethPrice}
                className="pl-7 pr-12"
                placeholder={ethPrice ? '0.00' : '...'}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                USD
              </span>
            </div>
          </div>

          {/* Quick amount buttons - centered */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground text-center">Suggested amounts</p>
            <div className="flex flex-wrap justify-center gap-2">
              {DONATION_PRESETS.map((amount) => (
                <Button
                  key={amount}
                  type="button"
                  variant={ethInput === amount.toString() ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handlePresetClick(amount)}
                  disabled={isMinting}
                  className="text-xs"
                >
                  {amount} ETH
                </Button>
              ))}
            </div>
          </div>

          {/* Minimum amount warning */}
          {!isLoadingMin && minWei > 0n && donationWei > 0n && !isValidAmount && (
            <p className="text-xs text-destructive text-center">
              Minimum donation: {formatEther(minWei)} ETH
            </p>
          )}
        </div>

        {/* Preview button only - language is auto-detected, modal allows override */}
        <div className="flex justify-end">
          <SoulboundPreviewModal
            type="support"
            initialLanguage={language}
            onLanguageChange={setLanguage}
          />
        </div>

        {/* Spoke chain info - show cross-chain option */}
        {isOnSpokeChain && (
          <Alert>
            <Send className="h-4 w-4" />
            <AlertDescription>
              Support tokens are minted on {hubChainName}. You can switch to {hubChainName} to avoid
              cross-chain fees, or donate directly from {currentChainName}.
            </AlertDescription>
          </Alert>
        )}

        {/* Wrong chain warning (not hub, not spoke - unsupported chain) */}
        {!isOnHubChain && !isOnSpokeChain && (
          <Alert>
            <ArrowRightLeft className="h-4 w-4" />
            <AlertDescription>
              Support tokens are minted on {hubChainName}. Please switch chains to donate.
            </AlertDescription>
          </Alert>
        )}

        {/* Error state - direct mint */}
        {isError && error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{sanitizeErrorMessage(error)}</AlertDescription>
          </Alert>
        )}

        {/* Error state - cross-chain mint */}
        {isCrossChainError && crossChainError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{sanitizeErrorMessage(crossChainError)}</AlertDescription>
          </Alert>
        )}

        {/* On hub chain - direct mint */}
        {isOnHubChain && (
          <>
            <Button
              onClick={handleMint}
              disabled={isMinting || !isValidAmount}
              className="w-full"
              size="lg"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Confirm in wallet...
                </>
              ) : isConfirming ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing donation...
                </>
              ) : (
                <>
                  <Heart className="mr-2 h-4 w-4" />
                  Donate & Mint
                </>
              )}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              You pay: {ethInput || '0'} ETH donation + gas. 100% goes to registry infrastructure.
            </p>
          </>
        )}

        {/* On spoke chain - show both options */}
        {isOnSpokeChain && (
          <div className="space-y-3">
            <div className="flex flex-col gap-2">
              <Button
                onClick={handleCrossChainMint}
                disabled={isCrossChainMinting || !crossChainFee || !isValidAmount || isSwitching}
                className="w-full"
              >
                {isCrossChainPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Confirm in wallet...
                  </>
                ) : isCrossChainConfirming ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending cross-chain...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Donate from {currentChainName}
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleSwitchChain}
                disabled={isSwitching || isCrossChainMinting}
                className="w-full"
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
            </div>
            {/* Fee breakdown for spoke chain */}
            <div className="text-xs text-muted-foreground">
              {crossChainFee ? (
                <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                  {/* Cross-chain fee */}
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1">
                      Cross-chain fee
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[200px]">
                          Support tokens are minted on {hubChainName}. Switch to {hubChainName} to
                          avoid this fee.
                        </TooltipContent>
                      </Tooltip>
                    </span>
                    <span className="text-right">
                      <span className="font-medium text-foreground">
                        {parseFloat(crossChainFee.feeEth).toFixed(6)} ETH
                      </span>
                      {ethPrice > 0 && (
                        <span className="ml-1 text-muted-foreground">
                          (~${(parseFloat(crossChainFee.feeEth) * ethPrice).toFixed(2)})
                        </span>
                      )}
                    </span>
                  </div>
                  {/* Donation amount */}
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1">
                      Donation
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[200px]">
                          100% of donations support the Stolen Wallet Registry infrastructure and
                          development.
                        </TooltipContent>
                      </Tooltip>
                    </span>
                    <span className="text-right">
                      <span className="font-medium text-foreground">{ethInput || '0'} ETH</span>
                      {ethPrice > 0 && (
                        <span className="ml-1 text-muted-foreground">
                          (~${(parseFloat(ethInput || '0') * ethPrice).toFixed(2)})
                        </span>
                      )}
                    </span>
                  </div>
                  {/* Gas estimate */}
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1">
                      Est. gas
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[200px]">
                          Network fee paid to {currentChainName} validators. Actual cost may vary.
                        </TooltipContent>
                      </Tooltip>
                    </span>
                    <span className="text-right">
                      {isLoadingGas ? (
                        <span className="flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                        </span>
                      ) : gasEstimate ? (
                        <>
                          <span className="font-medium text-foreground">
                            {parseFloat(gasEstimate.gasCostEth).toFixed(6)} ETH
                          </span>
                          {ethPrice > 0 && (
                            <span className="ml-1 text-muted-foreground">
                              (~${gasEstimate.gasCostUsd.toFixed(2)})
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </span>
                  </div>
                  {/* Divider */}
                  <div className="border-t border-border/50" />
                  {/* Total */}
                  <div className="flex justify-between font-medium">
                    <span className="text-foreground">Total</span>
                    <span className="text-right">
                      <span className="text-foreground">
                        {(
                          parseFloat(crossChainFee.feeEth) +
                          parseFloat(ethInput || '0') +
                          (gasEstimate ? parseFloat(gasEstimate.gasCostEth) : 0)
                        ).toFixed(6)}{' '}
                        ETH
                      </span>
                      {ethPrice > 0 && (
                        <span className="ml-1 text-muted-foreground">
                          (~$
                          {(
                            (parseFloat(crossChainFee.feeEth) + parseFloat(ethInput || '0')) *
                              ethPrice +
                            (gasEstimate?.gasCostUsd ?? 0)
                          ).toFixed(2)}
                          )
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              ) : isFeeError ? (
                <p className="text-destructive text-center">
                  Failed to load fee: {feeError?.message || 'Unknown error'}
                </p>
              ) : isLoadingFee ? (
                <p className="flex items-center justify-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading cross-chain fee...
                </p>
              ) : (
                <p className="text-muted-foreground/70 text-center">Cross-chain fee unavailable</p>
              )}
            </div>
          </div>
        )}

        {/* Unsupported chain - just switch button */}
        {!isOnHubChain && !isOnSpokeChain && (
          <Button onClick={handleSwitchChain} disabled={isSwitching} className="w-full" size="lg">
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
        )}

        {/* Show previously minted tokens */}
        {hasPreviousTokens && supportSoulboundAddress && (
          <div className="border-t pt-4 mt-4">
            <Label className="text-xs text-muted-foreground mb-2 block">
              Your minted tokens ({existingTokenIds.length})
            </Label>
            <div className="flex flex-wrap justify-center gap-2">
              {existingTokenIds.slice(-3).map((tokenId) => (
                <MintedTokenDisplay
                  key={tokenId.toString()}
                  contractAddress={supportSoulboundAddress}
                  tokenId={tokenId}
                  type="support"
                  size={140}
                />
              ))}
            </div>
            {existingTokenIds.length > 3 && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                +{existingTokenIds.length - 3} more tokens
              </p>
            )}
          </div>
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
