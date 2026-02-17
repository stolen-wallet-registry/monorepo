/**
 * Search page - Query wallet registry status.
 *
 * Allows users to search for any wallet address and see its registry status.
 * Includes recent searches stored in localStorage with chain and type info.
 */

import { useState, useCallback, useSyncExternalStore } from 'react';
import { useLocation } from 'wouter';
import { useAccount, useChainId } from 'wagmi';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@swr/ui';
import { RegistrySearch } from '@/components/composed/RegistrySearch';
import type { SearchResult as IndexerSearchResult, SearchType } from '@/hooks';
import { ExplorerLink } from '@/components/composed/ExplorerLink';
import {
  ArrowRight,
  History,
  X,
  Wallet,
  FileText,
  Code,
  AlertTriangle,
  Clock,
  CheckCircle,
} from 'lucide-react';
import { truncateAddress } from '@/lib/address';
import { getChainDisplayInfo } from '@/lib/chains';
import { logger } from '@/lib/logger';
import { redactAddress } from '@/lib/logger/formatters';
import { isAddress } from '@/lib/types/ethereum';
import type { Address } from '@/lib/types/ethereum';

const RECENT_SEARCHES_KEY = 'swr-recent-searches';
const MAX_RECENT_SEARCHES = 5;

/** Registry entry types */
type RegistryType = 'wallet' | 'transaction' | 'contract';
const VALID_TYPES: RegistryType[] = ['wallet', 'transaction', 'contract'];

/** Search result status */
type SearchResultStatus = 'registered' | 'pending' | 'clean' | 'unknown';
const VALID_STATUSES: SearchResultStatus[] = ['registered', 'pending', 'clean', 'unknown'];

/** Recent search entry with metadata */
interface RecentSearch {
  /** The address or identifier searched */
  address: Address;
  /** Chain ID where the search was performed */
  chainId: number;
  /** Type of registry entry */
  type: RegistryType;
  /** Result status from the search */
  resultStatus: SearchResultStatus;
  /** Timestamp of the search */
  timestamp: number;
}

/** Type display info */
const TYPE_INFO: Record<RegistryType, { label: string; icon: typeof Wallet }> = {
  wallet: { label: 'Wallet', icon: Wallet },
  transaction: { label: 'Transaction', icon: FileText },
  contract: { label: 'Contract', icon: Code },
};

/** Result status display info */
const RESULT_STATUS_INFO: Record<
  SearchResultStatus,
  { label: string; icon: typeof AlertTriangle; color: string }
> = {
  registered: { label: 'Stolen', icon: AlertTriangle, color: 'text-destructive' },
  pending: { label: 'Pending', icon: Clock, color: 'text-yellow-500' },
  clean: { label: 'Clean', icon: CheckCircle, color: 'text-green-500' },
  unknown: { label: 'Unknown', icon: CheckCircle, color: 'text-muted-foreground' },
};

// Stable empty array for server snapshot (must be same reference always)
const EMPTY_SEARCHES: RecentSearch[] = [];

// Cached snapshot for useSyncExternalStore (must return same reference if data unchanged)
let cachedRecentSearches: RecentSearch[] = EMPTY_SEARCHES;
let cachedRecentSearchesJson: string | null = null;

/**
 * Validates and normalizes a recent search entry.
 * Returns null if the entry is invalid.
 */
function normalizeRecentSearch(entry: unknown): RecentSearch | null {
  if (!entry || typeof entry !== 'object') return null;
  const e = entry as Record<string, unknown>;

  // Must have a valid address string
  if (typeof e.address !== 'string' || !e.address) return null;
  if (!isAddress(e.address)) return null;

  return {
    address: e.address,
    chainId: typeof e.chainId === 'number' ? e.chainId : 31337,
    type: VALID_TYPES.includes(e.type as RegistryType) ? (e.type as RegistryType) : 'wallet',
    resultStatus: VALID_STATUSES.includes(e.resultStatus as SearchResultStatus)
      ? (e.resultStatus as SearchResultStatus)
      : 'unknown',
    timestamp: typeof e.timestamp === 'number' ? e.timestamp : Date.now(),
  };
}

/**
 * Gets recent searches from localStorage.
 * SSR-safe: returns empty array if localStorage is unavailable.
 * Returns cached reference if data unchanged (required for useSyncExternalStore).
 */
function getRecentSearches(): RecentSearch[] {
  if (typeof window === 'undefined') return cachedRecentSearches;
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    // Return cached if unchanged
    if (stored === cachedRecentSearchesJson) {
      return cachedRecentSearches;
    }
    // Update cache
    cachedRecentSearchesJson = stored;
    if (!stored) {
      cachedRecentSearches = [];
      return cachedRecentSearches;
    }

    // Parse and normalize/filter entries
    const parsed: unknown = JSON.parse(stored);
    cachedRecentSearches = (Array.isArray(parsed) ? parsed : [])
      .map(normalizeRecentSearch)
      .filter((entry): entry is RecentSearch => entry !== null);
    return cachedRecentSearches;
  } catch {
    // Ignore localStorage errors
  }
  return cachedRecentSearches;
}

/**
 * Saves a search to recent searches.
 * SSR-safe: no-op if localStorage is unavailable.
 */
function saveRecentSearch(search: Omit<RecentSearch, 'timestamp'>): void {
  if (typeof window === 'undefined') return;
  if (!search.address) return;

  try {
    logger.ui.debug('Saving recent search', {
      address: redactAddress(search.address),
      chainId: search.chainId,
      resultStatus: search.resultStatus,
    });
    const searchAddressLower = search.address.toLowerCase();
    const recent = getRecentSearches().filter(
      (s) => s.address && s.address.toLowerCase() !== searchAddressLower
    );
    recent.unshift({ ...search, timestamp: Date.now() });
    const toSave = recent.slice(0, MAX_RECENT_SEARCHES);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(toSave));
    // Invalidate cache so next read gets fresh data
    cachedRecentSearchesJson = null;
    logger.ui.info('Recent search saved', {
      address: redactAddress(search.address),
      resultStatus: search.resultStatus,
      totalSearches: toSave.length,
    });
  } catch (error) {
    logger.ui.error(
      'Failed to save recent search',
      { address: redactAddress(search.address) },
      error as Error
    );
  }
}

/**
 * Updates the result status for an existing recent search.
 */
function updateRecentSearchResult(address: string, resultStatus: SearchResultStatus): void {
  if (typeof window === 'undefined') return;
  if (!address) return;

  try {
    const addressLower = address.toLowerCase();
    const recent = getRecentSearches().map((s) =>
      s.address && s.address.toLowerCase() === addressLower ? { ...s, resultStatus } : s
    );
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent));
    // Invalidate cache so next read gets fresh data
    cachedRecentSearchesJson = null;
    logger.ui.debug('Recent search result updated', {
      address: redactAddress(address),
      resultStatus,
    });
  } catch (error) {
    logger.ui.error(
      'Failed to update recent search result',
      { address: redactAddress(address) },
      error as Error
    );
  }
}

/**
 * Removes a search from recent searches.
 * SSR-safe: no-op if localStorage is unavailable.
 */
function removeRecentSearch(address: string): void {
  if (typeof window === 'undefined') return;
  try {
    const recent = getRecentSearches().filter(
      (s) => s.address.toLowerCase() !== address.toLowerCase()
    );
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent));
    // Invalidate cache so next read gets fresh data
    cachedRecentSearchesJson = null;
  } catch {
    // Ignore localStorage errors
  }
}

// Track subscribers for external store pattern
let recentSearchesListeners: Array<() => void> = [];

/**
 * Notifies all subscribers that recent searches changed.
 */
function notifyRecentSearchesChange(): void {
  recentSearchesListeners.forEach((listener) => listener());
}

/**
 * Subscribe to recent searches changes (external store pattern).
 */
function subscribeToRecentSearches(listener: () => void): () => void {
  recentSearchesListeners.push(listener);
  return () => {
    recentSearchesListeners = recentSearchesListeners.filter((l) => l !== listener);
  };
}

/**
 * Server snapshot - returns stable empty array reference.
 */
function getServerSnapshot(): RecentSearch[] {
  return EMPTY_SEARCHES;
}

export function SearchPage() {
  const [, setLocation] = useLocation();
  const { address: connectedAddress } = useAccount();
  const chainId = useChainId();
  // Use external store pattern for SSR-safe localStorage access
  const recentSearches = useSyncExternalStore(
    subscribeToRecentSearches,
    getRecentSearches,
    getServerSnapshot
  );
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Handle when a search is initiated (save to recent searches with unknown status initially)
  const handleSearch = useCallback(
    (query: string, type: SearchType) => {
      // Only save address searches to recent (they're the primary use case)
      if (type === 'address' || type === 'caip10') {
        // Extract address from CAIP-10 (format: namespace:chainId:address)
        const address = type === 'caip10' ? (query.split(':')[2] ?? query) : query;
        logger.ui.info('Search initiated from input', { address: redactAddress(address), chainId });
        saveRecentSearch({ address, chainId, type: 'wallet', resultStatus: 'unknown' });
        notifyRecentSearchesChange();
      } else {
        logger.ui.info('Transaction search initiated', { query, type });
      }
      setSearchQuery(query);
    },
    [chainId]
  );

  // Handle search result - update the recent search with actual result status
  const handleResult = useCallback((result: IndexerSearchResult) => {
    if (result.type === 'address' && result.data) {
      const resultStatus: SearchResultStatus = result.found ? 'registered' : 'clean';
      logger.ui.info('Address search result received', {
        address: redactAddress(result.data.address),
        found: result.found,
        foundInWalletRegistry: result.foundInWalletRegistry,
        foundInContractRegistry: result.foundInContractRegistry,
        resultStatus,
      });
      updateRecentSearchResult(result.data.address, resultStatus);
      notifyRecentSearchesChange();
    } else if (result.type === 'transaction') {
      logger.ui.info('Transaction search result received', {
        found: result.found,
        chains: result.data?.chains.length ?? 0,
      });
    }
  }, []);

  // Handle clicking "Check your wallet" quick action
  const handleQuickCheckWallet = useCallback(
    (address: Address) => {
      logger.ui.info('Quick action: check wallet', { address: redactAddress(address) });
      saveRecentSearch({ address, chainId, type: 'wallet', resultStatus: 'unknown' });
      notifyRecentSearchesChange();
      setSearchQuery(address);
    },
    [chainId]
  );

  // Handle clicking a recent search
  const handleRecentClick = useCallback((search: RecentSearch) => {
    logger.ui.info('Recent search clicked', {
      address: redactAddress(search.address),
      chainId: search.chainId,
    });
    setSearchQuery(search.address);
    saveRecentSearch({
      address: search.address,
      chainId: search.chainId ?? 31337,
      type: search.type ?? 'wallet',
      resultStatus: search.resultStatus ?? 'unknown',
    });
    notifyRecentSearchesChange();
  }, []);

  // Remove a recent search
  const handleRemoveRecent = useCallback(
    (address: string, e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation();
      logger.ui.info('Recent search removed', { address: redactAddress(address) });
      removeRecentSearch(address);
      notifyRecentSearchesChange();
    },
    []
  );

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
            key={searchQuery} // Force re-render when query changes
            defaultQuery={searchQuery}
            onSearch={handleSearch}
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
              {recentSearches.map((search) => {
                const chainInfo = getChainDisplayInfo(search.chainId);
                const type = search.type ?? 'wallet';
                const typeInfo = TYPE_INFO[type];
                const TypeIcon = typeInfo.icon;
                const resultStatus = search.resultStatus ?? 'unknown';
                const resultInfo = RESULT_STATUS_INFO[resultStatus];
                const ResultIcon = resultInfo.icon;

                return (
                  <li key={search.address}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => handleRecentClick(search)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleRecentClick(search);
                        }
                      }}
                      className="w-full flex items-center justify-between p-3 rounded-md border border-border hover:bg-muted transition-colors text-left group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <div className="flex items-center gap-3">
                        {/* Result status icon */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">
                              <ResultIcon className={`h-4 w-4 ${resultInfo.color}`} />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{resultInfo.label}</TooltipContent>
                        </Tooltip>
                        {/* Chain indicator */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={`w-2 h-2 rounded-full ${chainInfo.color} cursor-help`}
                            />
                          </TooltipTrigger>
                          <TooltipContent>{chainInfo.name}</TooltipContent>
                        </Tooltip>
                        {/* Type icon */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">
                              <TypeIcon className="h-4 w-4 text-muted-foreground" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{typeInfo.label}</TooltipContent>
                        </Tooltip>
                        {/* Address with copy button */}
                        <ExplorerLink
                          value={search.address}
                          type="address"
                          showDisabledIcon={false}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                        <button
                          onClick={(e) => handleRemoveRecent(search.address, e)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleRemoveRecent(search.address, e);
                            }
                          }}
                          className="h-6 w-6 flex items-center justify-center rounded-sm hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                          aria-label="Remove from recent searches"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
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
              className="w-full justify-start gap-2"
              onClick={() => handleQuickCheckWallet(connectedAddress)}
            >
              <Wallet className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Check your wallet:</span>
              <code className="text-xs">{truncateAddress(connectedAddress)}</code>
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
