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
import { useContractDeadlines } from '@/hooks/useContractDeadlines';
import { type SignatureStep } from '@/lib/signatures';
import { useFormStore } from '@/stores/formStore';
import { useP2PStore } from '@/stores/p2pStore';
import { passStreamData, getPeerConnection } from '@/lib/p2p';
import { logger } from '@/lib/logger';
import type { SignatureStatus } from '@/components/composed/SignatureCard';
import type { Address, Hash, Hex } from '@/lib/types/ethereum';

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
  registeree: Address | null;
  /** Relayer address from form store */
  relayer: Address | null;
  /** Connected chain ID */
  chainId: number;
  /** Trigger signing and P2P sending */
  handleSign: () => Promise<void>;
}

export function useP2PSignFlow(config: P2PSignFlowConfig): P2PSignFlowResult {
  const { signatureStep, signType, protocol, keyRef, getLibp2p } = config;

  const { address } = useAccount();
  const chainId = useChainId();
  const { registeree, relayer, relayerFromPeerSession } = useFormStore();
  const { partnerPeerId } = useP2PStore();

  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [signature, setSignature] = useState<Hex | null>(null);

  /**
   * In-flight latch for `handleSign`.
   *
   * `isSending` is only set AFTER signing resolves, so it cannot guard the window that
   * matters: two clicks while the wallet prompt is open produce two signatures, each with its
   * own freshly-resolved `windowBlock`, and both are written to the relayer's stream. The
   * relayer stores whichever arrives last and the victim has already approved two prompts. A
   * ref rather than state because it must be set synchronously inside the same click.
   */
  const signInFlightRef = useRef(false);

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
    refetch: refetchHashStruct,
  } = useGenerateHashStruct(relayer || undefined, signatureStep);

  const {
    nonce,
    isLoading: isLoadingNonce,
    error: nonceError,
    refetch: refetchNonce,
  } = useContractNonce(registeree || undefined);

  const {
    signAcknowledgement,
    signRegistration,
    isPending: isSigning,
    isError: isSignError,
    error: signError,
    reset: resetSign,
  } = useSignEIP712();

  // Registration only: the signature commits to the hash of a block at or after the
  // acknowledgement's grace-period start, so the signer needs the start block to refuse early.
  const { data: deadlines } = useContractDeadlines(
    signType === 'registration' ? (registeree ?? undefined) : undefined
  );
  const gracePeriodStart = deadlines?.start;

  const getStatus = (): SignatureStatus => {
    if (signature) return 'success';
    if (isSignError || sendError) return 'error';
    if (isSigning || isSending) return 'signing';
    return 'idle';
  };

  const handleSign = useCallback(async () => {
    if (signInFlightRef.current) {
      logger.p2p.warn('Sign already in progress, ignoring duplicate call', { keyRef });
      return;
    }

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

    // `relayer` becomes the `trustedForwarder` inside the signed message, and whoever holds
    // that role can complete the irreversible registration on their own schedule. It is only
    // trustworthy if it arrived from a CONNECT handshake in this session — a value restored
    // from localStorage may have been written by anyone with access to this browser profile.
    // A reload at this step does not re-run CONNECT, so without this check the persisted
    // value is what gets signed.
    if (!relayerFromPeerSession) {
      logger.p2p.warn('Refusing to sign: relayer was not established by a handshake this session', {
        keyRef,
      });
      setSendError(
        'Your relayer connection was not verified in this session. Please reconnect to your relayer before signing.'
      );
      return;
    }

    signInFlightRef.current = true;
    try {
      setSendError(null);
      resetSign();

      // Refetch nonce and deadline before signing - never sign with cached values.
      // acknowledge() increments nonces[registeree], so a registration signed with the
      // cached nonce reverts. In this flow the revert surfaces on the RELAYER's machine
      // after the signature has already shipped over libp2p, with no way for the
      // registeree to learn what went wrong — so failing here, before sending, is the
      // only recoverable point.
      const [nonceResult, hashResult] = await Promise.all([refetchNonce(), refetchHashStruct()]);

      const freshNonce =
        nonceResult.status === 'success' ? (nonceResult.data as bigint) : undefined;
      const rawHash = hashResult?.data as [bigint, string] | undefined;
      const freshDeadline = rawHash?.[0] ?? hashData.deadline;

      if (freshNonce === undefined) {
        logger.p2p.error('Failed to refetch nonce before signing', {
          keyRef,
          nonceStatus: nonceResult.status,
        });
        setSendError('Failed to load fresh signing data. Please try again.');
        return;
      }

      const { reportedChainId, incidentTimestamp } = stableFields;

      const params: SignParams = {
        wallet: registeree,
        trustedForwarder: relayer,
        reportedChainId,
        incidentTimestamp,
        nonce: freshNonce,
        deadline: freshDeadline,
        gracePeriodStart,
      };

      // Registration returns the freshness commitment alongside the signature; the relayer
      // cannot rebuild the digest or the calldata without it, so both go on the wire.
      let sig: Hex;
      let windowBlock: bigint | undefined;
      let windowBlockHash: Hash | undefined;
      if (signType === 'registration') {
        ({ signature: sig, windowBlock, windowBlockHash } = await signRegistration(params));
      } else {
        sig = await signAcknowledgement(params);
      }

      // Set isSending before signature to avoid a brief "success" flash in getStatus()
      // (signature being set while isSending is false would momentarily return 'success')
      setIsSending(true);

      // Send signature to relayer
      const connection = await getPeerConnection({ libp2p, remotePeerId: partnerPeerId });

      await passStreamData({
        connection,
        protocols: [protocol],
        streamData: {
          signature: {
            keyRef,
            value: sig,
            deadline: freshDeadline.toString(),
            nonce: freshNonce.toString(),
            address: registeree,
            chainId,
            reportedChainId: reportedChainId.toString(),
            incidentTimestamp: incidentTimestamp.toString(),
            windowBlock: windowBlock?.toString(),
            windowBlockHash,
          },
        },
      });

      // Set signature after successful send so status transitions cleanly:
      // idle → signing → sending → success (never flickers to success during send)
      setSignature(sig);
      logger.p2p.info(`${keyRef} signature sent to relayer`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sign or send';
      logger.p2p.error(`Failed to send ${keyRef} signature`, {}, err as Error);
      setSendError(message);
    } finally {
      setIsSending(false);
      signInFlightRef.current = false;
    }
  }, [
    hashData,
    address,
    partnerPeerId,
    relayerFromPeerSession,
    registeree,
    relayer,
    nonce,
    chainId,
    stableFields,
    signType,
    signAcknowledgement,
    signRegistration,
    gracePeriodStart,
    resetSign,
    protocol,
    keyRef,
    refetchNonce,
    refetchHashStruct,
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
