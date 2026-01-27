/**
 * Displays a table of selected transactions for fraud reporting.
 *
 * Used in the Transaction Batch Summary and payment steps to show
 * which transactions are being registered.
 *
 * Transactions are displayed with chain context using CAIP-2 format for the
 * chain identifier (e.g., "eip155:8453") plus the transaction hash.
 *
 * NOTE: This is NOT CAIP-10. CAIP-10 is specifically for account identifiers
 * (addresses), not transaction hashes. We use a similar "chain-qualified"
 * format for consistency and cross-chain identification.
 */

import { useState, useRef, useEffect } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@swr/ui';
import { Copy, Check, ExternalLink, Info } from 'lucide-react';
import { formatEther } from 'viem';
import { getChainName } from '@swr/chains';
import { getExplorerTxUrl } from '@/lib/explorer';
import type { StoredTransactionDetail } from '@/stores/transactionFormStore';

export interface SelectedTransactionsTableProps {
  /** Transaction details to display */
  transactions: StoredTransactionDetail[];
  /** Maximum height before scrolling (default: 160px / max-h-40) */
  maxHeight?: string;
  /** Whether to show value column */
  showValue?: boolean;
  /** Whether to show block column */
  showBlock?: boolean;
  /** Reported chain ID (EIP-155 number) for chain-qualified display */
  reportedChainId?: number | null;
}

/**
 * Format a transaction hash for display (truncated).
 * Uses longer suffix (8 chars) since there's no CAIP prefix.
 */
function formatTxHash(hash: string): string {
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

/**
 * Format a chain-qualified transaction reference for display (truncated).
 * Format: eip155:{chainId}:{truncatedHash}
 * Uses shorter suffix (6 chars) to accommodate the chain prefix length.
 *
 * Note: This format is inspired by CAIP-10 (namespace:chainId:identifier) but
 * applies it to transaction hashes rather than account addresses. CAIP-10 is
 * specifically for accounts, so we call this "chain-qualified" to be accurate.
 */
function formatChainQualifiedTx(hash: string, chainId: number): string {
  const prefix = `eip155:${chainId}:`;
  const truncatedHash = `${hash.slice(0, 10)}...${hash.slice(-6)}`;
  return `${prefix}${truncatedHash}`;
}

/**
 * Build full chain-qualified transaction reference.
 * Format: namespace:chainId:txHash (e.g., eip155:8453:0x...)
 */
function buildChainQualifiedTxRef(hash: string, chainId: number): string {
  return `eip155:${chainId}:${hash}`;
}

/**
 * Format an address for display (truncated).
 */
function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format ETH value from string representation.
 */
function formatValue(value: string): string {
  try {
    const eth = formatEther(BigInt(value));
    const numEth = parseFloat(eth);
    if (numEth === 0) return '0 ETH';
    if (numEth < 0.001) return '< 0.001 ETH';
    return `${numEth.toFixed(4)} ETH`;
  } catch {
    return '--';
  }
}

/**
 * Copy button with feedback.
 * Clears timeout on unmount to prevent state updates on unmounted component.
 */
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      // Clear any existing timeout before scheduling a new one
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Silently fail
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleCopy}
          className="p-0.5 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground"
          aria-label={copied ? 'Copied!' : 'Copy transaction hash'}
        >
          {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="text-xs">{copied ? 'Copied!' : 'Copy tx hash'}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Explorer link button.
 */
function ExplorerButton({ hash, chainId }: { hash: string; chainId: number }) {
  const explorerUrl = getExplorerTxUrl(chainId, hash);

  if (!explorerUrl) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-0.5 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground"
          aria-label="View on explorer"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="text-xs">View on explorer</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Table showing selected transactions with their details.
 */
export function SelectedTransactionsTable({
  transactions,
  maxHeight = 'max-h-40',
  showValue = false,
  showBlock = false,
  reportedChainId,
}: SelectedTransactionsTableProps) {
  const showChainContext = reportedChainId != null;
  if (transactions.length === 0) {
    return (
      <div className="rounded-lg border p-4 bg-muted/30 text-center text-sm text-muted-foreground">
        No transactions selected
      </div>
    );
  }

  // Get chain name for display
  const chainName = showChainContext && reportedChainId ? getChainName(reportedChainId) : null;

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="px-4 py-2 bg-muted/30 border-b">
        <p className="text-sm font-medium">Selected Transactions ({transactions.length})</p>
      </div>
      <div className={`${maxHeight} overflow-y-auto`}>
        <table className="w-full text-xs">
          <thead className="bg-background sticky top-0 z-10">
            <tr className="border-b bg-muted">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground w-8">#</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                {showChainContext ? (
                  <span className="inline-flex items-center gap-1">
                    Transaction
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p className="text-xs">
                          Transactions are shown with their <strong>chain context</strong> (CAIP-2
                          format) to uniquely identify them across blockchains.
                        </p>
                        <p className="text-xs mt-1 text-muted-foreground">
                          Format: eip155:{'{chainId}'}:{'{txHash}'}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </span>
                ) : (
                  'Hash'
                )}
              </th>
              {showChainContext && (
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Chain</th>
              )}
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">To</th>
              {showValue && (
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Value</th>
              )}
              {showBlock && (
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Block</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {transactions.map((tx, index) => (
              <tr key={tx.hash} className="hover:bg-muted/30">
                <td className="px-3 py-1.5 text-muted-foreground">{index + 1}</td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <code className="font-mono cursor-default text-xs">
                          {showChainContext && reportedChainId != null
                            ? formatChainQualifiedTx(tx.hash, reportedChainId)
                            : formatTxHash(tx.hash)}
                        </code>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-md">
                        <p className="text-xs font-mono break-all">
                          {showChainContext && reportedChainId != null
                            ? buildChainQualifiedTxRef(tx.hash, reportedChainId)
                            : tx.hash}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                    {/* Copy and explorer buttons - copy just the tx hash */}
                    <CopyButton value={tx.hash} />
                    {reportedChainId != null && (
                      <ExplorerButton hash={tx.hash} chainId={reportedChainId} />
                    )}
                  </div>
                </td>
                {showChainContext && (
                  <td className="px-3 py-1.5 text-muted-foreground text-xs">{chainName}</td>
                )}
                <td className="px-3 py-1.5 text-muted-foreground">
                  {tx.to ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <code className="font-mono cursor-default">{formatAddress(tx.to)}</code>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p className="text-xs font-mono">{tx.to}</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    '--'
                  )}
                </td>
                {showValue && (
                  <td className="px-3 py-1.5 text-right font-medium">{formatValue(tx.value)}</td>
                )}
                {showBlock && (
                  <td className="px-3 py-1.5 text-right text-muted-foreground">{tx.blockNumber}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
