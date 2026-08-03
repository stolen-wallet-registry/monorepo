/**
 * P2P Relay registration flow page - Registeree role.
 *
 * User signs with stolen wallet, sends signatures to relayer via P2P.
 * Relayer pays gas fees on behalf of the registeree.
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
import { StepIndicator } from '@/components/composed/StepIndicator';
import { P2PDebugPanel } from '@/components/dev';
import {
  WaitForConnectionStep,
  P2PAckSignStep,
  P2PRegSignStep,
  GracePeriodStep,
  SuccessStep,
} from '@/components/registration/steps';
import {
  P2PWaitForAcknowledgement,
  ConnectionStatusBadge,
  ReconnectDialog,
  P2PWaitForConfirmation,
} from '@/components/p2p';
import { useRegistrationStore, type RegistrationStep } from '@/stores/registrationStore';
import { useFormStore } from '@/stores/formStore';
import { useP2PStore, isPreConnectionStep } from '@/stores/p2pStore';
import { useStepNavigation } from '@/hooks/useStepNavigation';
import { useRequireWallet } from '@/hooks/useRequireWallet';
import { useContractDeadlines } from '@/hooks/useContractDeadlines';
import { useP2PKeepAlive } from '@/hooks/p2p/useP2PKeepAlive';
import {
  clearSentSignature,
  receiptMayAdvance,
  resetSentSignatures,
} from '@/hooks/p2p/sentSignatureLatch';
import { useP2PConnectionHealth } from '@/hooks/p2p/useP2PConnectionHealth';
import {
  setup,
  PROTOCOLS,
  readStreamData,
  acceptStream,
  isProtocolExpectedAtStep,
  isStreamAbortError,
  passStreamData,
  sendResignAck,
  type ProtocolHandler,
} from '@/lib/p2p';
import {
  useCrossChainConfirmation,
  needsCrossChainConfirmation,
} from '@/hooks/useCrossChainConfirmation';
import { getHubChainId } from '@/lib/chains/config';
import { getChainName, getBridgeMessageByIdUrl } from '@/lib/explorer';
import { removeSignature, SIGNATURE_STEP } from '@/lib/signatures';
import {
  MAX_RESIGN_REQUESTS,
  parseResignReason,
  resignNoticeForRecipient,
  resignTargetStep,
} from '@/components/registration/p2pResignRequest';
import { logger } from '@/lib/logger';
import { isAddress, isHash } from '@/lib/types/ethereum';
import type { Address } from '@/lib/types/ethereum';

/**
 * Step descriptions for P2P registeree flow.
 */
const STEP_DESCRIPTIONS: Partial<Record<RegistrationStep, string>> = {
  'wait-for-connection': 'Share your pairing code with your relayer',
  'acknowledge-and-sign': 'Sign the acknowledgement with your stolen wallet',
  'acknowledgement-payment': 'Waiting for relayer to submit acknowledgement',
  'grace-period': 'Wait for the grace period to complete',
  'register-and-sign': 'Sign the registration with your stolen wallet',
  'registration-payment': 'Waiting for relayer to complete registration',
  success: 'Registration successful',
};

/**
 * Step titles for P2P registeree flow.
 */
const STEP_TITLES: Partial<Record<RegistrationStep, string>> = {
  'wait-for-connection': 'Pair with Relayer',
  'acknowledge-and-sign': 'Sign Acknowledgement',
  'acknowledgement-payment': 'Relayer Submitting',
  'grace-period': 'Grace Period',
  'register-and-sign': 'Sign Registration',
  'registration-payment': 'Relayer Completing',
  success: 'Complete',
};

// ═══════════════════════════════════════════════════════════════════════════
// P2P Wait for Registration - polls hub as fallback when P2P message lost
// ═══════════════════════════════════════════════════════════════════════════

interface WalletP2PWaitForRegistrationProps {
  wallet: Address | undefined;
  onComplete: () => void;
}

/**
 * Waits for the relayer to complete wallet registration.
 *
 * Dual-path confirmation:
 * 1. P2P: REG_PAY handler stores hash/messageId (handled in parent)
 * 2. On-chain polling: polls hub isWalletRegistered, advances when confirmed
 *
 * On spoke chains, shows CrossChainRelayProgress with Hyperlane tracking.
 */
function WalletP2PWaitForRegistration({ wallet, onComplete }: WalletP2PWaitForRegistrationProps) {
  const chainId = useChainId();
  const { bridgeMessageId } = useRegistrationStore();

  const isCrossChain = needsCrossChainConfirmation(chainId);
  const hubChainId = isCrossChain ? getHubChainId(chainId) : undefined;

  // Track the messageId that was present when this component mounted.
  // Any value on mount is stale (persisted from a previous flow).
  // Only show CrossChainRelayProgress when a NEW messageId arrives.
  const [staleMessageId] = useState(bridgeMessageId);
  const freshMessageId =
    bridgeMessageId && bridgeMessageId !== staleMessageId ? bridgeMessageId : null;

  const confirmation = useCrossChainConfirmation({
    wallet,
    spokeChainId: chainId,
    enabled: !!wallet,
    pollInterval: 3000,
    maxPollingTime: 120000,
  });

  return (
    <P2PWaitForConfirmation
      status={confirmation.status}
      elapsedTime={confirmation.elapsedTime}
      onComplete={onComplete}
      waitingFor={
        isCrossChain ? 'cross-chain registration confirmation' : 'registration transaction'
      }
      logContext={{ wallet, elapsedTime: confirmation.elapsedTime }}
      crossChainProgress={
        isCrossChain && freshMessageId
          ? {
              hubChainName: hubChainId ? getChainName(hubChainId) : undefined,
              bridgeName: 'Hyperlane',
              messageId: freshMessageId,
              explorerUrl: getBridgeMessageByIdUrl(freshMessageId),
            }
          : undefined
      }
    />
  );
}

export function P2PRegistereeRegistrationPage() {
  const [, setLocation] = useLocation();
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const {
    registrationType,
    step,
    setRegistrationType,
    setAcknowledgementHash,
    setRegistrationHash,
    setBridgeMessageId,
  } = useRegistrationStore();
  const { setFormValues, setRelayerFromPeer, clearRelayerProvenance } = useFormStore();
  const relayerFromPeerSession = useFormStore((s) => s.relayerFromPeerSession);
  const {
    partnerPeerId,
    setPeerId,
    setPartnerPeerId,
    clearPartnerPeerId,
    setConnectedToPeer,
    setInitialized,
    reset: resetP2P,
  } = useP2PStore();
  const { goToNextStep, resetFlow } = useStepNavigation();

  // Entering (or returning to) the pairing step invalidates any earlier handshake. Without
  // this, a second connection attempt would find the flag already true and advance on the
  // send instead of on the relayer's reply — the exact gap the reply gate closes.
  useEffect(() => {
    if (step === 'wait-for-connection') {
      clearRelayerProvenance();
      // A second run in this tab must not inherit the first run's "we sent it" latches, or the
      // receipt gate is already open for signatures this run has not produced.
      resetSentSignatures();
    }
  }, [step, clearRelayerProvenance]);

  // Store libp2p in ref - NEVER pass libp2pRef.current directly as a prop!
  // libp2p uses a Proxy that throws when React DevTools tries to serialize it.
  // Always pass getLibp2p getter function instead.
  const libp2pRef = useRef<Libp2p | null>(null);
  // nodeReady triggers re-render when node initializes so components get the updated ref
  const [, setNodeReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [protocolError, setProtocolError] = useState<string | null>(null);
  /**
   * Why this victim is being asked to sign a second EIP-712 message.
   *
   * Its own channel, deliberately. This is the only text that explains an unexpected signing
   * prompt to a fraud victim and tells them to stop and check with their relayer first, and it
   * used to be written into `protocolError` — the same dismissable slot a keep-alive failure or
   * any later stream error writes to. Either would silently overwrite the warning while the
   * victim sat looking at the wallet prompt it was warning them about.
   *
   * Tagged with the step it was raised for and rendered inside that step, so it cannot outlive
   * the prompt it describes and there is no Dismiss to make it disappear early.
   */
  const [resignNotice, setResignNotice] = useState<{ step: RegistrationStep; text: string } | null>(
    null
  );
  const [showReconnectDialog, setShowReconnectDialog] = useState(false);

  // Getter for libp2p - pass this to components, NOT libp2pRef.current
  const getLibp2p = useCallback(() => libp2pRef.current, []);

  // Keep P2P connection alive throughout the session
  // Circuit relay connections timeout after ~2 minutes of inactivity
  useP2PKeepAlive({
    getLibp2p,
    remotePeerId: partnerPeerId,
    onConnectionLost: () => {
      logger.p2p.warn('P2P connection lost');
      setProtocolError('Connection to relayer was lost. Please restart the registration process.');
      setShowReconnectDialog(true);
    },
  });

  // Monitor connection health for both relay and peer
  const { health: connectionHealth } = useP2PConnectionHealth({
    getLibp2p,
    remotePeerId: partnerPeerId,
  });

  /**
   * How many re-sign requests this flow has honoured.
   *
   * A ref, not state: nothing renders from it, and it must not be a dependency of the effect
   * that builds the libp2p node. Not persisted either — a reload rebuilds the node, re-runs
   * CONNECT and starts a fresh session, and a relayer cannot force a reload, so there is no
   * counter to evade by making one happen.
   */
  const resignRequestCount = useRef(0);

  // Use ref for goToNextStep to avoid recreating P2P node when step changes
  const goToNextStepRef = useRef(goToNextStep);
  // Use ref for chainId to avoid stale closure in protocol handlers
  const chainIdRef = useRef(chainId);

  // Update refs in effect to avoid updating during render (React Compiler rule)
  useEffect(() => {
    goToNextStepRef.current = goToNextStep;
  }, [goToNextStep]);

  useEffect(() => {
    chainIdRef.current = chainId;
  }, [chainId]);

  // Initialize P2P node - only depends on connection state, not step navigation
  // Uses AbortController to handle React Strict Mode double-invocation cleanly
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

      // Check if already aborted (React Strict Mode cleanup)
      if (abortController.signal.aborted) {
        logger.p2p.debug('P2P init aborted before start (Strict Mode cleanup)');
        return;
      }

      try {
        logger.p2p.info('Initializing P2P node for registeree');

        // A fresh flow must never inherit a pin from an abandoned session. `partnerPeerId` is
        // persisted so a mid-flow reload keeps its partner, but a user who closed the tab from
        // the success screen would otherwise start their next flow already pinned to the old
        // partner — and the guard would silently reject the new one. Reading the step from
        // getState() rather than a dependency keeps this out of the effect's deps, which would
        // otherwise tear down and rebuild the libp2p node on every step change.
        if (isPreConnectionStep(useRegistrationStore.getState().step)) {
          useP2PStore.getState().clearPartnerPeerId();
        }

        // Build protocol handlers for registeree
        // Note: Uses ref for goToNextStep to avoid handler recreation
        // In libp2p 3.x, handler signature is (stream, connection) - connection unused here
        const streamHandler = (protocol: string) => ({
          handler: async (stream: Stream, connection?: Connection) => {
            try {
              const data = await readStreamData(stream);

              // Bind the stream to the agreed partner peer and to this protocol's schema
              // before any of it is trusted. Without this an arbitrary peer that learned a
              // displayed peer ID could inject signatures or drive the step machine.
              if (!acceptStream(protocol, connection, data, 'registeree')) return;

              // Authenticity is not ordering. `acceptStream` proves the message came from
              // the bound partner; this proves the message makes sense right now. Without
              // it, repeating a payload-free ACK_REC/REG_REC walks the flow one step per
              // message all the way to the success screen.
              const currentStep = useRegistrationStore.getState().step;
              if (!isProtocolExpectedAtStep(protocol, currentStep)) {
                logger.p2p.warn('Ignored protocol message that does not belong at this step', {
                  protocol,
                  step: currentStep,
                });
                return;
              }

              logger.p2p.info('Registeree received data', { protocol, data });

              switch (protocol) {
                case PROTOCOLS.CONNECT:
                  // The relayer dialed us after pasting our pairing code (audit V4 reversed
                  // the direction: we publish, they dial). This is the handshake, not a reply.
                  // Only update state here — step advancement is handled by
                  // WaitForConnectionStep, gated on `relayerFromPeerSession` below.
                  // `isAddress` narrows the wire value to `Address` and re-checks it. The Zod
                  // schema already enforces the shape, so this is belt-and-braces — but it is
                  // the boundary where peer-supplied text becomes an address the victim will
                  // sign over, so it validates here rather than asserting a type.
                  if (data.form?.relayer && isAddress(data.form.relayer)) {
                    // Marks the relayer as handshaked in this session. Signing refuses a
                    // relayer that only came back from localStorage — see FormState.
                    setRelayerFromPeer(data.form.relayer);
                  } else {
                    logger.p2p.warn('CONNECT without a usable relayer address; ignoring', {
                      relayer: data.form?.relayer,
                    });
                    break;
                  }
                  setConnectedToPeer(true);

                  // Answer, so the relayer learns its dial was accepted rather than refused
                  // in silence. It cannot tell the difference from a resolved write, and a
                  // refusal (someone else pinned first) is exactly the case worth surfacing.
                  // The registeree address is echoed so the relayer can check it against the
                  // wallet in the pairing code it pasted — a claim it must not adopt, only
                  // compare.
                  await passStreamData({
                    connection,
                    protocols: [PROTOCOLS.CONNECT],
                    streamData: {
                      form: { registeree: address },
                      success: true,
                    },
                  });
                  break;

                case PROTOCOLS.ACK_REC:
                  // A receipt is only meaningful as an acknowledgement of something WE sent.
                  // Without this, a relayer that sends ACK_REC early pushes the registeree off
                  // the sign step having signed nothing — and the flow then stalls at a payment
                  // step forever. Ordering (`isProtocolExpectedAtStep`) does not cover this: the
                  // receipt IS legitimate at this step, just not before we signed.
                  if (!receiptMayAdvance('wallet-ack')) {
                    logger.p2p.warn('Ignored ACK receipt for a signature this session never sent', {
                      step: currentStep,
                    });
                    break;
                  }
                  logger.p2p.info('ACK signature received by relayer');
                  goToNextStepRef.current();
                  break;

                case PROTOCOLS.ACK_PAY:
                  // Acknowledgement tx hash received - use relayer's chainId if provided
                  // Use chainIdRef.current to avoid stale closure when network changes
                  if (typeof data.hash === 'string' && isHash(data.hash)) {
                    setAcknowledgementHash(data.hash, data.txChainId ?? chainIdRef.current);
                    // Never advance on the relayer's word — the same rule REG_PAY below already
                    // follows. `data.hash` is shape-checked only: no proof the transaction
                    // exists, targets the registry, or succeeded. Advancing here drops the
                    // victim into the anti-phishing grace period with nothing on chain behind
                    // it, so they wait out the delay and are then asked for a registration
                    // signature that cannot succeed. The hash is kept for its explorer link;
                    // `P2PWaitForAcknowledgement` advances once the chain shows a live
                    // acknowledgement.
                    logger.registration.info(
                      'Recorded relayer-reported acknowledgement hash; awaiting on-chain confirmation',
                      { chainId: chainIdRef.current }
                    );
                  } else {
                    logger.p2p.warn('ACK_PAY received with invalid or missing hash', {
                      hash: data.hash,
                    });
                    setProtocolError('Received invalid acknowledgement hash from relayer');
                  }
                  break;

                case PROTOCOLS.REG_REC:
                  // See ACK_REC above — same rule, phase two.
                  if (!receiptMayAdvance('wallet-reg')) {
                    logger.p2p.warn('Ignored REG receipt for a signature this session never sent', {
                      step: currentStep,
                    });
                    break;
                  }
                  logger.p2p.info('REG signature received by relayer');
                  goToNextStepRef.current();
                  break;

                case PROTOCOLS.REG_PAY:
                  // Registration tx hash (and optional bridge message ID) received
                  // Use relayer's chainId if provided for correct explorer links
                  // Only advance step when hash validation succeeds
                  if (typeof data.hash === 'string' && isHash(data.hash)) {
                    setRegistrationHash(data.hash, data.txChainId ?? chainIdRef.current);
                    // Store bridge message ID if provided (for cross-chain explorer links)
                    if (typeof data.messageId === 'string' && isHash(data.messageId)) {
                      setBridgeMessageId(data.messageId);
                      logger.p2p.info('Received bridge message ID from relayer', {
                        messageId: data.messageId,
                      });
                    }
                    // Never advance to success on the relayer's word. `data.hash` is only
                    // checked for shape — there is no proof the transaction exists, targets
                    // the registry, or succeeded — so advancing here would show a fraud
                    // victim a success screen, with an explorer link, for a registration
                    // that may never have happened. The hash is recorded for that link and
                    // nothing more; `WalletP2PWaitForRegistration` polls
                    // `isWalletRegistered` and advances only once the chain agrees, on hub
                    // and spoke chains alike.
                    logger.registration.info(
                      'Recorded relayer-reported registration hash; awaiting on-chain confirmation',
                      { chainId: chainIdRef.current }
                    );
                  } else {
                    logger.p2p.warn('REG_PAY received with invalid or missing hash', {
                      hash: data.hash,
                    });
                    setProtocolError('Received invalid registration hash from relayer');
                  }
                  break;

                case PROTOCOLS.RESIGN_REQ: {
                  // The ONLY inbound message that moves this flow backwards. Four separate
                  // bounds, none of which rely on the sender being honest:
                  //
                  // 1. WHO. `acceptStream` above already required the stream to come from
                  //    the pinned partner peer (`peerGuard.authorizeStreamPeer`), and this
                  //    protocol is not CONNECT, so the pin must already exist — an unpinned
                  //    or mismatched peer was rejected before this switch. Not re-checked
                  //    here: duplicating it would be two places to keep in agreement.
                  //    Note what it does NOT prove — that the partner is honest. It is the
                  //    relayer, trusted with gas and nothing else. Everything below assumes
                  //    the sender is hostile.
                  // 2. WHEN. `isProtocolExpectedAtStep` above admits RESIGN_REQ at the two
                  //    payment steps only, so it cannot reach here from the grace period,
                  //    from a sign step, or from `success`.
                  // 3. WHERE TO. `resignTargetStep` derives the destination from the step we
                  //    are already on plus a two-valued validated enum. The message names no
                  //    step; there is no input that yields anything but the sign step of a
                  //    phase, and no way to reach a later step than the current one.
                  // 4. HOW OFTEN. Each honoured request costs a signing prompt, and only the
                  //    sender decides when to send one. `MAX_RESIGN_REQUESTS` caps the flow's
                  //    lifetime total across both phases, so a hostile relayer gets a small
                  //    fixed number of attempts at signature fatigue, not an unbounded loop.
                  // Every exit path below answers, refusals included. Without a reply the
                  // relayer treats a resolved stream write as consent and navigates back to
                  // wait for a signature this side has decided not to send — both sides then
                  // wait forever. See `lib/p2p/resignAck.ts`.
                  const reason = parseResignReason(data.reason);
                  if (!reason) {
                    // Unreachable while the schema requires the field; kept so relaxing the
                    // schema cannot silently turn a malformed request into a default recovery.
                    logger.p2p.warn('Ignored re-sign request with no recognised reason', {
                      step: currentStep,
                    });
                    await sendResignAck({
                      connection,
                      accepted: false,
                      message: 'Re-sign request carried no recognised reason.',
                    });
                    break;
                  }

                  const target = resignTargetStep(currentStep, reason);
                  if (!target) {
                    logger.p2p.warn('Ignored re-sign request that names no valid recovery step', {
                      step: currentStep,
                      reason,
                    });
                    await sendResignAck({
                      connection,
                      accepted: false,
                      message: 'This flow is not at a step where a re-sign can be honoured.',
                    });
                    break;
                  }

                  if (resignRequestCount.current >= MAX_RESIGN_REQUESTS) {
                    logger.p2p.warn(
                      'Refused re-sign request: this flow has already had its limit',
                      {
                        reason,
                        honoured: resignRequestCount.current,
                        limit: MAX_RESIGN_REQUESTS,
                      }
                    );
                    setProtocolError(
                      `Your relayer has asked you to sign again ${MAX_RESIGN_REQUESTS} times. Further requests are being ignored — stop here and start over with a relayer you trust.`
                    );
                    await sendResignAck({
                      connection,
                      accepted: false,
                      message: 'This flow has already honoured its limit of re-sign requests.',
                    });
                    break;
                  }
                  resignRequestCount.current += 1;

                  // Discard the dead signature before moving, so nothing can resubmit it.
                  // This flow does not persist its own signatures (`useP2PSignFlow` signs and
                  // sends without storing), but sessionStorage is keyed by wallet/chain/step
                  // and shared with the standard and self-relay flows, so an earlier attempt
                  // in this tab can have left one behind. `window-closed` additionally spends
                  // the acknowledgement, which is why it is the reason that restarts phase one.
                  if (address) {
                    removeSignature(address, chainIdRef.current, SIGNATURE_STEP.REGISTRATION);
                    if (reason === 'window-closed' || currentStep === 'acknowledgement-payment') {
                      removeSignature(address, chainIdRef.current, SIGNATURE_STEP.ACKNOWLEDGEMENT);
                    }
                  }

                  // Locally-composed copy. `data.message` is peer-supplied text and is never
                  // rendered — showing it would hand the relayer a caption above a wallet
                  // signing prompt on a fraud victim's screen.
                  setResignNotice({
                    step: target,
                    text: resignNoticeForRecipient(reason, 'wallet'),
                  });
                  logger.registration.warn('Relayer asked for a new signature; moving back', {
                    from: currentStep,
                    to: target,
                    reason,
                    honoured: resignRequestCount.current,
                  });
                  // A re-sign sends the flow back to a sign step, so the latch for the
                  // signature being replaced has to be dropped — otherwise the receipt gate is
                  // already open for a signature that no longer exists.
                  clearSentSignature('wallet-reg');
                  if (target === 'acknowledge-and-sign') clearSentSignature('wallet-ack');

                  // Answered BEFORE the step change, so the relayer is released even if
                  // re-rendering this page tears the handler's context down behind us.
                  await sendResignAck({
                    connection,
                    accepted: true,
                    message: 'Re-sign request accepted.',
                  });

                  useRegistrationStore.getState().setStep(target);
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
              const message = err instanceof Error ? err.message : 'Protocol handling error';
              logger.p2p.error('Error handling protocol', { protocol }, err as Error);
              setProtocolError(`Error in ${protocol}: ${message}`);
            }
          },
          // In libp2p 3.x, runOnTransientConnection renamed to runOnLimitedConnection
          options: { runOnLimitedConnection: true },
        });

        const handlers: ProtocolHandler[] = [
          { protocol: PROTOCOLS.CONNECT, streamHandler: streamHandler(PROTOCOLS.CONNECT) },
          { protocol: PROTOCOLS.ACK_REC, streamHandler: streamHandler(PROTOCOLS.ACK_REC) },
          { protocol: PROTOCOLS.ACK_PAY, streamHandler: streamHandler(PROTOCOLS.ACK_PAY) },
          { protocol: PROTOCOLS.REG_REC, streamHandler: streamHandler(PROTOCOLS.REG_REC) },
          { protocol: PROTOCOLS.REG_PAY, streamHandler: streamHandler(PROTOCOLS.REG_PAY) },
          { protocol: PROTOCOLS.RESIGN_REQ, streamHandler: streamHandler(PROTOCOLS.RESIGN_REQ) },
        ];

        const { libp2p: p2pNode } = await setup({ handlers, walletAddress: address });

        // Check if aborted during setup (React Strict Mode cleanup ran while awaiting)
        if (abortController.signal.aborted) {
          logger.p2p.debug('P2P init aborted after setup, stopping node');
          await p2pNode.stop();
          return;
        }

        node = p2pNode;
        libp2pRef.current = p2pNode;
        setNodeReady(true); // Trigger re-render so components get the node
        setPeerId(p2pNode.peerId.toString());
        setFormValues({ registeree: address });
        setInitialized(true);
        setIsInitializing(false);
        logger.p2p.info('P2P node initialized for registeree', {
          peerId: p2pNode.peerId.toString(),
        });
      } catch (err) {
        // Ignore errors if aborted
        if (abortController.signal.aborted) return;
        logger.p2p.error('Failed to initialize P2P', {}, err as Error);
        setIsInitializing(false);
      }
    };

    initP2P();

    return () => {
      abortController.abort();
      if (node) {
        const stopPromise = node.stop();
        if (stopPromise && typeof stopPromise.catch === 'function') {
          stopPromise.catch((err: unknown) => {
            logger.p2p.warn('Failed to stop P2P node on cleanup', {
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
        // Clear ref to prevent stale access
        if (libp2pRef.current === node) {
          libp2pRef.current = null;
          setNodeReady(false);
        }
      }
    };
    // Note: goToNextStep excluded from deps - accessed via ref to prevent node recreation
  }, [
    isConnected,
    address,
    chainId,
    setPeerId,
    setFormValues,
    setRelayerFromPeer,
    setConnectedToPeer,
    setInitialized,
    setAcknowledgementHash,
    setRegistrationHash,
    setBridgeMessageId,
  ]);

  // Initialize registration type on mount
  useEffect(() => {
    if (registrationType !== 'p2pRelay') {
      setRegistrationType('p2pRelay');
    }
  }, [registrationType, setRegistrationType]);

  // Redirect home only when genuinely disconnected (not while wagmi reconnects on reload)
  const { isReady } = useRequireWallet();

  // The acknowledgement-payment step advances on this, not on the relayer's ACK_PAY message.
  // Polls on a block-time interval, so it is the chain that moves the flow forward.
  const { data: ackDeadlines } = useContractDeadlines(address);

  const handleBack = useCallback(() => {
    resetFlow();
    resetP2P();
    if (libp2pRef.current) {
      const stopPromise = libp2pRef.current.stop();
      if (stopPromise && typeof stopPromise.catch === 'function') {
        stopPromise.catch((err: unknown) => {
          logger.p2p.warn('Failed to stop P2P node on back navigation', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
      libp2pRef.current = null;
    }
    setLocation('/');
  }, [resetFlow, resetP2P, setLocation]);

  if (!isReady) {
    return null;
  }

  const currentTitle = step ? (STEP_TITLES[step] ?? 'Unknown Step') : 'Getting Started';
  const currentDescription = step
    ? (STEP_DESCRIPTIONS[step] ?? '')
    : 'Follow the steps to register your stolen wallet via P2P relay.';

  // Render step content
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
            role="registeree"
            getLibp2p={getLibp2p}
            onComplete={goToNextStep}
            // Writing to a stream the relayer silently drops still resolves, so a victim whose
            // CONNECT was refused would otherwise advance and sign anyway. Advance on the
            // relayer's reply instead of on our own send.
            partnerAcknowledged={relayerFromPeerSession}
          />
        );

      case 'acknowledge-and-sign':
        return <P2PAckSignStep getLibp2p={getLibp2p} />;

      case 'acknowledgement-payment':
        // Gated on the chain, not on the relayer's ACK_PAY message — see the handler above.
        return (
          <P2PWaitForAcknowledgement
            deadlines={ackDeadlines}
            onComplete={goToNextStep}
            waitingFor="acknowledgement transaction"
          />
        );

      case 'grace-period':
        return <GracePeriodStep onComplete={goToNextStep} />;

      case 'register-and-sign':
        return <P2PRegSignStep getLibp2p={getLibp2p} />;

      case 'registration-payment':
        return <WalletP2PWaitForRegistration wallet={address} onComplete={goToNextStep} />;

      case 'success':
        return <SuccessStep />;

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
        Back to Home
      </Button>

      <div className="grid lg:grid-cols-[300px_1fr] gap-8 items-start">
        {/* Step Indicator Sidebar */}
        <aside aria-label="Registration steps">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">P2P Relay Registration</CardTitle>
              <CardDescription>Sign with stolen wallet, relayer pays gas</CardDescription>
            </CardHeader>
            <CardContent>
              <StepIndicator
                registrationType="p2pRelay"
                currentStep={step}
                stepDescriptions={STEP_DESCRIPTIONS}
              />
            </CardContent>
          </Card>
        </aside>

        {/* Main Content - stretches to fill grid row height */}
        <main className="flex flex-col gap-4 self-stretch">
          {/* Protocol error alert */}
          {protocolError && (
            <Alert variant="destructive">
              <AlertDescription className="flex items-center justify-between">
                <span>{protocolError}</span>
                <Button variant="outline" size="sm" onClick={() => setProtocolError(null)}>
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
            <CardContent className="flex-grow flex flex-col justify-center gap-4">
              {/* Rendered here, not in the page-level alert slot: it explains the signing
                  prompt directly below it, and it has no Dismiss because nothing about it
                  stops being true until the victim has decided whether to sign. */}
              {resignNotice?.step === step && (
                <Alert variant="destructive">
                  <AlertDescription>{resignNotice.text}</AlertDescription>
                </Alert>
              )}
              {renderStep()}
            </CardContent>
          </Card>

          {/* P2P Debug Panel - development only */}
          <P2PDebugPanel getLibp2p={getLibp2p} walletAddress={address} />
        </main>
      </div>

      {/* Reconnect dialog when connection is lost */}
      <ReconnectDialog
        open={showReconnectDialog}
        onOpenChange={setShowReconnectDialog}
        getLibp2p={getLibp2p}
        currentPeerId={partnerPeerId}
        partnerRole="relayer"
        // This side publishes a pairing code and never holds one for its partner, so there is
        // nothing a typed peer ID could be checked against. Passing no `pairedWallet` withdraws
        // the typed-identity path; clearing the pin is the recovery instead, which re-opens the
        // same trust-on-first-use the original pairing used and extends no new trust.
        onClearPairing={() => {
          clearPartnerPeerId();
          setConnectedToPeer(false);
          setProtocolError(null);
        }}
        onReconnected={(peerId) => {
          setPartnerPeerId(peerId);
          setProtocolError(null);
          setConnectedToPeer(true);
        }}
        onCancel={() => {
          logger.p2p.info('User cancelled reconnection dialog');
        }}
      />
    </div>
  );
}
