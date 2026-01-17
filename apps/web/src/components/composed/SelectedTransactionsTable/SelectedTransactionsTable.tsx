/**
 * Displays a table of selected transactions for fraud reporting.
 *
 * Used in the Transaction Batch Summary and payment steps to show
 * which transactions are being registered.
 */

import { Tooltip, TooltipContent, TooltipTrigger } from '@swr/ui';
import { formatEther } from 'viem';
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
}

/**
 * Format a transaction hash for display (truncated).
 */
function formatTxHash(hash: string): string {
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
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
 * Table showing selected transactions with their details.
 */
export function SelectedTransactionsTable({
  transactions,
  maxHeight = 'max-h-40',
  showValue = false,
  showBlock = false,
}: SelectedTransactionsTableProps) {
  if (transactions.length === 0) {
    return (
      <div className="rounded-lg border p-4 bg-muted/30 text-center text-sm text-muted-foreground">
        No transactions selected
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="px-4 py-2 bg-muted/30 border-b">
        <p className="text-sm font-medium">Selected Transactions ({transactions.length})</p>
      </div>
      <div className={`${maxHeight} overflow-y-auto`}>
        <table className="w-full text-xs">
          <thead className="bg-muted/20 sticky top-0">
            <tr className="border-b">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground w-8">#</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Hash</th>
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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <code className="font-mono cursor-default">{formatTxHash(tx.hash)}</code>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-md">
                      <p className="text-xs font-mono break-all">{tx.hash}</p>
                    </TooltipContent>
                  </Tooltip>
                </td>
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
