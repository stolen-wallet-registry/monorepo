/**
 * Signature card component for EIP-712 signing.
 *
 * Displays what the user is signing and handles the signing flow.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { InfoTooltip } from '@/components/composed/InfoTooltip';
import { ExplorerLink } from '@/components/composed/ExplorerLink';
import { cn } from '@/lib/utils';
import { getChainShortName } from '@/lib/explorer';
import { SIGNATURE_TTL_MS } from '@/lib/signatures';
import { PenTool, Check, AlertCircle, Loader2, Copy, Clock } from 'lucide-react';
import { useState, useCallback } from 'react';

/** Signature session TTL in minutes (derived from single source of truth) */
const SIGNATURE_TTL_MINUTES = SIGNATURE_TTL_MS / 60000;

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
  /** Chain ID where signature is valid */
  chainId?: number;
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
  const [signatureCopied, setSignatureCopied] = useState(false);

  const typeLabel = TYPE_LABELS[type];
  const isSuccess = status === 'success';
  const isSigning = status === 'signing';
  const isError = status === 'error';

  const handleCopySignature = useCallback(async () => {
    if (!signature || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(signature);
      setSignatureCopied(true);
      setTimeout(() => setSignatureCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy signature:', error);
    }
  }, [signature]);

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
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-lg">Sign {typeLabel}</CardTitle>
                <InfoTooltip
                  content={
                    type === 'acknowledgement'
                      ? 'Sign this EIP-712 message to acknowledge your intent to register this wallet as stolen. This signature will be submitted to the blockchain in the next step.'
                      : 'Sign this EIP-712 message to complete your registration. This signature will permanently mark your wallet as stolen in the on-chain registry.'
                  }
                  size="sm"
                />
              </div>
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
          {/* Chain info */}
          {data.chainId && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground flex items-center gap-1">
                Network:
                <InfoTooltip
                  content="The blockchain network where this signature is valid. Signatures are chain-specific and cannot be used on other networks."
                  size="sm"
                />
              </span>
              <Badge variant="outline" className="font-mono">
                {getChainShortName(data.chainId)}
              </Badge>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground flex items-center gap-1">
              Registeree:
              <InfoTooltip
                content="The wallet address being registered as stolen. This is the compromised wallet you're reporting."
                size="sm"
              />
            </span>
            <ExplorerLink value={data.registeree} type="address" showDisabledIcon={false} />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground flex items-center gap-1">
              Forwarder:
              <InfoTooltip
                content="The wallet that will submit the transaction and pay gas fees. In standard registration, this is the same as the registeree."
                size="sm"
              />
            </span>
            <ExplorerLink value={data.forwarder} type="address" showDisabledIcon={false} />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground flex items-center gap-1">
              Nonce:
              <InfoTooltip
                content="A unique number that prevents replay attacks. Each signature uses a different nonce to ensure it can only be used once."
                size="sm"
              />
            </span>
            <span>{data.nonce.toString()}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground flex items-center gap-1">
              Deadline:
              <InfoTooltip
                content="The block number after which this signature expires. This prevents old signatures from being used maliciously."
                size="sm"
              />
            </span>
            <span>Block {data.deadline.toString()}</span>
          </div>
        </div>

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
                      Signature stored for {SIGNATURE_TTL_MINUTES} minutes. After expiry, you'll
                      need to sign again.
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
      </CardContent>
    </Card>
  );
}
