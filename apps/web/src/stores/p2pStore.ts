import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
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
        set(initialState);
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
        return {
          peerId: state.peerId ?? initialState.peerId,
          partnerPeerId: state.partnerPeerId ?? initialState.partnerPeerId,
          connectedToPeer: state.connectedToPeer ?? initialState.connectedToPeer,
          connectionStatus: initialState.connectionStatus,
          errorMessage: initialState.errorMessage,
          isInitialized: initialState.isInitialized,
        };
      },
    }
  )
);
