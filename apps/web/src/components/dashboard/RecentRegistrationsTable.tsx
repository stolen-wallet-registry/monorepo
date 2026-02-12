/**
 * Recent Registrations Table
 *
 * Displays a paginated table of recent registrations across all registry types.
 */

import { useMemo, useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Skeleton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
  Button,
  ExplorerLink,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  // Chain icons
  NetworkEthereum,
  NetworkBase,
  NetworkOptimism,
  NetworkArbitrumOne,
  NetworkPolygon,
  getExplorerAddressUrl,
  getExplorerTxUrl,
} from '@swr/ui';
import { Wallet, Code, FileText, ChevronLeft, ChevronRight, Globe } from 'lucide-react';
import { formatRelativeTime, truncateHash } from '@swr/search';
import {
  useRecentRegistrations,
  type RegistrationEntry,
  type RegistrationType,
  type BatchType,
  formatBatchId,
} from '@/hooks/dashboard';
import { useOperators } from '@/hooks/dashboard';
import { cn } from '@/lib/utils';
import type { Address } from '@/lib/types/ethereum';

const TYPE_CONFIG: Record<RegistrationType, { label: string; icon: typeof Wallet; color: string }> =
  {
    wallet: { label: 'Wallet', icon: Wallet, color: 'bg-blue-500/10 text-blue-500' },
    contract: { label: 'Contract', icon: Code, color: 'bg-purple-500/10 text-purple-500' },
    transaction: { label: 'Transaction', icon: FileText, color: 'bg-green-500/10 text-green-500' },
  };

function getValidTypeFilter(value: string | null): RegistrationType | 'all' {
  if (value === 'wallet' || value === 'contract' || value === 'transaction' || value === 'all') {
    return value;
  }
  return 'all';
}

/**
 * Chain configuration for display with icons.
 * Maps chainId to display name and icon component.
 */
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

/**
 * Get chain info from CAIP-2 components.
 * Validates reference to avoid NaN chainIds.
 */
function getChainInfo(
  namespace: string,
  reference: string
): { chainId: number | null; name: string; Icon: React.ComponentType<{ className?: string }> } {
  if (namespace === 'eip155' && reference && /^\d+$/.test(reference)) {
    const chainId = parseInt(reference, 10);
    if (Number.isFinite(chainId)) {
      const config = CHAIN_CONFIG[chainId];
      if (config) {
        return { chainId, name: config.shortName, Icon: config.Icon };
      }
      return { chainId, name: `Chain ${chainId}`, Icon: Globe };
    }
  }
  // Fallback for invalid or non-EVM chains
  const displayName = reference ? `${namespace}:${reference}` : namespace;
  return { chainId: null, name: displayName, Icon: Globe };
}

interface RegistrationRowProps {
  entry: RegistrationEntry;
  operatorNames: Map<string, string>;
}

function RegistrationRow({ entry, operatorNames }: RegistrationRowProps) {
  const config = TYPE_CONFIG[entry.type];
  const TypeIcon = config.icon;

  // Get submitter label:
  // - Operators: show operator name or truncated address
  // - Individuals: show "Sponsored" if sponsored, "Individual" otherwise
  // PRIVACY: Never expose relayer/forwarder address for sponsored submissions
  const getSubmitterLabel = (): string => {
    // Operators always show their name
    if (entry.operator) {
      const name = operatorNames.get(entry.operator.toLowerCase());
      return name ?? truncateHash(entry.operator, 6, 4);
    }
    // For individuals: "Sponsored" if sponsored, "Individual" otherwise
    return entry.isSponsored ? 'Sponsored' : 'Individual';
  };
  const submitterLabel = getSubmitterLabel();

  // Parse chain info from CAIP-2
  const chainParts = entry.chainId.split(':');
  const {
    chainId,
    name: chainName,
    Icon: ChainIcon,
  } = getChainInfo(chainParts[0] ?? '', chainParts[1] ?? '');

  // Resolve explorer URLs (returns null for unsupported chains)
  const identifierHref =
    chainId && entry.type === 'transaction'
      ? getExplorerTxUrl(chainId, entry.identifier)
      : chainId
        ? getExplorerAddressUrl(chainId, entry.identifier)
        : null;

  const txHref =
    chainId && entry.transactionHash ? getExplorerTxUrl(chainId, entry.transactionHash) : null;

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
        <ExplorerLink
          value={entry.identifier as Address}
          type={entry.type === 'transaction' ? 'transaction' : 'address'}
          href={identifierHref}
          showDisabledIcon={false}
        />
      </TableCell>
      <TableCell>
        <span className="text-sm">{submitterLabel}</span>
      </TableCell>
      <TableCell>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-xs inline-flex items-center gap-1">
              <ChainIcon className="h-3 w-3" />
              {chainName}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">
              {CHAIN_CONFIG[chainId ?? 0]?.name ?? chainName}
              {chainId ? ` (Chain ID: ${chainId})` : ''}
            </p>
          </TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell>
        <span className="text-sm text-muted-foreground">
          {formatRelativeTime(entry.registeredAt)}
        </span>
      </TableCell>
      <TableCell>
        {entry.batchId ? (
          <Link
            href={`/dashboard/batches/${encodeURIComponent(entry.batchId)}?tab=batches&batchType=${entry.type}`}
            className="text-xs font-mono text-primary hover:underline"
          >
            {formatBatchId(entry.type as BatchType, entry.batchId)}
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {entry.transactionHash ? (
          <ExplorerLink
            value={entry.transactionHash}
            type="transaction"
            href={txHref}
            showDisabledIcon={false}
          />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}

export interface RecentRegistrationsTableProps {
  className?: string;
}

/**
 * Displays recent registrations in a table with filtering.
 *
 * @example
 * ```tsx
 * <RecentRegistrationsTable />
 * ```
 */
export function RecentRegistrationsTable({ className }: RecentRegistrationsTableProps) {
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const basePath = location.split('?')[0] || '/dashboard';
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);

  // Use local state for the filter to avoid race conditions with URL updates
  // Initialize from URL, then control locally
  const initialFilter = getValidTypeFilter(searchParams.get('type'));
  const [typeFilter, setTypeFilter] = useState<RegistrationType | 'all'>(initialFilter);
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const { registrations, isLoading, isError } = useRecentRegistrations({
    type: typeFilter,
    limit: 50, // Fetch more for client-side pagination
  });

  const { operators } = useOperators();

  // Memoize operator name lookup to avoid rebuilding every render
  const operatorNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const op of operators) {
      map.set(op.address.toLowerCase(), op.identifier);
    }
    return map;
  }, [operators]);

  // Client-side pagination with clamped page
  const totalPages = Math.max(1, Math.ceil(registrations.length / pageSize));
  const clampedPage = Math.min(page, totalPages - 1);
  const startIndex = clampedPage * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedRegistrations = registrations.slice(startIndex, endIndex);

  if (isError) {
    return (
      <Card className={className}>
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">Failed to load recent registrations.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Recent Registrations</CardTitle>
        <Select
          value={typeFilter}
          onValueChange={(value) => {
            // Update local state immediately (controls the query)
            const newFilter = getValidTypeFilter(value);
            setTypeFilter(newFilter);
            setPage(0);

            // Sync to URL for bookmarking/sharing (doesn't affect query)
            const nextParams = new URLSearchParams(search);
            nextParams.set('tab', 'registrations');
            if (value === 'all') {
              nextParams.delete('type');
            } else {
              nextParams.set('type', value);
            }
            const query = nextParams.toString();
            const nextLocation = query ? `${basePath}?${query}` : basePath;
            if (nextLocation !== location) {
              setLocation(nextLocation);
            }
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="wallet">Wallets</SelectItem>
            <SelectItem value="contract">Contracts</SelectItem>
            <SelectItem value="transaction">Transactions</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : registrations.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No registrations found.</p>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Type</TableHead>
                    <TableHead>Address/Hash</TableHead>
                    <TableHead>Submitter</TableHead>
                    <TableHead>Chain</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Tx</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRegistrations.map((entry) => (
                    <RegistrationRow key={entry.id} entry={entry} operatorNames={operatorNames} />
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {startIndex + 1}-{Math.min(endIndex, registrations.length)} of{' '}
                  {registrations.length}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(clampedPage - 1)}
                    disabled={clampedPage === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm">
                    Page {clampedPage + 1} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(clampedPage + 1)}
                    disabled={clampedPage >= totalPages - 1}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
