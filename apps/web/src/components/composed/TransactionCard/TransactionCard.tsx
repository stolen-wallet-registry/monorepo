/**
 * Transaction content component for blockchain transaction submission.
 *
 * Displays transaction status, signed message preview, and links to block explorer.
 * This is a content-only component - wrap in Card if needed for standalone use.
 */

import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { InfoTooltip } from '@/components/composed/InfoTooltip';
import { ExplorerLink } from '@/components/composed/ExplorerLink';
import { cn } from '@/lib/utils';
import { truncateAddress } from '@/lib/address';
import { getChainName, getChainShortName } from '@/lib/explorer';
import { Check, AlertCircle, Loader2, FileSignature, Globe, Copy } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';

export type TransactionStatus = 'idle' | 'submitting' | 'pending' | 'confirmed' | 'failed';

/** Signed message data to display */
export interface SignedMessageData {
  /** Wallet being registered */
  registeree: `0x${string}`;
  /** Wallet that will submit transaction */
  forwarder: `0x${string}`;
  /** Signature nonce */
  nonce: bigint;
  /** Block deadline for signature validity */
  deadline: bigint;
  /** The actual signature */
  signature: `0x${string}`;
  /** Chain ID where signature is valid */
  chainId?: number;
}

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
  /** Signed message data to display */
  signedMessage?: SignedMessageData | null;
  /** Chain ID for network display */
  chainId?: number;
  /** Callback to submit transaction */
  onSubmit: () => void;
  /** Callback to retry after failure */
  onRetry?: () => void;
  /** Whether the submit button is disabled */
  disabled?: boolean;
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
 * This is content-only - no Card wrapper. Parent provides the container.
 */
export function TransactionCard({
  type,
  status,
  hash,
  error,
  explorerUrl,
  signedMessage,
  chainId,
  onSubmit,
  onRetry,
  disabled = false,
  className,
}: TransactionCardProps) {
  const { copied: signatureCopied, copy: copySignature } = useCopyToClipboard({ resetMs: 2000 });

  const typeLabel = TYPE_LABELS[type];
  const statusConfig = STATUS_CONFIG[status];
  const isConfirmed = status === 'confirmed';
  const isSubmitting = status === 'submitting';
  const isPending = status === 'pending';
  const isFailed = status === 'failed';

  // Resolve chainId from props or signedMessage
  const resolvedChainId = chainId ?? signedMessage?.chainId;

  const handleCopySignature = () => {
    if (signedMessage?.signature) {
      copySignature(signedMessage.signature);
    }
  };

  const getDescription = () => {
    if (isConfirmed) return 'Transaction confirmed on-chain';
    if (isPending) return 'Waiting for block confirmation...';
    if (isSubmitting) {
      return resolvedChainId
        ? `Submitting to ${getChainShortName(resolvedChainId)}...`
        : 'Submitting to the network...';
    }
    if (isFailed) return 'Transaction failed';
    return `Submit the ${typeLabel.toLowerCase()} transaction`;
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Status header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{getDescription()}</p>
        <Badge variant={statusConfig.variant} className={cn(isConfirmed && 'bg-green-500')}>
          {statusConfig.label}
        </Badge>
      </div>

      {/* Signed message preview */}
      {signedMessage && !isConfirmed && (
        <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileSignature className="h-4 w-4 text-muted-foreground" />
              <span>Signed Message</span>
              <InfoTooltip
                content={
                  type === 'acknowledgement'
                    ? 'This is the EIP-712 acknowledgement message you signed. Submitting this transaction will record your intent to register this wallet as stolen and start the grace period.'
                    : 'This is the EIP-712 registration message you signed. Submitting this transaction will permanently mark this wallet as stolen in the on-chain registry.'
                }
                size="sm"
              />
            </div>
            {/* Network badge */}
            {resolvedChainId && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="font-mono text-xs gap-1">
                    <Globe className="h-3 w-3" />
                    {getChainShortName(resolvedChainId)}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">
                    {getChainName(resolvedChainId)} (Chain ID: {resolvedChainId})
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="space-y-2 font-mono text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground flex items-center gap-1">
                Registeree:
                <InfoTooltip content="The wallet address being registered as stolen." size="sm" />
              </span>
              <span>{truncateAddress(signedMessage.registeree, 6)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground flex items-center gap-1">
                Forwarder:
                <InfoTooltip
                  content="The wallet submitting this transaction and paying gas fees."
                  size="sm"
                />
              </span>
              <span>{truncateAddress(signedMessage.forwarder, 6)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground flex items-center gap-1">
                Nonce:
                <InfoTooltip
                  content="A unique number preventing replay attacks. Each signature uses a different nonce."
                  size="sm"
                />
              </span>
              <span>{signedMessage.nonce.toString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground flex items-center gap-1">
                Deadline:
                <InfoTooltip
                  content="The block number after which this signature expires and cannot be used."
                  size="sm"
                />
              </span>
              <span>Block {signedMessage.deadline.toString()}</span>
            </div>
            <div className="pt-2 border-t">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">Signature</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={handleCopySignature}
                      className="text-muted-foreground/60 hover:text-foreground transition-colors"
                      aria-label={signatureCopied ? 'Copied!' : 'Copy signature'}
                    >
                      {signatureCopied ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">{signatureCopied ? 'Copied!' : 'Copy signature'}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="text-xs break-all text-muted-foreground/80 cursor-default">
                    {signedMessage.signature.slice(0, 26)}...{signedMessage.signature.slice(-24)}
                  </p>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-md">
                  <p className="text-xs font-mono break-all">{signedMessage.signature}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      )}

      {/* Info text for payment */}
      {signedMessage && status === 'idle' && (
        <p className="text-sm text-muted-foreground text-center">
          {type === 'acknowledgement'
            ? 'Click below to pay gas and submit your signed acknowledgement to the blockchain.'
            : 'Click below to pay gas and permanently register this wallet as stolen.'}
        </p>
      )}

      {/* Transaction hash */}
      {hash && (
        <div className="rounded-lg bg-muted p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-muted-foreground">Transaction Hash</span>
            {resolvedChainId && (
              <Badge variant="outline" className="font-mono text-[10px]">
                {getChainShortName(resolvedChainId)}
              </Badge>
            )}
          </div>
          <ExplorerLink value={hash} type="transaction" href={explorerUrl} />
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
        <Alert variant="destructive" className="overflow-hidden">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <AlertDescription className="break-words">{error}</AlertDescription>
        </Alert>
      )}

      {/* Action button - show during idle, submitting, and failed states */}
      {(status === 'idle' || isSubmitting || isFailed) && (
        <Button
          onClick={isFailed && onRetry ? onRetry : onSubmit}
          className="w-full"
          size="lg"
          disabled={isSubmitting || (disabled && !isFailed)}
          aria-disabled={isSubmitting || (disabled && !isFailed)}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : isFailed ? (
            'Retry Transaction'
          ) : (
            `Submit ${typeLabel}`
          )}
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
    </div>
  );
}
