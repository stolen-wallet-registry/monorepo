/**
 * Batch detail page.
 */

import { useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
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
  NetworkEthereum,
  NetworkBase,
  NetworkOptimism,
  NetworkArbitrumOne,
  NetworkPolygon,
} from '@swr/ui';
import { ArrowLeft, Copy, Check, Globe, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatRelativeTime, formatTimestamp, truncateHash } from '@swr/search';
import { useBatchDetail, useOperators } from '@/hooks/dashboard';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { getHubChainIdForEnvironment } from '@/lib/chains/config';
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

const CHAIN_CONFIG: Record<
  number,
  { name: string; shortName: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  1: { name: 'Ethereum', shortName: 'ETH', Icon: NetworkEthereum },
  8453: { name: 'Base', shortName: 'Base', Icon: NetworkBase },
  10: { name: 'Optimism', shortName: 'OP', Icon: NetworkOptimism },
  42161: { name: 'Arbitrum', shortName: 'ARB', Icon: NetworkArbitrumOne },
  137: { name: 'Polygon', shortName: 'POLY', Icon: NetworkPolygon },
  31337: { name: 'Local', shortName: 'Local', Icon: Globe },
  84532: { name: 'Base Sepolia', shortName: 'Base Sep', Icon: NetworkBase },
};

function getChainInfoFromCaip2(caip2?: string): {
  chainId: number | null;
  name: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
} {
  if (!caip2) {
    return { chainId: null, name: 'Unknown', label: 'Unknown', Icon: Globe };
  }
  const [namespace, reference] = caip2.split(':');
  if (namespace === 'eip155' && reference && /^\d+$/.test(reference)) {
    const chainId = parseInt(reference, 10);
    if (Number.isFinite(chainId)) {
      const config = CHAIN_CONFIG[chainId];
      if (config) {
        return { chainId, name: config.name, label: config.shortName, Icon: config.Icon };
      }
      return { chainId, name: `Chain ${chainId}`, label: `Chain ${chainId}`, Icon: Globe };
    }
  }
  return { chainId: null, name: caip2, label: caip2, Icon: Globe };
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
  const { data, isLoading, isError } = useBatchDetail({
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
      return 'Individual';
    }
    return name ?? truncateHash(address, 6, 4);
  }, [data, operatorNames]);

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
            <p className="text-sm text-destructive">Failed to load batch details.</p>
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
            <p className="text-sm text-muted-foreground">Batch not found.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <SummaryItem label="Batch ID" value={<CopyableHash value={data.batch.id} />} />
              <SummaryItem
                label="Merkle Root"
                value={<CopyableHash value={data.batch.merkleRoot} />}
              />
              <SummaryItem
                label={data.type === 'transaction' ? 'Reporter' : 'Operator'}
                value={
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{submitterLabel}</span>
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
                value={(() => {
                  const chain = getChainInfoFromCaip2(data.batch.reportedChainId);
                  const ChainIcon = chain.Icon;
                  return (
                    <span className="inline-flex items-center gap-2">
                      <ChainIcon className="h-3 w-3" />
                      {chain.label}
                    </span>
                  );
                })()}
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
                  value={
                    data.batch.invalidated ? (
                      <Badge variant="destructive">Invalidated</Badge>
                    ) : (
                      <Badge variant="secondary">Active</Badge>
                    )
                  }
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
                        <TableHead>Wallet</TableHead>
                        <TableHead>Chain</TableHead>
                        <TableHead>Registered</TableHead>
                        <TableHead>Tx</TableHead>
                      </>
                    )}
                    {data.type === 'transaction' && (
                      <>
                        <TableHead>Tx Hash</TableHead>
                        <TableHead>Chain</TableHead>
                        <TableHead>Reporter</TableHead>
                        <TableHead>Reported</TableHead>
                      </>
                    )}
                    {data.type === 'contract' && (
                      <>
                        <TableHead>Contract</TableHead>
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
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                        No entries found for this batch.
                      </TableCell>
                    </TableRow>
                  ) : data.type === 'wallet' ? (
                    data.entries.map((entry) => {
                      const parts = entry.caip10.split(':');
                      const address = parts[2] ?? entry.id;
                      const caip2 =
                        parts.length >= 2 ? `${parts[0]}:${parts[1]}` : entry.sourceChainCAIP2;
                      const chainInfo = getChainInfoFromCaip2(caip2);
                      const ChainIcon = chainInfo.Icon;
                      return (
                        <TableRow key={entry.id}>
                          <TableCell>
                            <ExplorerLink
                              value={address}
                              type="address"
                              href={
                                chainInfo.chainId
                                  ? getExplorerAddressUrl(chainInfo.chainId, address)
                                  : null
                              }
                              showDisabledIcon={false}
                            />
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="text-xs inline-flex items-center gap-1"
                            >
                              <ChainIcon className="h-3 w-3" />
                              {chainInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {formatRelativeTime(entry.registeredAt)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <ExplorerLink
                              value={entry.transactionHash}
                              type="transaction"
                              href={getExplorerTxUrl(hubChainId, entry.transactionHash)}
                              showDisabledIcon={false}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : data.type === 'transaction' ? (
                    data.entries.map((entry) => {
                      const chainInfo = getChainInfoFromCaip2(entry.caip2ChainId);
                      const ChainIcon = chainInfo.Icon;
                      const txHref = entry.numericChainId
                        ? getExplorerTxUrl(entry.numericChainId, entry.txHash)
                        : null;
                      return (
                        <TableRow key={entry.id}>
                          <TableCell>
                            <ExplorerLink
                              value={entry.txHash}
                              type="transaction"
                              href={txHref}
                              showDisabledIcon={false}
                            />
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="text-xs inline-flex items-center gap-1"
                            >
                              <ChainIcon className="h-3 w-3" />
                              {chainInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <ExplorerLink
                              value={entry.reporter}
                              type="address"
                              href={getExplorerAddressUrl(hubChainId, entry.reporter)}
                            />
                          </TableCell>
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
                      const chainInfo = getChainInfoFromCaip2(entry.caip2ChainId);
                      const ChainIcon = chainInfo.Icon;
                      const contractHref = entry.numericChainId
                        ? getExplorerAddressUrl(entry.numericChainId, entry.contractAddress)
                        : null;
                      const statusLabel = data.batch.invalidated
                        ? 'Batch invalidated'
                        : entry.invalidated
                          ? 'Invalidated'
                          : 'Active';
                      const statusVariant =
                        data.batch.invalidated || entry.invalidated ? 'destructive' : 'secondary';
                      return (
                        <TableRow key={entry.entryHash}>
                          <TableCell>
                            <ExplorerLink
                              value={entry.contractAddress}
                              type="contract"
                              href={contractHref}
                              showDisabledIcon={false}
                            />
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="text-xs inline-flex items-center gap-1"
                            >
                              <ChainIcon className="h-3 w-3" />
                              {chainInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {formatRelativeTime(entry.reportedAt)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={statusVariant as 'secondary' | 'destructive'}
                              className="text-xs"
                            >
                              {statusLabel}
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
  const [location] = useLocation();
  const searchParams = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : (location.split('?')[1] ?? '')
  );

  const batchType =
    getValidBatchType(searchParams.get('batchType')) ??
    getValidBatchType(searchParams.get('type') === 'all' ? null : searchParams.get('type'));

  const backParams = new URLSearchParams(searchParams);
  backParams.set('tab', 'batches');
  backParams.delete('batchType');
  const backHref = `/dashboard?${backParams.toString()}`;

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
