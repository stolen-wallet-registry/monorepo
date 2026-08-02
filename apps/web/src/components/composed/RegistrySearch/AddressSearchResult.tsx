/**
 * Result card for address search (combined wallet + contract registries).
 *
 * Displays the status of a searched address from both the stolen wallet
 * registry AND the fraudulent contract registry. Shows which registry(ies)
 * the address was found in.
 */

import { Alert, AlertTitle, AlertDescription, Badge, Separator } from '@swr/ui';
import { AlertCircle, AlertTriangle, CheckCircle2, FileWarning, Wallet } from 'lucide-react';
import { ExplorerLink } from '@/components/composed/ExplorerLink';
import { cn } from '@/lib/utils';
import { registryKindLabel } from '@swr/search';
import type {
  AddressSearchData,
  WalletSearchData,
  ContractSearchData,
  SearchUnavailableReason,
  UnverifiedRegistries,
} from '@swr/search';

export interface AddressSearchResultProps {
  /** Whether the address was found in any registry */
  found: boolean;
  /** Found in stolen wallet registry */
  foundInWalletRegistry: boolean;
  /** Found in fraudulent contract registry */
  foundInContractRegistry: boolean;
  /** Combined search data (null if not found in any registry) */
  data: AddressSearchData | null;
  /**
   * Registries that could not be consulted.
   *
   * When non-empty, an absence of hits is NOT a clean result and must never render as one —
   * a green "Clean" badge over an unreachable registry is how an off-ramp clears a wallet
   * that is registered stolen.
   */
  unverified?: UnverifiedRegistries;
  /**
   * Why those registries could not be consulted. Only affects the guidance sentence on the
   * "Could Not Verify" card.
   *
   * `'unreachable'` (the default) means the query was sent and failed, so retrying is the
   * right advice. `'unsupported-identifier'` means the registry has no form for this
   * identifier and nothing was ever queried — telling that user to "try again" sends them
   * debugging an indexer that answered perfectly well.
   */
  reason?: SearchUnavailableReason;
  /** Additional class names */
  className?: string;
}

/** Sentence naming the registries that did not answer. */
function unverifiedSentence(unverified: UnverifiedRegistries): string {
  const names = unverified.map(registryKindLabel).join(' and ');
  const registryWord = unverified.length > 1 ? 'registries' : 'registry';
  return `The ${names} ${registryWord} could not be checked.`;
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
  unverified = [],
  reason = 'unreachable',
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

          {unverified.length > 0 && (
            <p className="mb-3 flex items-start gap-2 text-xs font-medium">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                {unverifiedSentence(unverified)} This address may also appear there — what is shown
                below is only what the reachable registries reported.
              </span>
            </p>
          )}

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

  // Nothing found, but a registry never answered — this is an unknown, not a clean result.
  // Rendering the green card here is the false negative the search layer exists to prevent.
  if (unverified.length > 0) {
    return (
      <Alert
        className={cn(
          'border-amber-500 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-100',
          className
        )}
      >
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-100">
          Could Not Verify
          <Badge
            variant="outline"
            className="text-xs border-amber-500 text-amber-700 dark:text-amber-300"
          >
            Unverified
          </Badge>
        </AlertTitle>
        <AlertDescription className="text-amber-800 dark:text-amber-200">
          <p>
            {unverifiedSentence(unverified)}{' '}
            {reason === 'unsupported-identifier' ? (
              <>
                That registry cannot be queried for this kind of identifier, so nothing there was
                checked. This is <strong>not</strong> a clean result — the address may be registered
                there, and retrying will not change that.
              </>
            ) : (
              <>
                This is <strong>not</strong> a clean result — the address may be registered. Try
                again before relying on it.
              </>
            )}
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  // Not found, and every registry answered.
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
