/**
 * Waits for the relayer's acknowledgement transaction to appear ON CHAIN.
 *
 * SECURITY (audit V3, acknowledgement half). The registeree/reporter pages already refuse to
 * advance to success on a relayer-reported REG_PAY hash — `data.hash` is shape-checked only,
 * with no proof the transaction exists, targets the registry, or succeeded. ACK_PAY did exactly
 * what that rule forbids: any 66-character hex called `goToNextStep()`.
 *
 * The acknowledgement is the worse of the two to fake. Advancing puts the victim into the
 * anti-phishing grace period with nothing on chain behind it; they wait out the randomised
 * delay and are then asked for a registration signature that cannot succeed, because there is
 * no acknowledgement for it to belong to. The two-phase flow is spent and the victim has been
 * conditioned to sign on request — the precise outcome the delay exists to prevent.
 *
 * So the hash is recorded for its explorer link and nothing more, and the flow moves on the
 * chain's word: an acknowledgement that is present AND still live.
 */

import { useCallback, useEffect, useRef } from 'react';

import { WaitingForData } from './WaitingForData';
import {
  acknowledgementIsOnChain,
  type AcknowledgementDeadlines,
} from '@/hooks/p2p/acknowledgementGate';

export interface P2PWaitForAcknowledgementProps {
  /** On-chain deadlines for the wallet/reporter being registered. */
  deadlines: AcknowledgementDeadlines | undefined;
  /** Called once, when the chain confirms a live acknowledgement. */
  onComplete: () => void;
  /** What the user is waiting for, for the waiting UI. */
  waitingFor: string;
  /** Optional override for the waiting copy. */
  message?: string;
}

export function P2PWaitForAcknowledgement({
  deadlines,
  onComplete,
  waitingFor,
  message,
}: P2PWaitForAcknowledgementProps) {
  // The deadlines hooks poll on a block-time interval, so this component re-renders with a
  // confirmed acknowledgement many times over. Advancing twice would skip a step of the
  // two-phase flow, so single-firing is structural rather than a property of the condition.
  const hasAdvancedRef = useRef(false);

  // Latest-ref for the callback: pages pass an inline arrow, so listing it as a dependency
  // would re-arm the effect every render.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  const confirmed = acknowledgementIsOnChain(deadlines);

  const advanceOnce = useCallback(() => {
    if (hasAdvancedRef.current) return;
    hasAdvancedRef.current = true;
    onCompleteRef.current();
  }, []);

  useEffect(() => {
    if (confirmed) advanceOnce();
  }, [confirmed, advanceOnce]);

  return (
    <WaitingForData
      message={
        message ??
        'Waiting for your relayer to submit the acknowledgement. This step completes when the transaction is confirmed on chain, not when they say it is.'
      }
      waitingFor={waitingFor}
    />
  );
}
