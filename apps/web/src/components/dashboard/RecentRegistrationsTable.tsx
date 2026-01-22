/**
 * Recent Registrations Table
 *
 * Displays a paginated table of recent registrations across all registry types.
 */

import { useState } from 'react';
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
} from '@swr/ui';
import { Wallet, Code, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatRelativeTime, truncateHash } from '@swr/search';
import {
  useRecentRegistrations,
  type RegistrationEntry,
  type RegistrationType,
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

interface RegistrationRowProps {
  entry: RegistrationEntry;
  operatorNames: Map<string, string>;
}

function RegistrationRow({ entry, operatorNames }: RegistrationRowProps) {
  const config = TYPE_CONFIG[entry.type];
  const Icon = config.icon;

  // Get operator name or "Individual"
  const operatorKey = (entry.operator ?? entry.reporter)?.toLowerCase();
  const submitterLabel = operatorKey
    ? (operatorNames.get(operatorKey) ?? truncateHash(operatorKey, 6, 4))
    : 'Individual';

  // Parse chain name from CAIP-2
  const chainParts = entry.chainId.split(':');
  const chainName = getChainDisplayName(chainParts[0], chainParts[1]);

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <div className={cn('p-1 rounded', config.color)}>
            <Icon className="h-3 w-3" />
          </div>
          <span className="text-xs text-muted-foreground">{config.label}</span>
        </div>
      </TableCell>
      <TableCell>
        <ExplorerLink
          value={entry.identifier as Address}
          type={entry.type === 'transaction' ? 'transaction' : 'address'}
          showDisabledIcon={false}
        />
      </TableCell>
      <TableCell>
        <span className="text-sm">{submitterLabel}</span>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-xs">
          {chainName}
        </Badge>
      </TableCell>
      <TableCell>
        <span className="text-sm text-muted-foreground">
          {formatRelativeTime(entry.registeredAt)}
        </span>
      </TableCell>
      <TableCell>
        <ExplorerLink value={entry.transactionHash} type="transaction" showDisabledIcon={false} />
      </TableCell>
    </TableRow>
  );
}

/**
 * Get human-readable chain name from CAIP-2 components.
 */
function getChainDisplayName(namespace: string, reference: string): string {
  if (namespace === 'eip155') {
    const chainId = parseInt(reference, 10);
    const chainNames: Record<number, string> = {
      1: 'Ethereum',
      8453: 'Base',
      10: 'Optimism',
      42161: 'Arbitrum',
      137: 'Polygon',
      31337: 'Local',
      84532: 'Base Sepolia',
    };
    return chainNames[chainId] ?? `Chain ${chainId}`;
  }
  return `${namespace}:${reference}`;
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
  const [typeFilter, setTypeFilter] = useState<RegistrationType | 'all'>('all');
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const { registrations, isLoading, isError } = useRecentRegistrations({
    type: typeFilter,
    limit: 50, // Fetch more for client-side pagination
  });

  const { operators } = useOperators();

  // Build operator name lookup
  const operatorNames = new Map<string, string>();
  for (const op of operators) {
    operatorNames.set(op.address.toLowerCase(), op.identifier);
  }

  // Client-side pagination
  const startIndex = page * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedRegistrations = registrations.slice(startIndex, endIndex);
  const totalPages = Math.ceil(registrations.length / pageSize);

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
            setTypeFilter(value as RegistrationType | 'all');
            setPage(0);
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
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm">
                    Page {page + 1} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
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
