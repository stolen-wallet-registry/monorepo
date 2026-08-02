/**
 * Store for transaction registration form state.
 *
 * Stores selected transaction hashes and chain ID.
 * Data hash and contract arrays are NOT persisted - derived from selections on demand.
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/shallow';
import { logger } from '@/lib/logger';
// Note: selection.ts imports `StoredTransactionDetail` from this module, but only
// as `import type`, so that edge is erased at compile time — no runtime cycle.
import { toStoredTransactionDetail } from '@/lib/transactions/selection';
import { isAddress, isHash, type Address, type Hash } from '@/lib/types/ethereum';
import type { UserTransaction } from '@/hooks/transactions/useUserTransactions';

/**
 * Minimal transaction details stored for display in subsequent steps.
 * Only the fields needed for UI presentation.
 */
export interface StoredTransactionDetail {
  hash: Hash;
  to: Address | null;
  value: string; // Stored as string for JSON serialization
  blockNumber: string; // Stored as string for JSON serialization
  timestamp?: number;
}

export interface TransactionFormState {
  /** Reporter address (wallet that signs the registration) */
  reporter: Address | null;
  /** Relayer/forwarder address (pays gas - same as reporter for standard) */
  forwarder: Address | null;
  /**
   * Whether `forwarder` arrived from a P2P CONNECT handshake in THIS session.
   *
   * Session-only by construction: never persisted, re-asserted false on rehydrate. The
   * forwarder becomes the `trustedForwarder` inside the signed message, and whoever holds
   * that role can complete the irreversible registration on their own schedule — a value
   * restored from localStorage may have been written by anyone with access to this browser
   * profile, and a reload mid-flow does not re-run CONNECT. The P2P signing path refuses to
   * sign when this is false. Mirrors `relayerFromPeerSession` on the wallet form store.
   */
  forwarderFromPeerSession: boolean;
  /** Selected transaction hashes to register */
  selectedTxHashes: Hash[];
  /** Full transaction details for display in subsequent steps */
  selectedTxDetails: StoredTransactionDetail[];
  /** Chain ID where transactions occurred (EIP-155 number) */
  reportedChainId: number | null;
  /** Computed data hash for EIP-712 signing (transient - not persisted) */
  dataHash: Hash | null;
  /** Transaction hashes for contract calls (transient) */
  txHashesForContract: Hash[];
  /** CAIP-2 chain ID hashes for contract calls (transient) */
  chainIdsForContract: Hash[];
}

export interface TransactionFormActions {
  setReporter: (address: Address) => void;
  setForwarder: (address: Address) => void;
  /** Set the forwarder AND mark it as established by a P2P handshake this session. */
  setForwarderFromPeer: (address: Address) => void;
  /**
   * Drop the handshake mark without touching the address.
   *
   * Called when the flow re-enters `wait-for-connection`: a pairing from an earlier attempt
   * must not make the next CONNECT look pre-accepted, or the reply gate that catches a refused
   * CONNECT would pass on stale evidence.
   */
  clearForwarderProvenance: () => void;
  setSelectedTxHashes: (hashes: Hash[]) => void;
  setSelectedTxDetails: (details: StoredTransactionDetail[]) => void;
  /** Set both hashes and details from UserTransaction array */
  setSelectedTransactions: (transactions: UserTransaction[]) => void;
  addTxHash: (hash: Hash) => void;
  removeTxHash: (hash: Hash) => void;
  setReportedChainId: (chainId: number) => void;
  /** Set transaction data for contract calls and signing */
  setTransactionData: (dataHash: Hash | null, txHashes: Hash[], chainIds: Hash[]) => void;
  reset: () => void;
}

/** Empty selection — what every rejected rehydrate falls back to. */
const EMPTY_SELECTION: { hashes: Hash[]; details: StoredTransactionDetail[] } = {
  hashes: [],
  details: [],
};

/**
 * `isAddress`/`isHash` take a string; persisted values are `unknown` and may be absent.
 *
 * `strict: false` disables EIP-55 checksum enforcement, which viem applies by default.
 *
 * Note what strict actually does: it short-circuits and ACCEPTS an all-lowercase address, so
 * lowercase is not the case at risk. What it rejects is a mixed-case address whose casing is
 * not a valid EIP-55 checksum — which persisted state routinely contains, since an address can
 * be re-cased by any upstream that touched it before it was stored.
 *
 * The question being asked here is "is this a well-formed address", not "is it checksummed".
 * Enforcing the checksum would discard legitimate state, and for the `to` field it would
 * discard the entire transaction selection over a display-only value. No security property
 * here depends on casing — the selection guard compares hashes, not addresses.
 */
function isPersistedAddress(value: unknown): value is Address {
  return typeof value === 'string' && isAddress(value, { strict: false });
}

function isPersistedHash(value: unknown): value is Hash {
  return typeof value === 'string' && isHash(value);
}

/** Whether a persisted entry has the shape and types of a stored transaction detail. */
function isStoredTransactionDetail(value: unknown): value is StoredTransactionDetail {
  if (value === null || typeof value !== 'object') return false;
  const detail = value as Partial<StoredTransactionDetail>;
  return (
    isPersistedHash(detail.hash) &&
    (detail.to === null || isPersistedAddress(detail.to)) &&
    typeof detail.value === 'string' &&
    typeof detail.blockNumber === 'string' &&
    (detail.timestamp === undefined || typeof detail.timestamp === 'number')
  );
}

/**
 * Restore the transaction selection only if the signed set and the displayed set agree.
 *
 * The two arrays are compared as SETS, not element-wise: `selectStoredTransactionDetails`
 * orders details by the user's transaction history rather than by selection order, so a
 * positional comparison would reject legitimate state.
 *
 * Returns an empty selection on any mismatch — a hash that no detail describes would be
 * signed and submitted invisibly, and a detail with no matching hash is a row shown to the
 * user that is not actually being reported.
 */
function restoreSelection(
  persistedHashes: unknown,
  persistedDetails: unknown
): { hashes: Hash[]; details: StoredTransactionDetail[] } {
  if (!Array.isArray(persistedHashes) || !Array.isArray(persistedDetails)) {
    return EMPTY_SELECTION;
  }

  if (persistedHashes.length === 0 && persistedDetails.length === 0) {
    return EMPTY_SELECTION;
  }

  if (!persistedHashes.every(isPersistedHash)) {
    logger.store.warn('Discarding transaction selection: malformed hash in persisted state');
    return EMPTY_SELECTION;
  }

  if (!persistedDetails.every(isStoredTransactionDetail)) {
    logger.store.warn('Discarding transaction selection: malformed detail in persisted state');
    return EMPTY_SELECTION;
  }

  const hashes = persistedHashes as Hash[];
  const details = persistedDetails as StoredTransactionDetail[];

  // Duplicates would make the set comparison pass while the submitted array differs.
  const hashSet = new Set(hashes);
  const detailHashSet = new Set(details.map((detail) => detail.hash));

  const agrees =
    hashSet.size === hashes.length &&
    detailHashSet.size === details.length &&
    hashSet.size === detailHashSet.size &&
    hashes.every((hash) => detailHashSet.has(hash));

  if (!agrees) {
    logger.store.warn(
      'Discarding transaction selection: the hashes to be signed do not match the transactions shown',
      { hashCount: hashes.length, detailCount: details.length }
    );
    return EMPTY_SELECTION;
  }

  return { hashes, details };
}

const initialState: TransactionFormState = {
  reporter: null,
  forwarder: null,
  forwarderFromPeerSession: false,
  selectedTxHashes: [],
  selectedTxDetails: [],
  reportedChainId: null,
  dataHash: null,
  txHashesForContract: [],
  chainIdsForContract: [],
};

export const useTransactionFormStore = create<TransactionFormState & TransactionFormActions>()(
  devtools(
    persist(
      immer((set) => ({
        ...initialState,

        setReporter: (address) =>
          set((state) => {
            logger.store.debug('Transaction form reporter updated', { address });
            state.reporter = address;
          }),

        clearForwarderProvenance: () =>
          set((state) => {
            state.forwarderFromPeerSession = false;
          }),

        setForwarderFromPeer: (address) =>
          set((state) => {
            logger.store.debug('Transaction forwarder set from peer handshake', { address });
            state.forwarder = address;
            state.forwarderFromPeerSession = true;
          }),

        setForwarder: (address) =>
          set((state) => {
            logger.store.debug('Transaction form forwarder updated', { address });
            state.forwarder = address;
            // Typed in or derived locally, not handshaked. The P2P path must not accept this.
            state.forwarderFromPeerSession = false;
          }),

        setSelectedTxHashes: (hashes) =>
          set((state) => {
            // Dedup and copy to prevent external mutation
            const unique = Array.from(new Set(hashes));
            logger.store.debug('Transaction form hashes updated', { count: unique.length });
            state.selectedTxHashes = unique;
            // Clear derived data when hashes change - needs recomputation
            state.dataHash = null;
            state.txHashesForContract = [];
            state.chainIdsForContract = [];
            // Note: details not updated here - use setSelectedTransactions for full update
          }),

        setSelectedTxDetails: (details) =>
          set((state) => {
            logger.store.debug('Transaction form details updated', { count: details.length });
            state.selectedTxDetails = details;
          }),

        setSelectedTransactions: (transactions) =>
          set((state) => {
            // Convert UserTransaction array to hashes and stored details
            const hashes = transactions.map((tx) => tx.hash);
            const details: StoredTransactionDetail[] = transactions.map(toStoredTransactionDetail);

            logger.store.debug('Transaction form transactions updated', {
              count: transactions.length,
            });
            state.selectedTxHashes = hashes;
            state.selectedTxDetails = details;
            state.dataHash = null;
            state.txHashesForContract = [];
            state.chainIdsForContract = [];
          }),

        addTxHash: (hash) =>
          set((state) => {
            if (!state.selectedTxHashes.includes(hash)) {
              logger.store.debug('Transaction hash added', { hash });
              state.selectedTxHashes.push(hash);
              // Clear derived data - needs recomputation
              state.dataHash = null;
              state.txHashesForContract = [];
              state.chainIdsForContract = [];
            }
          }),

        removeTxHash: (hash) =>
          set((state) => {
            const index = state.selectedTxHashes.indexOf(hash);
            if (index !== -1) {
              logger.store.debug('Transaction hash removed', { hash });
              state.selectedTxHashes.splice(index, 1);
              // Also remove from details
              state.selectedTxDetails = state.selectedTxDetails.filter((d) => d.hash !== hash);
              state.dataHash = null;
              state.txHashesForContract = [];
              state.chainIdsForContract = [];
            }
          }),

        setReportedChainId: (chainId) =>
          set((state) => {
            logger.store.debug('Transaction form chain ID updated', { chainId });
            state.reportedChainId = chainId;
            // Clear derived data when chain changes - needs recomputation
            state.dataHash = null;
            state.txHashesForContract = [];
            state.chainIdsForContract = [];
          }),

        setTransactionData: (dataHash, txHashes, chainIds) =>
          set((state) => {
            logger.store.debug('Transaction form data updated', {
              dataHash,
              txHashesCount: txHashes.length,
              chainIdsCount: chainIds.length,
            });
            state.dataHash = dataHash;
            // Defensive copy to avoid external mutation of stored arrays
            state.txHashesForContract = [...txHashes];
            state.chainIdsForContract = [...chainIds];
          }),

        reset: () => {
          logger.store.debug('Transaction form state reset');
          set(() => ({ ...initialState }));
        },
      })),
      {
        name: 'swr-transaction-form-state',
        version: 1,
        // There is no released version of this app, so nothing needs a real version
        // transform — any older blob is simply discarded. `migrate` still has to exist:
        // without it, zustand hits a version mismatch, console.errors, and never marks the
        // load as migrated, so it never rewrites the entry and the error repeats on every
        // single reload for anyone holding state from an earlier local version.
        migrate: () => initialState,
        // Don't persist derived data - it's computed.
        // `forwarderFromPeerSession` is session-only by design — persisting it would hand the
        // attacker the very flag it exists to withhold.
        partialize: (state) => ({
          reporter: state.reporter,
          forwarder: state.forwarder,
          selectedTxHashes: state.selectedTxHashes,
          selectedTxDetails: state.selectedTxDetails,
          reportedChainId: state.reportedChainId,
        }),
        // Validation runs in `merge`, not `migrate`: zustand only calls `migrate` on a version
        // mismatch, so validation placed there would never run on a normal rehydrate. `merge`
        // supplies a default for every field, which covers any stale local state a developer
        // may have. (The `migrate` above is not validation — it exists only so a version
        // mismatch discards and REWRITES the entry instead of erroring on every reload.)
        merge: (persisted, current) => {
          if (!persisted || typeof persisted !== 'object') {
            return current;
          }

          const state = persisted as Partial<TransactionFormState>;

          // `selectedTxHashes` is what gets hashed into the signed `dataHash` and submitted
          // on-chain; `selectedTxDetails` is the only thing the user ever sees. Restoring them
          // independently means a rewritten localStorage entry can show the victim their own
          // transactions while they sign and submit someone else's — and every downstream
          // check passes, because the signature over the poisoned hash is genuine and the
          // count check compares the poisoned array against itself.
          //
          // So they are restored as a pair or not at all. Any disagreement clears the
          // selection and sends the user back to pick again, which is recoverable; signing an
          // attacker's transaction list under your own name is not.
          const selection = restoreSelection(state.selectedTxHashes, state.selectedTxDetails);

          return {
            ...current,
            reporter: isPersistedAddress(state.reporter) ? state.reporter : initialState.reporter,
            forwarder: isPersistedAddress(state.forwarder)
              ? state.forwarder
              : initialState.forwarder,
            // Explicit, not merely absent from the persisted blob: a rehydrated forwarder has
            // by definition not been handshaked this session, and this is the assertion that
            // makes a hand-written localStorage entry unsignable in the P2P flow.
            forwarderFromPeerSession: false,
            selectedTxHashes: selection.hashes,
            selectedTxDetails: selection.details,
            reportedChainId:
              typeof state.reportedChainId === 'number' &&
              Number.isInteger(state.reportedChainId) &&
              state.reportedChainId > 0
                ? state.reportedChainId
                : initialState.reportedChainId,
            // Derived data is recomputed, never restored.
            dataHash: null,
            txHashesForContract: [],
            chainIdsForContract: [],
          };
        },
      }
    ),
    { name: 'TransactionFormStore', enabled: process.env.NODE_ENV === 'development' }
  )
);

// ============================================================================
// Selectors
// ============================================================================

/**
 * Select transaction selection state.
 */
export const useTransactionSelection = () =>
  useTransactionFormStore(
    useShallow((s) => ({
      selectedTxHashes: s.selectedTxHashes,
      selectedTxDetails: s.selectedTxDetails,
      reportedChainId: s.reportedChainId,
      dataHash: s.dataHash,
      txHashesForContract: s.txHashesForContract,
      chainIdsForContract: s.chainIdsForContract,
      setSelectedTxHashes: s.setSelectedTxHashes,
      setSelectedTxDetails: s.setSelectedTxDetails,
      setSelectedTransactions: s.setSelectedTransactions,
      addTxHash: s.addTxHash,
      removeTxHash: s.removeTxHash,
      setReportedChainId: s.setReportedChainId,
      setTransactionData: s.setTransactionData,
    }))
  );
