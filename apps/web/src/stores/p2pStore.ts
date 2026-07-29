import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
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
  /** Drop the pinned partner without touching the rest of the P2P state. */
  clearPartnerPeerId: () => void;
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

        clearPartnerPeerId: () =>
          set((state) => {
            if (state.partnerPeerId) {
              logger.p2p.info('Cleared pinned partner peer', {
                partnerPeerId: state.partnerPeerId,
              });
            }
            state.partnerPeerId = null;
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
        // partnerPeerId stays persisted on purpose: a mid-flow reload (grace period, payment
        // step) has to come back with its partner still pinned, and the pin is the only thing
        // that survives losing the libp2p node. The cost is that a user who closes the tab from
        // the success screen carries the pin into their NEXT flow, where the guard would then
        // silently reject the new partner's CONNECT. That is handled at the other end instead:
        // each P2P page clears the pin when its node initialises while the flow is still at the
        // pre-connection step (see `isPreConnectionStep`), which is true exactly when no partner
        // has been agreed yet and therefore never true for a mid-flow reload.
        //
        // Only the durable peer identities are persisted. connectedToPeer, connectionStatus,
        // errorMessage and isInitialized describe the current session's libp2p node, which does
        // not survive a reload — persisting them would rehydrate a connected-looking store with
        // no node behind it. Excluding them here means they always come from initialState.
        partialize: (state) => ({
          peerId: state.peerId,
          partnerPeerId: state.partnerPeerId,
        }),
        merge: (persisted, current) => {
          if (!persisted || typeof persisted !== 'object') {
            return current;
          }

          const state = persisted as Partial<P2PState>;

          return {
            ...current,
            peerId: state.peerId ?? initialState.peerId,
            partnerPeerId: state.partnerPeerId ?? initialState.partnerPeerId,
          };
        },
      }
    ),
    { name: 'P2PStore', enabled: process.env.NODE_ENV === 'development' }
  )
);

/**
 * True at the steps where no partner has been agreed yet, so any persisted `partnerPeerId`
 * is a leftover from an abandoned session rather than something to restore.
 *
 * Both the wallet and transaction P2P flows call their pre-connection step
 * 'wait-for-connection'; a null step means the flow has not started at all.
 */
export function isPreConnectionStep(step: string | null | undefined): boolean {
  return !step || step === 'wait-for-connection';
}
