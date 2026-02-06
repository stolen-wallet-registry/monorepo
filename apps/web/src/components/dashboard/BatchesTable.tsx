/**
 * Batches Table
 *
 * Displays recent batch registrations across all registry types.
 */

import { useMemo } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
  getExplorerTxUrl,
} from '@swr/ui';
import { Wallet, FileText, Code, ChevronLeft, ChevronRight, Copy, Check } from 'lucide-react';
import { formatRelativeTime, truncateHash } from '@swr/search';
import { useBatches, useOperators, type BatchSummary, type BatchType } from '@/hooks/dashboard';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { getHubChainIdForEnvironment } from '@/lib/chains/config';
import { cn } from '@/lib/utils';

const TYPE_CONFIG: Record<BatchType, { label: string; icon: typeof Wallet; color: string }> = {
  wallet: { label: 'Wallet', icon: Wallet, color: 'bg-blue-500/10 text-blue-500' },
  transaction: { label: 'Transaction', icon: FileText, color: 'bg-green-500/10 text-green-500' },
  contract: { label: 'Contract', icon: Code, color: 'bg-purple-500/10 text-purple-500' },
};

function getValidTypeFilter(value: string | null): BatchType | 'all' {
  if (value === 'wallet' || value === 'transaction' || value === 'contract' || value === 'all') {
    return value;
  }
  return 'all';
}

function getValidSubmitterFilter(value: string | null): 'all' | 'operator' | 'individual' {
  if (value === 'operator' || value === 'individual' || value === 'all') {
    return value;
  }
  return 'all';
}

interface BatchRowProps {
  batch: BatchSummary;
  operatorNames: Map<string, string>;
  detailHref: string;
}

function BatchRow({ batch, operatorNames, detailHref }: BatchRowProps) {
  const config = TYPE_CONFIG[batch.type];
  const TypeIcon = config.icon;
  const { copy, copied } = useCopyToClipboard({ resetMs: 2000 });

  const submitterKey = batch.submitter.toLowerCase();
  const operatorLabel = operatorNames.get(submitterKey);
  // Wallet and contract batches are always from operators; transaction batches check isOperator flag
  const isOperator =
    batch.type !== 'transaction' || (batch.type === 'transaction' && batch.isOperator === true);
  const submitterLabel = isOperator
    ? (operatorLabel ?? truncateHash(submitterKey, 6, 4))
    : 'Individual';

  const hubChainId = getHubChainIdForEnvironment();
  const txHref = getExplorerTxUrl(hubChainId, batch.transactionHash);

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <div className={cn('p-1 rounded', config.color)}>
            <TypeIcon className="h-3 w-3" />
          </div>
          <span className="text-xs text-muted-foreground">{config.label}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href={detailHref} className="font-mono text-sm hover:underline">
                {truncateHash(batch.id, 10, 6)}
              </Link>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs font-mono break-all">{batch.id}</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground/60 hover:text-foreground transition-colors"
                onClick={() => copy(batch.id)}
                aria-label={copied ? 'Copied!' : 'Copy batch ID'}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{copied ? 'Copied!' : 'Copy batch ID'}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TableCell>
      <TableCell>
        <span className="text-sm">{submitterLabel}</span>
      </TableCell>
      <TableCell>
        <span className="text-sm">{batch.count.toLocaleString()}</span>
      </TableCell>
      <TableCell>
        <span className="text-sm text-muted-foreground">
          {formatRelativeTime(batch.registeredAt)}
        </span>
      </TableCell>
      <TableCell>
        <ExplorerLink
          value={batch.transactionHash}
          type="transaction"
          href={txHref}
          showDisabledIcon={false}
        />
      </TableCell>
    </TableRow>
  );
}

export interface BatchesTableProps {
  className?: string;
}

export function BatchesTable({ className }: BatchesTableProps) {
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const basePath = location.split('?')[0] || '/dashboard';
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const typeFilter = getValidTypeFilter(searchParams.get('type'));
  const submitterFilter = getValidSubmitterFilter(searchParams.get('submitter'));
  const pageParam = parseInt(searchParams.get('page') ?? '1', 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const pageSize = 10;
  const batchFetchLimit = 100;

  const { batches, isLoading, isError } = useBatches({
    type: typeFilter,
    limit: batchFetchLimit,
  });
  const { operators } = useOperators({ approvedOnly: false });

  const operatorNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const op of operators) {
      map.set(op.address.toLowerCase(), op.identifier);
    }
    return map;
  }, [operators]);

  const filtered = useMemo(() => {
    return batches.filter((batch) => {
      if (submitterFilter === 'all') return true;
      if (batch.type !== 'transaction') {
        return submitterFilter === 'operator';
      }
      const isOp = batch.isOperator === true;
      return submitterFilter === 'operator' ? isOp : !isOp;
    });
  }, [batches, submitterFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const startIndex = (clampedPage - 1) * pageSize;
  const paginated = filtered.slice(startIndex, startIndex + pageSize);

  const updateParams = (updates: Record<string, string>) => {
    const nextParams = new URLSearchParams(search);
    nextParams.set('tab', 'batches');
    Object.entries(updates).forEach(([key, value]) => {
      if (value === 'all' || value === '1') {
        nextParams.delete(key);
      } else {
        nextParams.set(key, value);
      }
    });
    const query = nextParams.toString();
    const nextLocation = query ? `${basePath}?${query}` : basePath;
    if (nextLocation !== location) {
      setLocation(nextLocation);
    }
  };

  if (isError) {
    return (
      <Card className={className}>
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">Failed to load batch data.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="space-y-1">
          <CardTitle>Batch Registrations</CardTitle>
          <p className="text-xs text-muted-foreground">
            Showing the latest {batchFetchLimit} batches per type. Refine filters to narrow results.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={typeFilter}
            onValueChange={(value) => updateParams({ type: value, page: '1' })}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="wallet">Wallet batches</SelectItem>
              <SelectItem value="transaction">Transaction batches</SelectItem>
              <SelectItem value="contract">Contract batches</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={submitterFilter}
            onValueChange={(value) => updateParams({ submitter: value, page: '1' })}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Submitter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All submitters</SelectItem>
              <SelectItem value="operator">Operators</SelectItem>
              <SelectItem value="individual">Individuals</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Batch ID</TableHead>
                  <TableHead>Submitter</TableHead>
                  <TableHead>Count</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead>Tx</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      No batches found for this filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((batch) => {
                    const detailParams = new URLSearchParams(search);
                    detailParams.set('tab', 'batches');
                    detailParams.set('batchType', batch.type);
                    const detailHref = `/dashboard/batches/${batch.id}?${detailParams.toString()}`;
                    return (
                      <BatchRow
                        key={`${batch.type}-${batch.id}`}
                        batch={batch}
                        operatorNames={operatorNames}
                        detailHref={detailHref}
                      />
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
                  onClick={() => updateParams({ page: String(Math.max(1, clampedPage - 1)) })}
                  disabled={clampedPage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updateParams({ page: String(Math.min(totalPages, clampedPage + 1)) })
                  }
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
