/**
 * Tests for transaction form state rehydration.
 *
 * `selectedTxHashes` is what gets hashed into the signed `dataHash` and submitted on-chain.
 * `selectedTxDetails` is the only thing the user ever sees. If those two can be restored
 * independently, a rewritten localStorage entry shows the victim their own transactions while
 * they sign and submit someone else's — and nothing downstream catches it, because the
 * signature over the poisoned hash is genuine and the count check compares the poisoned array
 * against itself. The victim becomes the permanent on-chain reporter for transactions they
 * never saw, and pays the fee.
 *
 * These tests pin the pairing. They drive the real persist middleware via
 * `persist.rehydrate()` rather than calling internals, so they exercise the path an attacker
 * would actually use.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useTransactionFormStore } from './transactionFormStore';

const STORAGE_KEY = 'swr-transaction-form-state';

const HASH_A = `0x${'a'.repeat(64)}`;
const HASH_B = `0x${'b'.repeat(64)}`;
const ATTACKER_HASH = `0x${'e'.repeat(64)}`;
const REPORTER = '0x742D35CC6634c0532925A3b844BC9E7595F0BEb0';

function detailFor(hash: string) {
  return {
    hash,
    to: REPORTER,
    value: '1000000000000000000',
    blockNumber: '12345678',
    timestamp: 1700000000,
  };
}

/** Write a persisted blob exactly as zustand's persist middleware would. */
async function rehydrateWith(state: Record<string, unknown>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, version: 1 }));
  await useTransactionFormStore.persist.rehydrate();
  return useTransactionFormStore.getState();
}

beforeEach(() => {
  localStorage.clear();
  useTransactionFormStore.getState().reset();
});

describe('transactionFormStore rehydration — signed set must match displayed set (V27)', () => {
  it('restores a selection where hashes and details agree', () => {
    return rehydrateWith({
      reporter: REPORTER,
      forwarder: REPORTER,
      selectedTxHashes: [HASH_A, HASH_B],
      selectedTxDetails: [detailFor(HASH_A), detailFor(HASH_B)],
      reportedChainId: 8453,
    }).then((state) => {
      expect(state.selectedTxHashes).toEqual([HASH_A, HASH_B]);
      expect(state.selectedTxDetails).toHaveLength(2);
      expect(state.reporter).toBe(REPORTER);
      expect(state.reportedChainId).toBe(8453);
    });
  });

  it('tolerates details ordered differently from hashes', async () => {
    // selectStoredTransactionDetails orders by transaction history, not selection order, so a
    // positional comparison would reject legitimate state.
    const state = await rehydrateWith({
      selectedTxHashes: [HASH_A, HASH_B],
      selectedTxDetails: [detailFor(HASH_B), detailFor(HASH_A)],
    });

    expect(state.selectedTxHashes).toEqual([HASH_A, HASH_B]);
  });

  it('discards the selection when a hash has no matching detail', async () => {
    // The exploit: poison selectedTxHashes, leave selectedTxDetails untouched. The victim
    // sees their own transactions and signs the attacker's.
    const state = await rehydrateWith({
      selectedTxHashes: [ATTACKER_HASH],
      selectedTxDetails: [detailFor(HASH_A)],
    });

    expect(state.selectedTxHashes).toEqual([]);
    expect(state.selectedTxDetails).toEqual([]);
  });

  it('discards the selection when an extra hash is smuggled alongside real ones', async () => {
    const state = await rehydrateWith({
      selectedTxHashes: [HASH_A, ATTACKER_HASH],
      selectedTxDetails: [detailFor(HASH_A)],
    });

    expect(state.selectedTxHashes).toEqual([]);
  });

  it('discards the selection when a detail has no matching hash', async () => {
    // A row shown to the user that is not actually being reported is the same lie inverted.
    const state = await rehydrateWith({
      selectedTxHashes: [HASH_A],
      selectedTxDetails: [detailFor(HASH_A), detailFor(HASH_B)],
    });

    expect(state.selectedTxHashes).toEqual([]);
  });

  it('rejects duplicate hashes that would pass a set comparison', async () => {
    // Set equality alone would accept this while the submitted array differs in length.
    const state = await rehydrateWith({
      selectedTxHashes: [HASH_A, HASH_A],
      selectedTxDetails: [detailFor(HASH_A)],
    });

    expect(state.selectedTxHashes).toEqual([]);
  });

  it('rejects a malformed hash', async () => {
    const state = await rehydrateWith({
      selectedTxHashes: ['not-a-hash'],
      selectedTxDetails: [detailFor('not-a-hash')],
    });

    expect(state.selectedTxHashes).toEqual([]);
  });

  it('rejects a hash of the wrong length', async () => {
    const short = `0x${'a'.repeat(40)}`;
    const state = await rehydrateWith({
      selectedTxHashes: [short],
      selectedTxDetails: [detailFor(short)],
    });

    expect(state.selectedTxHashes).toEqual([]);
  });

  it('rejects a malformed detail entry', async () => {
    const state = await rehydrateWith({
      selectedTxHashes: [HASH_A],
      selectedTxDetails: [{ hash: HASH_A, to: null, value: 123, blockNumber: '1' }],
    });

    expect(state.selectedTxHashes).toEqual([]);
  });

  it('rejects non-array selection state', async () => {
    const state = await rehydrateWith({
      selectedTxHashes: HASH_A,
      selectedTxDetails: null,
    });

    expect(state.selectedTxHashes).toEqual([]);
    expect(state.selectedTxDetails).toEqual([]);
  });
});

describe('transactionFormStore rehydration — address and chain validation', () => {
  it('drops a malformed reporter and forwarder', async () => {
    const state = await rehydrateWith({
      reporter: 'not-an-address',
      forwarder: '0x1234',
    });

    expect(state.reporter).toBeNull();
    expect(state.forwarder).toBeNull();
  });

  it('drops a non-integer or non-positive chain ID', async () => {
    expect((await rehydrateWith({ reportedChainId: 'base' })).reportedChainId).toBeNull();
    expect((await rehydrateWith({ reportedChainId: -1 })).reportedChainId).toBeNull();
    expect((await rehydrateWith({ reportedChainId: 1.5 })).reportedChainId).toBeNull();
  });

  it('never restores derived data, which must be recomputed', async () => {
    const state = await rehydrateWith({
      selectedTxHashes: [HASH_A],
      selectedTxDetails: [detailFor(HASH_A)],
      dataHash: ATTACKER_HASH,
      txHashesForContract: [ATTACKER_HASH],
      chainIdsForContract: [ATTACKER_HASH],
    });

    expect(state.dataHash).toBeNull();
    expect(state.txHashesForContract).toEqual([]);
    expect(state.chainIdsForContract).toEqual([]);
  });
});

describe('transactionFormStore — forwarder provenance is session-only (V28)', () => {
  const RELAYER = '0x8ba1f109551bD432803012645Ac136ddd64DBA72';

  it('starts unmarked', () => {
    expect(useTransactionFormStore.getState().forwarderFromPeerSession).toBe(false);
  });

  it('marks the forwarder only when it came from a peer handshake', () => {
    const store = useTransactionFormStore.getState();
    store.setForwarderFromPeer(RELAYER);
    expect(useTransactionFormStore.getState().forwarder).toBe(RELAYER);
    expect(useTransactionFormStore.getState().forwarderFromPeerSession).toBe(true);
  });

  it('clears the mark when the forwarder is set by any other path', () => {
    // A locally derived or form-supplied forwarder carries no handshake evidence, and must
    // not inherit the mark left by an earlier P2P session.
    const store = useTransactionFormStore.getState();
    store.setForwarderFromPeer(RELAYER);
    useTransactionFormStore.getState().setForwarder(REPORTER);
    expect(useTransactionFormStore.getState().forwarderFromPeerSession).toBe(false);
  });

  it('clearForwarderProvenance drops the mark but keeps the address', () => {
    // Re-entering the pairing step must not let a previous handshake stand in for the reply
    // that proves the NEW pairing was accepted.
    const store = useTransactionFormStore.getState();
    store.setForwarderFromPeer(RELAYER);
    useTransactionFormStore.getState().clearForwarderProvenance();
    expect(useTransactionFormStore.getState().forwarder).toBe(RELAYER);
    expect(useTransactionFormStore.getState().forwarderFromPeerSession).toBe(false);
  });

  it('never persists the mark', async () => {
    useTransactionFormStore.getState().setForwarderFromPeer(RELAYER);
    await useTransactionFormStore.persist.rehydrate();
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string).state).not.toHaveProperty('forwarderFromPeerSession');
  });

  it('refuses to restore an injected mark from localStorage', async () => {
    // The whole point of the flag: a hand-written persisted blob must not be able to grant
    // itself the handshake evidence it is missing.
    const state = await rehydrateWith({
      reporter: REPORTER,
      forwarder: RELAYER,
      forwarderFromPeerSession: true,
      selectedTxHashes: [],
      selectedTxDetails: [],
      reportedChainId: 8453,
    });
    expect(state.forwarder).toBe(RELAYER);
    expect(state.forwarderFromPeerSession).toBe(false);
  });
});
