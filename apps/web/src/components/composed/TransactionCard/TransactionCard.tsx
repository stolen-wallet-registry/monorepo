/**
 * Transaction card component for blockchain transaction submission.
 *
 * Displays transaction status and links to block explorer.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Send, Check, AlertCircle, Loader2, ExternalLink, Clock } from 'lucide-react';

export type TransactionStatus = 'idle' | 'submitting' | 'pending' | 'confirmed' | 'failed';

export interface TransactionCardProps {
  /** Type of transaction */
  type: 'acknowledgement' | 'registration';
  /** Current transaction status */
  status: TransactionStatus;
  /** Transaction hash after submission */
  hash?: `0x${string}` | null;
  /** Error message if transaction failed */
  error?: string | null;
  /** Block explorer URL */
  explorerUrl?: string | null;
  /** Callback to submit transaction */
  onSubmit: () => void;
  /** Callback to retry after failure */
  onRetry?: () => void;
  /** Additional class names */
  className?: string;
}

/**
 * Human-readable labels for transaction types.
 */
const TYPE_LABELS = {
  acknowledgement: 'Acknowledgement',
  registration: 'Registration',
} as const;

/**
 * Status badge configuration.
 */
const STATUS_CONFIG = {
  idle: { label: 'Ready', variant: 'secondary' as const },
  submitting: { label: 'Submitting', variant: 'secondary' as const },
  pending: { label: 'Pending', variant: 'default' as const },
  confirmed: { label: 'Confirmed', variant: 'default' as const },
  failed: { label: 'Failed', variant: 'destructive' as const },
};

/**
 * Displays transaction submission UI with status and explorer link.
 */
export function TransactionCard({
  type,
  status,
  hash,
  error,
  explorerUrl,
  onSubmit,
  onRetry,
  className,
}: TransactionCardProps) {
  const typeLabel = TYPE_LABELS[type];
  const statusConfig = STATUS_CONFIG[status];
  const isConfirmed = status === 'confirmed';
  const isSubmitting = status === 'submitting';
  const isPending = status === 'pending';
  const isFailed = status === 'failed';

  const getIcon = () => {
    if (isConfirmed) return <Check className="h-5 w-5 text-green-600 dark:text-green-400" />;
    if (isPending) return <Clock className="h-5 w-5 text-amber-500" />;
    if (isFailed) return <AlertCircle className="h-5 w-5 text-destructive" />;
    return <Send className="h-5 w-5" />;
  };

  const getDescription = () => {
    if (isConfirmed) return 'Transaction confirmed on-chain';
    if (isPending) return 'Waiting for block confirmation...';
    if (isSubmitting) return 'Submitting to the network...';
    if (isFailed) return 'Transaction failed';
    return `Submit the ${typeLabel.toLowerCase()} transaction`;
  };

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'p-2 rounded-lg',
                isConfirmed && 'bg-green-100 dark:bg-green-900',
                isFailed && 'bg-destructive/10',
                !isConfirmed && !isFailed && 'bg-muted'
              )}
            >
              {getIcon()}
            </div>
            <div>
              <CardTitle className="text-lg">Submit {typeLabel}</CardTitle>
              <CardDescription>{getDescription()}</CardDescription>
            </div>
          </div>
          <Badge variant={statusConfig.variant} className={cn(isConfirmed && 'bg-green-500')}>
            {statusConfig.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Transaction hash */}
        {hash && (
          <div className="rounded-lg bg-muted p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Transaction Hash</span>
              {explorerUrl && (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  View on Explorer
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <p className="font-mono text-sm mt-1 break-all">
              {hash.slice(0, 20)}...{hash.slice(-20)}
            </p>
          </div>
        )}

        {/* Pending indicator */}
        {isPending && (
          <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Waiting for confirmation...</span>
          </div>
        )}

        {/* Error message */}
        {isFailed && error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Action button */}
        {(status === 'idle' || isFailed) && (
          <Button onClick={isFailed && onRetry ? onRetry : onSubmit} className="w-full" size="lg">
            {isFailed ? 'Retry Transaction' : `Submit ${typeLabel}`}
          </Button>
        )}

        {/* Success message */}
        {isConfirmed && (
          <div className="rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-3 text-center">
            <p className="text-sm text-green-700 dark:text-green-300">
              {type === 'acknowledgement'
                ? 'Acknowledgement recorded. Grace period has begun.'
                : 'Registration complete. Your wallet has been registered.'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
