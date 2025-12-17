/**
 * Registry search component.
 *
 * Allows users to search for a wallet address and see its registry status.
 * Uses InputGroup for a composable search input with loading states.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { isAddress } from 'viem';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, Skeleton } from '@swr/ui';
import { Search, X, Loader2 } from 'lucide-react';
import { useRegistryStatus, type RegistryStatus } from '@/hooks';
import { cn } from '@/lib/utils';
import { RegistrySearchResult, type ResultStatus } from './RegistrySearchResult';

export interface RegistrySearchProps {
  /** Pre-fill address (optional) */
  defaultAddress?: string;
  /** Called when search completes */
  onResult?: (result: RegistryStatus) => void;
  /** Compact mode for header/navbar */
  compact?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Determines result status from registry status.
 */
function getResultStatus(status: RegistryStatus): ResultStatus {
  if (status.isRegistered) return 'registered';
  if (status.isPending) return 'pending';
  return 'not-found';
}

/**
 * Search component for querying wallet addresses in the registry.
 *
 * @example
 * ```tsx
 * <RegistrySearch
 *   onResult={(result) => console.log('Search result:', result)}
 * />
 * ```
 */
export function RegistrySearch({
  defaultAddress = '',
  onResult,
  compact = false,
  className,
}: RegistrySearchProps) {
  const [inputValue, setInputValue] = useState(defaultAddress);
  const [searchAddress, setSearchAddress] = useState<`0x${string}` | undefined>(
    isAddress(defaultAddress) ? (defaultAddress as `0x${string}`) : undefined
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(!!defaultAddress && isAddress(defaultAddress));

  // Track which address we've notified for to prevent duplicate callbacks
  const lastNotifiedAddressRef = useRef<string | null>(null);

  const registryStatus = useRegistryStatus({
    address: searchAddress,
  });

  // Notify parent when result changes (using effect to properly track notifications)
  useEffect(() => {
    if (
      onResult &&
      searchAddress &&
      !registryStatus.isLoading &&
      !registryStatus.isError &&
      lastNotifiedAddressRef.current !== searchAddress
    ) {
      lastNotifiedAddressRef.current = searchAddress;
      onResult(registryStatus);
    }
  }, [onResult, searchAddress, registryStatus]);

  const handleSearch = useCallback(() => {
    const trimmed = inputValue.trim();

    // Validate address format
    if (!trimmed) {
      setValidationError('Please enter a wallet address');
      setSearchAddress(undefined);
      setHasSearched(false);
      return;
    }

    if (!isAddress(trimmed)) {
      setValidationError('Invalid Ethereum address. Must be 0x followed by 40 hex characters.');
      setSearchAddress(undefined);
      setHasSearched(false);
      return;
    }

    setValidationError(null);
    setSearchAddress(trimmed as `0x${string}`);
    setHasSearched(true);
    // Reset notification tracking so effect will fire for new address
    lastNotifiedAddressRef.current = null;
  }, [inputValue]);

  const handleClear = useCallback(() => {
    setInputValue('');
    setSearchAddress(undefined);
    setValidationError(null);
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

  const isLoading = hasSearched && searchAddress && registryStatus.isLoading;
  const showResult =
    hasSearched && searchAddress && !registryStatus.isLoading && !registryStatus.isError;
  const showError = validationError || (registryStatus.isError && registryStatus.error);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Search Input */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <InputGroup data-disabled={isLoading} className="flex-1">
            <InputGroupAddon>
              <Search className="h-4 w-4" />
            </InputGroupAddon>
            <InputGroupInput
              value={inputValue}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setInputValue(e.target.value);
                if (validationError) setValidationError(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search wallet address (0x...)"
              disabled={!!isLoading}
              aria-invalid={!!showError}
              aria-describedby={showError ? 'search-error' : undefined}
              className={compact ? 'text-sm' : ''}
            />
            <InputGroupAddon align="inline-end">
              {inputValue && !isLoading ? (
                <InputGroupButton size="icon-xs" onClick={handleClear} aria-label="Clear search">
                  <X className="h-3 w-3" />
                </InputGroupButton>
              ) : null}
            </InputGroupAddon>
          </InputGroup>
          <InputGroupButton
            onClick={handleSearch}
            disabled={!!isLoading || !inputValue.trim()}
            className={compact ? 'h-9 px-3' : 'h-10 px-4'}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Search
              </>
            )}
          </InputGroupButton>
        </div>

        {/* Validation Error */}
        {validationError && (
          <p id="search-error" className="text-sm text-destructive">
            {validationError}
          </p>
        )}

        {/* Contract Error */}
        {registryStatus.isError && registryStatus.error && (
          <p id="search-error" className="text-sm text-destructive">
            Error querying registry: {registryStatus.error.message}
          </p>
        )}
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {/* Search Result */}
      {showResult && (
        <RegistrySearchResult
          address={searchAddress}
          status={getResultStatus(registryStatus)}
          registrationData={registryStatus.registrationData}
          acknowledgementData={registryStatus.acknowledgementData}
        />
      )}
    </div>
  );
}
