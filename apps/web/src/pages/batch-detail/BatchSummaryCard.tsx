/**
 * "Batch Summary" card for the batch detail page.
 *
 * Renders the batch-level metadata (IDs, submitter, chain, timestamps) for any of the
 * three batch types. All derived values are computed by the page and passed in, so this
 * stays a pure function of its props.
 */

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  ExplorerLink,
  getExplorerAddressUrl,
  getExplorerTxUrl,
} from '@swr/ui';
import { Check, Copy } from 'lucide-react';
import { formatTimestamp, truncateHash } from '@swr/search';
import { formatBatchId, type BatchDetailResult, type BatchType } from '@/hooks/dashboard';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { renderChainBadge } from './chainBadge';

function SummaryItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}

function CopyableHash({
  value,
  displayValue,
}: {
  /** The value copied to clipboard */
  value: string;
  /** Optional display text (defaults to value) */
  displayValue?: string;
}) {
  const { copy, copied } = useCopyToClipboard({ resetMs: 2000 });
  const display = displayValue ?? value;
  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="font-mono text-sm">{truncateHash(display, 10, 6)}</span>
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

interface BatchSummaryCardProps {
  /** Loaded batch, or null when missing / still loading */
  data: BatchDetailResult | null;
  isLoading: boolean;
  /** Requested batch type - used for the batch ID prefix before data resolves */
  batchType: BatchType;
  /** Entry count for this batch */
  totalEntries: number;
  /** Resolved operator name or truncated submitter address */
  submitterLabel: string | null;
  /** Chain the batch itself was submitted on (explorer links) */
  hubChainId: number;
  /** Re-run the batch detail query */
  onRetry: () => void;
}

export function BatchSummaryCard({
  data,
  isLoading,
  batchType,
  totalEntries,
  submitterLabel,
  hubChainId,
  onRetry,
}: BatchSummaryCardProps) {
  return (
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
              <Button variant="outline" size="sm" onClick={onRetry}>
                Retry
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <SummaryItem
              label="Batch ID"
              value={
                <CopyableHash
                  value={data.batch.id}
                  displayValue={formatBatchId(batchType, data.batch.id)}
                />
              }
            />
            {'dataHash' in data.batch && data.batch.dataHash && (
              <SummaryItem label="Data Hash" value={<CopyableHash value={data.batch.dataHash} />} />
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
              <SummaryItem label="Batch Status" value={<Badge variant="secondary">Active</Badge>} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
