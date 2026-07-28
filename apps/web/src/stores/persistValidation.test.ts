import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Regression tests for the persisted-store validation path.
 *
 * These stores originally put their shape/address validation inside `migrate`, which zustand
 * calls ONLY when the persisted version differs from the store's configured `version`. On the
 * normal rehydrate path — same version, which is every real reload — the validation never ran,
 * so corrupted localStorage flowed straight into the store.
 *
 * Validation now lives in `merge`, which runs on every rehydrate. Each test seeds localStorage
 * with the store's CURRENT version (so `migrate` is deliberately not invoked) and asserts the
 * bad data was still rejected. Written against the same-version case on purpose: seeding an old
 * version would pass even with the original bug.
 */

/** Seed a zustand persist entry at a given version, then import the store fresh. */
function seedPersistedState(key: string, state: unknown, version: number) {
  localStorage.setItem(key, JSON.stringify({ state, version }));
}

describe('persisted store validation runs on rehydrate', () => {
  beforeEach(() => {
    localStorage.clear();
    // Each test imports its store fresh so persist middleware re-reads localStorage.
    vi.resetModules();
  });

  it('formStore rejects a malformed persisted registeree address', async () => {
    seedPersistedState(
      'swr-form-state',
      { registeree: 'not-an-address', relayer: '0x' + '1'.repeat(40) },
      1
    );

    const { useFormStore } = await import('./formStore');

    expect(useFormStore.getState().registeree).toBeNull();
    expect(useFormStore.getState().relayer).toBe('0x' + '1'.repeat(40));
  });

  it('formStore keeps a valid persisted address', async () => {
    const valid = ('0x' + 'a'.repeat(40)) as `0x${string}`;
    seedPersistedState('swr-form-state', { registeree: valid, relayer: null }, 1);

    const { useFormStore } = await import('./formStore');

    expect(useFormStore.getState().registeree).toBe(valid);
  });

  it('transactionRegistrationStore rejects an unknown persisted registrationType', async () => {
    seedPersistedState(
      'swr-transaction-registration-state',
      { registrationType: 'bogusType', step: 'select-transactions' },
      1
    );

    const { useTransactionRegistrationStore } = await import('./transactionRegistrationStore');

    expect(useTransactionRegistrationStore.getState().registrationType).not.toBe('bogusType');
  });

  it('transactionFormStore rejects non-array persisted selections', async () => {
    seedPersistedState(
      'swr-transaction-form-state',
      { selectedTxHashes: 'corrupted', selectedTxDetails: { not: 'an array' } },
      1
    );

    const { useTransactionFormStore } = await import('./transactionFormStore');

    expect(useTransactionFormStore.getState().selectedTxHashes).toEqual([]);
    expect(useTransactionFormStore.getState().selectedTxDetails).toEqual([]);
  });

  it('registrationStore falls back to defaults for missing persisted fields', async () => {
    seedPersistedState('swr-registration-state', { step: 'grace-period' }, 1);

    const { useRegistrationStore } = await import('./registrationStore');
    const state = useRegistrationStore.getState();

    expect(state.step).toBe('grace-period');
    expect(state.acknowledgementHash).toBeNull();
    expect(state.registrationHash).toBeNull();
  });
});
