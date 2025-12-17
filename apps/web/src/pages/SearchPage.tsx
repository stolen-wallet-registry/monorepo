/**
 * Search page - Query wallet registry status.
 *
 * Allows users to search for any wallet address and see its registry status.
 * Includes recent searches stored in localStorage.
 */

import { useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useAccount } from 'wagmi';
import { isAddress } from 'viem';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from '@swr/ui';
import { RegistrySearch } from '@/components/composed/RegistrySearch';
import { ArrowRight, History, X } from 'lucide-react';

const RECENT_SEARCHES_KEY = 'swr-recent-searches';
const MAX_RECENT_SEARCHES = 5;

/**
 * Gets recent searches from localStorage.
 */
function getRecentSearches(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore localStorage errors
  }
  return [];
}

/**
 * Saves a search to recent searches.
 */
function saveRecentSearch(address: string): void {
  try {
    const recent = getRecentSearches().filter((a) => a.toLowerCase() !== address.toLowerCase());
    recent.unshift(address);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent.slice(0, MAX_RECENT_SEARCHES)));
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Removes a search from recent searches.
 */
function removeRecentSearch(address: string): void {
  try {
    const recent = getRecentSearches().filter((a) => a.toLowerCase() !== address.toLowerCase());
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent));
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Truncates an address for display.
 */
function truncateAddress(address: string): string {
  return `${address.slice(0, 10)}...${address.slice(-8)}`;
}

export function SearchPage() {
  const [, setLocation] = useLocation();
  const { address: connectedAddress } = useAccount();
  // Use lazy initialization to read from localStorage once on mount
  const [recentSearches, setRecentSearches] = useState<string[]>(() => getRecentSearches());
  const [searchAddress, setSearchAddress] = useState<string>('');

  // Handle search result - currently a no-op but available for future use
  const handleResult = useCallback(() => {
    // We don't have the address in the result, so we track it via the component state
    // The RegistrySearch component handles the actual search
  }, []);

  // Track when a search is performed
  const handleSearchAddress = useCallback((address: string) => {
    if (isAddress(address)) {
      saveRecentSearch(address);
      setRecentSearches(getRecentSearches());
      setSearchAddress(address);
    }
  }, []);

  // Handle clicking a recent search
  const handleRecentClick = useCallback((address: string) => {
    setSearchAddress(address);
    saveRecentSearch(address);
    setRecentSearches(getRecentSearches());
  }, []);

  // Remove a recent search
  const handleRemoveRecent = useCallback((address: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeRecentSearch(address);
    setRecentSearches(getRecentSearches());
  }, []);

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Search Registry</h1>
        <p className="text-muted-foreground">
          Check if a wallet address is registered as stolen or has a pending registration.
        </p>
      </div>

      {/* Main Search Card */}
      <Card>
        <CardHeader>
          <CardTitle>Wallet Lookup</CardTitle>
          <CardDescription>
            Enter any Ethereum address to check its registry status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegistrySearch
            key={searchAddress} // Force re-render when address changes
            defaultAddress={searchAddress}
            onResult={handleResult}
          />
        </CardContent>
      </Card>

      {/* Recent Searches */}
      {recentSearches.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="h-4 w-4" />
              Recent Searches
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {recentSearches.map((address) => (
                <li key={address}>
                  <button
                    onClick={() => handleRecentClick(address)}
                    className="w-full flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors text-left group"
                  >
                    <code className="text-sm font-mono">{truncateAddress(address)}</code>
                    <div className="flex items-center gap-2">
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                      <button
                        onClick={(e) => handleRemoveRecent(address, e)}
                        className="h-6 w-6 flex items-center justify-center rounded-sm hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="Remove from recent searches"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {connectedAddress && (
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleSearchAddress(connectedAddress)}
            >
              <span className="text-muted-foreground">Check your wallet:</span>
              <code className="ml-2 text-xs">{truncateAddress(connectedAddress)}</code>
            </Button>
          )}
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => setLocation('/')}
          >
            <ArrowRight className="h-4 w-4 mr-2" />
            Register a stolen wallet
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
