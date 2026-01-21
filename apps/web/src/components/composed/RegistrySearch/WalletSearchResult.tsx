/**
 * Result card for wallet search (indexer-based).
 *
 * Displays the status of a searched wallet address from the Ponder indexer.
 */

import { Alert, AlertTitle, AlertDescription, Badge } from '@swr/ui';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { ExplorerLink } from '@/components/composed/ExplorerLink';
import { cn } from '@/lib/utils';
import type { WalletSearchData } from '@/hooks';

export interface WalletSearchResultProps {
  /** Whether the wallet was found in the registry */
  found: boolean;
  /** Wallet data from indexer (null if not found) */
  data: WalletSearchData | null;
  /** Additional class names */
  className?: string;
}

/**
 * Displays wallet search result from the indexer.
 */
export function WalletSearchResult({ found, data, className }: WalletSearchResultProps) {
  if (found && data) {
    const registeredDate = new Date(Number(data.registeredAt) * 1000);

    return (
      <Alert variant="destructive" className={className}>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle className="flex items-center gap-2">
          Registered as Stolen
          <Badge variant="destructive" className="text-xs">
            Compromised
          </Badge>
        </AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            This wallet (<code className="text-xs break-all">{data.address}</code>) has been
            registered as stolen.
          </p>
          <div className="w-full text-xs space-y-1 mt-3 pt-3 border-t border-destructive/20">
            <p>
              <span className="text-muted-foreground">CAIP-10:</span>{' '}
              <code className="break-all">{data.caip10}</code>
            </p>
            <p>
              <span className="text-muted-foreground">Registered:</span>{' '}
              {registeredDate.toLocaleString()}
            </p>
            <p className="flex items-center gap-1">
              <span className="text-muted-foreground">Transaction:</span>{' '}
              <ExplorerLink type="transaction" value={data.transactionHash} />
            </p>
            {data.isSponsored && (
              <p>
                <Badge variant="outline" className="text-xs">
                  Sponsored Registration
                </Badge>
              </p>
            )}
            {data.sourceChainName && (
              <p>
                <span className="text-muted-foreground">Source chain:</span> {data.sourceChainName}
              </p>
            )}
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
        Not Registered
        <Badge
          variant="outline"
          className="text-xs border-green-500 text-green-700 dark:text-green-300"
        >
          Clean
        </Badge>
      </AlertTitle>
      <AlertDescription className="text-green-800 dark:text-green-200">
        <p>This wallet is not in the stolen wallet registry.</p>
      </AlertDescription>
    </Alert>
  );
}
