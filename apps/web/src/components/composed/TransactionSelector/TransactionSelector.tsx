/**
 * Transaction selector component for fraud reporting.
 *
 * Allows users to view their recent transactions and select ones
 * they want to report as fraudulent. Supports batch selection
 * with Merkle tree generation.
 */

import { useCallback } from 'react';
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
import { AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react';
import type { UserTransaction } from '@/hooks/transactions/useUserTransactions';
import type { Hash } from '@/lib/types/ethereum';
import { formatEther } from 'viem';
import { getChainName } from '@/lib/caip';

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
 * Format a transaction hash for display (truncated).
 */
function formatTxHash(hash: Hash): string {
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

/**
 * Format a timestamp for display.
 */
function formatTimestamp(timestamp?: number): string {
  if (!timestamp) return 'Unknown time';
  return new Date(timestamp).toLocaleString();
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
 * Get explorer URL for a transaction.
 */
function getExplorerUrl(hash: Hash, chainId?: number): string | null {
  const explorers: Record<number, string | undefined> = {
    1: 'https://etherscan.io',
    8453: 'https://basescan.org',
    84532: 'https://sepolia.basescan.org',
    10: 'https://optimistic.etherscan.io',
    11155420: 'https://sepolia-optimistic.etherscan.io',
    42161: 'https://arbiscan.io',
    421614: 'https://sepolia.arbiscan.io',
    // Local Anvil chains have no explorer
  };

  if (!chainId) return null;
  const baseUrl = explorers[chainId];
  if (!baseUrl) return null;
  return `${baseUrl}/tx/${hash}`;
}

/**
 * Loading skeleton for transaction list.
 */
function TransactionSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
          <Skeleton className="h-5 w-5" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-4 w-24" />
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
  const selectedSet = new Set(selectedHashes);

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
              <Badge variant={selectedHashes.length > 0 ? 'default' : 'secondary'}>
                {selectedHashes.length} / {Math.min(transactions.length, maxSelections)} selected
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
                disabled={selectedHashes.length >= Math.min(transactions.length, maxSelections)}
              >
                Select all
              </Button>
              <span className="text-muted-foreground">|</span>
              <Button
                variant="link"
                size="sm"
                className="p-0 h-auto"
                onClick={handleClearAll}
                disabled={selectedHashes.length === 0}
              >
                Clear selection
              </Button>
            </div>

            {/* Transaction list */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {transactions.map((tx) => {
                const isSelected = selectedSet.has(tx.hash);
                const explorerUrl = getExplorerUrl(tx.hash, chainId ?? tx.chainId);

                return (
                  <div
                    key={tx.hash}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleToggle(tx.hash)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleToggle(tx.hash);
                      }
                    }}
                    className={cn(
                      'flex items-center gap-4 p-4 border rounded-lg cursor-pointer transition-all',
                      isSelected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'hover:border-primary/50 hover:bg-muted/50'
                    )}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => handleToggle(tx.hash)}
                      aria-label={`Select transaction ${formatTxHash(tx.hash)}`}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono">{formatTxHash(tx.hash)}</code>
                        {explorerUrl && (
                          <a
                            href={explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-muted-foreground hover:text-primary"
                            title="View on explorer"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {formatTimestamp(tx.timestamp)}
                        {tx.to && <span className="ml-2">to {tx.to.slice(0, 10)}...</span>}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-medium">{formatValue(tx.value)}</div>
                      <div className="text-xs text-muted-foreground">
                        Block {tx.blockNumber.toString()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedHashes.length >= maxSelections && (
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
