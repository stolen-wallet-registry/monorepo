/**
 * Connected wallet status alert.
 *
 * Automatically checks the connected wallet's registry status and displays
 * a prominent warning if the wallet is registered as stolen or has a pending
 * acknowledgement.
 */

import { useState, useCallback, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { Alert, AlertTitle, AlertDescription, Button, ExplorerLink } from '@swr/ui';
import { AlertTriangle, Clock, X } from 'lucide-react';
import { useRegistryStatus } from '@/hooks';
import { getHubChainIdForEnvironment } from '@/lib/chains/config';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';

const DISMISS_KEY = 'swr-wallet-status-dismissed';

export interface ConnectedWalletStatusProps {
  /** Show even if previously dismissed */
  alwaysShow?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Gets dismissed addresses from localStorage.
 * SSR-safe: returns empty set if localStorage is unavailable.
 */
function getDismissedAddresses(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const stored = localStorage.getItem(DISMISS_KEY);
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch {
    // Ignore localStorage errors
  }
  return new Set();
}

/**
 * Saves dismissed address to localStorage.
 * SSR-safe: no-op if localStorage is unavailable.
 */
function saveDismissedAddress(address: string): void {
  if (typeof window === 'undefined') return;
  try {
    const dismissed = getDismissedAddresses();
    dismissed.add(address.toLowerCase());
    localStorage.setItem(DISMISS_KEY, JSON.stringify([...dismissed]));
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Alert component that displays warning when connected wallet is registered or pending.
 *
 * Features:
 * - Automatically checks connected wallet status
 * - Dismissible with "Don't show again" option
 * - Hidden when wallet is clean
 *
 * @example
 * ```tsx
 * // In Layout.tsx
 * <ConnectedWalletStatus />
 *
 * // Force show even if dismissed
 * <ConnectedWalletStatus alwaysShow />
 * ```
 */
export function ConnectedWalletStatus({
  alwaysShow = false,
  className,
}: ConnectedWalletStatusProps) {
  const { address, isConnected } = useAccount();
  // Track manually dismissed state (user clicked dismiss during this session)
  const [sessionDismissed, setSessionDismissed] = useState(false);

  // Check if this address was previously dismissed (computed, not effect)
  // SSR-safe: defaults to false on server, recomputes on client hydration
  const isDismissed = useMemo(() => {
    if (alwaysShow) return false;
    if (sessionDismissed) return true;
    if (!address) return false;
    if (typeof window === 'undefined') return false;
    return getDismissedAddresses().has(address.toLowerCase());
  }, [address, alwaysShow, sessionDismissed]);

  // Query registry status for connected wallet (always query hub for unified registry)
  const hubChainId = getHubChainIdForEnvironment();
  const { isRegistered, isPending, isLoading, isError, error } = useRegistryStatus({
    address: isConnected ? address : undefined,
    refetchInterval: 60_000, // Check every minute
    chainId: hubChainId,
  });

  // Debug logging for troubleshooting
  // Uses debug level and anonymizes address for privacy
  const shouldShowAlert =
    isConnected &&
    !!address &&
    !isLoading &&
    !isError &&
    (isRegistered || isPending) &&
    (!isDismissed || alwaysShow);

  logger.wallet.debug('[ConnectedWalletStatus] Registry status check', {
    addressPrefix: address ? `${address.slice(0, 6)}...` : undefined,
    isConnected,
    hubChainId,
    queryEnabled: isConnected && !!address,
    isRegistered,
    isPending,
    isLoading,
    isError,
    error: error?.message,
    isDismissed,
    shouldShowAlert,
  });

  const handleDismiss = useCallback(() => {
    if (address) {
      saveDismissedAddress(address);
      setSessionDismissed(true);
    }
  }, [address]);

  // Don't render if:
  // - No wallet connected
  // - Loading or error
  // - Wallet is clean (not registered and not pending)
  // - Dismissed (unless alwaysShow)
  if (!isConnected || !address) return null;
  if (isLoading || isError) {
    if (isError)
      logger.wallet.warn('ConnectedWalletStatus query error, hiding alert', {
        error: error?.message,
      });
    return null;
  }
  if (!isRegistered && !isPending) return null;
  if (isDismissed && !alwaysShow) return null;

  // Registered as stolen - highest priority
  if (isRegistered) {
    return (
      <Alert variant="destructive" className={cn('relative', className)}>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Your connected wallet is registered as stolen</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            This wallet (
            <ExplorerLink
              value={address}
              type="address"
              truncate={false}
              showDisabledIcon={false}
              className="inline"
            />
            ) has been registered as stolen. Consider disconnecting and using a different wallet.
          </p>
        </AlertDescription>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="absolute top-2 right-2 h-6 w-6 p-0"
          aria-label="Dismiss alert"
        >
          <X className="h-4 w-4" />
        </Button>
      </Alert>
    );
  }

  // Pending registration
  if (isPending) {
    return (
      <Alert
        className={cn(
          'relative border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20 text-yellow-900 dark:text-yellow-100',
          className
        )}
      >
        <Clock className="h-4 w-4 text-yellow-600" />
        <AlertTitle className="text-yellow-900 dark:text-yellow-100">
          Your connected wallet has a pending registration
        </AlertTitle>
        <AlertDescription className="text-yellow-800 dark:text-yellow-200">
          <p>
            This wallet (
            <ExplorerLink
              value={address}
              type="address"
              truncate={false}
              showDisabledIcon={false}
              className="inline"
            />
            ) has an acknowledgement pending. Registration may complete soon.
          </p>
        </AlertDescription>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="absolute top-2 right-2 h-6 w-6 p-0 text-yellow-600 hover:text-yellow-800 hover:bg-yellow-100 dark:hover:bg-yellow-900"
          aria-label="Dismiss alert"
        >
          <X className="h-4 w-4" />
        </Button>
      </Alert>
    );
  }

  return null;
}
