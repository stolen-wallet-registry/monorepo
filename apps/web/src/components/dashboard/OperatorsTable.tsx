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
} from '@swr/ui';
import { useOperators, type OperatorInfo } from '@/hooks/dashboard';
import type { Address } from '@/lib/types/ethereum';

interface CapabilitiesBadgeProps {
  operator: OperatorInfo;
}

/**
 * Displays capability badges for an operator.
 */
function CapabilitiesBadge({ operator }: CapabilitiesBadgeProps) {
  return (
    <div className="flex flex-wrap gap-1">
      {operator.canSubmitWallet && (
        <Badge variant="secondary" className="text-xs">
          WALLET
        </Badge>
      )}
      {operator.canSubmitTransaction && (
        <Badge variant="secondary" className="text-xs">
          TX
        </Badge>
      )}
      {operator.canSubmitContract && (
        <Badge variant="secondary" className="text-xs">
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
  // Assuming ~12 second blocks on Ethereum
  const approvedDate = new Date(Number(operator.approvedAt) * 1000);
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
                  <TableHead>Permissions</TableHead>
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
