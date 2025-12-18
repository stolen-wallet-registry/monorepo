/**
 * TransactionCostCard Component
 *
 * Displays estimated transaction costs including:
 * - Protocol fee (only for registration)
 * - Network gas cost
 * - Total cost
 * - Current ETH price
 */

import { RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Button, Skeleton, cn } from '@swr/ui';
import { useTransactionCost, type UseTransactionCostParams } from '@/hooks/useTransactionCost';

export interface TransactionCostCardProps {
  /** Which step we're on - determines if protocol fee is shown */
  step: 'acknowledgement' | 'registration';
  /** Transaction args for gas estimation */
  transactionArgs?: UseTransactionCostParams['args'];
  /** Additional CSS classes */
  className?: string;
}

/**
 * Row component for displaying a cost line item.
 */
function CostRow({
  label,
  usd,
  eth,
  className,
}: {
  label: string;
  usd: string;
  eth: string;
  className?: string;
}) {
  return (
    <div className={cn('flex justify-between items-center', className)}>
      <span className="text-muted-foreground">{label}</span>
      <div className="text-right">
        <span className="font-medium">{usd}</span>
        <span className="text-xs text-muted-foreground ml-2">({eth} ETH)</span>
      </div>
    </div>
  );
}

/**
 * Loading state skeleton for the card.
 */
function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex justify-between items-center">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-28" />
      </div>
      <hr className="border-border" />
      <div className="flex justify-between items-center">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-36" />
      </div>
      <Skeleton className="h-3 w-48" />
    </div>
  );
}

/**
 * Error state display.
 */
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <AlertCircle className="h-8 w-8 text-destructive" />
      <p className="text-sm text-muted-foreground text-center">Failed to estimate costs</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try Again
      </Button>
    </div>
  );
}

/**
 * Card component displaying estimated transaction costs.
 *
 * Shows different information based on the step:
 * - Acknowledgement: Gas cost only
 * - Registration: Protocol fee + Gas cost + Total
 *
 * @example
 * ```tsx
 * <TransactionCostCard
 *   step="registration"
 *   transactionArgs={[deadline, nonce, owner, v, r, s]}
 * />
 * ```
 */
export function TransactionCostCard({
  step,
  transactionArgs,
  className,
}: TransactionCostCardProps) {
  const { data, isLoading, isError, refetch } = useTransactionCost({
    step,
    args: transactionArgs,
  });

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Estimated Transaction Cost</CardTitle>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => refetch()}
          disabled={isLoading}
          title="Refresh estimate"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading && !data && <LoadingSkeleton />}

        {isError && !data && <ErrorState onRetry={refetch} />}

        {data && (
          <div className="space-y-3">
            {/* Protocol Fee (only for registration) */}
            {data.protocolFee && (
              <CostRow label="Protocol Fee" usd={data.protocolFee.usd} eth={data.protocolFee.eth} />
            )}

            {/* Network Gas */}
            <CostRow label="Network Gas" usd={data.gasCost.usd} eth={data.gasCost.eth} />

            {/* Divider and Total (only if there's a protocol fee) */}
            {data.protocolFee && (
              <>
                <hr className="border-border" />
                <CostRow
                  label="Total"
                  usd={data.total.usd}
                  eth={data.total.eth}
                  className="font-medium"
                />
              </>
            )}

            {/* Footer info */}
            <p className="text-xs text-muted-foreground pt-1">
              ETH: {data.ethPriceUsd} • Gas: {data.gasCost.gwei} gwei
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
