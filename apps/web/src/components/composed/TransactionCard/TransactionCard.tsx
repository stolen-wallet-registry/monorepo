/**
 * Transaction content component for blockchain transaction submission.
 *
 * Displays transaction status, signed message preview, cost breakdown, and links to block explorer.
 * Cost breakdown includes: Protocol Fee, Bridge Fee (spoke chains only, e.g., "Hyperlane Fee"), Network Gas.
 * This is a content-only component - wrap in Card if needed for standalone use.
 */

import { useState, useEffect } from 'react';
import {
  Button,
  Alert,
  AlertDescription,
  Badge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@swr/ui';
import type { TransactionCost } from '@/hooks/useTransactionCost';
import { InfoTooltip } from '@/components/composed/InfoTooltip';
import { ExplorerLink } from '@/components/composed/ExplorerLink';
import { CostBreakdownTable } from '@/components/composed/CostBreakdownTable';
import { CrossChainRelayProgress } from '@/components/composed/CrossChainRelayProgress';
import { cn } from '@/lib/utils';
import { truncateAddress } from '@/lib/address';
import { getChainName, getChainShortName } from '@/lib/explorer';
import {
  Check,
  AlertCircle,
  AlertTriangle,
  Loader2,
  FileSignature,
  Globe,
  Copy,
} from 'lucide-react';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import type { Address, Hash, Hex } from '@/lib/types/ethereum';

export type TransactionStatus =
  | 'idle'
  | 'submitting'
  | 'pending'
  | 'confirmed'
  | 'failed'
  // Cross-chain states (spoke → hub)
  | 'relaying' // Spoke tx confirmed, waiting for hub delivery
  | 'hub-confirmed' // Hub chain shows wallet as registered
  | 'hub-timeout'; // Cross-chain confirmation timed out (spoke tx confirmed, hub unconfirmed)

/** Signed message data to display */
export interface SignedMessageData {
  /** Wallet being registered */
  registeree: Address;
  /** Wallet that will submit transaction */
  trustedForwarder: Address;
  /** Signature nonce */
  nonce: bigint;
  /** Block deadline for signature validity */
  deadline: bigint;
  /** The actual signature */
  signature: Hex;
  /** Chain ID where signature is valid */
  chainId?: number;
}

/** Cost estimate data for display */
export interface CostEstimateData {
  data: TransactionCost | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export interface CrossChainProgress {
  /** Time elapsed since relay started (ms) */
  elapsedTime: number;
  /** Target hub chain name for display */
  hubChainName?: string;
  /** Bridge name (e.g., "Hyperlane") */
  bridgeName?: string;
  /** Cross-chain message ID (for explorer link) */
  messageId?: Hash;
  /** Bridge explorer URL for the message */
  explorerUrl?: string | null;
}

export interface TransactionCardProps {
  /** Type of transaction */
  type: 'acknowledgement' | 'registration';
  /** Current transaction status */
  status: TransactionStatus;
  /** Transaction hash after submission */
  hash?: Hash | null;
  /** Error message if transaction failed */
  error?: string | null;
  /** Block explorer URL */
  explorerUrl?: string | null;
  /** Signed message data to display */
  signedMessage?: SignedMessageData | null;
  /** Cost estimate data */
  costEstimate?: CostEstimateData;
  /** Chain ID for network display */
  chainId?: number;
  /** Cross-chain relay progress (for spoke chain registrations) */
  crossChainProgress?: CrossChainProgress;
  /** Callback to submit transaction */
  onSubmit: () => void;
  /** Callback to retry after failure */
  onRetry?: () => void;
  /** Callback when user clicks "Continue Anyway" after cross-chain timeout */
  onContinueAnyway?: () => void;
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
  // Cross-chain states
  relaying: { label: 'Relaying', variant: 'default' as const },
  'hub-confirmed': { label: 'Confirmed', variant: 'default' as const },
  'hub-timeout': { label: 'Pending Confirmation', variant: 'outline' as const },
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
  costEstimate,
  chainId,
  crossChainProgress,
  onSubmit,
  onRetry,
  onContinueAnyway,
  disabled = false,
  className,
}: TransactionCardProps) {
  const { copied: signatureCopied, copy: copySignature } = useCopyToClipboard({ resetMs: 2000 });
  const [refreshCooldown, setRefreshCooldown] = useState(false);

  // Handle refresh cooldown timer
  useEffect(() => {
    if (!refreshCooldown) return;
    const timer = setTimeout(() => setRefreshCooldown(false), 5000);
    return () => clearTimeout(timer);
  }, [refreshCooldown]);

  const handleRefreshCost = () => {
    if (refreshCooldown || !costEstimate?.refetch) return;
    setRefreshCooldown(true);
    costEstimate.refetch();
  };

  const typeLabel = TYPE_LABELS[type];
  const statusConfig = STATUS_CONFIG[status];
  const isConfirmed = status === 'confirmed' || status === 'hub-confirmed';
  const isSubmitting = status === 'submitting';
  const isPending = status === 'pending';
  const isFailed = status === 'failed';
  const isRelaying = status === 'relaying';
  const isHubConfirmed = status === 'hub-confirmed';
  const isHubTimeout = status === 'hub-timeout';

  // Resolve chainId from props or signedMessage
  const resolvedChainId = chainId ?? signedMessage?.chainId;

  const handleCopySignature = () => {
    if (signedMessage?.signature) {
      copySignature(signedMessage.signature);
    }
  };

  const getDescription = () => {
    if (isHubConfirmed) return 'Registration confirmed on hub chain';
    if (isHubTimeout) {
      return 'Cross-chain confirmation timed out - spoke transaction was confirmed but hub confirmation could not be verified';
    }
    if (isRelaying) {
      const hubName = crossChainProgress?.hubChainName ?? 'hub chain';
      const bridgeName = crossChainProgress?.bridgeName ?? 'bridge';
      return `Relaying to ${hubName} via ${bridgeName}...`;
    }
    if (isConfirmed) return 'Transaction confirmed on-chain';
    if (isPending) return 'Waiting for block confirmation...';
    if (isSubmitting) {
      return resolvedChainId
        ? `Submitting to ${getChainShortName(resolvedChainId)}...`
        : 'Submitting to the network...';
    }
    if (isFailed) return 'Transaction failed';
    return 'Ready to submit';
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
              <span>{truncateAddress(signedMessage.trustedForwarder, 6)}</span>
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
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  Signature
                  <InfoTooltip
                    content="This cryptographic signature proves that the owner of the reporter wallet authorized this submission. It secures the registration by verifying ownership before any data is recorded on-chain."
                    size="sm"
                  />
                </p>
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

      {/* Cost estimate section - show during idle and submitting */}
      {costEstimate && (status === 'idle' || status === 'submitting') && (
        <CostBreakdownTable
          costEstimate={costEstimate.data}
          isLoading={costEstimate.isLoading}
          isError={costEstimate.isError}
          onRefresh={handleRefreshCost}
          isRefreshCooldown={refreshCooldown}
        />
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

      {/* Cross-chain relay progress */}
      {isRelaying && crossChainProgress && (
        <CrossChainRelayProgress
          elapsedTime={crossChainProgress.elapsedTime}
          hubChainName={crossChainProgress.hubChainName}
          bridgeName={crossChainProgress.bridgeName}
          messageId={crossChainProgress.messageId}
          explorerUrl={crossChainProgress.explorerUrl}
        />
      )}

      {/* Error message */}
      {isFailed && error && (
        <Alert variant="destructive" className="overflow-hidden">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <AlertDescription className="break-words break-all">{error}</AlertDescription>
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
            {type === 'acknowledgement' && 'Acknowledgement recorded. Grace period has begun.'}
            {type === 'registration' &&
              isHubConfirmed &&
              'Registration confirmed on hub chain. Your wallet is now permanently registered.'}
            {type === 'registration' &&
              !isHubConfirmed &&
              'Registration complete. Your wallet has been registered.'}
          </p>
        </div>
      )}

      {/* Cross-chain timeout warning */}
      {isHubTimeout && (
        <div className="space-y-3">
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Cross-chain Confirmation Pending
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Your transaction was confirmed on the spoke chain, but we couldn&apos;t verify the
                  hub chain confirmation within the timeout period. This is usually due to network
                  delays.
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Your registration is likely successful. You can check the bridge explorer or
                  continue and verify later.
                </p>
              </div>
            </div>
          </div>
          {crossChainProgress?.explorerUrl && (
            <a
              href={crossChainProgress.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-sm text-primary hover:underline"
            >
              View on Bridge Explorer →
            </a>
          )}
          {onContinueAnyway && (
            <Button onClick={onContinueAnyway} className="w-full" variant="outline" size="lg">
              Continue Anyway
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
