/**
 * DevTools "wallet" tab panel - connected account, chain and on-chain nonce.
 *
 * The wagmi hooks stay in DevTools: the nonce is fetched from an effect that also
 * depends on whether the drawer is open, so the fetching logic cannot move here
 * without changing when it runs.
 */

import { cn } from '@/lib/utils';
import type { Address } from '@/lib/types/ethereum';

interface WalletTabProps {
  isConnected: boolean;
  address: Address | undefined;
  chainId: number;
  /** Latest fetched transaction count, or null when unknown */
  blockchainNonce: bigint | null;
  nonceLoading: boolean;
  onRefreshNonce: () => void;
}

export function WalletTab({
  isConnected,
  address,
  chainId,
  blockchainNonce,
  nonceLoading,
  onRefreshNonce,
}: WalletTabProps) {
  if (!isConnected) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-muted-foreground">Connect wallet to view nonce info</p>
      </div>
    );
  }

  return (
    <>
      {/* Connected Wallet Info */}
      <div className="mb-4">
        <span className="mb-1 block text-xs font-medium text-muted-foreground">
          Connected Wallet
        </span>
        <p className="font-mono text-xs text-foreground break-all">{address}</p>
      </div>

      {/* Chain ID */}
      <div className="mb-4">
        <span className="mb-1 block text-xs font-medium text-muted-foreground">Chain ID</span>
        <p className="font-mono text-sm text-foreground">{chainId}</p>
      </div>

      {/* Blockchain Nonce */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-muted-foreground">Blockchain Nonce</span>
          <button
            type="button"
            onClick={onRefreshNonce}
            disabled={nonceLoading}
            className={cn(
              'rounded px-2 py-0.5 text-xs',
              'bg-muted text-muted-foreground hover:bg-muted/80',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {nonceLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        <p className="font-mono text-2xl font-bold text-foreground">
          {blockchainNonce !== null ? blockchainNonce.toString() : '—'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          This is the next nonce the blockchain expects for your wallet.
        </p>
      </div>

      {/* MetaMask Reset Instructions */}
      <div className="border-t border-border pt-3">
        <h4 className="mb-2 text-xs font-medium text-muted-foreground">MetaMask Nonce Sync</h4>
        <p className="text-xs text-muted-foreground mb-2">
          If MetaMask shows "Internal JSON-RPC error", your local nonce may be stale. Reset
          MetaMask's account nonce:
        </p>
        <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
          <li>Open MetaMask → click account icon</li>
          <li>Settings → Advanced</li>
          <li>Click "Clear activity tab data"</li>
          <li>Confirm and retry the transaction</li>
        </ol>
        <p className="mt-2 text-xs text-yellow-600 dark:text-yellow-400">
          Note: This only affects local history, not your on-chain balance.
        </p>
      </div>
    </>
  );
}
