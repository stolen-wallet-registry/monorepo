/**
 * Chain-aware mint actions for the wallet soulbound card.
 *
 * One region with three mutually exclusive shapes - hub chain (direct mint), spoke chain
 * (cross-chain mint + switch, with a fee breakdown) and unsupported chain (switch only) -
 * plus the alerts that explain the current chain and surface mint errors.
 *
 * Presentational only: every hook stays in WalletSoulboundMintCard so the mint flow keeps
 * a single owner.
 */

import { Alert, AlertDescription, Button } from '@swr/ui';
import { AlertCircle, ArrowRightLeft, Loader2, Send } from 'lucide-react';
import { CrossChainFeeBreakdown } from '@/components/composed/soulbound-mint/CrossChainFeeBreakdown';
import type {
  MintChainContext,
  MintCostEstimate,
  MintTxState,
} from '@/components/composed/soulbound-mint/types';
import { sanitizeErrorMessage } from '@/lib/utils';

interface WalletMintActionsProps {
  /** Where the wallet is connected relative to the hub */
  chain: MintChainContext;
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

export function WalletMintActions({
  chain,
  hubMint,
  crossChainMint,
  cost,
  isSwitching,
  onMint,
  onCrossChainMint,
  onSwitchChain,
}: WalletMintActionsProps) {
  const { hubChainName, currentChainName, isOnHubChain, isOnSpokeChain } = chain;

  return (
    <>
      {/* Spoke chain info - show cross-chain option */}
      {isOnSpokeChain && (
        <Alert>
          <Send className="h-4 w-4" />
          <AlertDescription>
            Wallet soulbound tokens are minted on {hubChainName}. You can switch to {hubChainName}{' '}
            to avoid cross-chain fees, or mint directly from {currentChainName}.
          </AlertDescription>
        </Alert>
      )}

      {/* Wrong chain warning (not hub, not spoke - unsupported chain) */}
      {!isOnHubChain && !isOnSpokeChain && (
        <Alert>
          <ArrowRightLeft className="h-4 w-4" />
          <AlertDescription>
            Wallet soulbound tokens are minted on {hubChainName}. Please switch chains to mint.
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
          <Button onClick={onMint} disabled={hubMint.isMinting} className="w-full" size="lg">
            {hubMint.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Confirm in wallet...
              </>
            ) : hubMint.isConfirming ? (
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

      {/* On spoke chain - show both options */}
      {isOnSpokeChain && (
        <div className="space-y-3">
          <div className="flex flex-col gap-2">
            <Button
              onClick={onCrossChainMint}
              disabled={crossChainMint.isMinting || !cost.fee || isSwitching}
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
                  Mint from {currentChainName}
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
          {/* Fee display for spoke chain */}
          <CrossChainFeeBreakdown
            crossChainFee={cost.fee}
            isLoadingFee={cost.isLoadingFee}
            isFeeError={cost.isFeeError}
            feeError={cost.feeError}
            feeTooltip={
              <>
                Wallet tokens are minted on {hubChainName}. Switch to {hubChainName} to avoid this
                fee.
              </>
            }
            gasEstimate={cost.gas}
            isLoadingGas={cost.isLoadingGas}
            ethPrice={cost.ethPrice}
            currentChainName={currentChainName}
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
