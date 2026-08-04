/**
 * "Review before you pay" panel for a relayer.
 *
 * The relayer is about to spend its own gas on a signature it received from a peer. This
 * shows the three things it cannot otherwise see: which wallet actually signed (recovered
 * from the EIP-712 digest, not taken from the payload), whether the nonce still matches the
 * contract, and how long the signature is still valid. Any problem is surfaced as a blocking,
 * actionable error — never silently.
 */

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

import { Alert, AlertDescription, Badge } from '@swr/ui';
import { EnsExplorerLink } from '@/components/composed/EnsExplorerLink';
import { describeRelaySignatureIssue } from '@/lib/signatures/relayVerification';
import type { RelaySignatureReview } from '@/lib/signatures/relayVerification';
import { cn } from '@/lib/utils';
import type { Address } from '@/lib/types/ethereum';

export interface RelayedSignatureReviewProps {
  /** Result of the verification, or null while it has not produced one yet. */
  review: RelaySignatureReview | null;
  /** True while recovery is in flight. */
  isChecking: boolean;
  /** Who the relayer believes it is paying for. */
  expectedSigner: Address | null | undefined;
  /** Deadline the signature commits to (unix seconds). */
  deadline: bigint | undefined;
  className?: string;
}

/** Render a deadline as a coarse countdown; exactness is not the point, direction is. */
function formatTimeLeft(deadline: bigint): string {
  const secondsLeft = Number(deadline - BigInt(Math.floor(Date.now() / 1000)));
  if (secondsLeft <= 0) return 'expired';
  if (secondsLeft < 60) return `${secondsLeft}s left`;
  const minutes = Math.floor(secondsLeft / 60);
  if (minutes < 60) return `${minutes}m left`;
  return `${Math.floor(minutes / 60)}h left`;
}

/**
 * Re-render once a second so the countdown actually counts down.
 *
 * `formatTimeLeft` reads the clock during render, so without a tick the value freezes at
 * whatever it was when the panel last rendered for some unrelated reason — and a relayer
 * deciding whether to spend gas can be shown "4m left" for a signature that lapsed minutes
 * ago. The interval only forces the re-render; the time itself stays read at render, so
 * there is no second copy of the clock to go stale.
 */
function useCountdownTick(active: boolean): void {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => clearInterval(id);
  }, [active]);
}

export function RelayedSignatureReview({
  review,
  isChecking,
  expectedSigner,
  deadline,
  className,
}: RelayedSignatureReviewProps) {
  // Before any early return: hook order must not depend on the review state.
  useCountdownTick(deadline !== undefined);

  if (!review) {
    return (
      <Alert className={className}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <AlertDescription>Verifying the signature you received…</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className={cn('space-y-3', className)} data-testid="relayed-signature-review">
      <div className="rounded-lg bg-muted p-4 space-y-2 font-mono text-sm">
        <div className="flex justify-between items-center gap-2">
          <span className="text-muted-foreground">Signed by:</span>
          {review.recoveredSigner ? (
            <EnsExplorerLink
              value={review.recoveredSigner}
              type="address"
              resolveEns={false}
              showDisabledIcon={false}
            />
          ) : (
            <span className="text-destructive">could not be recovered</span>
          )}
        </div>
        <div className="flex justify-between items-center gap-2">
          <span className="text-muted-foreground">You were told:</span>
          {expectedSigner ? (
            <EnsExplorerLink
              value={expectedSigner}
              type="address"
              resolveEns={false}
              showDisabledIcon={false}
            />
          ) : (
            <span className="text-destructive">unknown</span>
          )}
        </div>
        <div className="flex justify-between items-center gap-2">
          <span className="text-muted-foreground">Nonce:</span>
          <Badge variant={review.issues.includes('nonce-mismatch') ? 'destructive' : 'outline'}>
            {review.issues.includes('nonce-mismatch')
              ? 'does not match the contract'
              : review.issues.includes('nonce-unknown')
                ? 'checking…'
                : 'matches the contract'}
          </Badge>
        </div>
        {deadline !== undefined && (
          <div className="flex justify-between items-center gap-2">
            <span className="text-muted-foreground">Expires:</span>
            <Badge variant={review.issues.includes('deadline-expired') ? 'destructive' : 'outline'}>
              {formatTimeLeft(deadline)}
            </Badge>
          </div>
        )}
      </div>

      {review.ok ? (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            Signature verified. It was signed by the wallet you were told, the nonce matches the
            contract, and it has not expired.
          </AlertDescription>
        </Alert>
      ) : (
        review.issues.map((issue) => (
          <Alert key={issue} variant={issue === 'nonce-unknown' ? 'default' : 'destructive'}>
            {issue === 'nonce-unknown' ? (
              <Loader2 className={cn('h-4 w-4', isChecking && 'animate-spin')} />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <AlertDescription>{describeRelaySignatureIssue(issue)}</AlertDescription>
          </Alert>
        ))
      )}
    </div>
  );
}
