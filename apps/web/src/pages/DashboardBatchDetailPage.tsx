/**
 * Batch detail page.
 */

import { useMemo, useState } from 'react';
import { Link, useSearch } from 'wouter';
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
  NetworkIcon,
} from '@swr/ui';
import {
  ArrowLeft,
  Copy,
  Check,
  Globe,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Info,
} from 'lucide-react';
import { formatRelativeTime, formatTimestamp, truncateHash } from '@swr/search';
import { useBatchDetail, useOperators } from '@/hooks/dashboard';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { getHubChainIdForEnvironment } from '@/lib/chains/config';
import { getChainDisplayFromCaip2 } from '@/lib/chains';
import { extractAddressFromCAIP10, extractCAIP2FromCAIP10 } from '@swr/chains';
import type { BatchType } from '@/hooks/dashboard';

interface DashboardBatchDetailPageProps {
  params: {
    batchId: string;
  };
}

function getValidBatchType(value: string | null): BatchType | null {
  if (value === 'wallet' || value === 'transaction' || value === 'contract') {
    return value;
  }
  return null;
}

function SummaryItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}

function CopyableHash({ value }: { value: string }) {
  const { copy, copied } = useCopyToClipboard({ resetMs: 2000 });
  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="font-mono text-sm">{truncateHash(value, 10, 6)}</span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs font-mono break-all">{value}</p>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground/60 hover:text-foreground transition-colors"
            onClick={() => copy(value)}
            aria-label={copied ? 'Copied!' : 'Copy value'}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">{copied ? 'Copied!' : 'Copy'}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

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

function BatchDetailContent({
  batchId,
  batchType,
  backHref,
}: {
  batchId: string;
  batchType: BatchType;
  backHref: string;
}) {
  const [entryPage, setEntryPage] = useState(1);
  const pageSize = 25;
  const { data, isLoading, isError, refetch } = useBatchDetail({
    batchId,
    type: batchType,
    limit: pageSize,
    offset: (entryPage - 1) * pageSize,
  });
  const { operators } = useOperators({ approvedOnly: false });

  const hubChainId = getHubChainIdForEnvironment();

  const totalEntries = useMemo(() => {
    if (!data) return 0;
    if (data.type === 'wallet') return data.batch.walletCount;
    if (data.type === 'transaction') return data.batch.transactionCount;
    return data.batch.contractCount;
  }, [data]);

  const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize));
  // Clamp page at render time to handle data size changes without cascading renders.
  // When totalEntries shrinks, clampedPage adjusts automatically; state syncs on next interaction.
  const clampedPage = Math.min(entryPage, totalPages);

  const batchLabel = data?.type ?? batchType;
  const operatorNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const op of operators) {
      map.set(op.address.toLowerCase(), op.identifier);
    }
    return map;
  }, [operators]);

  const submitterLabel = useMemo(() => {
    if (!data) return null;
    const address = 'operator' in data.batch ? data.batch.operator : data.batch.reporter;
    const name = operatorNames.get(address.toLowerCase());
    if (data.type === 'transaction' && !name) {
      return data.batch.isOperator ? 'Operator' : 'Individual';
    }
    return name ?? truncateHash(address, 6, 4);
  }, [data, operatorNames]);

  const renderChainBadge = (caip2?: string, showCaip2Detail = false, chainIdHash?: string) => {
    const chain = getChainDisplayFromCaip2(caip2);
    const showNetworkIcon = chain.isKnown && !chain.isLocal;
    const icon = showNetworkIcon ? (
      chain.chainId ? (
        <NetworkIcon chainId={chain.chainId} variant="branded" size={12} />
      ) : chain.caip2 ? (
        <NetworkIcon caip2id={chain.caip2} variant="branded" size={12} />
      ) : (
        <Globe className="h-3 w-3" />
      )
    ) : (
      <Globe className="h-3 w-3" />
    );

    if (showCaip2Detail && caip2) {
      return (
        <div className="flex flex-col gap-0.5">
          <Badge variant="outline" className="text-xs inline-flex items-center gap-1 w-fit">
            {icon}
            {chain.shortName}
          </Badge>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-muted-foreground">
                {caip2}
                {chainIdHash && ` (${truncateHash(chainIdHash, 4, 4)})`}
              </span>
            </TooltipTrigger>
            {chainIdHash && (
              <TooltipContent side="bottom">
                <p className="text-xs font-mono break-all">{chainIdHash}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      );
    }

    return (
      <Badge variant="outline" className="text-xs inline-flex items-center gap-1">
        {icon}
        {chain.shortName}
      </Badge>
    );
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="sm">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Batches
          </Link>
        </Button>
        <Badge variant="outline" className="text-xs">
          {batchLabel.charAt(0).toUpperCase() + batchLabel.slice(1)} Batch
        </Badge>
      </div>

      {isError && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-3">
              <p className="text-sm text-destructive">Failed to load batch details.</p>
              <div>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  Retry
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Batch Summary</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : !data ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">Batch not found.</p>
              <div>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  Retry
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <SummaryItem label="Batch ID" value={<CopyableHash value={data.batch.id} />} />
              {'dataHash' in data.batch && data.batch.dataHash && (
                <SummaryItem
                  label="Data Hash"
                  value={<CopyableHash value={data.batch.dataHash} />}
                />
              )}
              {'operatorId' in data.batch && data.batch.operatorId && (
                <SummaryItem
                  label="Operator ID"
                  value={<CopyableHash value={data.batch.operatorId} />}
                />
              )}
              <SummaryItem
                label={data.type === 'transaction' ? 'Reporter' : 'Operator'}
                value={
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium">{submitterLabel}</span>
                    <ExplorerLink
                      value={'operator' in data.batch ? data.batch.operator : data.batch.reporter}
                      type="address"
                      href={getExplorerAddressUrl(
                        hubChainId,
                        'operator' in data.batch ? data.batch.operator : data.batch.reporter
                      )}
                    />
                  </div>
                }
              />
              <SummaryItem
                label="Reported Chain"
                value={renderChainBadge(
                  data.batch.reportedChainId,
                  true,
                  'reportedChainIdHash' in data.batch &&
                    typeof data.batch.reportedChainIdHash === 'string'
                    ? data.batch.reportedChainIdHash
                    : undefined
                )}
              />
              <SummaryItem label="Registered" value={formatTimestamp(data.batch.registeredAt)} />
              <SummaryItem
                label="Transaction"
                value={
                  <ExplorerLink
                    value={data.batch.transactionHash}
                    type="transaction"
                    href={getExplorerTxUrl(hubChainId, data.batch.transactionHash)}
                  />
                }
              />
              <SummaryItem label="Entry Count" value={totalEntries.toLocaleString()} />
              {data.type === 'contract' && (
                <SummaryItem
                  label="Batch Status"
                  value={<Badge variant="secondary">Active</Badge>}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
                            Transaction
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-3 w-3 cursor-help text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <p className="text-xs">
                                  Transactions are shown with their <strong>chain context</strong>{' '}
                                  (CAIP-2 format) to uniquely identify them across blockchains.
                                </p>
                                <p className="text-xs mt-1 text-muted-foreground">
                                  Format: eip155:{'{chainId}'}:{'{txHash}'}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </span>
                        </TableHead>
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
                        colSpan={data.type === 'contract' ? 4 : 3}
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
                              explorerUrl={txHref}
                              type="transaction"
                            />
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
                    onClick={() => setEntryPage(Math.max(1, clampedPage - 1))}
                    disabled={clampedPage <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEntryPage(Math.min(totalPages, clampedPage + 1))}
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
    </div>
  );
}

export function DashboardBatchDetailPage({ params }: DashboardBatchDetailPageProps) {
  const { batchId } = params;
  const search = useSearch();
  const searchParams = new URLSearchParams(search);

  const batchType =
    getValidBatchType(searchParams.get('batchType')) ??
    getValidBatchType(searchParams.get('type') === 'all' ? null : searchParams.get('type'));

  const backParams = new URLSearchParams(searchParams);
  backParams.set('tab', 'batches');
  backParams.delete('batchType');
  const backQuery = backParams.toString();
  const backHref = backQuery ? `/dashboard?${backQuery}` : '/dashboard';

  if (!batchType) {
    return (
      <div className="w-full max-w-6xl mx-auto px-4 py-8">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <p className="text-sm text-destructive">Missing batch type for this view.</p>
            <Button asChild variant="outline" size="sm">
              <Link href={backHref}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Batches
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <BatchDetailContent
      key={`${batchId}-${batchType}`}
      batchId={batchId}
      batchType={batchType}
      backHref={backHref}
    />
  );
}
