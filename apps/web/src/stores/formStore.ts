import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { logger } from '@/lib/logger';
import { isAddress, type Address } from '@/lib/types/ethereum';

/**
 * Whether a persisted value is a well-formed address.
 *
 * `strict: false` matches `transactionFormStore.isPersistedAddress` and `lib/indexer.ts`, and it
 * is the correct question here. Strict mode short-circuits and ACCEPTS all-lowercase; what it
 * rejects is a mixed-case address whose casing is not a valid EIP-55 checksum — exactly what
 * persisted state routinely holds, since an address can be re-cased by any upstream that touched
 * it before it was stored. Under strict mode a re-cased `registeree` or `relayer` was silently
 * dropped on reload, returning a user mid-flow to an empty form. No security property here
 * depends on casing: the P2P forwarder gate is `relayerFromPeerSession`, which is never
 * persisted, and address comparisons downstream are case-insensitive.
 */
function isPersistedAddress(value: unknown): value is Address {
  return typeof value === 'string' && isAddress(value, { strict: false });
}

export interface FormState {
  registeree: Address | null;
  relayer: Address | null;
  /**
   * Whether `relayer` was established by a live P2P CONNECT handshake in THIS session.
   *
   * Deliberately NOT persisted, so it is false after every reload. In the P2P flow the
   * relayer is the `trustedForwarder` the victim signs over, and it normally arrives from the
   * peer's CONNECT payload — but a reload at `acknowledge-and-sign` does not re-run CONNECT,
   * so without this flag the value that gets signed is whatever is in localStorage. An
   * attacker who can write localStorage sets `relayer` to their own address, forces a reload,
   * and the victim signs an acknowledgement naming them; since anyone may call `acknowledge`,
   * the attacker then satisfies `ack.trustedForwarder == msg.sender` and completes the
   * irreversible registration on their own schedule.
   *
   * Standard and self-relay are unaffected — they take the forwarder from the live form or
   * `useAccount()` — so this flag gates only the P2P signing path.
   */
  relayerFromPeerSession: boolean;
}

export interface FormActions {
  setRegisteree: (address: Address) => void;
  setRelayer: (address: Address) => void;
  /** Set the relayer from a live CONNECT handshake, marking it valid for P2P signing. */
  setRelayerFromPeer: (address: Address) => void;
  /** Invalidate a prior handshake when the pairing step is (re-)entered. */
  clearRelayerProvenance: () => void;
  setFormValues: (values: Partial<Omit<FormState, 'relayerFromPeerSession'>>) => void;
  reset: () => void;
}

const initialState: FormState = {
  registeree: null,
  relayer: null,
  relayerFromPeerSession: false,
};

export const useFormStore = create<FormState & FormActions>()(
  devtools(
    persist(
      immer((set) => ({
        ...initialState,

        setRegisteree: (address) =>
          set((state) => {
            logger.store.debug('Form registeree updated', { address });
            state.registeree = address;
          }),

        setRelayer: (address) =>
          set((state) => {
            logger.store.debug('Form relayer updated', { address });
            state.relayer = address;
            // Typed into the form, not handshaked. The P2P path must not accept this.
            state.relayerFromPeerSession = false;
          }),

        clearRelayerProvenance: () =>
          set((state) => {
            state.relayerFromPeerSession = false;
          }),

        setRelayerFromPeer: (address) =>
          set((state) => {
            logger.store.debug('Form relayer set from peer handshake', { address });
            state.relayer = address;
            state.relayerFromPeerSession = true;
          }),

        setFormValues: (values) =>
          set((state) => {
            logger.store.debug('Form values batch updated', { values });
            Object.assign(state, values);
            // A batch write is the form path; only setRelayerFromPeer confers peer provenance.
            if (values.relayer !== undefined) {
              state.relayerFromPeerSession = false;
            }
          }),

        reset: () => {
          logger.store.debug('Form state reset');
          set(() => ({ ...initialState }));
        },
      })),
      {
        name: 'swr-form-state',
        version: 1,
        // There is no released version of this app, so nothing needs a real version
        // transform — any older blob is simply discarded. `migrate` still has to exist:
        // without it, zustand hits a version mismatch, console.errors, and never marks the
        // load as migrated, so it never rewrites the entry and the error repeats on every
        // single reload for anyone holding state from an earlier local version.
        migrate: () => initialState,
        // `relayerFromPeerSession` is session-only by design — persisting it would hand the
        // attacker the very flag it exists to withhold.
        partialize: (state) => ({
          registeree: state.registeree,
          relayer: state.relayer,
        }),
        // Validation lives in `merge`, not `migrate`: zustand only calls `migrate` when the
        // persisted version differs from `version`, so validation placed there never runs on
        // the normal rehydrate path. `merge` runs on every rehydrate.
        merge: (persisted, current) => {
          if (!persisted || typeof persisted !== 'object') {
            return current;
          }

          const state = persisted as Partial<FormState>;

          // Validate addresses are properly formatted before restoring.
          // Corrupted localStorage data could cause type safety issues.
          const validRegisteree = isPersistedAddress(state.registeree)
            ? state.registeree
            : initialState.registeree;
          const validRelayer = isPersistedAddress(state.relayer)
            ? state.relayer
            : initialState.relayer;

          return {
            ...current,
            registeree: validRegisteree,
            relayer: validRelayer,
            // Explicit, not merely absent from the persisted blob: a rehydrated relayer has by
            // definition not been handshaked this session, and this is the assertion that
            // makes a hand-written localStorage entry unsignable in the P2P flow.
            relayerFromPeerSession: false,
          };
        },
      }
    ),
    { name: 'FormStore', enabled: process.env.NODE_ENV === 'development' }
  )
);
