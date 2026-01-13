'use client';

/**
 * Registry search preview for landing page.
 *
 * Allows visitors to immediately search the registry without connecting a wallet.
 * Uses the shared queryRegistryStatusSimple from @swr/ui.
 */

import { useState, useCallback, type FormEvent } from 'react';
import { Search, Loader2, AlertTriangle, CheckCircle, Clock, HelpCircle } from 'lucide-react';
import {
  Button,
  Input,
  ExplorerLink,
  getExplorerAddressUrl,
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  queryRegistryStatusSimple,
  getResultStatus,
  getStatusLabel,
  getStatusDescription,
  isAddress,
  type RegistryStatusResult,
  type ResultStatus,
} from '@swr/ui';
import { StolenWalletRegistryABI } from '@swr/abis';
import {
  EXAMPLE_REGISTERED_ADDRESS,
  EXAMPLE_CLEAN_ADDRESS,
  REGISTRY_CHAIN_ID,
  REGISTRY_CONTRACT_ADDRESS,
} from './constants';

interface RegistrySearchPreviewProps {
  className?: string;
}

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
      return <Clock className="h-4 w-4 text-yellow-500" />;
    case 'not-found':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
  }
}

export function RegistrySearchPreview({ className }: RegistrySearchPreviewProps) {
  const [inputValue, setInputValue] = useState('');
  const [result, setResult] = useState<RegistryStatusResult | null>(null);
  const [searchedAddress, setSearchedAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = useCallback(async (address: string) => {
    const trimmed = address.trim();

    if (!trimmed) {
      setError('Please enter a wallet address');
      setResult(null);
      return;
    }

    if (!isAddress(trimmed)) {
      setError('Invalid address format. Must be 0x followed by 40 hex characters.');
      setResult(null);
      return;
    }

    setError(null);
    setIsLoading(true);
    setSearchedAddress(trimmed);

    try {
      const queryResult = await queryRegistryStatusSimple(
        REGISTRY_CHAIN_ID,
        trimmed,
        REGISTRY_CONTRACT_ADDRESS,
        StolenWalletRegistryABI
      );
      setResult(queryResult);
    } catch (err) {
      console.error('Registry query failed:', err);
      setError('Failed to query registry. Please try again.');
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
    (address: string, forceStolen = false) => {
      const trimmed = address.trim();
      setInputValue(trimmed);

      // For demo purposes: force "Stolen Wallet" example to show as registered
      // since we don't have a production registry with actual stolen wallets yet
      if (forceStolen) {
        setError(null);
        setSearchedAddress(trimmed);
        // Mock a "registered" result for demo
        setResult({
          isRegistered: true,
          isPending: false,
          registrationData: null,
          acknowledgementData: null,
        });
        return;
      }

      void handleSearch(trimmed);
    },
    [handleSearch]
  );

  const resultStatus = result ? getResultStatus(result) : null;
  const explorerUrl = searchedAddress
    ? getExplorerAddressUrl(REGISTRY_CHAIN_ID, searchedAddress)
    : null;

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
              placeholder="Search wallet address (0x...)"
              className="pl-10 font-mono text-sm"
              disabled={isLoading}
              aria-label="Wallet address to search"
            />
          </div>
          <Button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            aria-label={isLoading ? 'Searching registry' : 'Search registry'}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs text-center">
              <p>
                Enter any wallet address to check if it&apos;s been reported as stolen in our
                registry.
              </p>
            </TooltipContent>
          </Tooltip>
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
            onClick={() => handleExampleClick(EXAMPLE_REGISTERED_ADDRESS, true)}
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

        {/* Result Display - Compact with colored background */}
        {result && resultStatus && searchedAddress && (
          <div className={`mt-3 rounded-lg border p-3 ${getResultBgClass(resultStatus)}`}>
            <div className="flex items-center justify-center gap-2">
              <StatusIcon status={resultStatus} />
              <span className="font-medium text-sm">{getStatusLabel(resultStatus)}</span>
            </div>
            <p className="mt-1 text-center text-xs text-muted-foreground">
              {getStatusDescription(resultStatus)}
            </p>
            <div className="mt-2 flex justify-center">
              <ExplorerLink
                value={searchedAddress as `0x${string}`}
                type="address"
                href={explorerUrl}
                truncate={false}
                showDisabledIcon={false}
                className="text-xs break-all"
              />
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
