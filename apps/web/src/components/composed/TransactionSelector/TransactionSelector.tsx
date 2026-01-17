/**
 * Transaction selector component for fraud reporting.
 *
 * Allows users to view their recent transactions and select ones
 * they want to report as fraudulent. Supports batch selection
 * with Merkle tree generation.
 */

import { useCallback, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Checkbox,
  Badge,
  Skeleton,
} from '@swr/ui';
import { cn } from '@/lib/utils';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { UserTransaction } from '@/hooks/transactions/useUserTransactions';
import type { Hash } from '@/lib/types/ethereum';
import { formatEther } from 'viem';
import { getChainName } from '@/lib/caip';

/**
 * Format a transaction hash for display (truncated).
 */
function formatTxHash(hash: Hash): string {
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

/**
 * Format an address for display (truncated).
 */
function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export interface TransactionSelectorProps {
  /** List of transactions to display */
  transactions: UserTransaction[];
  /** Currently selected transaction hashes */
  selectedHashes: Hash[];
  /** Callback when selection changes */
  onSelectionChange: (hashes: Hash[]) => void;
  /** Whether transactions are loading */
  isLoading?: boolean;
  /** Error message if fetch failed */
  error?: string | null;
  /** Callback to refresh transactions */
  onRefresh?: () => void;
  /** Maximum transactions that can be selected (default: 100) */
  maxSelections?: number;
  /** Chain ID for building explorer links */
  chainId?: number;
  /** Additional class names */
  className?: string;
}

/**
 * Format ETH value for display.
 */
function formatValue(value: bigint): string {
  const eth = formatEther(value);
  const numEth = parseFloat(eth);
  if (numEth === 0) return '0 ETH';
  if (numEth < 0.001) return '< 0.001 ETH';
  return `${numEth.toFixed(4)} ETH`;
}

/**
 * Format timestamp as short date/time.
 * Handles both Unix seconds and milliseconds.
 */
function formatShortTimestamp(timestamp?: number): string {
  if (!timestamp) return '--';
  // Convert Unix seconds to milliseconds if needed (timestamps < 1e12 are seconds)
  const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  const date = new Date(ms);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Loading skeleton for transaction list.
 */
function TransactionSkeleton() {
  return (
    <div className="space-y-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2 border rounded">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16 ml-auto" />
        </div>
      ))}
    </div>
  );
}

/**
 * Empty state when no transactions found.
 */
function EmptyState({ onRefresh }: { onRefresh?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center border rounded-lg border-dashed">
      <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
      <p className="text-lg font-medium text-muted-foreground mb-2">No transactions found</p>
      <p className="text-sm text-muted-foreground mb-4">
        No recent transactions were found for this wallet.
      </p>
      {onRefresh && (
        <Button variant="outline" onClick={onRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      )}
    </div>
  );
}

/**
 * Displays a selectable list of transactions for fraud reporting.
 */
export function TransactionSelector({
  transactions,
  selectedHashes,
  onSelectionChange,
  isLoading = false,
  error,
  onRefresh,
  maxSelections = 100,
  chainId,
  className,
}: TransactionSelectorProps) {
  const transactionHashSet = useMemo(
    () => new Set(transactions.map((tx) => tx.hash)),
    [transactions]
  );
  // Normalize selectedHashes to only include hashes that exist in current transaction list
  const normalizedSelectedHashes = useMemo(
    () => selectedHashes.filter((h) => transactionHashSet.has(h)),
    [selectedHashes, transactionHashSet]
  );
  const selectedSet = useMemo(() => new Set(normalizedSelectedHashes), [normalizedSelectedHashes]);
  const validSelectedCount = normalizedSelectedHashes.length;

  const handleToggle = useCallback(
    (hash: Hash) => {
      const newSelection = new Set(selectedHashes);
      if (newSelection.has(hash)) {
        newSelection.delete(hash);
      } else if (newSelection.size < maxSelections) {
        newSelection.add(hash);
      }
      onSelectionChange(Array.from(newSelection));
    },
    [selectedHashes, onSelectionChange, maxSelections]
  );

  const handleSelectAll = useCallback(() => {
    const allHashes = transactions.slice(0, maxSelections).map((tx) => tx.hash);
    onSelectionChange(allHashes);
  }, [transactions, maxSelections, onSelectionChange]);

  const handleClearAll = useCallback(() => {
    onSelectionChange([]);
  }, [onSelectionChange]);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Select Fraudulent Transactions</CardTitle>
          <CardDescription>Loading your recent transactions...</CardDescription>
        </CardHeader>
        <CardContent>
          <TransactionSkeleton />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={cn('border-destructive', className)}>
        <CardHeader>
          <CardTitle>Error Loading Transactions</CardTitle>
          <CardDescription className="text-destructive">{error}</CardDescription>
        </CardHeader>
        <CardContent>
          {onRefresh && (
            <Button variant="outline" onClick={onRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Select Fraudulent Transactions</CardTitle>
            <CardDescription>
              Choose the transactions you want to report as fraudulent.
              {chainId && ` (${getChainName(chainId)})`}
            </CardDescription>
          </div>
          {transactions.length > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant={validSelectedCount > 0 ? 'default' : 'secondary'}>
                {validSelectedCount} / {Math.min(transactions.length, maxSelections)} selected
              </Badge>
              {onRefresh && (
                <Button variant="ghost" size="icon" onClick={onRefresh} title="Refresh">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <EmptyState onRefresh={onRefresh} />
        ) : (
          <div className="space-y-4">
            {/* Batch selection controls */}
            <div className="flex items-center gap-4 text-sm">
              <Button
                variant="link"
                size="sm"
                className="p-0 h-auto"
                onClick={handleSelectAll}
                disabled={validSelectedCount >= Math.min(transactions.length, maxSelections)}
              >
                Select all
              </Button>
              <span className="text-muted-foreground">|</span>
              <Button
                variant="link"
                size="sm"
                className="p-0 h-auto"
                onClick={handleClearAll}
                disabled={validSelectedCount === 0}
              >
                Clear selection
              </Button>
            </div>

            {/* Table with borders */}
            <div className="border rounded-lg overflow-hidden">
              {/* Column headers */}
              <div className="grid grid-cols-[auto_1fr_minmax(120px,auto)_minmax(60px,auto)_minmax(70px,auto)_minmax(50px,auto)] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/30 border-b">
                <div className="w-4" />
                <div>Hash</div>
                <div>To</div>
                <div>Date</div>
                <div className="text-right">Value</div>
                <div className="text-right">Block</div>
              </div>

              {/* Transaction list */}
              <div className="max-h-80 overflow-y-auto divide-y divide-border">
                {transactions.map((tx) => {
                  const isSelected = selectedSet.has(tx.hash);

                  return (
                    <div
                      key={tx.hash}
                      className={cn(
                        'grid grid-cols-[auto_1fr_minmax(120px,auto)_minmax(60px,auto)_minmax(70px,auto)_minmax(50px,auto)] gap-2 items-center px-3 py-2 transition-all text-sm',
                        isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'
                      )}
                    >
                      <Checkbox
                        checked={isSelected}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggle(tx.hash);
                        }}
                        aria-label={`Select transaction ${formatTxHash(tx.hash)}`}
                        className="h-4 w-4 cursor-pointer"
                      />

                      <code className="text-xs font-mono truncate" title={tx.hash}>
                        {formatTxHash(tx.hash)}
                      </code>

                      <code
                        className="text-xs font-mono text-muted-foreground truncate"
                        title={tx.to ?? undefined}
                      >
                        {tx.to ? formatAddress(tx.to) : '--'}
                      </code>

                      <span className="text-xs text-muted-foreground">
                        {formatShortTimestamp(tx.timestamp)}
                      </span>

                      <span className="text-xs font-medium text-right">
                        {formatValue(tx.value)}
                      </span>

                      <span className="text-xs text-muted-foreground text-right">
                        {tx.blockNumber.toString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {validSelectedCount >= maxSelections && (
              <p className="text-sm text-amber-600">
                Maximum of {maxSelections} transactions can be selected at once.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
