/**
 * Result card for address search (combined wallet + contract registries).
 *
 * Displays the status of a searched address from both the stolen wallet
 * registry AND the fraudulent contract registry. Shows which registry(ies)
 * the address was found in.
 */

import { Alert, AlertTitle, AlertDescription, Badge, Separator } from '@swr/ui';
import { AlertCircle, CheckCircle2, FileWarning, Wallet } from 'lucide-react';
import { ExplorerLink } from '@/components/composed/ExplorerLink';
import { cn } from '@/lib/utils';
import type { AddressSearchData, WalletSearchData, ContractSearchData } from '@swr/search';

export interface AddressSearchResultProps {
  /** Whether the address was found in any registry */
  found: boolean;
  /** Found in stolen wallet registry */
  foundInWalletRegistry: boolean;
  /** Found in fraudulent contract registry */
  foundInContractRegistry: boolean;
  /** Combined search data (null if not found in any registry) */
  data: AddressSearchData | null;
  /** Additional class names */
  className?: string;
}

/**
 * Section showing wallet registry results.
 */
function WalletSection({ data }: { data: WalletSearchData }) {
  const registeredDate = new Date(Number(data.registeredAt) * 1000);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 font-medium">
        <Wallet className="h-4 w-4" />
        <span>Stolen Wallet Registry</span>
        <Badge variant="destructive" className="text-xs">
          Compromised
        </Badge>
      </div>
      <div className="text-xs space-y-1 pl-6">
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
          <Badge variant="outline" className="text-xs">
            Sponsored Registration
          </Badge>
        )}
        {data.sourceChainName && (
          <p>
            <span className="text-muted-foreground">Source chain:</span> {data.sourceChainName}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Section showing contract registry results.
 */
function ContractSection({ data }: { data: ContractSearchData }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 font-medium">
        <FileWarning className="h-4 w-4" />
        <span>Fraudulent Contract Registry</span>
        <Badge variant="destructive" className="text-xs">
          Flagged
        </Badge>
      </div>

      <div className="text-xs space-y-2 pl-6">
        <p className="text-muted-foreground">
          Flagged on {data.chains.length} chain{data.chains.length > 1 ? 's' : ''}:
        </p>
        {data.chains.map((chain) => {
          const reportedDate = new Date(Number(chain.reportedAt) * 1000);
          return (
            <div
              key={`${chain.caip2ChainId}-${chain.batchId}`}
              className="pl-2 border-l border-muted"
            >
              <p className="font-medium">{chain.chainName}</p>
              <p>
                <span className="text-muted-foreground">Reported:</span>{' '}
                {reportedDate.toLocaleString()}
              </p>
              <p className="flex items-center gap-1">
                <span className="text-muted-foreground">Operator:</span>{' '}
                <ExplorerLink type="address" value={chain.operator} />
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Displays combined address search result from wallet and contract registries.
 */
export function AddressSearchResult({
  found,
  foundInWalletRegistry,
  foundInContractRegistry,
  data,
  className,
}: AddressSearchResultProps) {
  if (found && data) {
    // Determine severity - both registries is worst case
    const isBothRegistries = foundInWalletRegistry && foundInContractRegistry;

    return (
      <Alert variant="destructive" className={className}>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle className="flex items-center gap-2">
          {isBothRegistries ? (
            <>
              Found in Multiple Registries
              <Badge variant="destructive" className="text-xs">
                High Risk
              </Badge>
            </>
          ) : foundInWalletRegistry ? (
            <>
              Registered as Stolen Wallet
              <Badge variant="destructive" className="text-xs">
                Compromised
              </Badge>
            </>
          ) : (
            <>
              Flagged as Fraudulent Contract
              <Badge variant="destructive" className="text-xs">
                Flagged
              </Badge>
            </>
          )}
        </AlertTitle>
        <AlertDescription>
          <p className="mb-3">
            Address <code className="text-xs break-all">{data.address}</code>
          </p>

          <div className="space-y-3 pt-3 border-t border-destructive/20">
            {foundInWalletRegistry && data.wallet && <WalletSection data={data.wallet} />}

            {foundInWalletRegistry && foundInContractRegistry && (
              <Separator className="bg-destructive/20" />
            )}

            {foundInContractRegistry && data.contract && <ContractSection data={data.contract} />}
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  // Not found in any registry
  return (
    <Alert
      className={cn(
        'border-green-500 bg-green-50 dark:bg-green-950/20 text-green-900 dark:text-green-100',
        className
      )}
    >
      <CheckCircle2 className="h-4 w-4 text-green-600" />
      <AlertTitle className="flex items-center gap-2 text-green-900 dark:text-green-100">
        Not Found
        <Badge
          variant="outline"
          className="text-xs border-green-500 text-green-700 dark:text-green-300"
        >
          Clean
        </Badge>
      </AlertTitle>
      <AlertDescription className="text-green-800 dark:text-green-200">
        <p>This address is not in the stolen wallet registry or fraudulent contract registry.</p>
      </AlertDescription>
    </Alert>
  );
}
