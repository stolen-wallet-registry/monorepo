/**
 * Result card for transaction search (indexer-based).
 *
 * Displays the status of a searched transaction hash from the Ponder indexer.
 * Shows which chains the transaction has been reported on.
 */

import { Alert, AlertTitle, AlertDescription, Badge } from '@swr/ui';
import { AlertCircle, CheckCircle2, Link as LinkIcon } from 'lucide-react';
import { ExplorerLink } from '@/components/composed/ExplorerLink';
import { cn } from '@/lib/utils';
import type { TransactionSearchData } from '@/hooks';

export interface TransactionSearchResultProps {
  /** Whether the transaction was found in the registry */
  found: boolean;
  /** Transaction data from indexer (null if not found) */
  data: TransactionSearchData | null;
  /** Additional class names */
  className?: string;
}

/**
 * Displays transaction search result from the indexer.
 */
export function TransactionSearchResult({ found, data, className }: TransactionSearchResultProps) {
  if (found && data) {
    return (
      <Alert variant="destructive" className={className}>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle className="flex items-center gap-2">
          Reported as Fraudulent
          <Badge variant="destructive" className="text-xs">
            {data.chains.length} Chain{data.chains.length !== 1 ? 's' : ''}
          </Badge>
        </AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            This transaction (<code className="text-xs break-all">{data.txHash}</code>) has been
            reported as fraudulent.
          </p>

          {/* Chain reports */}
          <div className="space-y-2 mt-3 pt-3 border-t border-destructive/20">
            <p className="text-xs text-muted-foreground font-medium">Reported on:</p>
            {data.chains.map((chain, index) => {
              const reportedDate = new Date(Number(chain.reportedAt) * 1000);
              return (
                <div
                  key={`${chain.caip2ChainId}-${chain.batchId}-${index}`}
                  className="text-xs space-y-1 p-2 rounded bg-destructive/5"
                >
                  <div className="flex items-center gap-2">
                    <LinkIcon className="h-3 w-3" />
                    <span className="font-medium">{chain.chainName}</span>
                    <span className="text-muted-foreground">({chain.caip2ChainId})</span>
                  </div>
                  <div className="pl-5 space-y-0.5 text-muted-foreground">
                    <p>
                      Reporter: <ExplorerLink type="address" value={chain.reporter} />
                    </p>
                    <p>Reported: {reportedDate.toLocaleString()}</p>
                    <p className="break-all">
                      Batch: <code>{chain.batchId.slice(0, 18)}...</code>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  // Not found state
  return (
    <Alert
      className={cn(
        'border-green-500 bg-green-50 dark:bg-green-950/20 text-green-900 dark:text-green-100',
        className
      )}
    >
      <CheckCircle2 className="h-4 w-4 text-green-600" />
      <AlertTitle className="flex items-center gap-2 text-green-900 dark:text-green-100">
        Not Reported
        <Badge
          variant="outline"
          className="text-xs border-green-500 text-green-700 dark:text-green-300"
        >
          Clean
        </Badge>
      </AlertTitle>
      <AlertDescription className="text-green-800 dark:text-green-200">
        <p>This transaction has not been reported as fraudulent.</p>
      </AlertDescription>
    </Alert>
  );
}
