/**
 * Store for transaction registration form state.
 *
 * Stores selected transaction hashes and chain ID.
 * Merkle tree is NOT persisted - rebuilt from hashes on demand.
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/shallow';
import { logger } from '@/lib/logger';
import type { Address, Hash } from '@/lib/types/ethereum';

export interface TransactionFormState {
  /** Reporter address (wallet that signs the registration) */
  reporter: Address | null;
  /** Relayer/forwarder address (pays gas - same as reporter for standard) */
  forwarder: Address | null;
  /** Selected transaction hashes to register */
  selectedTxHashes: Hash[];
  /** Chain ID where transactions occurred (EIP-155 number) */
  reportedChainId: number | null;
  /** Computed Merkle root (transient - not persisted) */
  merkleRoot: Hash | null;
}

export interface TransactionFormActions {
  setReporter: (address: Address) => void;
  setForwarder: (address: Address) => void;
  setSelectedTxHashes: (hashes: Hash[]) => void;
  addTxHash: (hash: Hash) => void;
  removeTxHash: (hash: Hash) => void;
  setReportedChainId: (chainId: number) => void;
  setMerkleRoot: (root: Hash | null) => void;
  reset: () => void;
}

const initialState: TransactionFormState = {
  reporter: null,
  forwarder: null,
  selectedTxHashes: [],
  reportedChainId: null,
  merkleRoot: null,
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

        setForwarder: (address) =>
          set((state) => {
            logger.store.debug('Transaction form forwarder updated', { address });
            state.forwarder = address;
          }),

        setSelectedTxHashes: (hashes) =>
          set((state) => {
            // Dedup and copy to prevent external mutation
            const unique = Array.from(new Set(hashes));
            logger.store.debug('Transaction form hashes updated', { count: unique.length });
            state.selectedTxHashes = unique;
            // Clear merkle root when hashes change - it needs to be recomputed
            state.merkleRoot = null;
          }),

        addTxHash: (hash) =>
          set((state) => {
            if (!state.selectedTxHashes.includes(hash)) {
              logger.store.debug('Transaction hash added', { hash });
              state.selectedTxHashes.push(hash);
              state.merkleRoot = null;
            }
          }),

        removeTxHash: (hash) =>
          set((state) => {
            const index = state.selectedTxHashes.indexOf(hash);
            if (index !== -1) {
              logger.store.debug('Transaction hash removed', { hash });
              state.selectedTxHashes.splice(index, 1);
              state.merkleRoot = null;
            }
          }),

        setReportedChainId: (chainId) =>
          set((state) => {
            logger.store.debug('Transaction form chain ID updated', { chainId });
            state.reportedChainId = chainId;
            // Clear merkle root when chain changes - it needs to be recomputed
            state.merkleRoot = null;
          }),

        setMerkleRoot: (root) =>
          set((state) => {
            logger.store.debug('Transaction form merkle root updated', { root });
            state.merkleRoot = root;
          }),

        reset: () => {
          logger.store.debug('Transaction form state reset');
          set(() => ({ ...initialState }));
        },
      })),
      {
        name: 'swr-transaction-form-state',
        version: 1,
        // Don't persist merkleRoot - it's computed
        partialize: (state) => ({
          reporter: state.reporter,
          forwarder: state.forwarder,
          selectedTxHashes: state.selectedTxHashes,
          reportedChainId: state.reportedChainId,
        }),
        migrate: (persisted) => {
          if (!persisted || typeof persisted !== 'object') {
            return initialState;
          }

          const state = persisted as Partial<TransactionFormState>;

          return {
            reporter: state.reporter ?? initialState.reporter,
            forwarder: state.forwarder ?? initialState.forwarder,
            selectedTxHashes: Array.isArray(state.selectedTxHashes)
              ? state.selectedTxHashes
              : initialState.selectedTxHashes,
            reportedChainId: state.reportedChainId ?? initialState.reportedChainId,
            merkleRoot: null, // Never restore - always recompute
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
 * Select reporter and forwarder addresses.
 */
export const useTransactionFormAddresses = () =>
  useTransactionFormStore(
    useShallow((s) => ({
      reporter: s.reporter,
      forwarder: s.forwarder,
      setReporter: s.setReporter,
      setForwarder: s.setForwarder,
    }))
  );

/**
 * Select transaction selection state.
 */
export const useTransactionSelection = () =>
  useTransactionFormStore(
    useShallow((s) => ({
      selectedTxHashes: s.selectedTxHashes,
      reportedChainId: s.reportedChainId,
      merkleRoot: s.merkleRoot,
      setSelectedTxHashes: s.setSelectedTxHashes,
      addTxHash: s.addTxHash,
      removeTxHash: s.removeTxHash,
      setReportedChainId: s.setReportedChainId,
      setMerkleRoot: s.setMerkleRoot,
    }))
  );

/**
 * Select just the merkle root (read-only).
 */
export const useTransactionMerkleRoot = () => useTransactionFormStore((s) => s.merkleRoot);

/**
 * Select transaction count (read-only).
 */
export const useTransactionCount = () => useTransactionFormStore((s) => s.selectedTxHashes.length);
