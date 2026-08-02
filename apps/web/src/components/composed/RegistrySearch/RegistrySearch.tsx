/**
 * Registry search component.
 *
 * Allows users to search for wallet addresses, ENS names, or transaction hashes
 * and see their registry status using the Ponder indexer.
 * Uses InputGroup for a composable search input with loading states.
 */

import { useState, useCallback, useMemo } from 'react';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Skeleton,
  Button,
} from '@swr/ui';
import {
  Search,
  X,
  Loader2,
  Wallet,
  FileText,
  AlertCircle,
  AtSign,
  AlertTriangle,
} from 'lucide-react';
import {
  useRegistrySearch as useIndexerSearch,
  useEnsResolve,
  useIndexerStatus,
  type SearchType,
} from '@/hooks';
import { isSearchUnavailableError } from '@swr/search';
import { detectSearchTypeWithEns, type SearchTypeWithEns } from '@/lib/ens';
import { cn, sanitizeErrorMessage } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { AddressSearchResult } from './AddressSearchResult';
import { TransactionSearchResult } from './TransactionSearchResult';

export interface RegistrySearchProps {
  /** Pre-fill query (optional) */
  defaultQuery?: string;
  /**
   * Called when a search is initiated, with the query actually sent to the
   * indexer (ENS names are reported as their resolved address).
   *
   * Results are deliberately not handed back: a parent that needs them calls
   * `useRegistrySearch` with this same query and reads them from the cache.
   */
  onSearch?: (query: string, type: SearchType) => void;
  /** Compact mode for header/navbar */
  compact?: boolean;
  /** Additional class names */
  className?: string;
}

/** Approximate lag in words, for a caveat line rather than a metric. */
function formatLag(seconds: number): string {
  if (seconds < 120) return `${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 120) return `${minutes} minutes`;
  return `${Math.round(minutes / 60)} hours`;
}

/**
 * Get validation indicator based on search type
 */
function getSearchTypeIndicator(type: SearchTypeWithEns) {
  switch (type) {
    case 'address':
    case 'caip10':
      return { Icon: Wallet, label: 'Valid address', valid: true };
    case 'ens':
      return { Icon: AtSign, label: 'ENS name', valid: true };
    case 'transaction':
      return { Icon: FileText, label: 'Valid transaction hash', valid: true };
    case 'invalid':
    default:
      return { Icon: AlertCircle, label: 'Invalid input', valid: false };
  }
}

/**
 * Search component for querying the registry via Ponder indexer.
 * Supports wallet addresses, ENS names, transaction hashes, and CAIP-10 identifiers.
 *
 * @example
 * ```tsx
 * <RegistrySearch
 *   onSearch={(query, type) => console.log('Searching', type, query)}
 * />
 * ```
 */
export function RegistrySearch({
  defaultQuery = '',
  onSearch,
  compact = false,
  className,
}: RegistrySearchProps) {
  const [inputValue, setInputValue] = useState(defaultQuery);
  const [searchQuery, setSearchQuery] = useState(defaultQuery);
  const [hasSearched, setHasSearched] = useState(!!defaultQuery);

  // Real-time input type detection (with ENS support)
  const inputType = useMemo(() => detectSearchTypeWithEns(inputValue), [inputValue]);

  // ENS resolution (only when input looks like ENS name)
  const ensName = inputType === 'ens' ? inputValue.trim() : undefined;
  const {
    address: resolvedAddress,
    isLoading: isEnsLoading,
    isError: isEnsError,
  } = useEnsResolve(ensName);

  // Determine the effective search value (use resolved address for ENS)
  // Only switch to resolved address AFTER user has initiated search (hasSearched = true)
  const effectiveSearchQuery = useMemo(() => {
    if (!hasSearched) return searchQuery;
    if (inputType === 'ens' && resolvedAddress) {
      return resolvedAddress;
    }
    return searchQuery;
  }, [hasSearched, inputType, resolvedAddress, searchQuery]);

  // Query the indexer with effective query (empty string when not searching - hook disables itself)
  const indexerQuery = hasSearched ? effectiveSearchQuery : '';
  const { data, isLoading, error } = useIndexerSearch(indexerQuery);
  // Only polled once a search has happened — see UseIndexerStatusOptions.enabled. Until then
  // `stale` reads true (unknown freshness), which is the safe default and unused anyway,
  // since the caveat only renders alongside a result.
  const { stale: indexerStale, data: indexerStatus } = useIndexerStatus({ enabled: hasSearched });

  const handleSearch = useCallback(() => {
    const trimmed = inputValue.trim();
    logger.ui.debug('Search initiated', { inputValue: trimmed });

    if (!trimmed) {
      return;
    }

    const type = detectSearchTypeWithEns(trimmed);
    if (type === 'invalid') {
      logger.ui.debug('Search validation failed: invalid input format', { input: trimmed });
      return;
    }

    // For ENS names, we need to wait for resolution
    if (type === 'ens') {
      if (isEnsLoading) {
        logger.ui.debug('ENS resolution in progress', { input: trimmed });
        return;
      }
      if (!resolvedAddress) {
        logger.ui.debug('ENS name could not be resolved', { input: trimmed });
        return;
      }
      logger.ui.info('Search started with resolved ENS', {
        ensName: trimmed,
        address: resolvedAddress,
      });
      setSearchQuery(resolvedAddress);
      setHasSearched(true);
      onSearch?.(resolvedAddress, 'address');
      return;
    }

    logger.ui.info('Search started', { query: trimmed, type });
    setSearchQuery(trimmed);
    setHasSearched(true);
    // Map SearchTypeWithEns to SearchType for callback
    const callbackType: SearchType = type === 'caip10' ? 'caip10' : type;
    onSearch?.(trimmed, callbackType);
  }, [inputValue, onSearch, isEnsLoading, resolvedAddress]);

  const handleClear = useCallback(() => {
    logger.ui.debug('Search cleared');
    setInputValue('');
    setSearchQuery('');
    setHasSearched(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSearch();
      }
    },
    [handleSearch]
  );

  // Determine loading states
  const showLoading = hasSearched && isLoading;
  const showEnsLoading = inputType === 'ens' && isEnsLoading;
  const showResult = hasSearched && data && !isLoading;

  // `@swr/search` fails CLOSED: rather than return a result an integrator could read as
  // "clean", it throws `SearchUnavailableError` when it cannot establish whether an identifier
  // is registered. TanStack Query hands that back as `error`, but it is not an error in the
  // sense the generic line below means — the search ran, the registry simply was not checked,
  // and that is a distinct state the user must be shown as such (audit finding V2). Rendering
  // it as "Error querying indexer: …" buries the one fact that matters.
  //
  // Deliberately narrow: only this error type gets the card. Anything else is a genuine
  // failure of ours and stays on the generic path, where it is sanitized.
  const unavailable = error && isSearchUnavailableError(error) ? error : null;
  const showUnavailable = Boolean(unavailable) && !isLoading;
  const showError = error && !unavailable && !isLoading;

  // A "not found" is a statement about the blocks the indexer has actually processed. If it
  // is behind, everything registered in the gap reads as clean, so the caveat belongs next to
  // the result — only when there is nothing to report, since a hit stands on its own.
  //
  // `type: 'invalid'` is excluded: it also carries `found: false`, but nothing was queried, so
  // indexer lag has no bearing on it. Warning there attaches a scary, irrelevant caveat to what
  // is really just a typo, and trains people to ignore the warning where it does matter.
  const showStaleWarning = Boolean(
    showResult && data && data.type !== 'invalid' && !data.found && indexerStale
  );

  // Can search if input is valid and not loading ENS
  const canSearch = useMemo(() => {
    if (inputValue.trim().length < 3) return false;
    if (inputType === 'invalid') return false;
    if (inputType === 'ens') {
      // For ENS, need to have resolved address or be currently loading
      return !isEnsLoading && !isEnsError && !!resolvedAddress;
    }
    return inputValue.trim().length >= 10;
  }, [inputValue, inputType, isEnsLoading, isEnsError, resolvedAddress]);

  // Get indicator for current input
  const indicator = useMemo(() => {
    if (!inputValue.trim()) return null;

    // For ENS names, show loading or error states
    if (inputType === 'ens') {
      if (isEnsLoading) {
        return { Icon: Loader2, label: 'Resolving ENS...', valid: true, loading: true };
      }
      if (isEnsError || !resolvedAddress) {
        return { Icon: AlertCircle, label: 'ENS not found', valid: false };
      }
      return { Icon: AtSign, label: `Resolves to ${resolvedAddress.slice(0, 10)}...`, valid: true };
    }

    return getSearchTypeIndicator(inputType);
  }, [inputValue, inputType, isEnsLoading, isEnsError, resolvedAddress]);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Search Input */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <InputGroup data-disabled={showLoading || showEnsLoading} className="flex-1">
            <InputGroupAddon>
              <Search className="h-4 w-4" />
            </InputGroupAddon>
            <InputGroupInput
              value={inputValue}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setInputValue(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search wallet, ENS name, or transaction (0x... or name.eth)"
              disabled={showLoading}
              aria-invalid={!!showError}
              aria-describedby={showError ? 'search-error' : undefined}
              className={compact ? 'text-sm' : ''}
            />
            {/* Type indicator */}
            {indicator && !showLoading && (
              <InputGroupAddon align="inline-end">
                <indicator.Icon
                  className={cn(
                    'h-4 w-4',
                    indicator.valid ? 'text-green-500' : 'text-destructive',
                    'loading' in indicator && indicator.loading
                      ? 'animate-spin text-muted-foreground'
                      : ''
                  )}
                  aria-label={indicator.label}
                />
              </InputGroupAddon>
            )}
            {/* Clear button */}
            <InputGroupAddon align="inline-end">
              {inputValue && !showLoading ? (
                <InputGroupButton size="icon-xs" onClick={handleClear} aria-label="Clear search">
                  <X className="h-3 w-3" />
                </InputGroupButton>
              ) : null}
            </InputGroupAddon>
          </InputGroup>
          <Button
            onClick={handleSearch}
            disabled={showLoading || showEnsLoading || !canSearch}
            size={compact ? 'sm' : 'default'}
          >
            {showLoading || showEnsLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <span>Search</span>
            )}
          </Button>
        </div>

        {/* ENS resolution hint */}
        {inputType === 'ens' && resolvedAddress && !showLoading && (
          <p className="text-xs text-muted-foreground">
            {inputValue.trim()} resolves to {resolvedAddress.slice(0, 10)}...
            {resolvedAddress.slice(-8)}
          </p>
        )}

        {/* Error */}
        {showError && (
          <p id="search-error" className="text-sm text-destructive">
            {/* graphql-request's ClientError embeds the request and response verbatim, so
                the raw message is not safe to render. Sanitize like every other error
                surface; see the V29 tests in @swr/errors. */}
            Error querying indexer: {sanitizeErrorMessage(error)}
          </p>
        )}
      </div>

      {/* Screen reader announcements */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {showEnsLoading && 'Resolving ENS name...'}
        {showLoading && 'Searching registry...'}
        {showResult &&
          data &&
          `Search complete. ${data.found ? 'Match found.' : 'No match found.'}`}
        {showUnavailable && 'Search could not be completed. The registry was not checked.'}
        {showError && 'Search error occurred.'}
      </div>

      {/* Loading Skeleton */}
      {showLoading && (
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {/* Indexer freshness caveat on a negative result */}
      {showStaleWarning && (
        <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            {indexerStatus?.lagSeconds != null
              ? `The indexer is about ${formatLag(indexerStatus.lagSeconds)} behind, so anything registered since then is not reflected here.`
              : 'The indexer’s progress could not be confirmed, so this result may not reflect recent registrations.'}
          </span>
        </p>
      )}

      {/* Could not verify — an unknown, never an absence. See `unavailable` above. */}
      {showUnavailable && unavailable && (
        <AddressSearchResult
          found={false}
          foundInWalletRegistry={false}
          foundInContractRegistry={false}
          data={null}
          unverified={unavailable.unverified}
          reason={unavailable.reason}
        />
      )}

      {/* Search Results */}
      {showResult && data && (
        <>
          {data.type === 'address' && (
            <AddressSearchResult
              found={data.found}
              foundInWalletRegistry={data.foundInWalletRegistry}
              foundInContractRegistry={data.foundInContractRegistry}
              data={data.data}
              unverified={data.unverified}
            />
          )}
          {data.type === 'transaction' && (
            <TransactionSearchResult found={data.found} data={data.data} />
          )}
          {data.type === 'invalid' && (
            <p className="text-sm text-muted-foreground">Invalid search input.</p>
          )}
        </>
      )}
    </div>
  );
}
