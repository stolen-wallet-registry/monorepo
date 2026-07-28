/**
 * Post-dispatch state for a cross-chain soulbound mint.
 *
 * Shown once the spoke-chain transaction is confirmed and the Hyperlane message is on
 * its way to the hub: it reports polling progress, then the minted token once the hub
 * confirms. The wallet and support mint cards render the exact same structure and
 * differ only in wording, icon and the token they display, so the layout lives here and
 * the copy is passed in.
 */

import type { ReactNode } from 'react';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
} from '@swr/ui';
import { AlertCircle, Check, ExternalLink, Loader2, Send } from 'lucide-react';
import { ExplorerLink } from '@/components/composed/ExplorerLink';
import { cn } from '@/lib/utils';
import type { Hash } from '@/lib/types/ethereum';

interface CrossChainMintStatusCardProps {
  /** Icon rendered in the card title */
  icon: ReactNode;
  /** Card title */
  title: string;
  /** Hub chain confirmed the mint */
  isConfirmedOnHub: boolean;
  /** Still waiting on the hub chain */
  isPolling: boolean;
  /** Gave up waiting for the hub chain */
  isTimeout: boolean;
  /** Seconds elapsed since the spoke transaction confirmed */
  elapsedSeconds: number;
  /** Success copy shown once the hub confirms */
  successMessage: ReactNode;
  /** Copy shown while the message is in flight */
  pendingMessage: ReactNode;
  /** Minted token visual - only rendered once the hub confirms */
  tokenDisplay?: ReactNode;
  /** Chain the request was sent from */
  spokeChainName: string;
  /** Spoke-chain transaction hash */
  spokeHash: Hash;
  /**
   * Explorer URL for the spoke-chain transaction.
   *
   * Nullable because `getExplorerTxUrl` returns null for chains with no known
   * explorer (local Anvil), which is exactly what both call sites pass in.
   * `ExplorerLink` already accepts a null href and degrades to plain text.
   */
  spokeExplorerHref: string | null;
  /** Hyperlane message ID, once known */
  messageId?: Hash | null;
  /** Hyperlane explorer URL for the message */
  explorerUrl?: string | null;
  /** Explanatory note shown while the mint is still in flight */
  footerNote: ReactNode;
  /** Label for the dismiss/reset button */
  resetLabel: string;
  onReset: () => void;
  /** Additional class names */
  className?: string;
}

export function CrossChainMintStatusCard({
  icon,
  title,
  isConfirmedOnHub,
  isPolling,
  isTimeout,
  elapsedSeconds,
  successMessage,
  pendingMessage,
  tokenDisplay,
  spokeChainName,
  spokeHash,
  spokeExplorerHref,
  messageId,
  explorerUrl,
  footerNote,
  resetLabel,
  onReset,
  className,
}: CrossChainMintStatusCardProps) {
  return (
    <Card className={cn('', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Show different alert based on confirmation status */}
        {isConfirmedOnHub ? (
          <Alert className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950">
            <Check className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700 dark:text-green-300">
              {successMessage}
            </AlertDescription>
          </Alert>
        ) : isTimeout ? (
          <Alert className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-700 dark:text-amber-300">
              Confirmation timeout. Your token may still be minting - check the explorer link below.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950">
            <Send className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-700 dark:text-blue-300">
              {pendingMessage}
              {isPolling && elapsedSeconds > 0 && <span className="ml-1">({elapsedSeconds}s)</span>}
            </AlertDescription>
          </Alert>
        )}

        {/* Display minted token when confirmed */}
        {isConfirmedOnHub && tokenDisplay && (
          <div className="flex justify-center py-4">{tokenDisplay}</div>
        )}

        {/* Show loading spinner while polling */}
        {isPolling && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Transaction links */}
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Transaction on {spokeChainName}</Label>
            <ExplorerLink value={spokeHash} href={spokeExplorerHref} />
          </div>

          {/* Hyperlane explorer link */}
          {messageId && explorerUrl && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Track cross-chain message</Label>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-primary hover:underline"
              >
                View on Hyperlane Explorer
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>

        {!isConfirmedOnHub && (
          <p className="text-xs text-center text-muted-foreground">{footerNote}</p>
        )}

        <Button variant="outline" onClick={onReset} className="w-full">
          {resetLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
