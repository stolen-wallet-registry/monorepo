/**
 * Signature content component for EIP-712 signing.
 *
 * Displays what the user is signing and handles the signing flow.
 * This is a content-only component - wrap in Card if needed for standalone use.
 */

import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  SignatureDetails,
  type SignatureDetailsData,
} from '@/components/composed/SignatureDetails';
import { cn } from '@/lib/utils';
import { SIGNATURE_TTL_MS } from '@/lib/signatures';
import { Check, AlertCircle, Loader2, Copy, Clock } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';

/** Signature session TTL in minutes (derived from single source of truth) */
const SIGNATURE_TTL_MINUTES = SIGNATURE_TTL_MS / 60000;

export type SignatureStatus = 'idle' | 'signing' | 'success' | 'error';

/** Re-export SignatureDetailsData as SignatureData for backward compatibility */
export type SignatureData = SignatureDetailsData;

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
  /** Whether the sign button is disabled */
  disabled?: boolean;
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
 * This is content-only - no Card wrapper. Parent provides the container.
 */
export function SignatureCard({
  type,
  data,
  status,
  error,
  signature,
  onSign,
  onRetry,
  disabled = false,
  className,
}: SignatureCardProps) {
  const { copied: signatureCopied, copy: copySignature } = useCopyToClipboard({ resetMs: 2000 });

  const typeLabel = TYPE_LABELS[type];
  const isSuccess = status === 'success';
  const isSigning = status === 'signing';
  const isError = status === 'error';

  const handleCopySignature = () => {
    if (signature) {
      copySignature(signature);
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Data being signed */}
      <SignatureDetails data={data} />

      {/* Error message */}
      {isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error ?? 'An unexpected error occurred'}</AlertDescription>
        </Alert>
      )}

      {/* Signature preview with full tooltip and TTL info */}
      {isSuccess && signature && (
        <div className="rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-green-700 dark:text-green-300">Signature</p>
            <div className="flex items-center gap-2">
              {/* TTL indicator */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400">
                    <Clock className="h-3 w-3" />
                    {SIGNATURE_TTL_MINUTES}m
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">
                    Signature stored for {SIGNATURE_TTL_MINUTES} minutes. After expiry, you'll need
                    to sign again.
                  </p>
                </TooltipContent>
              </Tooltip>
              {/* Copy button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleCopySignature}
                    className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200 transition-colors"
                    aria-label={signatureCopied ? 'Copied!' : 'Copy signature'}
                  >
                    {signatureCopied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">{signatureCopied ? 'Copied!' : 'Copy signature'}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          {/* Truncated signature with full value tooltip */}
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="font-mono text-xs text-green-600 dark:text-green-400 break-all cursor-default">
                {signature.slice(0, 26)}...{signature.slice(-24)}
              </p>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-md">
              <p className="text-xs font-mono break-all">{signature}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* Action button */}
      {!isSuccess && (
        <Button
          onClick={isError && onRetry ? onRetry : onSign}
          disabled={isSigning || (disabled && !isError)}
          aria-disabled={isSigning || (disabled && !isError)}
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
    </div>
  );
}
