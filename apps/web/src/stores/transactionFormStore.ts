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
  /** Selected transaction hashes to register */
  selectedTxHashes: Hash[];
  /** Full transaction details for display in subsequent steps */
  selectedTxDetails: StoredTransactionDetail[];
  /** Chain ID where transactions occurred (EIP-155 number) */
  reportedChainId: number | null;
  /** Computed Merkle root (transient - not persisted) */
  merkleRoot: Hash | null;
  /** Sorted transaction hashes from merkle tree (transient - for contract calls) */
  sortedTxHashes: Hash[];
  /** Sorted CAIP-2 chain IDs from merkle tree (transient - for contract calls) */
  sortedChainIds: Hash[];
}

export interface TransactionFormActions {
  setReporter: (address: Address) => void;
  setForwarder: (address: Address) => void;
  setSelectedTxHashes: (hashes: Hash[]) => void;
  setSelectedTxDetails: (details: StoredTransactionDetail[]) => void;
  /** Set both hashes and details from UserTransaction array */
  setSelectedTransactions: (transactions: UserTransaction[]) => void;
  addTxHash: (hash: Hash) => void;
  removeTxHash: (hash: Hash) => void;
  setReportedChainId: (chainId: number) => void;
  setMerkleRoot: (root: Hash | null) => void;
  /** Set merkle tree data including sorted hashes for contract calls */
  setMerkleTreeData: (root: Hash | null, sortedTxHashes: Hash[], sortedChainIds: Hash[]) => void;
  reset: () => void;
}

const initialState: TransactionFormState = {
  reporter: null,
  forwarder: null,
  selectedTxHashes: [],
  selectedTxDetails: [],
  reportedChainId: null,
  merkleRoot: null,
  sortedTxHashes: [],
  sortedChainIds: [],
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
            // Clear merkle data when hashes change - it needs to be recomputed
            state.merkleRoot = null;
            state.sortedTxHashes = [];
            state.sortedChainIds = [];
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
            const details: StoredTransactionDetail[] = transactions.map((tx) => ({
              hash: tx.hash,
              to: tx.to,
              value: tx.value.toString(),
              blockNumber: tx.blockNumber.toString(),
              timestamp: tx.timestamp,
            }));

            logger.store.debug('Transaction form transactions updated', {
              count: transactions.length,
            });
            state.selectedTxHashes = hashes;
            state.selectedTxDetails = details;
            state.merkleRoot = null;
            state.sortedTxHashes = [];
            state.sortedChainIds = [];
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
              // Also remove from details
              state.selectedTxDetails = state.selectedTxDetails.filter((d) => d.hash !== hash);
              state.merkleRoot = null;
              state.sortedTxHashes = [];
              state.sortedChainIds = [];
            }
          }),

        setReportedChainId: (chainId) =>
          set((state) => {
            logger.store.debug('Transaction form chain ID updated', { chainId });
            state.reportedChainId = chainId;
            // Clear merkle data when chain changes - it needs to be recomputed
            state.merkleRoot = null;
            state.sortedTxHashes = [];
            state.sortedChainIds = [];
          }),

        setMerkleRoot: (root) =>
          set((state) => {
            logger.store.debug('Transaction form merkle root updated', { root });
            state.merkleRoot = root;
            // Clear sorted data when root is cleared
            if (!root) {
              state.sortedTxHashes = [];
              state.sortedChainIds = [];
            }
          }),

        setMerkleTreeData: (root, sortedTxHashes, sortedChainIds) =>
          set((state) => {
            logger.store.debug('Transaction form merkle tree data updated', {
              root,
              sortedTxHashesCount: sortedTxHashes.length,
              sortedChainIdsCount: sortedChainIds.length,
            });
            state.merkleRoot = root;
            state.sortedTxHashes = sortedTxHashes;
            state.sortedChainIds = sortedChainIds;
          }),

        reset: () => {
          logger.store.debug('Transaction form state reset');
          set(() => ({ ...initialState }));
        },
      })),
      {
        name: 'swr-transaction-form-state',
        version: 2, // Bumped for selectedTxDetails addition
        // Don't persist merkleRoot - it's computed
        partialize: (state) => ({
          reporter: state.reporter,
          forwarder: state.forwarder,
          selectedTxHashes: state.selectedTxHashes,
          selectedTxDetails: state.selectedTxDetails,
          reportedChainId: state.reportedChainId,
        }),
        migrate: (persisted, version) => {
          if (!persisted || typeof persisted !== 'object') {
            return initialState;
          }

          const state = persisted as Partial<TransactionFormState>;

          // Migrate from v1: add selectedTxDetails
          if (version === 1) {
            return {
              reporter: state.reporter ?? initialState.reporter,
              forwarder: state.forwarder ?? initialState.forwarder,
              selectedTxHashes: Array.isArray(state.selectedTxHashes)
                ? state.selectedTxHashes
                : initialState.selectedTxHashes,
              selectedTxDetails: [], // New field - start empty
              reportedChainId: state.reportedChainId ?? initialState.reportedChainId,
              merkleRoot: null,
            };
          }

          return {
            reporter: state.reporter ?? initialState.reporter,
            forwarder: state.forwarder ?? initialState.forwarder,
            selectedTxHashes: Array.isArray(state.selectedTxHashes)
              ? state.selectedTxHashes
              : initialState.selectedTxHashes,
            selectedTxDetails: Array.isArray(state.selectedTxDetails)
              ? state.selectedTxDetails
              : initialState.selectedTxDetails,
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
      selectedTxDetails: s.selectedTxDetails,
      reportedChainId: s.reportedChainId,
      merkleRoot: s.merkleRoot,
      sortedTxHashes: s.sortedTxHashes,
      sortedChainIds: s.sortedChainIds,
      setSelectedTxHashes: s.setSelectedTxHashes,
      setSelectedTxDetails: s.setSelectedTxDetails,
      setSelectedTransactions: s.setSelectedTransactions,
      addTxHash: s.addTxHash,
      removeTxHash: s.removeTxHash,
      setReportedChainId: s.setReportedChainId,
      setMerkleRoot: s.setMerkleRoot,
      setMerkleTreeData: s.setMerkleTreeData,
    }))
  );

/**
 * Select just the transaction details (read-only).
 */
export const useSelectedTransactionDetails = () =>
  useTransactionFormStore((s) => s.selectedTxDetails);

/**
 * Select just the merkle root (read-only).
 */
export const useTransactionMerkleRoot = () => useTransactionFormStore((s) => s.merkleRoot);

/**
 * Select transaction count (read-only).
 */
export const useTransactionCount = () => useTransactionFormStore((s) => s.selectedTxHashes.length);
