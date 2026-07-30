import { useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useLocation } from 'wouter';

/**
 * Redirect to home only when the wallet is genuinely disconnected.
 *
 * On a page reload wagmi passes through status 'reconnecting' (with `address` still
 * undefined) before the previous connection is restored, so `isConnected` is false on the
 * first render of every reload. A `!isConnected` redirect therefore bounces the user home
 * on every reload — defeating persisted-flow restoration entirely. Only the settled
 * 'disconnected' state redirects.
 *
 * @returns isReady - true once the connection is established; render nothing (or a
 *   loading state) until then.
 */
export function useRequireWallet(): { isReady: boolean } {
  const { status } = useAccount();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (status === 'disconnected') {
      setLocation('/');
    }
  }, [status, setLocation]);

  return { isReady: status === 'connected' };
}
