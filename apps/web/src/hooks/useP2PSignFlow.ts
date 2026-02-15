/**
 * Shared hook for P2P signature flows (acknowledgement and registration).
 *
 * Extracts the common pattern of:
 * 1. Loading contract data (hash struct + nonce)
 * 2. Signing EIP-712 typed data
 * 3. Sending the signature to the relayer via P2P
 *
 * Used by P2PAckSignStep and P2PRegSignStep to avoid duplicated logic.
 */

import { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { useAccount, useChainId } from 'wagmi';
import type { Libp2p } from 'libp2p';

import { useSignEIP712, type SignParams } from '@/hooks/useSignEIP712';
import { useGenerateHashStruct } from '@/hooks/useGenerateHashStruct';
import { useContractNonce } from '@/hooks/useContractNonce';
import { type SignatureStep } from '@/lib/signatures';
import { useFormStore } from '@/stores/formStore';
import { useP2PStore } from '@/stores/p2pStore';
import { passStreamData, getPeerConnection } from '@/lib/p2p';
import { logger } from '@/lib/logger';
import type { SignatureStatus } from '@/components/composed/SignatureCard';
import type { Hex } from '@/lib/types/ethereum';

export interface P2PSignFlowConfig {
  /** Which signature step (ACKNOWLEDGEMENT or REGISTRATION) */
  signatureStep: SignatureStep;
  /** Which signing function to call ('acknowledgement' or 'registration') */
  signType: 'acknowledgement' | 'registration';
  /** P2P protocol to send the signature on */
  protocol: string;
  /** Key reference for the signature payload */
  keyRef: string;
  /** Getter for the libp2p node instance */
  getLibp2p: () => Libp2p | null;
}

export interface P2PSignFlowResult {
  /** Current signing status */
  status: SignatureStatus;
  /** Error message if any */
  errorMessage: string | null;
  /** The generated signature */
  signature: Hex | null;
  /** Whether contract data is loading */
  isLoading: boolean;
  /** Whether all prerequisites are met for signing */
  isReady: boolean;
  /** Hash struct data (deadline etc.) */
  hashData: { deadline: bigint } | undefined;
  /** Current nonce */
  nonce: bigint | undefined;
  /** Registeree address from form store */
  registeree: string | null;
  /** Relayer address from form store */
  relayer: string | null;
  /** Connected chain ID */
  chainId: number;
  /** Trigger signing and P2P sending */
  handleSign: () => Promise<void>;
}

export function useP2PSignFlow(config: P2PSignFlowConfig): P2PSignFlowResult {
  const { signatureStep, signType, protocol, keyRef, getLibp2p } = config;

  const { address } = useAccount();
  const chainId = useChainId();
  const { registeree, relayer } = useFormStore();
  const { partnerPeerId } = useP2PStore();

  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [signature, setSignature] = useState<Hex | null>(null);

  // Use ref for getter to avoid callback re-creation when parent re-renders
  const getLibp2pRef = useRef(getLibp2p);
  useEffect(() => {
    getLibp2pRef.current = getLibp2p;
  }, [getLibp2p]);

  // Stabilize fields for this signing session
  const stableFields = useMemo(
    () => ({
      reportedChainId: BigInt(chainId),
      incidentTimestamp: 0n, // TODO: Add incident timestamp selection UI
    }),
    [chainId]
  );

  // Contract hooks
  const {
    data: hashData,
    isLoading: isLoadingHash,
    error: hashError,
  } = useGenerateHashStruct(relayer || undefined, signatureStep);

  const {
    nonce,
    isLoading: isLoadingNonce,
    error: nonceError,
  } = useContractNonce(registeree || undefined);

  const {
    signAcknowledgement,
    signRegistration,
    isPending: isSigning,
    isError: isSignError,
    error: signError,
    reset: resetSign,
  } = useSignEIP712();

  const signFn = signType === 'acknowledgement' ? signAcknowledgement : signRegistration;

  const getStatus = (): SignatureStatus => {
    if (signature) return 'success';
    if (isSignError || sendError) return 'error';
    if (isSigning || isSending) return 'signing';
    return 'idle';
  };

  const handleSign = useCallback(async () => {
    const libp2p = getLibp2pRef.current();
    if (
      !hashData ||
      !address ||
      !libp2p ||
      !partnerPeerId ||
      !registeree ||
      !relayer ||
      nonce === undefined
    ) {
      return;
    }

    try {
      setSendError(null);
      resetSign();

      const { reportedChainId, incidentTimestamp } = stableFields;

      const params: SignParams = {
        wallet: registeree,
        trustedForwarder: relayer,
        reportedChainId,
        incidentTimestamp,
        nonce,
        deadline: hashData.deadline,
      };

      const sig = await signFn(params);
      setSignature(sig);

      // Send signature to relayer
      setIsSending(true);
      const connection = await getPeerConnection({ libp2p, remotePeerId: partnerPeerId });

      await passStreamData({
        connection,
        protocols: [protocol],
        streamData: {
          signature: {
            keyRef,
            value: sig,
            deadline: hashData.deadline.toString(),
            nonce: nonce.toString(),
            address: registeree,
            chainId,
            reportedChainId: reportedChainId.toString(),
            incidentTimestamp: incidentTimestamp.toString(),
          },
        },
      });

      logger.p2p.info(`${keyRef} signature sent to relayer`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sign or send';
      logger.p2p.error(`Failed to send ${keyRef} signature`, {}, err as Error);
      setSendError(message);
    } finally {
      setIsSending(false);
    }
  }, [
    hashData,
    address,
    partnerPeerId,
    registeree,
    relayer,
    nonce,
    chainId,
    stableFields,
    signFn,
    resetSign,
    protocol,
    keyRef,
  ]);

  const isLoading = isLoadingHash || isLoadingNonce;
  const isReady =
    !isLoading && !!hashData && nonce !== undefined && !!getLibp2p() && !!partnerPeerId;
  const errorMessage = hashError?.message || nonceError?.message || signError?.message || sendError;

  return {
    status: getStatus(),
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
  };
}
