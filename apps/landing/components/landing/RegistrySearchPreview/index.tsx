'use client';

/**
 * Registry search preview for landing page.
 *
 * Allows visitors to immediately search the registry without connecting a wallet.
 * Uses the Ponder indexer via @swr/search for rich search results.
 */

import { useState, useCallback, type FormEvent } from 'react';
import { Search, Loader2, AlertTriangle, CheckCircle, Link as LinkIcon } from 'lucide-react';
import {
  Button,
  Input,
  ExplorerLink,
  getExplorerAddressUrl,
  getExplorerTxUrl,
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@swr/ui';
import {
  search,
  getResultStatus,
  getStatusLabel,
  getStatusDescription,
  formatTimestamp,
  truncateHash,
  type SearchConfig,
  type SearchResult,
  type ResultStatus,
} from '@swr/search';
import {
  EXAMPLE_REGISTERED_ADDRESS,
  EXAMPLE_CLEAN_ADDRESS,
  INDEXER_URL,
  HUB_CHAIN_ID,
} from './constants';

interface RegistrySearchPreviewProps {
  className?: string;
}

const searchConfig: SearchConfig = {
  indexerUrl: INDEXER_URL,
};

/**
 * Get background color class based on status.
 */
export function getResultBgClass(status: ResultStatus): string {
  switch (status) {
    case 'registered':
      return 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900';
    case 'pending':
      return 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-900';
    case 'not-found':
      return 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-900';
  }
}

/**
 * Get status icon based on result.
 */
function StatusIcon({ status }: { status: ResultStatus }) {
  switch (status) {
    case 'registered':
      return <AlertTriangle className="h-4 w-4 text-destructive" />;
    case 'pending':
      return <LinkIcon className="h-4 w-4 text-yellow-500" />;
    case 'not-found':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
  }
}

export function RegistrySearchPreview({ className }: RegistrySearchPreviewProps) {
  const [inputValue, setInputValue] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();

    if (!trimmed) {
      setError('Please enter a wallet address or transaction hash');
      setResult(null);
      return;
    }

    // Basic validation - at least looks like a hex value
    if (!trimmed.startsWith('0x')) {
      setError('Invalid format. Must start with 0x');
      setResult(null);
      return;
    }

    setError(null);
    setIsLoading(true);
    setSearchedQuery(trimmed);

    try {
      const searchResult = await search(searchConfig, trimmed);
      setResult(searchResult);

      // Show error for invalid input type
      if (searchResult.type === 'invalid') {
        setError(
          'Invalid format. Enter a wallet address (42 chars) or transaction hash (66 chars).'
        );
      }
    } catch (err) {
      console.error('Registry search failed:', err);
      setError('Failed to search registry. Please try again.');
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      void handleSearch(inputValue);
    },
    [inputValue, handleSearch]
  );

  const handleExampleClick = useCallback(
    (address: string) => {
      const trimmed = address.trim();
      setInputValue(trimmed);
      void handleSearch(trimmed);
    },
    [handleSearch]
  );

  const resultStatus = result && result.type !== 'invalid' ? getResultStatus(result) : null;

  // Get explorer URL based on result type
  const getExplorerUrl = () => {
    if (!searchedQuery || !result || result.type === 'invalid') return null;

    if (result.type === 'wallet') {
      return getExplorerAddressUrl(HUB_CHAIN_ID, searchedQuery);
    } else if (result.type === 'transaction') {
      return getExplorerTxUrl(HUB_CHAIN_ID, searchedQuery);
    }
    return null;
  };

  const explorerUrl = getExplorerUrl();

  return (
    <TooltipProvider>
      <div className={className}>
        {/* Search Form */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Search wallet or transaction (0x...)"
              className="pl-10 font-mono text-sm"
              disabled={isLoading}
              aria-label="Address or transaction hash to search"
            />
          </div>
          <Button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            aria-label={isLoading ? 'Searching registry' : 'Search registry'}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
          </Button>
        </form>

        {/* Example Buttons - Centered */}
        <div
          className="mt-2 flex flex-wrap items-center justify-center gap-2"
          role="group"
          aria-label="Example addresses to search"
        >
          <span className="text-xs text-muted-foreground">Examples:</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExampleClick(EXAMPLE_REGISTERED_ADDRESS)}
            disabled={isLoading}
            className="h-7 px-3 text-xs"
            aria-label="Search example stolen wallet address"
          >
            Stolen Wallet
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExampleClick(EXAMPLE_CLEAN_ADDRESS)}
            disabled={isLoading}
            className="h-7 px-3 text-xs"
            aria-label="Search example clean wallet address"
          >
            Clean Wallet
          </Button>
        </div>

        {/* Error Message */}
        {error && <p className="mt-2 text-center text-sm text-destructive">{error}</p>}

        {/* Result Display */}
        {result && result.type !== 'invalid' && resultStatus && searchedQuery && (
          <div className={`mt-3 rounded-lg border p-3 ${getResultBgClass(resultStatus)}`}>
            <div className="flex items-center justify-center gap-2">
              <StatusIcon status={resultStatus} />
              <span className="font-medium text-sm">{getStatusLabel(result)}</span>
            </div>
            <p className="mt-1 text-center text-xs text-muted-foreground">
              {getStatusDescription(result)}
            </p>

            {/* Additional details for found results */}
            {result.found && result.data && (
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {result.type === 'wallet' && result.data && (
                  <>
                    <p className="text-center">
                      Registered: {formatTimestamp(result.data.registeredAt)}
                    </p>
                    {result.data.isSponsored && (
                      <p className="text-center italic">Sponsored registration</p>
                    )}
                    {result.data.sourceChainName && (
                      <p className="text-center">Source: {result.data.sourceChainName}</p>
                    )}
                  </>
                )}
                {result.type === 'transaction' && result.data && (
                  <p className="text-center">
                    Reported on {result.data.chains.length} chain
                    {result.data.chains.length > 1 ? 's' : ''}
                  </p>
                )}
              </div>
            )}

            {/* Explorer link */}
            <div className="mt-2 flex justify-center">
              {result.type === 'wallet' ? (
                <ExplorerLink
                  value={searchedQuery as `0x${string}`}
                  type="address"
                  href={explorerUrl}
                  truncate={false}
                  showDisabledIcon={false}
                  className="text-xs break-all"
                />
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="font-mono text-xs">{truncateHash(searchedQuery, 10, 8)}</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-mono text-xs">{searchedQuery}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
