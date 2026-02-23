/**
 * Shared P2P wait-for-confirmation component.
 *
 * Used by both wallet and transaction P2P reporter pages to show
 * on-chain polling status while waiting for the relayer's registration
 * to land on the hub. Dual-path: P2P message (handled by parent) OR
 * on-chain polling (handled here) — whichever fires first wins.
 */

import { useEffect } from 'react';
import { WaitingForData } from './WaitingForData';
import { logger } from '@/lib/logger';

export interface P2PWaitForConfirmationProps {
  /** Cross-chain confirmation status from the polling hook */
  status: 'idle' | 'waiting' | 'polling' | 'confirmed' | 'timeout';
  /** Elapsed polling time in ms */
  elapsedTime: number;
  /** Called when on-chain confirmation is detected */
  onComplete: () => void;
  /** Description shown below spinner (e.g., "registration transaction") */
  waitingFor: string;
  /** Context for the log message */
  logContext?: Record<string, unknown>;
}

/**
 * Displays polling status and auto-advances when hub confirms.
 */
export function P2PWaitForConfirmation({
  status,
  elapsedTime,
  onComplete,
  waitingFor,
  logContext,
}: P2PWaitForConfirmationProps) {
  useEffect(() => {
    if (status === 'confirmed') {
      logger.registration.info('P2P on-chain confirmation detected via polling', logContext);
      const timerId = window.setTimeout(onComplete, 1000);
      return () => clearTimeout(timerId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- elapsedTime excluded: updates every second, would cancel the setTimeout before onComplete fires
  }, [status, onComplete]);

  const statusText =
    status === 'confirmed'
      ? 'Registration confirmed on hub!'
      : status === 'polling'
        ? `Checking hub chain... (${Math.round(elapsedTime / 1000)}s)`
        : status === 'timeout'
          ? 'Still checking...'
          : 'Waiting for relayer to complete registration...';

  return <WaitingForData message={statusText} waitingFor={waitingFor} />;
}
