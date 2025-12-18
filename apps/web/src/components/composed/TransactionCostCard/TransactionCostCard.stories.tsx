import type { Meta, StoryObj } from '@storybook/react';
import { RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Button, Skeleton } from '@swr/ui';
import { cn } from '@/lib/utils';

/**
 * TransactionCostCard requires the useTransactionCost hook which needs
 * blockchain connection. These stories show the visual states using
 * a mock implementation of the internal components.
 */

const meta: Meta = {
  title: 'Composed/TransactionCostCard',
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[400px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj;

// Internal components for story display
function CostRow({
  label,
  usd,
  eth,
  className,
}: {
  label: string;
  usd: string;
  eth: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between', className)}>
      <span className="text-muted-foreground">{label}</span>
      <div className="text-right">
        <span className="font-medium">{usd}</span>
        <span className="ml-2 text-xs text-muted-foreground">({eth} ETH)</span>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-28" />
      </div>
      <hr className="border-border" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-36" />
      </div>
      <Skeleton className="h-3 w-48" />
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <AlertCircle className="h-8 w-8 text-destructive" />
      <p className="text-center text-sm text-muted-foreground">Failed to estimate costs</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try Again
      </Button>
    </div>
  );
}

/**
 * Registration step with protocol fee and total.
 */
export const RegistrationWithFee: Story = {
  render: () => (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Estimated Transaction Cost</CardTitle>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Refresh estimate">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <CostRow label="Protocol Fee" usd="$1.00" eth="0.0004" />
          <CostRow label="Network Gas" usd="$0.12" eth="0.00005" />
          <hr className="border-border" />
          <CostRow label="Total" usd="$1.12" eth="0.00045" className="font-medium" />
          <p className="pt-1 text-xs text-muted-foreground">ETH: $2,500.00 USD • Gas: 8.5 gwei</p>
        </div>
      </CardContent>
    </Card>
  ),
};

/**
 * Acknowledgement step - gas only, no protocol fee.
 */
export const AcknowledgementGasOnly: Story = {
  render: () => (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Estimated Transaction Cost</CardTitle>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Refresh estimate">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <CostRow label="Network Gas" usd="$0.08" eth="0.00003" />
          <p className="pt-1 text-xs text-muted-foreground">ETH: $2,500.00 USD • Gas: 6.2 gwei</p>
        </div>
      </CardContent>
    </Card>
  ),
};

/**
 * Loading state while fetching estimate.
 */
export const Loading: Story = {
  render: () => (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Estimated Transaction Cost</CardTitle>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled aria-label="Refreshing">
          <Loader2 className="h-4 w-4 animate-spin" />
        </Button>
      </CardHeader>
      <CardContent>
        <LoadingSkeleton />
      </CardContent>
    </Card>
  ),
};

/**
 * Error state with retry option.
 */
export const Error: Story = {
  render: () => (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Estimated Transaction Cost</CardTitle>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Refresh estimate">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <ErrorState onRetry={() => console.log('Retry clicked')} />
      </CardContent>
    </Card>
  ),
};

/**
 * High gas scenario.
 */
export const HighGas: Story = {
  render: () => (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Estimated Transaction Cost</CardTitle>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Refresh estimate">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <CostRow label="Protocol Fee" usd="$1.00" eth="0.0004" />
          <CostRow label="Network Gas" usd="$8.50" eth="0.0034" />
          <hr className="border-border" />
          <CostRow label="Total" usd="$9.50" eth="0.0038" className="font-medium" />
          <p className="pt-1 text-xs text-muted-foreground">ETH: $2,500.00 USD • Gas: 125 gwei</p>
        </div>
      </CardContent>
    </Card>
  ),
};
