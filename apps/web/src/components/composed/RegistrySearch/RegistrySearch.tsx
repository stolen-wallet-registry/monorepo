/**
 * Registry search component.
 *
 * Allows users to search for a wallet address and see its registry status.
 * Uses InputGroup for a composable search input with loading states.
 */

import { useState, useCallback } from 'react';
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

  const registryStatus = useRegistryStatus({
    address: searchAddress,
  });

  // Notify parent when result changes
  if (onResult && searchAddress && !registryStatus.isLoading && !registryStatus.isError) {
    // Use a ref to track if we've already notified for this address
    // to avoid infinite loops
  }

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

    // Notify parent
    if (onResult && !registryStatus.isLoading) {
      onResult(registryStatus);
    }
  }, [inputValue, onResult, registryStatus]);

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
        <InputGroup data-disabled={isLoading}>
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
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : inputValue ? (
              <InputGroupButton size="icon-xs" onClick={handleClear} aria-label="Clear search">
                <X className="h-3 w-3" />
              </InputGroupButton>
            ) : null}
          </InputGroupAddon>
        </InputGroup>

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
