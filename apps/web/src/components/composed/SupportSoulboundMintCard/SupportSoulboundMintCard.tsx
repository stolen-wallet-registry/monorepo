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
} from '@swr/ui';
import { useMinDonation, useMintSupportSoulbound, useSupportTokens } from '@/hooks/soulbound';
import { useEthPrice } from '@/hooks/useEthPrice';
import { ExplorerLink, getExplorerTxUrl } from '@/components/composed/ExplorerLink';
import { SoulboundPreviewModal } from '@/components/composed/SoulboundPreviewModal';
import { MintedTokenDisplay } from '@/components/composed/MintedTokenDisplay';
import { cn, sanitizeErrorMessage } from '@/lib/utils';
import { getChainName } from '@/lib/chains/config';
import { getSupportSoulboundAddress } from '@/lib/contracts/addresses';
import { getBrowserLanguage } from '@/lib/browser';
import { useAccount, useSwitchChain } from 'wagmi';
import { Loader2, Check, AlertCircle, Heart, ArrowRightLeft } from 'lucide-react';
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

  const { address: connectedAddress } = useAccount();
  const { minWei, isLoading: isLoadingMin } = useMinDonation();
  const { data: ethPriceData } = useEthPrice();
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

  // Refetch tokens after successful mint to get the new token ID
  // Small delay ensures the blockchain has indexed the new token
  useEffect(() => {
    if (isConfirmed) {
      const timer = setTimeout(() => {
        refetchTokens();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isConfirmed, refetchTokens]);

  // Success state
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
          <Button variant="outline" onClick={reset} className="w-full">
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

        {/* Wrong chain warning */}
        {!isOnHubChain && (
          <Alert>
            <ArrowRightLeft className="h-4 w-4" />
            <AlertDescription>
              Support tokens are minted on {hubChainName}. Please switch chains to donate.
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
        ) : (
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
        )}

        <p className="text-xs text-center text-muted-foreground">
          100% of donations go to supporting the registry infrastructure
        </p>

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
