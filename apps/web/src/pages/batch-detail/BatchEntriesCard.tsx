/**
 * "Batch Entries" card for the batch detail page.
 *
 * Owns the per-registry-type table shapes (wallet / transaction / contract) and the
 * pager. Pagination state lives on the page because it drives the query; this card only
 * reports page changes upwards.
 */

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  ExplorerLink,
  getExplorerAddressUrl,
  getExplorerTxUrl,
} from '@swr/ui';
import { Check, ChevronLeft, ChevronRight, Copy, ExternalLink, Info } from 'lucide-react';
import { formatRelativeTime, truncateHash } from '@swr/search';
import { extractAddressFromCAIP10, extractCAIP2FromCAIP10 } from '@swr/chains';
import type { BatchDetailResult } from '@/hooks/dashboard';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { getChainDisplayFromCaip2 } from '@/lib/chains';
import { renderChainBadge } from './chainBadge';

/**
 * Format a CAIP-10 identifier for display (truncated).
 * Format: eip155:{chainId}:{truncatedIdentifier}
 */
function formatCaip10Display(identifier: string, caip2: string | undefined): string {
  const truncated = `${identifier.slice(0, 10)}...${identifier.slice(-6)}`;
  if (caip2) {
    return `${caip2}:${truncated}`;
  }
  return truncated;
}

/**
 * Build full CAIP-10 identifier.
 */
function buildCaip10(identifier: string, caip2: string | undefined): string {
  if (caip2) {
    return `${caip2}:${identifier}`;
  }
  return identifier;
}

/**
 * CAIP-10 formatted entry with copy and explorer buttons.
 * Displays: namespace:chainId:truncatedIdentifier
 * Copy button copies just the raw identifier (hash/address).
 */
function Caip10Entry({
  identifier,
  caip2,
  explorerUrl,
  type,
}: {
  identifier: string;
  caip2: string | undefined;
  explorerUrl: string | null;
  type: 'address' | 'transaction' | 'contract';
}) {
  const { copy, copied } = useCopyToClipboard({ resetMs: 2000 });
  const displayValue = formatCaip10Display(identifier, caip2);
  const fullCaip10 = buildCaip10(identifier, caip2);

  return (
    <div className="flex items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <code className="font-mono text-xs cursor-default">{displayValue}</code>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-md">
          <p className="text-xs font-mono break-all">{fullCaip10}</p>
        </TooltipContent>
      </Tooltip>
      {/* Copy button - copies just the identifier (address/hash) */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => copy(identifier)}
            className="p-0.5 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground"
            aria-label={
              copied ? 'Copied!' : `Copy ${type === 'transaction' ? 'tx hash' : 'address'}`
            }
          >
            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">
            {copied ? 'Copied!' : `Copy ${type === 'transaction' ? 'tx hash' : 'address'}`}
          </p>
        </TooltipContent>
      </Tooltip>
      {/* Explorer link */}
      {explorerUrl && (
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
      )}
    </div>
  );
}

interface BatchEntriesCardProps {
  /** Loaded batch, or null when missing / still loading */
  data: BatchDetailResult | null;
  isLoading: boolean;
  /** Entry count across all pages */
  totalEntries: number;
  /** Entries per page */
  pageSize: number;
  /** Current page, already clamped to totalPages by the page */
  clampedPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function BatchEntriesCard({
  data,
  isLoading,
  totalEntries,
  pageSize,
  clampedPage,
  totalPages,
  onPageChange,
}: BatchEntriesCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Batch Entries</CardTitle>
        {!isLoading && data && (
          <p className="text-xs text-muted-foreground">
            {totalEntries === 0
              ? '0 entries'
              : `Showing ${(clampedPage - 1) * pageSize + 1}–${Math.min(
                  clampedPage * pageSize,
                  totalEntries
                )} of ${totalEntries}`}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">No entries available.</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  {data.type === 'wallet' && (
                    <>
                      <TableHead>
                        <span className="inline-flex items-center gap-1">
                          Wallet (CAIP-10)
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3 w-3 cursor-help text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="text-xs">
                                <strong>CAIP-10</strong> is a standard for identifying blockchain
                                addresses across chains. Format:{' '}
                                <code>namespace:chainId:address</code>
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </span>
                      </TableHead>
                      <TableHead>Chain</TableHead>
                      <TableHead>Registered</TableHead>
                    </>
                  )}
                  {data.type === 'transaction' && (
                    <>
                      <TableHead>
                        <span className="inline-flex items-center gap-1">
                          Registry Key
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3 w-3 cursor-help text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="text-xs">
                                Chain-qualified reference stored in the registry. Format:{' '}
                                <code>
                                  eip155:{'{chainId}'}:{'{txHash}'}
                                </code>
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </span>
                      </TableHead>
                      <TableHead>Transaction</TableHead>
                      <TableHead>Chain</TableHead>
                      <TableHead>Reported</TableHead>
                    </>
                  )}
                  {data.type === 'contract' && (
                    <>
                      <TableHead>
                        <span className="inline-flex items-center gap-1">
                          Contract (CAIP-10)
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3 w-3 cursor-help text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="text-xs">
                                <strong>CAIP-10</strong> is a standard for identifying blockchain
                                addresses across chains. Format:{' '}
                                <code>namespace:chainId:address</code>
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </span>
                      </TableHead>
                      <TableHead>Chain</TableHead>
                      <TableHead>Reported</TableHead>
                      <TableHead>Status</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.entries.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={data.type === 'wallet' ? 3 : 4}
                      className="text-center text-sm text-muted-foreground"
                    >
                      No entries found for this batch.
                    </TableCell>
                  </TableRow>
                ) : data.type === 'wallet' ? (
                  data.entries.map((entry) => {
                    const address = extractAddressFromCAIP10(entry.caip10) ?? entry.id;
                    const caip2 = extractCAIP2FromCAIP10(entry.caip10) ?? entry.sourceChainCAIP2;
                    const chainInfo = getChainDisplayFromCaip2(caip2);
                    const explorerUrl = chainInfo.chainId
                      ? getExplorerAddressUrl(chainInfo.chainId, address)
                      : null;
                    return (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <Caip10Entry
                            identifier={address}
                            caip2={caip2}
                            explorerUrl={explorerUrl}
                            type="address"
                          />
                        </TableCell>
                        <TableCell>{renderChainBadge(caip2)}</TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {formatRelativeTime(entry.registeredAt)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : data.type === 'transaction' ? (
                  data.entries.map((entry) => {
                    const chainInfo = getChainDisplayFromCaip2(entry.caip2ChainId);
                    const chainIdForExplorer = entry.numericChainId ?? chainInfo.chainId;
                    const txHref = chainIdForExplorer
                      ? getExplorerTxUrl(chainIdForExplorer, entry.txHash)
                      : null;
                    return (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <Caip10Entry
                            identifier={entry.txHash}
                            caip2={entry.caip2ChainId}
                            explorerUrl={null}
                            type="transaction"
                          />
                        </TableCell>
                        <TableCell>
                          {txHref ? (
                            <ExplorerLink value={entry.txHash} type="transaction" href={txHref} />
                          ) : (
                            <code className="font-mono text-xs">
                              {truncateHash(entry.txHash, 6, 4)}
                            </code>
                          )}
                        </TableCell>
                        <TableCell>{renderChainBadge(entry.caip2ChainId)}</TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {formatRelativeTime(entry.reportedAt)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  data.entries.map((entry) => {
                    const chainInfo = getChainDisplayFromCaip2(entry.caip2ChainId);
                    const chainIdForExplorer = entry.numericChainId ?? chainInfo.chainId;
                    const contractHref = chainIdForExplorer
                      ? getExplorerAddressUrl(chainIdForExplorer, entry.contractAddress)
                      : null;
                    return (
                      <TableRow key={`${entry.contractAddress}-${entry.caip2ChainId}`}>
                        <TableCell>
                          <Caip10Entry
                            identifier={entry.contractAddress}
                            caip2={entry.caip2ChainId}
                            explorerUrl={contractHref}
                            type="contract"
                          />
                        </TableCell>
                        <TableCell>{renderChainBadge(entry.caip2ChainId)}</TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {formatRelativeTime(entry.reportedAt)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            Active
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-muted-foreground">
                Page {clampedPage} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(Math.max(1, clampedPage - 1))}
                  disabled={clampedPage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(Math.min(totalPages, clampedPage + 1))}
                  disabled={clampedPage >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
