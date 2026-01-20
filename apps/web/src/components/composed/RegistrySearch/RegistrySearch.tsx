/**
 * Registry search component.
 *
 * Allows users to search for wallet addresses or transaction hashes
 * and see their registry status using the Ponder indexer.
 * Uses InputGroup for a composable search input with loading states.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Skeleton,
  Button,
} from '@swr/ui';
import { Search, X, Loader2, Wallet, FileText, AlertCircle } from 'lucide-react';
import {
  useRegistrySearch as useIndexerSearch,
  detectSearchType,
  type SearchResult as IndexerSearchResult,
  type SearchType,
} from '@/hooks';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { WalletSearchResult } from './WalletSearchResult';
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
function getSearchTypeIndicator(type: SearchType) {
  switch (type) {
    case 'wallet':
    case 'caip10':
      return { Icon: Wallet, label: 'Valid wallet address', valid: true };
    case 'transaction':
      return { Icon: FileText, label: 'Valid transaction hash', valid: true };
    case 'invalid':
    default:
      return { Icon: AlertCircle, label: 'Invalid input', valid: false };
  }
}

/**
 * Search component for querying the registry via Ponder indexer.
 * Supports wallet addresses, transaction hashes, and CAIP-10 identifiers.
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

  // Real-time input type detection
  const inputType = detectSearchType(inputValue);

  // Query the indexer
  const { data, isLoading, error } = useIndexerSearch(searchQuery);

  // Notify parent when result changes
  useEffect(() => {
    if (onResult && data && lastNotifiedQueryRef.current !== searchQuery) {
      lastNotifiedQueryRef.current = searchQuery;
      logger.ui.info('Search result ready', {
        query: searchQuery,
        type: data.type,
        found: data.found,
      });
      onResult(data);
    }
  }, [onResult, searchQuery, data]);

  const handleSearch = useCallback(() => {
    const trimmed = inputValue.trim();
    logger.ui.debug('Search initiated', { inputValue: trimmed });

    if (!trimmed) {
      return;
    }

    const type = detectSearchType(trimmed);
    if (type === 'invalid') {
      logger.ui.debug('Search validation failed: invalid input format', { input: trimmed });
      return;
    }

    logger.ui.info('Search started', { query: trimmed, type });
    setSearchQuery(trimmed);
    setHasSearched(true);
    lastNotifiedQueryRef.current = null;
    onSearch?.(trimmed, type);
  }, [inputValue, onSearch]);

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

  const showLoading = hasSearched && isLoading;
  const showResult = hasSearched && data && !isLoading;
  const showError = error;
  const canSearch = inputValue.trim().length >= 10 && inputType !== 'invalid';

  // Get indicator for current input
  const indicator = inputValue.trim() ? getSearchTypeIndicator(inputType) : null;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Search Input */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <InputGroup data-disabled={showLoading} className="flex-1">
            <InputGroupAddon>
              <Search className="h-4 w-4" />
            </InputGroupAddon>
            <InputGroupInput
              value={inputValue}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setInputValue(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search wallet or transaction (0x...)"
              disabled={showLoading}
              aria-invalid={!!showError}
              aria-describedby={showError ? 'search-error' : undefined}
              className={compact ? 'text-sm' : ''}
            />
            {/* Type indicator */}
            {indicator && !showLoading && (
              <InputGroupAddon align="inline-end">
                <indicator.Icon
                  className={cn('h-4 w-4', indicator.valid ? 'text-green-500' : 'text-destructive')}
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
            disabled={showLoading || !canSearch}
            size={compact ? 'sm' : 'default'}
          >
            {showLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>Search</span>}
          </Button>
        </div>

        {/* Error */}
        {showError && (
          <p id="search-error" className="text-sm text-destructive">
            Error querying indexer: {error.message}
          </p>
        )}
      </div>

      {/* Screen reader announcements */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
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
          {data.type === 'wallet' && <WalletSearchResult found={data.found} data={data.data} />}
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
