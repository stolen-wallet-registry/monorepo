/**
 * Cost breakdown table component for transaction fees.
 *
 * Displays protocol fee, bridge fee (spoke chains), network gas, and total.
 * Includes loading skeleton, refresh functionality with cooldown.
 */

import { Skeleton, Tooltip, TooltipContent, TooltipTrigger } from '@swr/ui';
import { RefreshCw } from 'lucide-react';
import { InfoTooltip } from '@/components/composed/InfoTooltip';
import type { TransactionCost } from '@/hooks/useTransactionCost';
import { cn } from '@/lib/utils';

export interface CostBreakdownTableProps {
  /** Cost estimate data to display */
  costEstimate: TransactionCost | null;
  /** Whether cost data is loading */
  isLoading?: boolean;
  /** Whether there was an error loading cost data */
  isError?: boolean;
  /** Callback to refresh cost estimate */
  onRefresh?: () => void;
  /** Whether refresh is on cooldown */
  isRefreshCooldown?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Displays transaction cost breakdown with fees, gas, and total.
 *
 * Shows:
 * - Protocol Fee (registration only)
 * - Bridge Fee (spoke chains only, e.g., "Hyperlane Fee")
 * - Network Gas
 * - Total (when multiple fees)
 * - Footer with ETH price, gas gwei, and refresh button
 */
export function CostBreakdownTable({
  costEstimate,
  isLoading = false,
  isError = false,
  onRefresh,
  isRefreshCooldown = false,
  className,
}: CostBreakdownTableProps) {
  // Loading skeleton
  if (isLoading && !costEstimate) {
    return (
      <div className={cn('rounded-lg border bg-muted/30 p-4 space-y-2', className)}>
        <div className="flex justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-3 w-40" />
      </div>
    );
  }

  // Error state
  if (isError && !costEstimate) {
    return (
      <div className={cn('rounded-lg border bg-muted/30 p-4', className)}>
        <p className="text-sm text-muted-foreground text-center">Unable to estimate costs</p>
      </div>
    );
  }

  // No data
  if (!costEstimate) {
    return null;
  }

  return (
    <div className={cn('rounded-lg border bg-muted/30 p-4 space-y-2', className)}>
      {/* Protocol Fee (registration only) */}
      {costEstimate.protocolFee && (
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground flex items-center gap-1">
            Protocol Fee
            <InfoTooltip
              content="This fee supports public goods funding. On Optimism-based chains, it goes to the Optimism Retroactive Public Goods Fund. On other chains, it supports Protocol Guild for Ethereum core development."
              size="sm"
            />
          </span>
          <div className="text-right">
            <span className="font-medium">{costEstimate.protocolFee.usd}</span>
            <span className="text-xs text-muted-foreground ml-2">
              ({costEstimate.protocolFee.eth} ETH)
            </span>
          </div>
        </div>
      )}

      {/* Bridge Fee (spoke chains only during registration) */}
      {costEstimate.bridgeFee && costEstimate.bridgeName && (
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground flex items-center gap-1">
            {costEstimate.bridgeName} Fee
            <InfoTooltip
              content={`Fee for relaying your registration to the hub chain via ${costEstimate.bridgeName}. This covers cross-chain message delivery.`}
              size="sm"
            />
          </span>
          <div className="text-right">
            <span className="font-medium">{costEstimate.bridgeFee.usd}</span>
            <span className="text-xs text-muted-foreground ml-2">
              ({costEstimate.bridgeFee.eth} ETH)
            </span>
          </div>
        </div>
      )}

      {/* Network Gas */}
      <div className="flex justify-between items-center text-sm">
        <span className="text-muted-foreground flex items-center gap-1">
          Network Gas
          <InfoTooltip
            content="Standard network fee paid to validators for processing your transaction on the blockchain."
            size="sm"
          />
        </span>
        <div className="text-right">
          <span className="font-medium">{costEstimate.gasCost.usd}</span>
          <span className="text-xs text-muted-foreground ml-2">
            ({costEstimate.gasCost.eth} ETH)
          </span>
        </div>
      </div>

      {/* Total (if any fees besides gas) */}
      {(costEstimate.protocolFee || costEstimate.bridgeFee) && (
        <>
          <hr className="border-border" />
          <div className="flex justify-between items-center text-sm font-medium">
            <span>Total</span>
            <div className="text-right">
              <span>{costEstimate.total.usd}</span>
              <span className="text-xs text-muted-foreground ml-2 font-normal">
                ({costEstimate.total.eth} ETH)
              </span>
            </div>
          </div>
        </>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <p className="text-xs text-muted-foreground">
          ETH: {costEstimate.ethPriceUsd} • Gas: {costEstimate.gasCost.gwei} gwei
        </p>
        {onRefresh && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshCooldown || isLoading}
                className={cn(
                  'p-1.5 rounded-md border border-transparent',
                  'text-muted-foreground hover:text-foreground',
                  'hover:bg-muted hover:border-border',
                  'active:scale-95 cursor-pointer',
                  'transition-all duration-150',
                  (isRefreshCooldown || isLoading) &&
                    'opacity-40 cursor-not-allowed hover:bg-transparent hover:border-transparent active:scale-100'
                )}
                aria-label="Refresh cost estimate"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{isRefreshCooldown ? 'Please wait...' : 'Refresh estimate'}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
