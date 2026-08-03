/**
 * P2P Relay transaction registration flow page - Relayer role.
 *
 * Relayer receives signatures + transaction batch data from reporter via P2P
 * and pays gas fees to submit acknowledgement and registration transactions.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { useAccount, useChainId } from 'wagmi';
import { ArrowLeft } from 'lucide-react';
import type { Libp2p } from 'libp2p';
import type { Connection, Stream } from '@libp2p/interface';

import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@swr/ui';
import { TransactionStepIndicator } from '@/components/composed/TransactionStepIndicator';
import { P2PDebugPanel } from '@/components/dev';
import {
  TxAcknowledgePayStep,
  TxGracePeriodStep,
  TxRegisterPayStep,
  TxSuccessStep,
} from '@/components/registration/tx-steps';
import { WaitForConnectionStep } from '@/components/registration/steps';
import { WaitingForData, ConnectionStatusBadge, ReconnectDialog } from '@/components/p2p';
import {
  useTransactionRegistrationStore,
  useTransactionRegistrationFlow,
  getTxNextStep,
  type TransactionRegistrationStep,
} from '@/stores/transactionRegistrationStore';
import { useTransactionFormStore } from '@/stores/transactionFormStore';
import { useP2PStore, isPreConnectionStep } from '@/stores/p2pStore';
import { useP2PKeepAlive } from '@/hooks/p2p/useP2PKeepAlive';
import { useRequireWallet } from '@/hooks/useRequireWallet';
import { useP2PConnectionHealth } from '@/hooks/p2p/useP2PConnectionHealth';
import {
  setup,
  PROTOCOLS,
  readStreamData,
  acceptStream,
  isTxRelayerProtocolExpectedAtStep,
  passStreamData,
  getPeerConnection,
  isStreamAbortError,
  RESIGN_ACK,
  publishResignAck,
  isValidTxSignatureData,
  type ProtocolHandler,
  type ParsedStreamData,
  type PaymentMessage,
} from '@/lib/p2p';
import {
  storeTxSignature,
  TX_SIGNATURE_STEP,
  type StoredTxSignature,
} from '@/lib/signatures/transactions';
import { isSameAddress } from '@/lib/p2p/pairingToken';
import { logger } from '@/lib/logger';
import { isAddress } from '@/lib/types/ethereum';
import type { Address, Hash, Hex } from '@/lib/types/ethereum';

/**
 * Process a received transaction signature: validate, store in signature storage
 * and form store, confirm receipt, and advance step.
 */
async function processTxSignature(
  data: ParsedStreamData,
  connection: Connection,
  relayerAddress: Address,
  expectedChainId: number,
  step: typeof TX_SIGNATURE_STEP.ACKNOWLEDGEMENT | typeof TX_SIGNATURE_STEP.REGISTRATION,
  receiptProtocol: string,
  goToNextStep: () => void,
  updateFormStore: (data: ParsedStreamData) => void,
  /**
   * Called when the signature was stored but the receipt could NOT be delivered — see the
   * receipt block below. The relayer still advances; this tells the human their partner has
   * not been confirmed to.
   */
  onReceiptFailed?: (message: string) => void
): Promise<boolean> {
  if (!isValidTxSignatureData(data, expectedChainId)) {
    logger.p2p.warn(
      `Received malformed TX ${step === TX_SIGNATURE_STEP.ACKNOWLEDGEMENT ? 'ACK' : 'REG'} signature data`,
      { data }
    );
    return false;
  }

  const sig = data.signature;
  const batch = data.transactionBatch;

  // The signature must be FROM the reporter named in the pairing code, and nobody else. The
  // wallet flow's `processSignature` carries the same check for the same reason: everything
  // downstream (the review's recovered-signer comparison, the reporter shown in the UI, the
  // `reporter` argument submitted on chain) is anchored to `pairedWallet`, so a payload naming
  // a different address can only produce a flow that cannot complete. Fails closed with no
  // pairing at all, which is exactly the state in which anything would be accepted.
  const pairedWallet = useP2PStore.getState().pairedWallet;
  if (!pairedWallet || !isSameAddress(sig.address, pairedWallet)) {
    logger.p2p.warn('Rejected relayed transaction signature that is not from the paired wallet', {
      claimed: sig.address,
      paired: pairedWallet,
    });
    return false;
  }

  // Store signature in sessionStorage
  const stored: StoredTxSignature = {
    signature: sig.value as Hex,
    deadline: BigInt(sig.deadline),
    nonce: BigInt(sig.nonce),
    dataHash: batch.dataHash as Hash,
    reportedChainId: batch.reportedChainId as Hash,
    transactionCount: batch.transactionCount,
    // Provably the paired wallet — the guard above rejected anything else.
    reporter: sig.address as Address,
    trustedForwarder: relayerAddress,
    chainId: sig.chainId,
    step,
    storedAt: Date.now(),
    // Registration only: the relayer submits this block number verbatim and rebuilds the
    // digest from this hash to verify the signature. Neither can be re-derived here.
    windowBlock: sig.windowBlock != null ? BigInt(sig.windowBlock) : undefined,
    windowBlockHash: sig.windowBlockHash != null ? (sig.windowBlockHash as Hash) : undefined,
  };
  try {
    storeTxSignature(stored);
  } catch (e) {
    // sessionStorage refused the write (Safari private mode). The pay step reads the signature
    // back out of storage, so advancing would strand the relayer with nothing to submit.
    logger.p2p.error(
      'Failed to store relayed transaction signature',
      { step },
      e instanceof Error ? e : undefined
    );
    return false;
  }

  // Update form store with transaction batch data
  updateFormStore(data);

  // Confirm receipt.
  //
  // Isolated from the advance: a circuit-relay drop makes this write throw, and letting that
  // propagate meant `goToNextStep()` never ran — the relayer held the stored signature but
  // stayed on the waiting screen while the reporter, never receiving its receipt, had no
  // resend control. The signature is stored and the pay step is where the relayer belongs, so
  // the advance happens regardless; the undelivered receipt is a message to a human.
  let receiptDelivered = true;
  try {
    await passStreamData({
      connection,
      protocols: [receiptProtocol],
      streamData: { success: true, message: 'Transaction signature received' },
    });
  } catch (e) {
    receiptDelivered = false;
    logger.p2p.warn('Stored the relayed signature but could not confirm receipt to the partner', {
      step,
      receiptProtocol,
      error: e instanceof Error ? e.message : String(e),
    });
    onReceiptFailed?.(
      'Your partner\'s signature arrived, but the confirmation back to them could not be delivered. They may still be showing "waiting" — tell them it arrived before you submit.'
    );
  }

  logger.p2p.info(
    `TX ${step === TX_SIGNATURE_STEP.ACKNOWLEDGEMENT ? 'ACK' : 'REG'} signature stored, advancing to payment`,
    { reporter: sig.address, transactionCount: batch.transactionCount, receiptDelivered }
  );
  goToNextStep();
  return true;
}

/**
 * Step descriptions for P2P relayer transaction flow.
 */
const STEP_DESCRIPTIONS: Partial<Record<TransactionRegistrationStep, string>> = {
  'wait-for-connection': "Paste the reporter's pairing code",
  'select-transactions': 'Waiting for reporter to select transactions',
  'acknowledge-sign': 'Waiting for reporter to sign acknowledgement',
  'acknowledgement-payment': 'Submit the acknowledgement transaction',
  'grace-period': 'Wait for the grace period to complete',
  'register-sign': 'Waiting for reporter to sign registration',
  'registration-payment': 'Submit the registration transaction',
  success: 'Registration successful',
};

/**
 * Step titles for P2P relayer transaction flow.
 */
const STEP_TITLES: Partial<Record<TransactionRegistrationStep, string>> = {
  'wait-for-connection': 'Wait for Connection',
  'select-transactions': 'Waiting for Selection',
  'acknowledge-sign': 'Waiting for Signature',
  'acknowledgement-payment': 'Submit Acknowledgement',
  'grace-period': 'Grace Period',
  'register-sign': 'Waiting for Signature',
  'registration-payment': 'Complete Registration',
  success: 'Complete',
};

export function TransactionP2PRelayerPage() {
  const [, setLocation] = useLocation();
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { registrationType, step, setStep } = useTransactionRegistrationFlow();
  const { reset: resetTxReg } = useTransactionRegistrationStore();
  const {
    partnerPeerId,
    connectedToPeer,
    pairedWallet,
    setPeerId,
    setPartnerPeerId,
    setConnectedToPeer,
    clearPairedWallet,
    setInitialized,
    reset: resetP2P,
  } = useP2PStore();

  // Entering (or returning to) the pairing step invalidates any earlier pairing. Without this
  // a second attempt would find `connectedToPeer` already true and advance immediately, and a
  // stale `pairedWallet` from an abandoned session would authorize payment for a report this
  // relayer never agreed to. Deps are `[step]` only, so the CONNECT that legitimately sets
  // these while still on this step is not undone.
  useEffect(() => {
    if (step === 'wait-for-connection') {
      setConnectedToPeer(false);
      clearPairedWallet();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- must run on step entry only
  }, [step]);

  // Store libp2p in ref - NEVER pass libp2pRef.current directly as a prop!
  const libp2pRef = useRef<Libp2p | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [showReconnectDialog, setShowReconnectDialog] = useState(false);

  // Getter for libp2p - pass this to components, NOT libp2pRef.current
  const getLibp2p = useCallback(() => libp2pRef.current, []);

  // Keep P2P connection alive
  useP2PKeepAlive({
    getLibp2p,
    remotePeerId: partnerPeerId,
    onConnectionLost: () => {
      logger.p2p.warn('P2P connection lost');
      setConnectionError('Connection to reporter was lost. They may need to restart the process.');
      setShowReconnectDialog(true);
    },
  });

  // Monitor connection health
  const { health: connectionHealth } = useP2PConnectionHealth({
    getLibp2p,
    remotePeerId: partnerPeerId,
  });

  // Use ref for step advancement to avoid recreating P2P node when step changes
  const goToNextStepRef = useRef(() => {
    const currentStep = useTransactionRegistrationStore.getState().step;
    if (currentStep) {
      const next = getTxNextStep('p2pRelay', currentStep);
      if (next) {
        useTransactionRegistrationStore.getState().setStep(next);
      }
    }
  });

  /**
   * Update the form store from received P2P data.
   * Uses getState() to avoid unstable deps in the P2P init effect.
   */
  const updateFormStoreFromP2PRef = useRef((data: ParsedStreamData, relayerAddress: Address) => {
    if (!data.signature || !data.transactionBatch) return;

    const sig = data.signature;
    const batch = data.transactionBatch;
    const store = useTransactionFormStore.getState();

    // The reporter is the wallet from the pairing code, never `sig.address` — that is the
    // peer's own claim, and writing it here is what let a relayer end up submitting for a
    // wallet it never agreed to (audit V4). A disagreement is dropped rather than merged:
    // `useRelayedTxSignatureReview` will block payment anyway (recovery against a claimed
    // reporter yields an address that is not the paired wallet), but the store must not
    // display the claim as though it were the agreed reporter in the meantime.
    const paired = useP2PStore.getState().pairedWallet;
    if (!paired || (isAddress(sig.address) && sig.address.toLowerCase() !== paired.toLowerCase())) {
      logger.p2p.warn('Relayed signature names a reporter other than the paired wallet', {
        claimed: sig.address,
        paired,
      });
    }
    if (paired) store.setReporter(paired);
    store.setForwarder(relayerAddress);
    store.setReportedChainId(sig.chainId);
    store.setSelectedTxHashes(batch.transactionHashes as Hash[]);
    // Populate selectedTxDetails with hash-only entries so payment steps can show the table.
    // The relayer doesn't have full tx details (to, value, block) — only hashes from P2P.
    store.setSelectedTxDetails(
      batch.transactionHashes.map((hash: string) => ({
        hash: hash as Hash,
        to: null,
        value: '0',
        blockNumber: '0',
      }))
    );
    store.setTransactionData(
      batch.dataHash as Hash,
      batch.transactionHashes as Hash[],
      batch.chainIdHashes as Hash[]
    );
  });

  // Read inside long-lived protocol handlers, which would otherwise close over a stale
  // chainId if the relayer switches network mid-flow. The received signature is checked
  // against this value before the relayer pays to submit it.
  const chainIdRef = useRef(chainId);
  useEffect(() => {
    chainIdRef.current = chainId;
  }, [chainId]);

  // Initialize P2P node
  // Every setState below an await in this effect is already gated on
  // `abortController.signal.aborted` (including inside catch blocks), so a
  // superseded or unmounted run cannot write state. The rule cannot see the
  // guard through the async helper calls.
  // react-doctor-disable-next-line react-doctor/no-set-state-after-await-in-effect
  useEffect(() => {
    const abortController = new AbortController();
    let node: Libp2p | null = null;

    const initP2P = async () => {
      if (!isConnected || !address) return;

      if (abortController.signal.aborted) {
        logger.p2p.debug('P2P init aborted before start (Strict Mode cleanup)');
        return;
      }

      try {
        logger.p2p.info('Initializing P2P node for TX relayer');

        // A fresh flow must never inherit a pin from an abandoned session. `partnerPeerId` is
        // persisted so a mid-flow reload keeps its partner, but a user who closed the tab from
        // the success screen would otherwise start their next flow already pinned to the old
        // partner — and the guard would silently reject the new one. Reading the step from
        // getState() rather than a dependency keeps this out of the effect's deps, which would
        // otherwise tear down and rebuild the libp2p node on every step change.
        if (isPreConnectionStep(useTransactionRegistrationStore.getState().step)) {
          useP2PStore.getState().clearPartnerPeerId();
        }

        const streamHandler = (protocol: string) => ({
          handler: async (stream: Stream, connection?: Connection) => {
            try {
              const data = await readStreamData(stream);

              // Bind the stream to the agreed partner peer and to this protocol's schema
              // before any of it is trusted. Without this an arbitrary peer that learned a
              // displayed peer ID could inject signatures or drive the step machine.
              if (!acceptStream(protocol, connection, data, 'relayer')) {
                // Rejections used to be logged and nothing else, which made the failure mode
                // indistinguishable from a quiet network: the real reporter's CONNECT is
                // refused because someone else was pinned first, and both sides just sit
                // there. Saying so is what lets a relayer notice they are paired with the
                // wrong peer and restart, rather than eventually paying gas for a stranger.
                if (protocol === PROTOCOLS.CONNECT) {
                  setConnectionError(
                    'A connection attempt was refused because it came from a different peer than the one you are paired with. If your partner cannot connect, restart this page to clear the pairing.'
                  );
                }
                return;
              }

              // Authenticity is not ordering. `acceptStream` proves the message came from the
              // bound partner; this proves it belongs at the step the relayer is actually on.
              // Without it a partner that repeats a CONNECT walks the relayer forward one step
              // per message — into a payment step with no signature stored.
              const currentStep = useTransactionRegistrationStore.getState().step;
              if (!isTxRelayerProtocolExpectedAtStep(protocol, currentStep)) {
                logger.p2p.warn('Ignored TX protocol message that does not belong at this step', {
                  protocol,
                  step: currentStep,
                });
                return;
              }

              logger.p2p.info('TX Relayer received data', { protocol, data });

              switch (protocol) {
                case PROTOCOLS.CONNECT: {
                  // The reporter's answer to the CONNECT this page sent after pasting their
                  // pairing code. It proves the pairing was accepted; nothing is learned here.
                  //
                  // SECURITY (audit V4): the reporter comes from the pairing code and from
                  // nowhere else. `data.form.registeree` used to be written straight into the
                  // form store with an `as Address` cast — that is the peer's own claim, and
                  // it is what the later signer check was comparing against. Now it is only
                  // compared, and a disagreement aborts rather than resolving in the peer's
                  // favour.
                  const paired = useP2PStore.getState().pairedWallet;
                  if (!paired) {
                    logger.p2p.error('CONNECT accepted with no paired wallet; refusing');
                    setConnectionError(
                      'This session has no pairing code, so there is no way to tell whose report you would be paying for. Restart this page and paste the code your partner shows you.'
                    );
                    break;
                  }
                  if (
                    data.form?.registeree &&
                    (!isAddress(data.form.registeree) ||
                      data.form.registeree.toLowerCase() !== paired.toLowerCase())
                  ) {
                    logger.p2p.warn('Peer claims a different wallet than the pairing code names', {
                      claimed: data.form.registeree,
                      paired,
                    });
                    setConnectionError(
                      'Your partner is reporting from a different wallet than the one in the pairing code you pasted. Do not continue — ask them for a fresh code.'
                    );
                    break;
                  }
                  useTransactionFormStore.getState().setReporter(paired);
                  // The partner peer ID was pinned from the pairing code before dialing.
                  // Deliberately NOT taken from data.p2p.partnerPeerId — a payload-supplied
                  // peer ID is attacker-controlled and would defeat the binding.
                  setConnectedToPeer(true);

                  // At `wait-for-connection` this is the answer to our own dial: no reply (an
                  // answer to an answer is an endless CONNECT ping-pong) and no step advance,
                  // because WaitForConnectionStep owns that and gates it on `connectedToPeer`.
                  //
                  // Past it, the reporter reloaded and is asking us to re-assert the handshake
                  // so they can sign again (see `lib/p2p/rehandshake.ts`). They dialed, so here
                  // WE answer. The reply carries our own connected address — the value their
                  // side checks against the forwarder it already has on file, not one read out
                  // of this payload.
                  if (isPreConnectionStep(currentStep)) break;

                  logger.p2p.info('Answering a re-handshake request from the reporter', {
                    step: currentStep,
                  });
                  await passStreamData({
                    connection,
                    protocols: [PROTOCOLS.CONNECT],
                    streamData: { form: { relayer: address }, success: true },
                  });
                  break;
                }

                case RESIGN_ACK:
                  // The reporter's answer to a re-sign request this page sent. See the wallet
                  // relayer page; identical semantics.
                  publishResignAck(data.success === true);
                  break;

                case PROTOCOLS.TX_ACK_SIG: {
                  // Transaction acknowledgement signature + batch data received.
                  // processTxSignature advances one step (select-transactions → acknowledge-sign)
                  // but relayer needs to reach acknowledgement-payment, so advance again —
                  // only if it actually accepted the payload. Advancing on a rejected payload
                  // would move the relayer into a payment step with no stored signature.
                  const ackAccepted = await processTxSignature(
                    data,
                    connection,
                    address,
                    chainIdRef.current,
                    TX_SIGNATURE_STEP.ACKNOWLEDGEMENT,
                    PROTOCOLS.TX_ACK_REC,
                    goToNextStepRef.current,
                    (d) => updateFormStoreFromP2PRef.current(d, address),
                    setConnectionError
                  );
                  if (ackAccepted) {
                    // Skip acknowledge-sign → acknowledgement-payment
                    goToNextStepRef.current();
                  }
                  break;
                }

                case PROTOCOLS.TX_REG_SIG: {
                  // Transaction registration signature + batch data received
                  const regAccepted = await processTxSignature(
                    data,
                    connection,
                    address,
                    chainIdRef.current,
                    TX_SIGNATURE_STEP.REGISTRATION,
                    PROTOCOLS.TX_REG_REC,
                    goToNextStepRef.current,
                    (d) => updateFormStoreFromP2PRef.current(d, address),
                    setConnectionError
                  );
                  if (!regAccepted) {
                    logger.p2p.warn('Rejected TX registration signature payload', { protocol });
                  }
                  break;
                }
              }
            } catch (err) {
              if (isStreamAbortError(err)) {
                logger.p2p.warn('Stream aborted during read, connection may be degraded', {
                  protocol,
                });
                return;
              }
              logger.p2p.error('Error handling TX protocol', { protocol }, err as Error);
            }
          },
          options: { runOnLimitedConnection: true },
        });

        const handlers: ProtocolHandler[] = [
          { protocol: PROTOCOLS.CONNECT, streamHandler: streamHandler(PROTOCOLS.CONNECT) },
          { protocol: PROTOCOLS.TX_ACK_SIG, streamHandler: streamHandler(PROTOCOLS.TX_ACK_SIG) },
          { protocol: PROTOCOLS.TX_REG_SIG, streamHandler: streamHandler(PROTOCOLS.TX_REG_SIG) },
          { protocol: RESIGN_ACK, streamHandler: streamHandler(RESIGN_ACK) },
        ];

        const { libp2p: p2pNode } = await setup({ handlers, walletAddress: address });

        if (abortController.signal.aborted) {
          logger.p2p.debug('P2P init aborted after setup, stopping node');
          await p2pNode.stop();
          return;
        }

        node = p2pNode;
        libp2pRef.current = p2pNode;
        setPeerId(p2pNode.peerId.toString());
        setInitialized(true);
        setIsInitializing(false);
        logger.p2p.info('P2P node initialized for TX relayer', {
          peerId: p2pNode.peerId.toString(),
        });
      } catch (err) {
        if (abortController.signal.aborted) return;
        logger.p2p.error('Failed to initialize P2P for TX relayer', {}, err as Error);
        setIsInitializing(false);
      }
    };

    initP2P();

    return () => {
      abortController.abort();
      if (node) {
        const stopPromise = node.stop();
        if (stopPromise && typeof stopPromise.catch === 'function') {
          stopPromise.catch(() => {
            logger.p2p.debug('Error stopping P2P node');
          });
        }
        if (libp2pRef.current === node) {
          libp2pRef.current = null;
        }
      }
    };
    // Note: txFormStore excluded from deps - accessed via getState() to prevent node recreation
  }, [isConnected, address, setPeerId, setPartnerPeerId, setConnectedToPeer, setInitialized]);

  // Initialize registration type on mount
  useEffect(() => {
    if (registrationType !== 'p2pRelay') {
      useTransactionRegistrationStore.getState().setRegistrationType('p2pRelay');
    }
  }, [registrationType]);

  // Set initial step
  useEffect(() => {
    if (step === null) {
      setStep('wait-for-connection');
    }
  }, [step, setStep]);

  // Redirect home only when genuinely disconnected (not while wagmi reconnects on reload)
  const { isReady } = useRequireWallet();

  const goToNextStep = useCallback(() => {
    goToNextStepRef.current();
  }, []);

  const handleBack = useCallback(() => {
    resetTxReg();
    useTransactionFormStore.getState().reset();
    resetP2P();
    if (libp2pRef.current) {
      const stopPromise = libp2pRef.current.stop();
      if (stopPromise && typeof stopPromise.catch === 'function') {
        stopPromise.catch(() => {
          logger.p2p.debug('Error stopping P2P node on back');
        });
      }
      libp2pRef.current = null;
    }
    setLocation('/registration/transactions/p2p-relay');
  }, [resetTxReg, resetP2P, setLocation]);

  const handleAckComplete = useCallback(() => {
    // After ack submission, notify reporter via P2P
    const node = libp2pRef.current;
    const ackHash = useTransactionRegistrationStore.getState().acknowledgementHash;
    const ackChainId = useTransactionRegistrationStore.getState().acknowledgementChainId;
    if (node && partnerPeerId && ackHash) {
      // Use getPeerConnection to reconnect if the connection dropped
      getPeerConnection({ libp2p: node, remotePeerId: partnerPeerId })
        .then((conn) =>
          passStreamData({
            connection: conn,
            protocols: [PROTOCOLS.TX_ACK_PAY],
            streamData: {
              hash: ackHash,
              txChainId: ackChainId ?? chainId,
              success: true,
            },
          })
        )
        .then(() => {
          logger.p2p.info('TX ACK_PAY sent to reporter', { hash: ackHash });
        })
        .catch((err) => {
          logger.p2p.error('Failed to send TX ACK_PAY to reporter', {}, err as Error);
        });
    } else {
      logger.p2p.warn('Cannot send TX ACK_PAY - missing node, peer, or hash', {
        hasNode: !!node,
        hasPartner: !!partnerPeerId,
        hasHash: !!ackHash,
      });
    }
    goToNextStep();
  }, [partnerPeerId, chainId, goToNextStep]);

  const handleRegComplete = useCallback(() => {
    // After reg submission, notify reporter via P2P
    const node = libp2pRef.current;
    const regHash = useTransactionRegistrationStore.getState().registrationHash;
    const regChainId = useTransactionRegistrationStore.getState().registrationChainId;
    const msgId = useTransactionRegistrationStore.getState().bridgeMessageId;
    if (node && partnerPeerId && regHash) {
      const streamData: PaymentMessage = {
        hash: regHash,
        txChainId: regChainId ?? chainId,
        success: true,
        ...(msgId ? { messageId: msgId } : {}),
      };
      // Use getPeerConnection to reconnect if the connection dropped during cross-chain wait
      getPeerConnection({ libp2p: node, remotePeerId: partnerPeerId })
        .then((conn) =>
          passStreamData({
            connection: conn,
            protocols: [PROTOCOLS.TX_REG_PAY],
            streamData,
          })
        )
        .then(() => {
          logger.p2p.info('TX REG_PAY sent to reporter', { hash: regHash, messageId: msgId });
        })
        .catch((err) => {
          logger.p2p.error('Failed to send TX REG_PAY to reporter', {}, err as Error);
        });
    } else {
      logger.p2p.warn('Cannot send TX REG_PAY - missing node, peer, or hash', {
        hasNode: !!node,
        hasPartner: !!partnerPeerId,
        hasHash: !!regHash,
      });
    }
    goToNextStep();
  }, [partnerPeerId, chainId, goToNextStep]);

  if (!isReady) {
    return null;
  }

  const currentTitle = step ? (STEP_TITLES[step] ?? 'Unknown Step') : 'Getting Started';
  const currentDescription = step
    ? (STEP_DESCRIPTIONS[step] ?? '')
    : 'Help someone register fraudulent transactions by paying gas fees.';

  const renderStep = () => {
    if (isInitializing) {
      return (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          <p className="text-muted-foreground">Connecting to P2P network...</p>
        </div>
      );
    }

    switch (step) {
      case 'wait-for-connection':
        return (
          <WaitForConnectionStep
            role="relayer"
            getLibp2p={getLibp2p}
            onComplete={goToNextStep}
            // Set by the CONNECT handler above when the reporter answers. A resolved write is
            // not an accepted pairing — see the prop's documentation.
            partnerAcknowledged={connectedToPeer}
          />
        );

      case 'select-transactions':
        return (
          <WaitingForData
            message="Waiting for reporter to select transactions..."
            waitingFor="transaction selection"
          />
        );

      case 'acknowledge-sign':
        return (
          <WaitingForData
            message="Waiting for reporter to sign acknowledgement..."
            waitingFor="acknowledgement signature"
          />
        );

      case 'acknowledgement-payment':
        return <TxAcknowledgePayStep onComplete={handleAckComplete} getLibp2p={getLibp2p} />;

      case 'grace-period':
        return <TxGracePeriodStep onComplete={goToNextStep} />;

      case 'register-sign':
        return (
          <WaitingForData
            message="Waiting for reporter to sign registration..."
            waitingFor="registration signature"
          />
        );

      case 'registration-payment':
        return <TxRegisterPayStep onComplete={handleRegComplete} getLibp2p={getLibp2p} />;

      case 'success':
        return <TxSuccessStep />;

      default:
        return (
          <div className="text-muted-foreground text-center py-12">
            Initializing registration flow...
          </div>
        );
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8">
      <Button variant="outline" onClick={handleBack} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Role Selection
      </Button>

      <div className="grid lg:grid-cols-[300px_1fr] gap-8 items-start">
        {/* Step Indicator Sidebar */}
        <aside aria-label="Registration steps">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">P2P Relay (Relayer)</CardTitle>
              <CardDescription>
                Pay gas for someone else&apos;s transaction registration
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TransactionStepIndicator
                registrationType="p2pRelay"
                currentStep={step}
                stepDescriptions={STEP_DESCRIPTIONS}
              />
            </CardContent>
          </Card>
        </aside>

        {/* Main Content */}
        <main className="flex flex-col gap-4 self-stretch">
          {/* Connection error alert */}
          {connectionError && (
            <Alert variant="destructive">
              <AlertDescription className="flex items-center justify-between">
                <span>{connectionError}</span>
                <Button variant="outline" size="sm" onClick={() => setConnectionError(null)}>
                  Dismiss
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <Card className="flex-grow flex flex-col h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{currentTitle}</CardTitle>
                {!isInitializing && (
                  <ConnectionStatusBadge
                    status={connectionHealth.status}
                    health={connectionHealth}
                  />
                )}
              </div>
              <CardDescription>{currentDescription}</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow flex flex-col justify-center">
              {renderStep()}
            </CardContent>
          </Card>

          {/* P2P Debug Panel - development only */}
          <P2PDebugPanel
            getLibp2p={getLibp2p}
            walletAddress={address}
            onSimulateConnectionLost={() => {
              setConnectionError(
                'Connection to reporter was lost. They may need to restart the process.'
              );
              setShowReconnectDialog(true);
            }}
          />
        </main>
      </div>

      {/* Reconnect dialog when connection is lost */}
      <ReconnectDialog
        open={showReconnectDialog}
        onOpenChange={setShowReconnectDialog}
        getLibp2p={getLibp2p}
        currentPeerId={partnerPeerId}
        partnerRole="registeree"
        // The wallet this relayer agreed to pay for. A re-pin is only accepted from a fresh
        // pairing code naming this same wallet — without it, reconnect is a second, unguarded
        // way to change the binding V4 established (see the dialog's module comment).
        pairedWallet={pairedWallet}
        onReconnected={(peerId) => {
          setPartnerPeerId(peerId);
          setConnectionError(null);
          setConnectedToPeer(true);
        }}
        onCancel={() => {
          logger.p2p.info('User cancelled reconnection dialog');
        }}
      />
    </div>
  );
}
