/**
 * P2P Acknowledgement Sign Step.
 *
 * Registeree signs acknowledgement and sends signature to relayer via P2P.
 * Uses useP2PSignFlow for the common sign-and-send logic.
 */

import type { Libp2p } from 'libp2p';

import { SignatureCard } from '@/components/composed/SignatureCard';
import { EnsExplorerLink } from '@/components/composed/EnsExplorerLink';
import { Alert, AlertDescription } from '@swr/ui';
import { SIGNATURE_STEP } from '@/lib/signatures';
import { PROTOCOLS } from '@/lib/p2p';
import { useP2PSignFlow } from '@/hooks/useP2PSignFlow';

export interface P2PAckSignStepProps {
  /**
   * Getter for the libp2p node instance.
   * IMPORTANT: Uses a getter function instead of passing libp2p directly.
   * libp2p uses a Proxy that throws MissingServiceError when unknown properties are accessed.
   * React DevTools tries to serialize props (accessing `$typeof`, etc.), which crashes the app.
   * Passing a getter function avoids this because functions aren't deeply inspected.
   */
  getLibp2p: () => Libp2p | null;
  // Note: onComplete is intentionally not included here.
  // Step advancement is handled by the parent page via protocol handlers
  // when ACK_REC is received from the relayer, ensuring reliable completion.
}

/**
 * P2P step for registeree to sign acknowledgement and send to relayer.
 */
export function P2PAckSignStep({ getLibp2p }: P2PAckSignStepProps) {
  const {
    status,
    errorMessage,
    signature,
    isLoading,
    isReady,
    hashData,
    nonce,
    registeree,
    relayer,
    chainId,
    handleSign,
  } = useP2PSignFlow({
    signatureStep: SIGNATURE_STEP.ACKNOWLEDGEMENT,
    signType: 'acknowledgement',
    protocol: PROTOCOLS.ACK_SIG,
    keyRef: 'AcknowledgementOfRegistry',
    getLibp2p,
  });

  // Build signature data for display
  const signatureData =
    registeree && relayer && hashData && nonce !== undefined
      ? {
          registeree,
          trustedForwarder: relayer,
          nonce,
          deadline: hashData.deadline,
          chainId,
        }
      : null;

  return (
    <div className="space-y-6">
      <Alert>
        <AlertDescription>
          Sign the acknowledgement message with your stolen wallet. The signature will be sent
          securely to your relayer{' '}
          {relayer && (
            <>
              (<EnsExplorerLink value={relayer} type="address" truncate showDisabledIcon={false} />)
            </>
          )}{' '}
          who will submit the transaction on your behalf.
        </AlertDescription>
      </Alert>

      {isLoading && (
        <div className="flex items-center justify-center py-8" role="status" aria-label="Loading">
          <div
            className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"
            aria-hidden="true"
          />
          <span className="sr-only">Loading signature data...</span>
        </div>
      )}

      {!isLoading && signatureData && (
        <SignatureCard
          type="acknowledgement"
          data={signatureData}
          status={status}
          error={errorMessage}
          signature={signature}
          onSign={handleSign}
          onRetry={handleSign}
          disabled={!isReady}
        />
      )}
    </div>
  );
}
