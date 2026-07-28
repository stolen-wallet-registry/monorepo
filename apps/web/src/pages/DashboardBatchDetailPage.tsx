/**
 * Batch detail page.
 */

import { useMemo, useState } from 'react';
import { Link, useSearch } from 'wouter';
import { Badge, Button, Card, CardContent } from '@swr/ui';
import { ArrowLeft } from 'lucide-react';
import { truncateHash } from '@swr/search';
import { useBatchDetail, useOperators, type BatchType } from '@/hooks/dashboard';
import { getHubChainIdForEnvironment } from '@/lib/chains/config';
import { BatchSummaryCard } from './batch-detail/BatchSummaryCard';
import { BatchEntriesCard } from './batch-detail/BatchEntriesCard';

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

      <BatchSummaryCard
        data={data}
        isLoading={isLoading}
        batchType={batchType}
        totalEntries={totalEntries}
        submitterLabel={submitterLabel}
        hubChainId={hubChainId}
        onRetry={() => refetch()}
      />

      <BatchEntriesCard
        data={data}
        isLoading={isLoading}
        totalEntries={totalEntries}
        pageSize={pageSize}
        clampedPage={clampedPage}
        totalPages={totalPages}
        onPageChange={setEntryPage}
      />
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
