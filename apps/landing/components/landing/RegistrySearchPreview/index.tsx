'use client';

/**
 * Registry search preview for landing page.
 *
 * Allows visitors to immediately search the registry without connecting a wallet.
 * Uses the shared queryRegistryStatusSimple from @swr/ui.
 */

import { useState, useCallback } from 'react';
import { Search, Loader2, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import {
  Button,
  Input,
  Alert,
  AlertTitle,
  AlertDescription,
  queryRegistryStatusSimple,
  getResultStatus,
  getStatusLabel,
  getStatusDescription,
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
 * Validates if a string is a valid Ethereum address.
 */
function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Get alert variant based on status.
 */
function getAlertVariant(status: ResultStatus): 'destructive' | 'default' {
  if (status === 'registered') return 'destructive';
  return 'default';
}

/**
 * Get status icon based on result.
 */
function StatusIcon({ status }: { status: ResultStatus }) {
  switch (status) {
    case 'registered':
      return <AlertTriangle className="h-5 w-5 text-destructive" />;
    case 'pending':
      return <Clock className="h-5 w-5 text-yellow-500" />;
    case 'not-found':
      return <CheckCircle className="h-5 w-5 text-green-500" />;
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
      return;
    }

    if (!isValidAddress(trimmed)) {
      setError('Invalid address format. Must be 0x followed by 40 hex characters.');
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
    (e: React.FormEvent) => {
      e.preventDefault();
      handleSearch(inputValue);
    },
    [inputValue, handleSearch]
  );

  const handleExampleClick = useCallback(
    (address: string) => {
      setInputValue(address);
      handleSearch(address);
    },
    [handleSearch]
  );

  const resultStatus = result ? getResultStatus(result) : null;

  return (
    <div className={className}>
      {/* Search Form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
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
            className="pl-10"
            disabled={isLoading}
          />
        </div>
        <Button type="submit" disabled={isLoading || !inputValue.trim()}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
        </Button>
      </form>

      {/* Example Buttons */}
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="text-xs text-muted-foreground self-center">Try examples:</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleExampleClick(EXAMPLE_REGISTERED_ADDRESS)}
          disabled={isLoading}
          className="text-xs"
        >
          Stolen Wallet
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleExampleClick(EXAMPLE_CLEAN_ADDRESS)}
          disabled={isLoading}
          className="text-xs"
        >
          Clean Wallet
        </Button>
      </div>

      {/* Error Message */}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {/* Result Display */}
      {result && resultStatus && searchedAddress && (
        <Alert variant={getAlertVariant(resultStatus)} className="mt-4">
          <StatusIcon status={resultStatus} />
          <AlertTitle className="ml-2">{getStatusLabel(resultStatus)}</AlertTitle>
          <AlertDescription className="ml-2">
            <p className="mt-1">{getStatusDescription(resultStatus)}</p>
            <p className="mt-2 font-mono text-xs opacity-70">
              {searchedAddress.slice(0, 6)}...{searchedAddress.slice(-4)}
            </p>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
