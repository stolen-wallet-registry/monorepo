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

const initialState: TransactionFormState = {
  reporter: null,
  forwarder: null,
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
        version: 3, // Bumped for merkle→dataHash rename
        // Don't persist derived data - it's computed
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

          if (version < 3) {
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
              dataHash: null,
              txHashesForContract: [],
              chainIdsForContract: [],
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

/**
 * Select just the transaction details (read-only).
 */
export const useSelectedTransactionDetails = () =>
  useTransactionFormStore((s) => s.selectedTxDetails);

/**
 * Select just the data hash (read-only).
 */
export const useTransactionDataHash = () => useTransactionFormStore((s) => s.dataHash);

/**
 * Select transaction count (read-only).
 */
export const useTransactionCount = () => useTransactionFormStore((s) => s.selectedTxHashes.length);
