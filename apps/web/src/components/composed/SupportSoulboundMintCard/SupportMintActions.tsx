/**
 * Chain-aware donate/mint actions for the support soulbound card.
 *
 * One region with three mutually exclusive shapes - hub chain (direct donation), spoke
 * chain (cross-chain donation + switch, with a fee breakdown that includes the donation)
 * and unsupported chain (switch only) - plus the alerts explaining the current chain and
 * surfacing mint errors.
 *
 * Presentational only: every hook stays in SupportSoulboundMintCard.
 */

import { Alert, AlertDescription, Button } from '@swr/ui';
import { AlertCircle, ArrowRightLeft, Heart, Loader2, Send } from 'lucide-react';
import { CrossChainFeeBreakdown } from '@/components/composed/soulbound-mint/CrossChainFeeBreakdown';
import type {
  MintChainContext,
  MintCostEstimate,
  MintTxState,
} from '@/components/composed/soulbound-mint/types';
import { sanitizeErrorMessage } from '@/lib/utils';

interface SupportMintActionsProps {
  /** Where the wallet is connected relative to the hub */
  chain: MintChainContext;
  /** Donation amount in ETH, as typed */
  ethInput: string;
  /** Whether the entered amount clears the contract minimum */
  isValidAmount: boolean;
  /** Direct hub mint state */
  hubMint: MintTxState;
  /** Cross-chain mint state */
  crossChainMint: MintTxState;
  /** Fee, gas and price inputs for the cross-chain breakdown */
  cost: MintCostEstimate;
  /** Chain switching */
  isSwitching: boolean;
  onMint: () => void;
  onCrossChainMint: () => void;
  onSwitchChain: () => void;
}

export function SupportMintActions({
  chain,
  ethInput,
  isValidAmount,
  hubMint,
  crossChainMint,
  cost,
  isSwitching,
  onMint,
  onCrossChainMint,
  onSwitchChain,
}: SupportMintActionsProps) {
  const { hubChainName, currentChainName, isOnHubChain, isOnSpokeChain } = chain;

  return (
    <>
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
      {hubMint.isError && hubMint.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{sanitizeErrorMessage(hubMint.error)}</AlertDescription>
        </Alert>
      )}

      {/* Error state - cross-chain mint */}
      {crossChainMint.isError && crossChainMint.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{sanitizeErrorMessage(crossChainMint.error)}</AlertDescription>
        </Alert>
      )}

      {/* On hub chain - direct mint */}
      {isOnHubChain && (
        <>
          <Button
            onClick={onMint}
            disabled={hubMint.isMinting || !isValidAmount}
            className="w-full"
            size="lg"
          >
            {hubMint.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Confirm in wallet...
              </>
            ) : hubMint.isConfirming ? (
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
              onClick={onCrossChainMint}
              disabled={crossChainMint.isMinting || !cost.fee || !isValidAmount || isSwitching}
              className="w-full"
            >
              {crossChainMint.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Confirm in wallet...
                </>
              ) : crossChainMint.isConfirming ? (
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
              onClick={onSwitchChain}
              disabled={isSwitching || crossChainMint.isMinting}
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
          <CrossChainFeeBreakdown
            crossChainFee={cost.fee}
            isLoadingFee={cost.isLoadingFee}
            isFeeError={cost.isFeeError}
            feeError={cost.feeError}
            feeTooltip={
              <>
                Support tokens are minted on {hubChainName}. Switch to {hubChainName} to avoid this
                fee.
              </>
            }
            gasEstimate={cost.gas}
            isLoadingGas={cost.isLoadingGas}
            ethPrice={cost.ethPrice}
            currentChainName={currentChainName}
            donationEth={ethInput}
          />
        </div>
      )}

      {/* Unsupported chain - just switch button */}
      {!isOnHubChain && !isOnSpokeChain && (
        <Button onClick={onSwitchChain} disabled={isSwitching} className="w-full" size="lg">
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
    </>
  );
}
