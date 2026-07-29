import { describe, it, expect } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { invalidateRegistryQueries, registryKeys } from './queryKeys';

/**
 * A wagmi `useReadContract` cache entry, keyed the way wagmi keys it. This is the shape the
 * nonce/deadline/hash-struct reads actually live under — the reason invalidation has to
 * target wagmi's root key rather than a hand-rolled factory.
 */
const WAGMI_NONCE_KEY = [
  'readContract',
  { address: '0xregistry', functionName: 'nonces', args: ['0xwallet'], chainId: 8453 },
];

function seed(client: QueryClient, key: unknown[], data: unknown) {
  client.setQueryData(key, data);
  // Mark as fresh so `isStale()` is meaningful before invalidation.
  const entry = client.getQueryCache().find({ queryKey: key });
  return entry;
}

describe('invalidateRegistryQueries', () => {
  it('invalidates wagmi contract reads and the explicit registry status query', () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } });

    seed(client, WAGMI_NONCE_KEY, 3n);
    seed(client, [...registryKeys.status('0xwallet', 8453)], { isRegistered: false });

    expect(client.getQueryCache().find({ queryKey: WAGMI_NONCE_KEY })?.isStale()).toBe(false);

    invalidateRegistryQueries(client, { step: 'acknowledgement' });

    expect(client.getQueryCache().find({ queryKey: WAGMI_NONCE_KEY })?.isStale()).toBe(true);
    expect(
      client
        .getQueryCache()
        .find({ queryKey: [...registryKeys.status('0xwallet', 8453)] })
        ?.isStale()
    ).toBe(true);
  });

  // Positive-path counterpart: invalidating everything indiscriminately would also "pass" the
  // assertions above, so prove unrelated caches survive.
  it('leaves unrelated caches alone', () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } });

    seed(client, ['ens', 'name', '0xwallet'], 'vitalik.eth');
    seed(client, WAGMI_NONCE_KEY, 3n);

    invalidateRegistryQueries(client);

    expect(
      client
        .getQueryCache()
        .find({ queryKey: ['ens', 'name', '0xwallet'] })
        ?.isStale()
    ).toBe(false);
    expect(client.getQueryCache().find({ queryKey: WAGMI_NONCE_KEY })?.isStale()).toBe(true);
  });
});
