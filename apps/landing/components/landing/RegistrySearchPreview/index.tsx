'use client';

/**
 * Registry search preview for landing page.
 *
 * Allows visitors to immediately search the registry without connecting a wallet.
 * Uses the Ponder indexer via @swr/search for rich search results.
 */

import { useState, useCallback, useRef, type FormEvent } from 'react';
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

type StubScenario =
  | 'stolen-wallet'
  | 'clean-wallet'
  | 'reported-tx'
  | 'clean-tx'
  | 'flagged-contract'
  | 'clean-contract';
import {
  EXAMPLE_REGISTERED_ADDRESS,
  EXAMPLE_CLEAN_ADDRESS,
  EXAMPLE_REPORTED_TX,
  EXAMPLE_CLEAN_TX,
  EXAMPLE_FLAGGED_CONTRACT,
  EXAMPLE_CLEAN_CONTRACT,
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

// ═══════════════════════════════════════════════════════════════════════════
// STUB DATA FOR EXAMPLES
// ═══════════════════════════════════════════════════════════════════════════
// These stub results are used for the example buttons to demonstrate the UI
// without requiring actual registered entries in the indexer.

function createStubbedWalletResult(address: string): SearchResult {
  return {
    type: 'address',
    found: true,
    foundInWalletRegistry: true,
    foundInContractRegistry: false,
    data: {
      address: address.toLowerCase() as `0x${string}`,
      wallet: {
        address: address.toLowerCase() as `0x${string}`,
        caip10: `eip155:${HUB_CHAIN_ID}:${address.toLowerCase()}`,
        registeredAt: BigInt(Math.floor(Date.now() / 1000) - 86400 * 7), // 7 days ago
        transactionHash:
          '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
        isSponsored: false,
      },
      contract: null,
    },
  };
}

function createStubbedTransactionResult(txHash: string): SearchResult {
  return {
    type: 'transaction',
    found: true,
    data: {
      txHash: txHash.toLowerCase() as `0x${string}`,
      chains: [
        {
          caip2ChainId: `eip155:${HUB_CHAIN_ID}`,
          chainName: HUB_CHAIN_ID === 8453 ? 'Base' : 'Base Sepolia',
          numericChainId: HUB_CHAIN_ID,
          batchId:
            '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`,
          reporter: '0x0000000000000000000000000000000000000000' as `0x${string}`,
          reportedAt: BigInt(Math.floor(Date.now() / 1000) - 86400 * 3), // 3 days ago
        },
      ],
    },
  };
}

function createStubbedNotFoundAddressResult(address: string): SearchResult {
  return {
    type: 'address',
    found: false,
    foundInWalletRegistry: false,
    foundInContractRegistry: false,
    data: {
      address: address.toLowerCase() as `0x${string}`,
      wallet: null,
      contract: null,
    },
  };
}

function createStubbedCleanTransactionResult(_txHash: string): SearchResult {
  return {
    type: 'transaction',
    found: false,
    data: null,
  };
}

function createStubbedContractResult(address: string): SearchResult {
  return {
    type: 'address',
    found: true,
    foundInWalletRegistry: false,
    foundInContractRegistry: true,
    data: {
      address: address.toLowerCase() as `0x${string}`,
      wallet: null,
      contract: {
        contractAddress: address.toLowerCase() as `0x${string}`,
        chains: [
          {
            caip2ChainId: `eip155:${HUB_CHAIN_ID}`,
            chainName: HUB_CHAIN_ID === 8453 ? 'Base' : 'Base Sepolia',
            numericChainId: HUB_CHAIN_ID,
            batchId:
              '0x0000000000000000000000000000000000000000000000000000000000000002' as `0x${string}`,
            operator: '0x0000000000000000000000000000000000000000' as `0x${string}`,
            reportedAt: BigInt(Math.floor(Date.now() / 1000) - 86400 * 5), // 5 days ago
          },
        ],
      },
    },
  };
}

export function RegistrySearchPreview({ className }: RegistrySearchPreviewProps) {
  const [inputValue, setInputValue] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestQueryRef = useRef<string | null>(null);

  const handleSearch = useCallback(async (query: string, useStub?: StubScenario) => {
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
    setSearchedQuery(trimmed);
    latestQueryRef.current = trimmed;

    // Use stubbed data for ALL example buttons (no indexer required)
    switch (useStub) {
      case 'stolen-wallet':
        setResult(createStubbedWalletResult(trimmed));
        return;
      case 'clean-wallet':
        setResult(createStubbedNotFoundAddressResult(trimmed));
        return;
      case 'reported-tx':
        setResult(createStubbedTransactionResult(trimmed));
        return;
      case 'clean-tx':
        setResult(createStubbedCleanTransactionResult(trimmed));
        return;
      case 'flagged-contract':
        setResult(createStubbedContractResult(trimmed));
        return;
      case 'clean-contract':
        setResult(createStubbedNotFoundAddressResult(trimmed));
        return;
    }

    // Real search for user-typed input (requires indexer)
    setIsLoading(true);

    try {
      const searchResult = await search(searchConfig, trimmed);

      // Ignore stale responses from previous searches
      if (latestQueryRef.current !== trimmed) return;

      setResult(searchResult);

      // Show error for invalid input type
      if (searchResult.type === 'invalid') {
        setError(
          'Invalid format. Enter a wallet address (42 chars) or transaction hash (66 chars).'
        );
      }
    } catch (err) {
      // Ignore errors from stale searches
      if (latestQueryRef.current !== trimmed) return;

      console.error('Registry search failed:', err);
      setError('Failed to search registry. Please try again.');
      setResult(null);
    } finally {
      // Only clear loading if this is still the latest query
      if (latestQueryRef.current === trimmed) {
        setIsLoading(false);
      }
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
    (value: string, stub: StubScenario) => {
      const trimmed = value.trim();
      setInputValue(trimmed);
      void handleSearch(trimmed, stub);
    },
    [handleSearch]
  );

  const resultStatus = result && result.type !== 'invalid' ? getResultStatus(result) : null;

  // Get explorer URL based on result type
  const getExplorerUrl = () => {
    if (!searchedQuery || !result || result.type === 'invalid') return null;

    if (result.type === 'address') {
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

        {/* Example Buttons - Grid layout for uniform alignment */}
        <div
          className="mt-2 grid w-fit mx-auto grid-cols-[auto_5rem_5rem] items-center gap-x-2 gap-y-1.5"
          role="group"
          aria-label="Example searches"
        >
          <span className="text-xs text-muted-foreground text-right">Wallets:</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExampleClick(EXAMPLE_REGISTERED_ADDRESS, 'stolen-wallet')}
            disabled={isLoading}
            className="h-7 w-full text-xs"
            aria-label="Search example stolen wallet address"
          >
            Stolen
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExampleClick(EXAMPLE_CLEAN_ADDRESS, 'clean-wallet')}
            disabled={isLoading}
            className="h-7 w-full text-xs"
            aria-label="Search example clean wallet address"
          >
            Clean
          </Button>

          <span className="text-xs text-muted-foreground text-right">Transactions:</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExampleClick(EXAMPLE_REPORTED_TX, 'reported-tx')}
            disabled={isLoading}
            className="h-7 w-full text-xs"
            aria-label="Search example reported transaction"
          >
            Reported
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExampleClick(EXAMPLE_CLEAN_TX, 'clean-tx')}
            disabled={isLoading}
            className="h-7 w-full text-xs"
            aria-label="Search example clean transaction"
          >
            Clean
          </Button>

          <span className="text-xs text-muted-foreground text-right">Contracts:</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExampleClick(EXAMPLE_FLAGGED_CONTRACT, 'flagged-contract')}
            disabled={isLoading}
            className="h-7 w-full text-xs"
            aria-label="Search example flagged contract address"
          >
            Flagged
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExampleClick(EXAMPLE_CLEAN_CONTRACT, 'clean-contract')}
            disabled={isLoading}
            className="h-7 w-full text-xs"
            aria-label="Search example clean contract address"
          >
            Clean
          </Button>
        </div>

        {/* Error Message */}
        {error && <p className="mt-2 text-center text-sm text-destructive">{error}</p>}

        {/* Result Display - resultStatus implies result is valid (non-invalid) */}
        {result && resultStatus && searchedQuery && (
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
                {result.type === 'address' && result.data.wallet && (
                  <>
                    <p className="text-center">
                      Registered: {formatTimestamp(result.data.wallet.registeredAt)}
                    </p>
                    {result.data.wallet.isSponsored && (
                      <p className="text-center italic">Sponsored registration</p>
                    )}
                    {result.data.wallet.sourceChainName && (
                      <p className="text-center">Source: {result.data.wallet.sourceChainName}</p>
                    )}
                  </>
                )}
                {result.type === 'address' && result.data.contract && (
                  <p className="text-center">
                    Flagged on {result.data.contract.chains.length} chain
                    {result.data.contract.chains.length > 1 ? 's' : ''}
                  </p>
                )}
                {result.type === 'transaction' && (
                  <p className="text-center">
                    Reported on {result.data.chains.length} chain
                    {result.data.chains.length > 1 ? 's' : ''}
                  </p>
                )}
              </div>
            )}

            {/* Explorer link */}
            <div className="mt-2 flex justify-center">
              {result.type === 'address' ? (
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
