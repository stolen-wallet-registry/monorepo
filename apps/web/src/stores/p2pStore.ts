import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

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
          state.peerId = peerId;
        }),

      setPartnerPeerId: (peerId) =>
        set((state) => {
          state.partnerPeerId = peerId;
        }),

      setConnectedToPeer: (connected) =>
        set((state) => {
          state.connectedToPeer = connected;
        }),

      setP2PValues: (values) =>
        set((state) => {
          Object.assign(state, values);
        }),

      reset: () => set(initialState),
    })),
    {
      name: 'p2p-state',
    }
  )
);
