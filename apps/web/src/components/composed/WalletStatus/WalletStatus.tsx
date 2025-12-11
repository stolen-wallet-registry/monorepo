import { useEffect, useRef } from 'react';
import { useAccount, useChainId } from 'wagmi';

import { logger } from '@/lib/logger';

/**
 * Displays current wallet connection status and logs connection changes.
 */
export function WalletStatus() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const prevConnected = useRef(isConnected);
  const prevChainId = useRef(chainId);

  // Log wallet connection changes
  useEffect(() => {
    if (isConnected && !prevConnected.current) {
      logger.wallet.info('Wallet connected', { address, chainId });
    } else if (!isConnected && prevConnected.current) {
      logger.wallet.info('Wallet disconnected');
    }
    prevConnected.current = isConnected;
  }, [isConnected, address, chainId]);

  // Log chain changes
  useEffect(() => {
    if (chainId !== prevChainId.current && prevChainId.current !== undefined) {
      logger.wallet.info('Chain changed', { from: prevChainId.current, to: chainId });
    }
    prevChainId.current = chainId;
  }, [chainId]);

  if (!isConnected) {
    return <p className="text-muted-foreground">Connect your wallet to get started.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-green-600 dark:text-green-400 font-medium">Connected</p>
      <p className="text-sm font-mono break-all">Address: {address}</p>
      <p className="text-sm">Chain ID: {chainId}</p>
    </div>
  );
}
