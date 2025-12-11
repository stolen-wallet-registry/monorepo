/**
 * Signature card component for EIP-712 signing.
 *
 * Displays what the user is signing and handles the signing flow.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { truncateAddress } from '@/lib/address';
import { PenTool, Check, AlertCircle, Loader2 } from 'lucide-react';

export type SignatureStatus = 'idle' | 'signing' | 'success' | 'error';

export interface SignatureData {
  /** Wallet being registered */
  registeree: `0x${string}`;
  /** Wallet that will submit transaction */
  forwarder: `0x${string}`;
  /** Signature nonce */
  nonce: bigint;
  /** Block deadline for signature validity */
  deadline: bigint;
}

export interface SignatureCardProps {
  /** Type of signature */
  type: 'acknowledgement' | 'registration';
  /** Data being signed */
  data: SignatureData;
  /** Current signing status */
  status: SignatureStatus;
  /** Error message if signing failed */
  error?: string | null;
  /** The signature after signing */
  signature?: `0x${string}` | null;
  /** Callback to initiate signing */
  onSign: () => void;
  /** Callback to retry after error */
  onRetry?: () => void;
  /** Additional class names */
  className?: string;
}

/**
 * Human-readable labels for signature types.
 */
const TYPE_LABELS = {
  acknowledgement: 'Acknowledgement',
  registration: 'Registration',
} as const;

/**
 * Displays EIP-712 signing UI with data preview and status.
 */
export function SignatureCard({
  type,
  data,
  status,
  error,
  signature,
  onSign,
  onRetry,
  className,
}: SignatureCardProps) {
  const typeLabel = TYPE_LABELS[type];
  const isSuccess = status === 'success';
  const isSigning = status === 'signing';
  const isError = status === 'error';

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'p-2 rounded-lg',
                isSuccess ? 'bg-green-100 dark:bg-green-900' : 'bg-muted'
              )}
            >
              {isSuccess ? (
                <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
              ) : (
                <PenTool className="h-5 w-5" />
              )}
            </div>
            <div>
              <CardTitle className="text-lg">Sign {typeLabel}</CardTitle>
              <CardDescription>
                {isSuccess
                  ? 'Signature complete'
                  : `Sign the ${typeLabel.toLowerCase()} message with your wallet`}
              </CardDescription>
            </div>
          </div>
          {isSuccess && <Badge className="bg-green-500">Signed</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Data being signed */}
        <div className="rounded-lg bg-muted p-4 space-y-2 font-mono text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Registeree:</span>
            <span>{truncateAddress(data.registeree, 6)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Forwarder:</span>
            <span>{truncateAddress(data.forwarder, 6)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Nonce:</span>
            <span>{data.nonce.toString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Deadline:</span>
            <span>Block {data.deadline.toString()}</span>
          </div>
        </div>

        {/* Error message */}
        {isError && error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Signature preview */}
        {isSuccess && signature && (
          <div className="rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-3">
            <p className="text-xs font-medium text-green-700 dark:text-green-300 mb-1">Signature</p>
            <p className="font-mono text-xs text-green-600 dark:text-green-400 break-all">
              {signature.slice(0, 20)}...{signature.slice(-20)}
            </p>
          </div>
        )}

        {/* Action button */}
        {!isSuccess && (
          <Button
            onClick={isError && onRetry ? onRetry : onSign}
            disabled={isSigning}
            className="w-full"
            size="lg"
          >
            {isSigning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Waiting for signature...
              </>
            ) : isError ? (
              'Retry Signing'
            ) : (
              `Sign ${typeLabel}`
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
