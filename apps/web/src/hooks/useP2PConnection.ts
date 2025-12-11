/**
 * Hook for managing P2P connection lifecycle.
 *
 * Handles libp2p node creation, connection management, and cleanup.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Libp2p } from 'libp2p';
import type { Connection } from '@libp2p/interface/connection';
import type { IncomingStreamData } from '@libp2p/interface/stream-handler';
import {
  setup,
  getPeerConnection,
  passStreamData,
  readStreamData,
  type ProtocolHandler,
  type ParsedStreamData,
  PROTOCOLS,
} from '@/lib/p2p';
import { useP2PStore } from '@/stores/p2pStore';
import { logger } from '@/lib/logger';

export interface UseP2PConnectionOptions {
  /** Auto-initialize the P2P node on mount */
  autoInit?: boolean;
  /** Protocol handlers to register */
  handlers?: ProtocolHandler[];
  /** Callback when connection is established */
  onConnected?: (remotePeerId: string) => void;
  /** Callback when connection is lost */
  onDisconnected?: () => void;
  /** Callback when data is received */
  onData?: (data: ParsedStreamData, protocol: string) => void;
}

export interface UseP2PConnectionResult {
  /** The libp2p node instance */
  node: Libp2p | null;
  /** Current connection to partner (if any) */
  connection: Connection | null;
  /** Local peer ID */
  peerId: string | null;
  /** Partner peer ID */
  partnerPeerId: string | null;
  /** Whether connected to a partner */
  isConnected: boolean;
  /** Whether the node is initializing */
  isInitializing: boolean;
  /** Whether the node is initialized */
  isInitialized: boolean;
  /** Error message if connection failed */
  error: string | null;
  /** Initialize the P2P node */
  initialize: () => Promise<void>;
  /** Connect to a remote peer */
  connect: (remotePeerId: string) => Promise<Connection>;
  /** Disconnect from current partner */
  disconnect: () => Promise<void>;
  /** Send data to connected partner */
  send: (protocols: string[], data: ParsedStreamData) => Promise<void>;
  /** Shutdown the P2P node */
  shutdown: () => Promise<void>;
  /** Read data from a stream source */
  readStream: typeof readStreamData;
}

/**
 * Hook for P2P connection management.
 */
export function useP2PConnection(options: UseP2PConnectionOptions = {}): UseP2PConnectionResult {
  const { autoInit = false, handlers = [], onConnected, onDisconnected, onData } = options;

  const nodeRef = useRef<Libp2p | null>(null);
  const connectionRef = useRef<Connection | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get store state and actions
  const {
    peerId,
    partnerPeerId,
    connectedToPeer,
    isInitialized,
    setPeerId,
    setPartnerPeerId,
    setConnectionStatus,
    setInitialized,
    reset: resetStore,
  } = useP2PStore();

  // Build default handlers that integrate with the onData callback
  const buildHandlers = useCallback((): ProtocolHandler[] => {
    const defaultHandler = (protocol: string): ProtocolHandler['streamHandler'] => ({
      handler: async ({ stream }: IncomingStreamData) => {
        try {
          const data = await readStreamData(stream.source);
          logger.p2p.info('Received data', { protocol, success: data.success });
          onData?.(data, protocol);
        } catch (err) {
          logger.p2p.error('Error reading stream', { protocol }, err as Error);
        }
      },
      options: {},
    });

    // Combine user handlers with defaults for unhandled protocols
    const allProtocols = Object.values(PROTOCOLS);
    const userProtocols = new Set(handlers.map((h) => h.protocol));

    const defaultHandlers: ProtocolHandler[] = allProtocols
      .filter((p) => !userProtocols.has(p))
      .map((protocol) => ({
        protocol,
        streamHandler: defaultHandler(protocol),
      }));

    return [...handlers, ...defaultHandlers];
  }, [handlers, onData]);

  // Initialize the P2P node
  const initialize = useCallback(async () => {
    if (nodeRef.current || isInitializing) {
      logger.p2p.debug('Node already exists or initializing, skipping');
      return;
    }

    logger.p2p.info('Initializing P2P connection');
    setIsInitializing(true);
    setError(null);
    setConnectionStatus('connecting');

    try {
      const allHandlers = buildHandlers();
      const { libp2p } = await setup(allHandlers);

      nodeRef.current = libp2p;
      const localPeerId = libp2p.peerId.toString();
      setPeerId(localPeerId);
      setInitialized(true);
      setConnectionStatus('disconnected');

      logger.p2p.info('P2P node initialized', { peerId: localPeerId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize P2P';
      logger.p2p.error('P2P initialization failed', {}, err as Error);
      setError(message);
      setConnectionStatus('error', message);
    } finally {
      setIsInitializing(false);
    }
  }, [buildHandlers, isInitializing, setConnectionStatus, setInitialized, setPeerId]);

  // Connect to a remote peer
  const connect = useCallback(
    async (remotePeerId: string): Promise<Connection> => {
      const node = nodeRef.current;
      if (!node) {
        throw new Error('P2P node not initialized');
      }

      logger.p2p.info('Connecting to peer', { remotePeerId });
      setConnectionStatus('connecting');

      try {
        const connection = await getPeerConnection({ libp2p: node, remotePeerId });
        connectionRef.current = connection;
        setPartnerPeerId(remotePeerId);
        setConnectionStatus('connected');

        logger.p2p.info('Connected to peer', { remotePeerId });
        onConnected?.(remotePeerId);

        return connection;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to connect';
        logger.p2p.error('Connection failed', { remotePeerId }, err as Error);
        setError(message);
        setConnectionStatus('error', message);
        throw err;
      }
    },
    [setConnectionStatus, setPartnerPeerId, onConnected]
  );

  // Disconnect from current partner
  const disconnect = useCallback(async () => {
    const connection = connectionRef.current;
    if (connection) {
      logger.p2p.info('Disconnecting from peer');
      try {
        await connection.close();
      } catch {
        // Ignore close errors
      }
      connectionRef.current = null;
    }

    setPartnerPeerId('');
    setConnectionStatus('disconnected');
    onDisconnected?.();
  }, [setConnectionStatus, setPartnerPeerId, onDisconnected]);

  // Send data to connected partner
  const send = useCallback(async (protocols: string[], data: ParsedStreamData) => {
    const connection = connectionRef.current;
    if (!connection) {
      throw new Error('Not connected to a peer');
    }

    await passStreamData({ streamData: data, connection, protocols });
  }, []);

  // Shutdown the P2P node
  const shutdown = useCallback(async () => {
    logger.p2p.info('Shutting down P2P');

    await disconnect();

    const node = nodeRef.current;
    if (node) {
      await node.stop();
      nodeRef.current = null;
    }

    resetStore();
  }, [disconnect, resetStore]);

  // Auto-initialize on mount if requested
  useEffect(() => {
    if (autoInit && !nodeRef.current && !isInitializing) {
      initialize();
    }
  }, [autoInit, initialize, isInitializing]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (nodeRef.current) {
        logger.p2p.debug('Cleaning up P2P node on unmount');
        const stopPromise = nodeRef.current.stop();
        if (stopPromise && typeof stopPromise.catch === 'function') {
          stopPromise.catch(() => {});
        }
      }
    };
  }, []);

  return {
    node: nodeRef.current,
    connection: connectionRef.current,
    peerId,
    partnerPeerId,
    isConnected: connectedToPeer,
    isInitializing,
    isInitialized,
    error,
    initialize,
    connect,
    disconnect,
    send,
    shutdown,
    readStream: readStreamData,
  };
}
