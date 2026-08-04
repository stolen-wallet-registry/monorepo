/**
 * Fee breakdown shown before a cross-chain soulbound mint.
 *
 * Wallet mints pay the Hyperlane fee plus gas; support mints add the donation on top.
 * The donation row is opt-in via `donationEth` so both cards render the same table.
 */

import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@swr/ui';
import { HelpCircle, Loader2 } from 'lucide-react';

interface CrossChainFeeBreakdownProps {
  /** Quoted bridge fee, or null/undefined while unavailable */
  crossChainFee: { feeEth: string } | null | undefined;
  isLoadingFee: boolean;
  isFeeError: boolean;
  feeError: { message?: string } | null | undefined;
  /** Explains why the bridge fee is charged - wording differs per token type */
  feeTooltip: ReactNode;
  /** Estimated gas for the spoke-chain transaction */
  gasEstimate: { gasCostEth: string; gasCostUsd: number } | null | undefined;
  isLoadingGas: boolean;
  /** ETH price in USD, 0 when unknown (suppresses the USD columns) */
  ethPrice: number;
  /** Chain the user is paying gas on */
  currentChainName: string;
  /** Donation amount in ETH - when set, adds a donation row and includes it in the total */
  donationEth?: string;
}

export function CrossChainFeeBreakdown({
  crossChainFee,
  isLoadingFee,
  isFeeError,
  feeError,
  feeTooltip,
  gasEstimate,
  isLoadingGas,
  ethPrice,
  currentChainName,
  donationEth,
}: CrossChainFeeBreakdownProps) {
  return (
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
                <TooltipContent className="max-w-[200px]">{feeTooltip}</TooltipContent>
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
          {donationEth !== undefined && (
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
                <span className="font-medium text-foreground">{donationEth || '0'} ETH</span>
                {ethPrice > 0 && (
                  <span className="ml-1 text-muted-foreground">
                    (~${(parseFloat(donationEth || '0') * ethPrice).toFixed(2)})
                  </span>
                )}
              </span>
            </div>
          )}
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
                  parseFloat(donationEth || '0') +
                  (gasEstimate ? parseFloat(gasEstimate.gasCostEth) : 0)
                ).toFixed(6)}{' '}
                ETH
              </span>
              {ethPrice > 0 && (
                <span className="ml-1 text-muted-foreground">
                  (~$
                  {(
                    (parseFloat(crossChainFee.feeEth) + parseFloat(donationEth || '0')) * ethPrice +
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
  );
}
