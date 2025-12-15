import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/shallow';
import { logger } from '@/lib/logger';

export type P2PConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface P2PState {
  /** Current node's peer ID */
  peerId: string | null;
  /** Connected partner's peer ID */
  partnerPeerId: string | null;
  /** Whether connected to partner peer */
  connectedToPeer: boolean;
  /** Connection status */
  connectionStatus: P2PConnectionStatus;
  /** Error message if connection failed */
  errorMessage: string | null;
  /** Whether libp2p node is initialized */
  isInitialized: boolean;
}

export interface P2PActions {
  setPeerId: (peerId: string) => void;
  setPartnerPeerId: (peerId: string) => void;
  setConnectedToPeer: (connected: boolean) => void;
  setConnectionStatus: (status: P2PConnectionStatus, errorMessage?: string) => void;
  setInitialized: (initialized: boolean) => void;
  setP2PValues: (values: Partial<P2PState>) => void;
  reset: () => void;
}

const initialState: P2PState = {
  peerId: null,
  partnerPeerId: null,
  connectedToPeer: false,
  connectionStatus: 'disconnected',
  errorMessage: null,
  isInitialized: false,
};

export const useP2PStore = create<P2PState & P2PActions>()(
  devtools(
    persist(
      immer((set) => ({
        ...initialState,

        setPeerId: (peerId) =>
          set((state) => {
            logger.p2p.debug('P2P local peerId set', { peerId });
            state.peerId = peerId;
          }),

        setPartnerPeerId: (peerId) =>
          set((state) => {
            logger.p2p.debug('P2P partner peerId set', { peerId });
            state.partnerPeerId = peerId;
          }),

        setConnectedToPeer: (connected) =>
          set((state) => {
            logger.p2p.info('P2P connection status changed', { connected });
            state.connectedToPeer = connected;
            state.connectionStatus = connected ? 'connected' : 'disconnected';
          }),

        setConnectionStatus: (status, errorMessage) =>
          set((state) => {
            logger.p2p.info('P2P connection status updated', { status, errorMessage });
            state.connectionStatus = status;
            state.errorMessage = errorMessage ?? null;
            if (status === 'connected') {
              state.connectedToPeer = true;
            } else if (status === 'disconnected' || status === 'error') {
              state.connectedToPeer = false;
            }
          }),

        setInitialized: (initialized) =>
          set((state) => {
            logger.p2p.info('P2P initialized status changed', { initialized });
            state.isInitialized = initialized;
          }),

        setP2PValues: (values) =>
          set((state) => {
            logger.p2p.debug('P2P values batch updated', { values });
            Object.assign(state, values);
          }),

        reset: () => {
          logger.p2p.debug('P2P state reset');
          set(() => initialState);
        },
      })),
      {
        name: 'swr-p2p-state',
        version: 1,
        migrate: (persisted) => {
          // Validate basic shape
          if (!persisted || typeof persisted !== 'object') {
            return initialState;
          }

          const state = persisted as Partial<P2PState>;

          // Ensure all required fields exist with fallbacks
          // Note: connectionStatus, errorMessage, isInitialized, and connectedToPeer are
          // intentionally reset to initial values on reload. These are ephemeral states
          // that reflect the current session's P2P connection status and should not persist
          // across browser refreshes. The libp2p node needs to be re-initialized each session,
          // so preserving these values would be misleading.
          return {
            peerId: state.peerId ?? initialState.peerId,
            partnerPeerId: state.partnerPeerId ?? initialState.partnerPeerId,
            connectedToPeer: initialState.connectedToPeer, // Reset on reload
            connectionStatus: initialState.connectionStatus,
            errorMessage: initialState.errorMessage,
            isInitialized: initialState.isInitialized,
          };
        },
      }
    ),
    { name: 'P2PStore', enabled: process.env.NODE_ENV === 'development' }
  )
);

// ============================================================================
// Selectors - Use these for granular subscriptions to prevent unnecessary re-renders
// ============================================================================

/**
 * Select peer IDs (local and partner).
 * Use when component needs to display or share peer IDs.
 */
export const useP2PPeerIds = () =>
  useP2PStore(
    useShallow((s) => ({
      peerId: s.peerId,
      partnerPeerId: s.partnerPeerId,
      setPeerId: s.setPeerId,
      setPartnerPeerId: s.setPartnerPeerId,
    }))
  );

/**
 * Select connection status.
 * Use when component needs to show connection state or error.
 */
export const useP2PConnection = () =>
  useP2PStore(
    useShallow((s) => ({
      connectionStatus: s.connectionStatus,
      connectedToPeer: s.connectedToPeer,
      errorMessage: s.errorMessage,
      isInitialized: s.isInitialized,
      setConnectionStatus: s.setConnectionStatus,
      setConnectedToPeer: s.setConnectedToPeer,
      setInitialized: s.setInitialized,
    }))
  );

/**
 * Select connection status only (read-only).
 * Use for simple status indicators.
 */
export const useP2PConnectionStatus = () => useP2PStore((s) => s.connectionStatus);

/**
 * Select whether connected to peer (read-only).
 * Use for conditional rendering based on connection.
 */
export const useIsConnectedToPeer = () => useP2PStore((s) => s.connectedToPeer);
