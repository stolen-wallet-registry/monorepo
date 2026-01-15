/**
 * Card component for minting a SupportSoulbound token with a donation.
 *
 * Allows anyone to support the registry by donating and receiving
 * a commemorative soulbound token.
 */

import { useState, useMemo } from 'react';
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
  Slider,
} from '@swr/ui';
import { useMinDonation, useMintSupportSoulbound } from '@/hooks/soulbound';
import { useEthPrice } from '@/hooks/useEthPrice';
import { LanguageSelector } from '@/components/composed/LanguageSelector';
import { SoulboundPreviewModal } from '@/components/composed/SoulboundPreviewModal';
import { cn, sanitizeErrorMessage } from '@/lib/utils';
import { Loader2, Check, AlertCircle, Heart } from 'lucide-react';
import { formatEther, parseEther } from 'viem';
import type { Hash } from '@/lib/types/ethereum';

/** Preset donation amounts in ETH */
const DONATION_PRESETS = [0.0001, 0.001, 0.005, 0.01, 0.05, 0.1] as const;

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
  const [language, setLanguage] = useState('en');
  const [sliderIndex, setSliderIndex] = useState(3); // Default to 0.01 ETH

  const { minWei, isLoading: isLoadingMin } = useMinDonation();
  const { data: ethPriceData } = useEthPrice();
  const { mint, isPending, isConfirming, isConfirmed, isError, error, hash, reset } =
    useMintSupportSoulbound();

  const isMinting = isPending || isConfirming;

  // Get donation amount from slider
  const donationEth = DONATION_PRESETS[sliderIndex];
  const donationWei = parseEther(donationEth.toString());

  // Check if valid (meets minimum)
  const isValidAmount = donationWei >= minWei;

  // Calculate USD value
  const donationUsd = useMemo(() => {
    if (!ethPriceData?.usd) return null;
    const usd = donationEth * ethPriceData.usd;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(usd);
  }, [donationEth, ethPriceData?.usd]);

  const handleMint = async () => {
    if (!isValidAmount) return;

    // Clear any previous error state before attempting new mint
    reset();

    try {
      const txHash = await mint({ language, donationWei });
      onSuccess?.(txHash);
    } catch {
      // Error is handled by the hook
    }
  };

  // Success state
  if (isConfirmed && hash) {
    return (
      <Card className={cn('', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-pink-500" />
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
          <p className="text-sm text-muted-foreground">
            Transaction: {hash.slice(0, 10)}...{hash.slice(-8)}
          </p>
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
          <Heart className="h-5 w-5 text-pink-500" />
          Support the Registry
        </CardTitle>
        <CardDescription>
          Donate to support the registry and receive a commemorative soulbound token
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Donation amount slider */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Donation Amount</Label>
            <div className="text-right">
              <span className="text-lg font-semibold">{donationEth} ETH</span>
              {donationUsd && (
                <span className="ml-2 text-sm text-muted-foreground">({donationUsd})</span>
              )}
            </div>
          </div>
          <Slider
            value={[sliderIndex]}
            onValueChange={([value]) => setSliderIndex(value)}
            min={0}
            max={DONATION_PRESETS.length - 1}
            step={1}
            disabled={isMinting}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{DONATION_PRESETS[0]} ETH</span>
            <span>{DONATION_PRESETS[DONATION_PRESETS.length - 1]} ETH</span>
          </div>
          {!isLoadingMin && minWei > 0n && !isValidAmount && (
            <p className="text-xs text-destructive">
              Amount must be at least {formatEther(minWei)} ETH
            </p>
          )}
        </div>

        {/* Language selector with preview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Language</Label>
            <SoulboundPreviewModal
              type="support"
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
          100% of donations go to supporting the registry infrastructure
        </p>
      </CardContent>
    </Card>
  );
}
