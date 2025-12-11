import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { logger } from '@/lib/logger';

export interface P2PState {
  peerId: string | null;
  partnerPeerId: string | null;
  connectedToPeer: boolean;
}

export interface P2PActions {
  setPeerId: (peerId: string) => void;
  setPartnerPeerId: (peerId: string) => void;
  setConnectedToPeer: (connected: boolean) => void;
  setP2PValues: (values: Partial<P2PState>) => void;
  reset: () => void;
}

const initialState: P2PState = {
  peerId: null,
  partnerPeerId: null,
  connectedToPeer: false,
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
        };
      },
    }
  )
);
