/**
 * Hook for P2P signature relay operations.
 *
 * Coordinates sending signatures between registeree and relayer during P2P registration.
 * Built on top of useP2PConnection with protocol-specific helpers.
 */

import { useCallback, useMemo } from 'react';
import { useAccount } from 'wagmi';
import type { Connection, Stream } from '@libp2p/interface';
import {
  useP2PConnection,
  type UseP2PConnectionOptions,
  type UseP2PConnectionResult,
} from './useP2PConnection';
import {
  PROTOCOLS,
  passStreamData,
  readStreamData,
  getPeerConnection,
  type ParsedStreamData,
  type SignatureOverTheWire,
  type ProtocolHandler,
} from '@/lib/p2p';
import { storeSignature, type StoredSignature, SIGNATURE_STEP } from '@/lib/signatures';
import { useFormStore } from '@/stores/formStore';
import { useRegistrationStore } from '@/stores/registrationStore';
import { useP2PStore } from '@/stores/p2pStore';
import { logger } from '@/lib/logger';
import type { Hash, Hex } from '@/lib/types/ethereum';

export type P2PRole = 'registeree' | 'relayer';

/**
 * Validate signature data before processing.
 * Ensures all required fields exist and can be safely converted to BigInt.
 */
function isValidSignature(sig: unknown): sig is SignatureOverTheWire {
  if (!sig || typeof sig !== 'object') return false;

  const s = sig as Record<string, unknown>;

  // Check required string fields exist
  if (typeof s.value !== 'string' || !s.value) return false;
  // Validate address is 0x-prefixed hex string of correct length (42 chars)
  if (
    typeof s.address !== 'string' ||
    !s.address.startsWith('0x') ||
    s.address.length !== 42 ||
    !/^0x[0-9a-fA-F]{40}$/.test(s.address)
  ) {
    return false;
  }
  if (typeof s.keyRef !== 'string') return false;

  // Check chainId is a valid integer (not a float)
  if (typeof s.chainId !== 'number' || !Number.isInteger(s.chainId)) return false;

  // Check deadline and nonce can be safely converted to BigInt
  if (typeof s.deadline !== 'string' || !/^\d+$/.test(s.deadline)) return false;
  if (typeof s.nonce !== 'string' || !/^\d+$/.test(s.nonce)) return false;

  return true;
}

/**
 * Validate transaction hash from network payload.
 * Ensures it's a properly formatted 0x-prefixed hex string.
 * Tx hashes should be 66 characters (0x + 64 hex chars).
 */
function isValidTxHash(hash: unknown): hash is Hash {
  return (
    typeof hash === 'string' &&
    hash.startsWith('0x') &&
    hash.length === 66 &&
    /^0x[0-9a-fA-F]{64}$/.test(hash)
  );
}

/**
 * Merge protocol handlers, with customHandlers overriding defaults.
 * Uses Map-based deduplication keyed by protocol identifier.
 */
function mergeHandlers(
  defaultHandlers: ProtocolHandler[],
  customHandlers: ProtocolHandler[]
): ProtocolHandler[] {
  const handlerMap = new Map<string, ProtocolHandler>();

  // Add defaults first
  for (const handler of defaultHandlers) {
    handlerMap.set(handler.protocol, handler);
  }

  // Custom handlers override defaults with same protocol
  for (const handler of customHandlers) {
    handlerMap.set(handler.protocol, handler);
  }

  return Array.from(handlerMap.values());
}

/**
 * Options for the useP2PSignatureRelay hook.
 *
 * **Important:** Callback props (`onSignatureReceived`, `onTxHashReceived`, `onPeerConnected`,
 * `onStepAdvance`) should be stable references (memoized with useCallback or refs) to avoid
 * rebuilding protocol handlers on every render. If these callbacks change frequently, consider
 * using a ref pattern like the page components do for goToNextStep.
 *
 * @example Stable callbacks with useCallback:
 * ```tsx
 * const handleSignatureReceived = useCallback((sig, protocol) => {
 *   // handle signature
 * }, []); // stable deps
 *
 * const { ... } = useP2PSignatureRelay({
 *   role: 'relayer',
 *   onSignatureReceived: handleSignatureReceived,
 * });
 * ```
 */
export interface UseP2PSignatureRelayOptions {
  /** The role of this peer (registeree sends signatures, relayer receives) */
  role: P2PRole;
  /**
   * Callback when a signature is received (relayer only).
   * Should be memoized to avoid handler recreation.
   */
  onSignatureReceived?: (signature: SignatureOverTheWire, protocol: string) => void;
  /**
   * Callback when a transaction hash is received (registeree only).
   * Should be memoized to avoid handler recreation.
   */
  onTxHashReceived?: (hash: Hash, protocol: string) => void;
  /**
   * Callback when peer connection is established.
   * Should be memoized to avoid handler recreation.
   */
  onPeerConnected?: (remotePeerId: string) => void;
  /**
   * Callback when registration step should advance.
   * Should be memoized to avoid handler recreation.
   */
  onStepAdvance?: () => void;
  /** Custom protocol handlers (overrides defaults) */
  customHandlers?: ProtocolHandler[];
}

/**
 * Result interface for useP2PSignatureRelay hook.
 *
 * All send functions (`sendAckSignature`, `sendRegSignature`, `sendAckTxHash`, `sendRegTxHash`,
 * `confirmAckReceived`, `confirmRegReceived`, `sendConnectHandshake`) are async and will
 * reject with an error if the connection fails or the stream cannot be opened.
 *
 * **Error Handling:** Callers MUST wrap these functions in try/catch blocks to handle:
 * - Connection errors (peer offline, network issues)
 * - Stream errors (protocol mismatch, timeout)
 *
 * @example
 * ```tsx
 * const handleSend = async () => {
 *   try {
 *     await sendAckSignature(signature);
 *   } catch (err) {
 *     // Handle error - show user feedback, retry, etc.
 *     console.error('Failed to send signature:', err);
 *   }
 * };
 * ```
 */
export interface UseP2PSignatureRelayResult extends Omit<UseP2PConnectionResult, 'send'> {
  /** Role of this peer */
  role: P2PRole;
  /**
   * Send acknowledgement signature to relayer (registeree only).
   * @throws {Error} If connection fails or stream cannot be opened
   */
  sendAckSignature: (signature: SignatureOverTheWire) => Promise<void>;
  /**
   * Send registration signature to relayer (registeree only).
   * @throws {Error} If connection fails or stream cannot be opened
   */
  sendRegSignature: (signature: SignatureOverTheWire) => Promise<void>;
  /**
   * Send acknowledgement transaction hash to registeree (relayer only).
   * @throws {Error} If connection fails or stream cannot be opened
   */
  sendAckTxHash: (hash: Hash) => Promise<void>;
  /**
   * Send registration transaction hash to registeree (relayer only).
   * @throws {Error} If connection fails or stream cannot be opened
   */
  sendRegTxHash: (hash: Hash) => Promise<void>;
  /**
   * Confirm acknowledgement signature received (relayer only).
   * @throws {Error} If connection fails or stream cannot be opened
   */
  confirmAckReceived: () => Promise<void>;
  /**
   * Confirm registration signature received (relayer only).
   * @throws {Error} If connection fails or stream cannot be opened
   */
  confirmRegReceived: () => Promise<void>;
  /**
   * Send connect handshake with form data.
   * @throws {Error} If connection fails or stream cannot be opened
   */
  sendConnectHandshake: () => Promise<void>;
}

/**
 * Hook for P2P signature relay coordination.
 *
 * **Important:** All send functions reject on error. Callers must handle errors appropriately.
 *
 * @example Registeree usage with error handling:
 * ```tsx
 * const { initialize, connect, sendAckSignature, sendRegSignature } = useP2PSignatureRelay({
 *   role: 'registeree',
 *   onTxHashReceived: (hash, protocol) => {
 *     // Handle received tx hash from relayer
 *   },
 * });
 *
 * const handleSign = async () => {
 *   try {
 *     await sendAckSignature(signature);
 *   } catch (err) {
 *     // Show error to user, implement retry logic
 *     setError(err instanceof Error ? err.message : 'Failed to send');
 *   }
 * };
 * ```
 *
 * @example Relayer usage with error handling:
 * ```tsx
 * const { initialize, peerId, sendAckTxHash, sendRegTxHash } = useP2PSignatureRelay({
 *   role: 'relayer',
 *   onSignatureReceived: (signature, protocol) => {
 *     // Store signature and submit transaction
 *   },
 * });
 *
 * const handleSendHash = async () => {
 *   try {
 *     await sendAckTxHash(hash);
 *   } catch (err) {
 *     // Implement retry with exponential backoff
 *     logger.error('Failed to send hash', err);
 *   }
 * };
 * ```
 */
export function useP2PSignatureRelay(
  options: UseP2PSignatureRelayOptions
): UseP2PSignatureRelayResult {
  const {
    role,
    onSignatureReceived,
    onTxHashReceived,
    onPeerConnected,
    onStepAdvance,
    customHandlers = [],
  } = options;

  const { address } = useAccount();

  // Form store for registeree/relayer addresses
  const { setFormValues } = useFormStore();
  // Registration store for tx hashes
  const { setAcknowledgementHash, setRegistrationHash } = useRegistrationStore();
  // P2P store for connection state
  const { setPartnerPeerId, setConnectedToPeer } = useP2PStore();

  // Build protocol handlers based on role
  // In libp2p 3.x, StreamHandler signature is (stream: Stream, connection: Connection) => void
  const buildRoleHandlers = useCallback((): ProtocolHandler[] => {
    const handlers: ProtocolHandler[] = [];

    // Both roles handle CONNECT
    handlers.push({
      protocol: PROTOCOLS.CONNECT,
      streamHandler: {
        handler: async (stream: Stream, connection: Connection) => {
          try {
            const data = await readStreamData(stream);
            logger.p2p.info('Received CONNECT', { role, data });

            // Update form with partner's address
            if (data.form) {
              setFormValues(data.form);
            }

            // Update P2P state with partner info
            if (data.p2p?.partnerPeerId) {
              setPartnerPeerId(data.p2p.partnerPeerId);
            }
            setConnectedToPeer(true);

            // Relayer responds to CONNECT with their address (only if address is defined)
            if (role === 'relayer' && address) {
              await passStreamData({
                connection,
                protocols: [PROTOCOLS.CONNECT],
                streamData: {
                  form: { relayer: address },
                  success: true,
                },
              });
            } else if (role === 'relayer') {
              // Still send success response even without address
              await passStreamData({
                connection,
                protocols: [PROTOCOLS.CONNECT],
                streamData: { success: true },
              });
            }

            onPeerConnected?.(connection.remotePeer.toString());
            onStepAdvance?.();
          } catch (err) {
            logger.p2p.error('Error handling CONNECT', {}, err as Error);
          }
        },
        // Use runOnLimitedConnection in libp2p 3.x (was runOnTransientConnection)
        options: { runOnLimitedConnection: true },
      },
    });

    if (role === 'relayer') {
      // Relayer receives signatures
      handlers.push({
        protocol: PROTOCOLS.ACK_SIG,
        streamHandler: {
          handler: async (stream: Stream, connection: Connection) => {
            try {
              const data = await readStreamData(stream);
              logger.p2p.info('Received ACK signature', { role });

              // Validate signature data before processing
              if (!isValidSignature(data.signature)) {
                logger.p2p.error('Invalid ACK signature data received', {
                  hasSignature: !!data.signature,
                  fields: data.signature ? Object.keys(data.signature) : [],
                });
                return;
              }

              // Store the signature for later use
              const sig = data.signature;
              const stored: StoredSignature = {
                signature: sig.value as Hex,
                deadline: BigInt(sig.deadline),
                nonce: BigInt(sig.nonce),
                address: sig.address,
                chainId: sig.chainId,
                step: SIGNATURE_STEP.ACKNOWLEDGEMENT,
                storedAt: Date.now(),
              };
              storeSignature(stored);

              // Confirm receipt
              await passStreamData({
                connection,
                protocols: [PROTOCOLS.ACK_REC],
                streamData: { success: true, message: 'Signature received' },
              });

              onSignatureReceived?.(sig, PROTOCOLS.ACK_SIG);
              onStepAdvance?.();
            } catch (err) {
              logger.p2p.error('Error handling ACK_SIG', {}, err as Error);
            }
          },
          options: { runOnLimitedConnection: true },
        },
      });

      handlers.push({
        protocol: PROTOCOLS.REG_SIG,
        streamHandler: {
          handler: async (stream: Stream, connection: Connection) => {
            try {
              const data = await readStreamData(stream);
              logger.p2p.info('Received REG signature', { role });

              // Validate signature data before processing
              if (!isValidSignature(data.signature)) {
                logger.p2p.error('Invalid REG signature data received', {
                  hasSignature: !!data.signature,
                  fields: data.signature ? Object.keys(data.signature) : [],
                });
                return;
              }

              // Store the signature for later use
              const sig = data.signature;
              const stored: StoredSignature = {
                signature: sig.value as Hex,
                deadline: BigInt(sig.deadline),
                nonce: BigInt(sig.nonce),
                address: sig.address,
                chainId: sig.chainId,
                step: SIGNATURE_STEP.REGISTRATION,
                storedAt: Date.now(),
              };
              storeSignature(stored);

              // Confirm receipt
              await passStreamData({
                connection,
                protocols: [PROTOCOLS.REG_REC],
                streamData: { success: true, message: 'Signature received' },
              });

              onSignatureReceived?.(sig, PROTOCOLS.REG_SIG);
              onStepAdvance?.();
            } catch (err) {
              logger.p2p.error('Error handling REG_SIG', {}, err as Error);
            }
          },
          options: { runOnLimitedConnection: true },
        },
      });
    }

    if (role === 'registeree') {
      // Registeree receives tx hashes and confirmations
      // Note: libp2p 3.x StreamHandler signature is (stream, connection) - connection unused here
      handlers.push({
        protocol: PROTOCOLS.ACK_REC,
        streamHandler: {
          handler: async (stream: Stream, _connection: Connection) => {
            try {
              const data = await readStreamData(stream);
              logger.p2p.info('ACK signature confirmed received', { data });
              onStepAdvance?.();
            } catch (err) {
              logger.p2p.error('Error handling ACK_REC', {}, err as Error);
            }
          },
          options: { runOnLimitedConnection: true },
        },
      });

      handlers.push({
        protocol: PROTOCOLS.ACK_PAY,
        streamHandler: {
          handler: async (stream: Stream, _connection: Connection) => {
            try {
              const data = await readStreamData(stream);
              logger.p2p.info('Received ACK payment hash', { data });

              // Validate tx hash before storing/propagating
              if (isValidTxHash(data.hash)) {
                setAcknowledgementHash(data.hash);
                onTxHashReceived?.(data.hash, PROTOCOLS.ACK_PAY);
              } else if (data.hash) {
                logger.p2p.warn('Received malformed ACK payment hash', { hash: data.hash });
              }
              onStepAdvance?.();
            } catch (err) {
              logger.p2p.error('Error handling ACK_PAY', {}, err as Error);
            }
          },
          options: { runOnLimitedConnection: true },
        },
      });

      handlers.push({
        protocol: PROTOCOLS.REG_REC,
        streamHandler: {
          handler: async (stream: Stream, _connection: Connection) => {
            try {
              const data = await readStreamData(stream);
              logger.p2p.info('REG signature confirmed received', { data });
              onStepAdvance?.();
            } catch (err) {
              logger.p2p.error('Error handling REG_REC', {}, err as Error);
            }
          },
          options: { runOnLimitedConnection: true },
        },
      });

      handlers.push({
        protocol: PROTOCOLS.REG_PAY,
        streamHandler: {
          handler: async (stream: Stream, _connection: Connection) => {
            try {
              const data = await readStreamData(stream);
              logger.p2p.info('Received REG payment hash', { data });

              // Validate tx hash before storing/propagating
              if (isValidTxHash(data.hash)) {
                setRegistrationHash(data.hash);
                onTxHashReceived?.(data.hash, PROTOCOLS.REG_PAY);
              } else if (data.hash) {
                logger.p2p.warn('Received malformed REG payment hash', { hash: data.hash });
              }
              onStepAdvance?.();
            } catch (err) {
              logger.p2p.error('Error handling REG_PAY', {}, err as Error);
            }
          },
          options: { runOnLimitedConnection: true },
        },
      });
    }

    // Merge handlers with customHandlers overriding defaults (Map-based deduplication)
    return mergeHandlers(handlers, customHandlers);
  }, [
    role,
    address,
    setFormValues,
    setPartnerPeerId,
    setConnectedToPeer,
    setAcknowledgementHash,
    setRegistrationHash,
    onSignatureReceived,
    onTxHashReceived,
    onPeerConnected,
    onStepAdvance,
    customHandlers,
  ]);

  // Memoize handlers array to prevent recreating on every render
  const handlers = useMemo(() => buildRoleHandlers(), [buildRoleHandlers]);

  // Configure base P2P connection
  const connectionOptions: UseP2PConnectionOptions = {
    autoInit: true,
    handlers,
  };

  const p2pConnection = useP2PConnection(connectionOptions);

  // Helper to get current connection
  const getConnection = useCallback(async (): Promise<Connection> => {
    if (p2pConnection.connection) {
      return p2pConnection.connection;
    }

    const partnerId = useP2PStore.getState().partnerPeerId;
    if (!partnerId || !p2pConnection.node) {
      throw new Error('No connection available');
    }

    return getPeerConnection({ libp2p: p2pConnection.node, remotePeerId: partnerId });
  }, [p2pConnection.connection, p2pConnection.node]);

  // Send connect handshake
  const sendConnectHandshake = useCallback(async () => {
    if (!p2pConnection.peerId) {
      throw new Error('Cannot send connect handshake: local peer ID not available');
    }
    const connection = await getConnection();
    const streamData: ParsedStreamData = {
      form: { registeree: address },
      p2p: { partnerPeerId: p2pConnection.peerId },
    };
    await passStreamData({ connection, protocols: [PROTOCOLS.CONNECT], streamData });
    logger.p2p.info('Sent CONNECT handshake');
  }, [getConnection, address, p2pConnection.peerId]);

  // Registeree: Send acknowledgement signature
  const sendAckSignature = useCallback(
    async (signature: SignatureOverTheWire) => {
      const connection = await getConnection();
      await passStreamData({
        connection,
        protocols: [PROTOCOLS.ACK_SIG],
        streamData: { signature },
      });
      logger.p2p.info('Sent ACK signature');
    },
    [getConnection]
  );

  // Registeree: Send registration signature
  const sendRegSignature = useCallback(
    async (signature: SignatureOverTheWire) => {
      const connection = await getConnection();
      await passStreamData({
        connection,
        protocols: [PROTOCOLS.REG_SIG],
        streamData: { signature },
      });
      logger.p2p.info('Sent REG signature');
    },
    [getConnection]
  );

  // Relayer: Send acknowledgement tx hash
  const sendAckTxHash = useCallback(
    async (hash: Hash) => {
      const connection = await getConnection();
      await passStreamData({
        connection,
        protocols: [PROTOCOLS.ACK_PAY],
        streamData: { hash },
      });
      logger.p2p.info('Sent ACK tx hash', { hash });
    },
    [getConnection]
  );

  // Relayer: Send registration tx hash
  const sendRegTxHash = useCallback(
    async (hash: Hash) => {
      const connection = await getConnection();
      await passStreamData({
        connection,
        protocols: [PROTOCOLS.REG_PAY],
        streamData: { hash },
      });
      logger.p2p.info('Sent REG tx hash', { hash });
    },
    [getConnection]
  );

  // Relayer: Confirm ack signature received (manual if needed)
  const confirmAckReceived = useCallback(async () => {
    const connection = await getConnection();
    await passStreamData({
      connection,
      protocols: [PROTOCOLS.ACK_REC],
      streamData: { success: true, message: 'Signature received' },
    });
    logger.p2p.info('Sent ACK receipt confirmation');
  }, [getConnection]);

  // Relayer: Confirm reg signature received (manual if needed)
  const confirmRegReceived = useCallback(async () => {
    const connection = await getConnection();
    await passStreamData({
      connection,
      protocols: [PROTOCOLS.REG_REC],
      streamData: { success: true, message: 'Signature received' },
    });
    logger.p2p.info('Sent REG receipt confirmation');
  }, [getConnection]);

  return {
    ...p2pConnection,
    role,
    sendAckSignature,
    sendRegSignature,
    sendAckTxHash,
    sendRegTxHash,
    confirmAckReceived,
    confirmRegReceived,
    sendConnectHandshake,
  };
}
