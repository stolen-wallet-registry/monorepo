/**
 * Dashboard Stats Cards
 *
 * Displays four stat cards with registry totals.
 */

import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@swr/ui';
import { Wallet, Code, FileText, Users } from 'lucide-react';
import { useRegistryStats } from '@/hooks/dashboard';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  description?: string;
  isLoading?: boolean;
}

function StatCard({ title, value, icon, description, isLoading }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="h-4 w-4 text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="text-2xl font-bold">{value.toLocaleString()}</div>
        )}
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}

export interface DashboardStatsCardsProps {
  className?: string;
}

/**
 * Displays registry statistics in a grid of cards.
 *
 * @example
 * ```tsx
 * <DashboardStatsCards />
 * ```
 */
export function DashboardStatsCards({ className }: DashboardStatsCardsProps) {
  const { stats, isLoading, isError } = useRegistryStats();

  if (isError) {
    return (
      <div className={cn('grid gap-4 md:grid-cols-2 lg:grid-cols-4', className)}>
        <Card className="col-span-full">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">Failed to load registry statistics.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn('grid gap-4 md:grid-cols-2 lg:grid-cols-4', className)}>
      <StatCard
        title="Stolen Wallets"
        value={stats?.totalWalletRegistrations ?? 0}
        icon={<Wallet className="h-4 w-4" />}
        description="Wallets marked as compromised"
        isLoading={isLoading}
      />
      <StatCard
        title="Fraudulent Contracts"
        value={stats?.totalFraudulentContracts ?? 0}
        icon={<Code className="h-4 w-4" />}
        description="Malicious contracts flagged"
        isLoading={isLoading}
      />
      <StatCard
        title="Stolen Transactions"
        value={stats?.totalTransactionsReported ?? 0}
        icon={<FileText className="h-4 w-4" />}
        description="Fraudulent transactions reported"
        isLoading={isLoading}
      />
      <StatCard
        title="Approved Operators"
        value={stats?.activeOperators ?? 0}
        icon={<Users className="h-4 w-4" />}
        description="DAO-approved submitters"
        isLoading={isLoading}
      />
    </div>
  );
}
