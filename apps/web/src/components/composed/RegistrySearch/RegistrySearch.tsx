/**
 * Registry search component.
 *
 * Allows users to search for wallet addresses, ENS names, or transaction hashes
 * and see their registry status using the Ponder indexer.
 * Uses InputGroup for a composable search input with loading states.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Skeleton,
  Button,
} from '@swr/ui';
import { Search, X, Loader2, Wallet, FileText, AlertCircle, AtSign } from 'lucide-react';
import {
  useRegistrySearch as useIndexerSearch,
  useEnsResolve,
  type SearchResult as IndexerSearchResult,
  type SearchType,
} from '@/hooks';
import { detectSearchTypeWithEns, type SearchTypeWithEns } from '@/lib/ens';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { AddressSearchResult } from './AddressSearchResult';
import { TransactionSearchResult } from './TransactionSearchResult';

export interface RegistrySearchProps {
  /** Pre-fill query (optional) */
  defaultQuery?: string;
  /** Called when a search is initiated */
  onSearch?: (query: string, type: SearchType) => void;
  /** Called when search completes with result */
  onResult?: (result: IndexerSearchResult) => void;
  /** Compact mode for header/navbar */
  compact?: boolean;
  /** Additional class names */
  className?: string;
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
 *   onResult={(result) => console.log('Search result:', result)}
 * />
 * ```
 */
export function RegistrySearch({
  defaultQuery = '',
  onSearch,
  onResult,
  compact = false,
  className,
}: RegistrySearchProps) {
  const [inputValue, setInputValue] = useState(defaultQuery);
  const [searchQuery, setSearchQuery] = useState(defaultQuery);
  const [hasSearched, setHasSearched] = useState(!!defaultQuery);

  // Track which query we've notified for to prevent duplicate callbacks
  const lastNotifiedQueryRef = useRef<string | null>(null);

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

  // Notify parent when result changes (only when user has initiated search)
  useEffect(() => {
    if (!hasSearched || !onResult || !data || !effectiveSearchQuery) return;
    if (lastNotifiedQueryRef.current === effectiveSearchQuery) return;

    lastNotifiedQueryRef.current = effectiveSearchQuery;
    logger.ui.info('Search result ready', {
      query: effectiveSearchQuery,
      type: data.type,
      found: data.found,
    });
    onResult(data);
  }, [hasSearched, onResult, effectiveSearchQuery, data]);

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
      lastNotifiedQueryRef.current = null;
      onSearch?.(resolvedAddress, 'address');
      return;
    }

    logger.ui.info('Search started', { query: trimmed, type });
    setSearchQuery(trimmed);
    setHasSearched(true);
    lastNotifiedQueryRef.current = null;
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
  const showError = error && !isLoading;

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
            Error querying indexer: {error.message}
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
        {showError && 'Search error occurred.'}
      </div>

      {/* Loading Skeleton */}
      {showLoading && (
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-20 w-full" />
        </div>
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
