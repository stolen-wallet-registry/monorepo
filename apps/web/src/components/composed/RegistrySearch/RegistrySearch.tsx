/**
 * Registry search component.
 *
 * Allows users to search for a wallet address and see its registry status.
 * Uses InputGroup for a composable search input with loading states.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { isAddress } from 'viem';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Skeleton,
  Button,
} from '@swr/ui';
import { Search, X, Loader2, Check, AlertCircle } from 'lucide-react';
import { useRegistryStatus, type RegistryStatus } from '@/hooks';
import { getHubChainIdForEnvironment } from '@/lib/chains/config';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import type { Address } from '@/lib/types/ethereum';
import { RegistrySearchResult, type ResultStatus } from './RegistrySearchResult';

/** Result passed to onSearch callback */
export interface SearchResult {
  /** The searched address */
  address: Address;
  /** Registry status for the address */
  status: RegistryStatus;
}

export interface RegistrySearchProps {
  /** Pre-fill address (optional) */
  defaultAddress?: string;
  /** Called when a search is initiated with a valid address */
  onSearch?: (address: Address) => void;
  /** Called when search completes with result */
  onResult?: (result: SearchResult) => void;
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
  onSearch,
  onResult,
  compact = false,
  className,
}: RegistrySearchProps) {
  const [inputValue, setInputValue] = useState(defaultAddress);
  const [searchAddress, setSearchAddress] = useState<Address | undefined>(
    isAddress(defaultAddress) ? (defaultAddress as Address) : undefined
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(!!defaultAddress && isAddress(defaultAddress));

  // Track which address we've notified for to prevent duplicate callbacks
  const lastNotifiedAddressRef = useRef<string | null>(null);

  // Real-time address validation (null = empty/no state, true = valid, false = invalid)
  const addressValidation = useMemo(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return null; // Empty = no validation state
    return isAddress(trimmed);
  }, [inputValue]);

  // Always query the hub chain for unified registry (cross-chain registrations settle there)
  const registryStatus = useRegistryStatus({
    address: searchAddress,
    chainId: getHubChainIdForEnvironment(),
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
      logger.ui.info('Search result ready', {
        address: searchAddress,
        isRegistered: registryStatus.isRegistered,
        isPending: registryStatus.isPending,
      });
      onResult({ address: searchAddress, status: registryStatus });
    }
  }, [onResult, searchAddress, registryStatus]);

  const handleSearch = useCallback(() => {
    const trimmed = inputValue.trim();
    logger.ui.debug('Search initiated', { inputValue: trimmed });

    // Validate address format
    if (!trimmed) {
      logger.ui.debug('Search validation failed: empty input');
      setValidationError('Please enter a wallet address');
      setSearchAddress(undefined);
      setHasSearched(false);
      return;
    }

    if (!isAddress(trimmed)) {
      logger.ui.debug('Search validation failed: invalid address format', { input: trimmed });
      setValidationError('Invalid Ethereum address. Must be 0x followed by 40 hex characters.');
      setSearchAddress(undefined);
      setHasSearched(false);
      return;
    }

    const validAddress = trimmed as Address;
    logger.ui.info('Search started', { address: validAddress });

    setValidationError(null);
    setSearchAddress(validAddress);
    setHasSearched(true);
    // Reset notification tracking so effect will fire for new address
    lastNotifiedAddressRef.current = null;

    // Notify parent that search was initiated
    onSearch?.(validAddress);
  }, [inputValue, onSearch]);

  const handleClear = useCallback(() => {
    logger.ui.debug('Search cleared');
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
              aria-describedby={
                validationError
                  ? 'search-error-validation'
                  : registryStatus.isError
                    ? 'search-error-contract'
                    : undefined
              }
              className={compact ? 'text-sm' : ''}
            />
            {/* Validation indicator */}
            {addressValidation !== null && !isLoading && (
              <InputGroupAddon align="inline-end">
                {addressValidation ? (
                  <Check className="h-4 w-4 text-green-500" aria-label="Valid address" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-destructive" aria-label="Invalid address" />
                )}
              </InputGroupAddon>
            )}
            {/* Clear button */}
            <InputGroupAddon align="inline-end">
              {inputValue && !isLoading ? (
                <InputGroupButton size="icon-xs" onClick={handleClear} aria-label="Clear search">
                  <X className="h-3 w-3" />
                </InputGroupButton>
              ) : null}
            </InputGroupAddon>
          </InputGroup>
          <Button
            onClick={handleSearch}
            disabled={!!isLoading || !inputValue.trim()}
            size={compact ? 'sm' : 'default'}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>Search</span>}
          </Button>
        </div>

        {/* Validation Error */}
        {validationError && (
          <p id="search-error-validation" className="text-sm text-destructive">
            {validationError}
          </p>
        )}

        {/* Contract Error */}
        {registryStatus.isError && registryStatus.error && (
          <p id="search-error-contract" className="text-sm text-destructive">
            Error querying registry: {registryStatus.error.message}
          </p>
        )}
      </div>

      {/* Screen reader announcements */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {isLoading && 'Searching registry...'}
        {showResult && `Search complete. Wallet is ${getResultStatus(registryStatus)}.`}
        {showError && 'Search error occurred.'}
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
