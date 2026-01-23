/**
 * Operators Table
 *
 * Displays a list of approved operators with their capabilities.
 */

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
  Badge,
  ExplorerLink,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@swr/ui';
import { HelpCircle } from 'lucide-react';
import { useOperators, type OperatorInfo } from '@/hooks/dashboard';
import type { Address } from '@/lib/types/ethereum';

/** Permission description for header tooltip */
const PERMISSIONS_TOOLTIP =
  'Permissions grant operators access to submit batch registrations to specific registries (Wallet, Transaction, or Contract).';

interface CapabilitiesBadgeProps {
  operator: OperatorInfo;
}

/**
 * Displays capability badges for an operator with color coding.
 */
function CapabilitiesBadge({ operator }: CapabilitiesBadgeProps) {
  return (
    <div className="flex flex-wrap gap-1">
      {operator.canSubmitWallet && (
        <Badge className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30">
          WALLET
        </Badge>
      )}
      {operator.canSubmitTransaction && (
        <Badge className="text-xs bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30">
          TX
        </Badge>
      )}
      {operator.canSubmitContract && (
        <Badge className="text-xs bg-purple-500/20 text-purple-400 border-purple-500/30 hover:bg-purple-500/30">
          CONTRACT
        </Badge>
      )}
    </div>
  );
}

interface OperatorRowProps {
  operator: OperatorInfo;
}

function OperatorRow({ operator }: OperatorRowProps) {
  // Convert block number to approximate date
  // Block number × ~12 seconds per block = approximate epoch milliseconds
  // Note: This is approximate since block times vary
  const approvedDate = new Date(Number(operator.approvedAt) * 12 * 1000);
  const dateString = approvedDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium">{operator.identifier}</span>
          {!operator.approved && (
            <Badge variant="destructive" className="w-fit text-xs mt-1">
              Revoked
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        <ExplorerLink value={operator.address as Address} type="address" showDisabledIcon={false} />
      </TableCell>
      <TableCell>
        <CapabilitiesBadge operator={operator} />
      </TableCell>
      <TableCell>
        <span className="text-sm text-muted-foreground">{dateString}</span>
      </TableCell>
    </TableRow>
  );
}

export interface OperatorsTableProps {
  className?: string;
  /** Show revoked operators too */
  showRevoked?: boolean;
}

/**
 * Displays list of approved operators.
 *
 * @example
 * ```tsx
 * <OperatorsTable />
 * ```
 */
export function OperatorsTable({ className, showRevoked = false }: OperatorsTableProps) {
  const { operators, isLoading, isError } = useOperators({
    approvedOnly: !showRevoked,
  });

  if (isError) {
    return (
      <Card className={className}>
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">Failed to load operators.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Approved Operators</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : operators.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No approved operators yet.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 cursor-help">
                          Permissions
                          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[300px]">
                        <p className="text-xs whitespace-pre-line">{PERMISSIONS_TOOLTIP}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead>Approved</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operators.map((operator) => (
                  <OperatorRow key={operator.address} operator={operator} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
