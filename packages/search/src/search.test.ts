/**
 * Tests for the search functions, focused on the failure directions that matter.
 *
 * A fraud registry has an asymmetric cost of error: a false positive inconveniences someone,
 * a false negative clears a wallet that IS registered stolen and lets a withdrawal through.
 * These tests exist to make the false-negative direction unreachable — an indexer failure
 * must never render as "clean", and every registry a query claims to cover must actually be
 * queried.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { request } from 'graphql-request';
import {
  search,
  searchAddress,
  searchAddressByCAIP10,
  searchContract,
  searchTransaction,
  searchWallet,
} from './search';
import { detectSearchType } from './detect';
import { isSearchUnavailableError, SearchUnavailableError } from './errors';
import {
  getAddressStatus,
  getAddressStatusLabel,
  getAddressStatusDescription,
  getResultStatus,
  isCompromised,
} from './interpret';
import {
  CONTRACT_QUERY,
  REPORT_MAX_PAGES,
  REPORT_PAGE_SIZE,
  TRANSACTION_QUERY,
  WALLET_QUERY,
} from './queries';
import type { AddressSearchResult, SearchConfig } from './types';

vi.mock('graphql-request', () => ({
  request: vi.fn(),
  gql: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, s, i) => acc + s + (i < values.length ? String(values[i]) : ''), ''),
}));

const mockRequest = vi.mocked(request);

const config: SearchConfig = { indexerUrl: 'http://indexer.test' };
const ADDRESS = '0x742D35CC6634c0532925A3b844BC9E7595F0BEb0';

const WALLET_ITEM = {
  id: ADDRESS.toLowerCase(),
  walletAddress: ADDRESS.toLowerCase(),
  caip10: `eip155:*:${ADDRESS.toLowerCase()}`,
  registeredAt: '1700000000',
  transactionHash: `0x${'a'.repeat(64)}`,
  isSponsored: false,
  sourceChainCAIP2: null,
  reportedChainCAIP2: 'eip155:8453',
};

const CONTRACT_ITEM = {
  contractAddress: ADDRESS.toLowerCase(),
  caip2ChainId: 'eip155:8453',
  numericChainId: 8453,
  batchId: `0x${'b'.repeat(64)}`,
  operator: `0x${'c'.repeat(40)}`,
  reportedAt: '1700000001',
};

/**
 * Route each mocked GraphQL call by which document it was given, so a test can fail one
 * registry while the other succeeds — the partial-failure case is the whole point.
 */
function mockByQuery(handlers: {
  wallet?: () => unknown;
  contract?: () => unknown;
  fallback?: () => unknown;
}) {
  mockRequest.mockImplementation((_url: unknown, document: unknown) => {
    if (document === WALLET_QUERY && handlers.wallet) return Promise.resolve(handlers.wallet());
    if (document === CONTRACT_QUERY && handlers.contract)
      return Promise.resolve(handlers.contract());
    if (handlers.fallback) return Promise.resolve(handlers.fallback());
    return Promise.reject(new Error(`unexpected query`));
  });
}

const emptyWallet = () => ({ stolenWallets: { items: [] } });
const emptyContract = () => ({ fraudulentContracts: { items: [] } });
const foundWallet = () => ({ stolenWallets: { items: [WALLET_ITEM] } });
const foundContract = () => ({ fraudulentContracts: { items: [CONTRACT_ITEM] } });
const boom = () => {
  throw new Error('indexer unreachable');
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('searchAddress — never reports a false negative (V2)', () => {
  it('returns a clean result only when BOTH registries answered', async () => {
    mockByQuery({ wallet: emptyWallet, contract: emptyContract });

    const result = await searchAddress(config, ADDRESS);

    expect(result.found).toBe(false);
    expect(result.unverified).toEqual([]);
    expect(getAddressStatus(result)).toBe('not-found');
  });

  it('throws instead of returning "clean" when the wallet registry fails', async () => {
    mockByQuery({ wallet: boom, contract: emptyContract });

    // The bug this replaces: Promise.allSettled collapsed the rejection into
    // { found: false }, byte-identical to a genuinely clean address, and the UI painted a
    // green "Clean" badge over an indexer outage.
    await expect(searchAddress(config, ADDRESS)).rejects.toThrow(SearchUnavailableError);
  });

  it('throws when the contract registry fails and nothing was found', async () => {
    mockByQuery({ wallet: emptyWallet, contract: boom });

    await expect(searchAddress(config, ADDRESS)).rejects.toThrow(SearchUnavailableError);
  });

  it('names the registries that did not answer', async () => {
    mockByQuery({ wallet: boom, contract: boom });

    const error = await searchAddress(config, ADDRESS).catch((e: unknown) => e);

    expect(isSearchUnavailableError(error)).toBe(true);
    expect((error as SearchUnavailableError).unverified).toEqual(['wallet', 'contract']);
    expect((error as SearchUnavailableError).failures).toHaveLength(2);
  });

  it('never claims a clean result in the thrown message', async () => {
    mockByQuery({ wallet: boom, contract: emptyContract });

    const error = await searchAddress(config, ADDRESS).catch((e: unknown) => e);

    expect((error as Error).message).toContain('NOT a clean result');
  });

  it('still returns a hit when the OTHER registry is down, and flags the gap', async () => {
    // A positive result is actionable even with partial coverage — but it must not imply the
    // unreachable registry was checked and came back empty.
    mockByQuery({ wallet: boom, contract: foundContract });

    const result = await searchAddress(config, ADDRESS);

    expect(result.found).toBe(true);
    expect(result.foundInContractRegistry).toBe(true);
    expect(result.foundInWalletRegistry).toBe(false);
    expect(result.unverified).toEqual(['wallet']);
    expect(getAddressStatusDescription(result)).toContain('NOT a clean result');
  });

  it('reports "Could Not Verify" rather than "Not Found" for a partial answer', async () => {
    mockByQuery({ wallet: foundWallet, contract: boom });

    const result = await searchAddress(config, ADDRESS);

    expect(result.unverified).toEqual(['contract']);
    expect(getAddressStatusLabel(result)).not.toBe('Not Found');
  });
});

describe('searchWallet propagates indexer failures', () => {
  it('rejects rather than resolving to not-found', async () => {
    mockByQuery({ wallet: boom });

    await expect(searchWallet(config, ADDRESS)).rejects.toThrow('indexer unreachable');
  });
});

describe('CAIP-10 search covers the contract registry (V18)', () => {
  it('finds a fraudulent contract when queried in CAIP-10 form', async () => {
    // The canonical form the docs and landing page promote used to hardcode
    // foundInContractRegistry: false, so a registered drainer read as clean here while the
    // bare address found it.
    mockByQuery({ wallet: emptyWallet, contract: foundContract });

    const result = await searchAddressByCAIP10(config, `eip155:8453:${ADDRESS.toLowerCase()}`);

    expect(result.found).toBe(true);
    expect(result.foundInContractRegistry).toBe(true);
  });

  it('covers the contract registry for the wildcard chain form too', async () => {
    mockByQuery({ wallet: emptyWallet, contract: foundContract });

    const result = await searchAddressByCAIP10(config, `eip155:*:${ADDRESS.toLowerCase()}`);

    expect(result.foundInContractRegistry).toBe(true);
  });

  it('routes CAIP-10 through the same coverage in the unified search()', async () => {
    mockByQuery({ wallet: emptyWallet, contract: foundContract });

    const result = await search(config, `eip155:8453:${ADDRESS.toLowerCase()}`);

    expect(result.type).toBe('address');
    expect(result.found).toBe(true);
  });

  it('fails closed on CAIP-10 input when a registry is down', async () => {
    mockByQuery({ wallet: emptyWallet, contract: boom });

    await expect(
      searchAddressByCAIP10(config, `eip155:8453:${ADDRESS.toLowerCase()}`)
    ).rejects.toThrow(SearchUnavailableError);
  });

  // NEITHER registry can be consulted for a non-EVM identifier (findings S-2 and S-3):
  // the contract registry is keyed by an EVM address, and the wallet registry's stored key
  // is the raw bytes32 hex the indexer derives from the event, not the base58 a user types.
  // That is an UNKNOWN, not an absence — and the package's rule is that an unknown with
  // nothing found throws rather than returning something a caller can read as clean.
  it('fails closed for a non-EVM namespace', async () => {
    mockByQuery({ fallback: emptyWallet });

    await expect(searchAddressByCAIP10(config, 'solana:mainnet:FN1abcDEF')).rejects.toThrow(
      SearchUnavailableError
    );
  });

  it('names both registries and explains why neither could be consulted', async () => {
    mockByQuery({ fallback: emptyWallet });

    const error = await searchAddressByCAIP10(config, 'solana:mainnet:FN1abcDEF').catch(
      (e: unknown) => e
    );

    expect(isSearchUnavailableError(error)).toBe(true);
    expect((error as SearchUnavailableError).unverified).toEqual(['wallet', 'contract']);
    expect((error as SearchUnavailableError).reason).toBe('unsupported-identifier');
    expect((error as Error).message).toContain('NOT a clean result');
    // The indexer answered fine here — the registry simply has no form for this identifier.
    // Saying "the indexer did not answer" would send someone debugging the wrong thing.
    expect((error as Error).message).not.toContain('did not answer');
  });

  // S-3, the case the old suite got backwards. It asserted this path returns a HIT, using a
  // mock that answered every query with the same wallet regardless of the variables sent.
  // Against the real indexer the query could never match: the stored key is
  // `${reportedChainCAIP2}:0x<bytes32 hex>` (apps/indexer walletCaip10) while the query sent
  // the user's base58, lowercased — and base58 is case-sensitive, so lowercasing destroys it.
  // A registered Solana wallet was therefore a permanent silent miss that rendered green.
  it('throws rather than issuing a non-EVM query that can never match (S-3)', async () => {
    // The indexer is primed to return a HIT. It must never be asked, because a "miss" from
    // this query would be indistinguishable from one — and there is no key that hits.
    mockByQuery({ fallback: () => ({ stolenWallets: { items: [WALLET_ITEM] } }) });

    await expect(searchAddressByCAIP10(config, 'solana:mainnet:FN1abcDEF')).rejects.toThrow(
      SearchUnavailableError
    );
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('does not lowercase a case-sensitive identifier on the way to failing closed', async () => {
    mockByQuery({ fallback: emptyWallet });

    // Bitcoin base58check, mixed case and meaningful. Whatever happens, it must not become
    // a query — a lowercased base58check string is a different, invalid address.
    await expect(
      searchAddressByCAIP10(
        config,
        'bip122:000000000019d6689c085ae165831e93:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
      )
    ).rejects.toThrow(SearchUnavailableError);
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

// ─── S-2: the documented entrypoint must not fail open ──────────────────────────────────────
//
// Every test above calls `searchAddressByCAIP10` directly. That is precisely how the original
// bug survived: the fail-closed branch was well tested and completely unreachable from
// `search()`, which is what every consumer actually calls. `detectSearchType('solana:…')`
// returned 'invalid', so `search()` returned `{ type:'invalid', found:false }` — reported by
// `isCompromised()` as false and by `getResultStatus()` as 'not-found'.
describe('search() fails closed on an identifier it cannot answer for (S-2)', () => {
  const UNANSWERABLE = [
    'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:FN1abcDEFghiJKLmnoPQRstuVWXyz1234567',
    'bip122:000000000019d6689c085ae165831e93:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    'cosmos:cosmoshub-4:cosmos1t2uflqwqe0fsj0shcfkrvpukewcw40yjj6hdc0',
  ];

  it.each(UNANSWERABLE)('rejects %s instead of reporting it clean', async (identifier) => {
    mockByQuery({ fallback: emptyWallet });

    await expect(search(config, identifier)).rejects.toThrow(SearchUnavailableError);
  });

  it('does not hand back a result an integrator could read as a negative', async () => {
    mockByQuery({ fallback: emptyWallet });

    const outcome = await search(config, UNANSWERABLE[0] as string).then(
      (result) => ({ threw: false, result }),
      (error: unknown) => ({ threw: true, error })
    );

    // The exact shape of the bug: had this returned, `isCompromised(result)` would be false
    // and `getResultStatus(result)` 'not-found', and `if (!isCompromised(r)) allow()` clears
    // a withdrawal for an address nothing ever looked at.
    expect(outcome.threw).toBe(true);
    expect(isSearchUnavailableError((outcome as { error: unknown }).error)).toBe(true);
  });

  it('classifies it as unsupported, not invalid', () => {
    // 'invalid' is a real negative answer (nothing to query). Folding an unanswerable
    // identifier into it is what made the negative confident.
    expect(detectSearchType(UNANSWERABLE[0] as string)).toBe('unsupported');
    expect(detectSearchType('not-an-identifier')).toBe('invalid');
  });

  it('still treats a genuinely malformed EVM identifier as invalid', async () => {
    // We know exactly what an EVM address looks like, so this is a typo, not an unknown —
    // and a scary "could not verify" for a typo trains people to ignore the real ones.
    const result = await search(config, 'eip155:8453:0xnope');

    expect(result.type).toBe('invalid');
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

// ─── S-3's other half: assert the VARIABLES, not just the return value ──────────────────────
//
// The suite mocked `request` to answer by document only, so every test passed regardless of
// what was actually sent. A query built from the wrong key returns "not found" from a healthy
// indexer, which is the most dangerous answer this package can produce, and no assertion on
// the returned value can see it. These pin the wire.
describe('CAIP-10 queries send the key the indexer actually stores', () => {
  it('queries the bare lowercase address for a chain-specific eip155 identifier', async () => {
    mockByQuery({ wallet: emptyWallet, contract: foundContract });

    await search(config, `eip155:8453:${ADDRESS}`);

    const walletCall = mockRequest.mock.calls.find((call) => call[1] === WALLET_QUERY);
    const contractCall = mockRequest.mock.calls.find((call) => call[1] === CONTRACT_QUERY);

    // Not the CAIP-10 string, and not the checksummed casing: the indexer stores wallets
    // under a chain-wildcarded key and both registries key on the lowercase address.
    expect(walletCall?.[2]).toEqual({ address: ADDRESS.toLowerCase() });
    // The contract query is paginated, so it also carries the page size and a null cursor.
    expect(contractCall?.[2]).toEqual({
      address: ADDRESS.toLowerCase(),
      limit: REPORT_PAGE_SIZE,
      after: null,
    });
  });

  it('queries the same key for the wildcard dialects the UI displays', async () => {
    for (const wildcard of ['*', '_']) {
      vi.clearAllMocks();
      mockByQuery({ wallet: emptyWallet, contract: foundContract });

      await search(config, `eip155:${wildcard}:${ADDRESS}`);

      const walletCall = mockRequest.mock.calls.find((call) => call[1] === WALLET_QUERY);
      expect(walletCall?.[2]).toEqual({ address: ADDRESS.toLowerCase() });
    }
  });

  it('lowercases a bare address before querying', async () => {
    mockByQuery({ wallet: emptyWallet, contract: foundContract });

    await search(config, ADDRESS);

    const walletCall = mockRequest.mock.calls.find((call) => call[1] === WALLET_QUERY);
    expect(walletCall?.[2]).toEqual({ address: ADDRESS.toLowerCase() });
  });
});

describe('invalid input', () => {
  it('is a real answer, not an unverified one', async () => {
    const result = await search(config, 'not-an-identifier');

    expect(result.type).toBe('invalid');
    expect(result.unverified).toEqual([]);
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

// ─── The false-clean states are unrepresentable, not merely unproduced ───────────────────────
//
// These are compile-time assertions. `NotAssignable<T, U>` resolves to `true` only while `T`
// is rejected by `U`; the moment someone loosens the union back into a shape that can express
// a confident negative, the annotation resolves to `never`, `= true` stops compiling, and
// `pnpm typecheck` fails. The runtime `expect` just keeps vitest reporting the case.
describe('result type forbids the false-clean shapes', () => {
  /** Compile-time proof that `T` is NOT assignable to `U`. Resolves to `never` if it is. */
  type NotAssignable<T, U> = T extends U ? never : true;

  it('cannot express "found" without data (UI-8)', () => {
    // The exact shape behind UI-8: a `if (found && data)` guard skipped this straight past
    // the destructive branch and fell through to the green "Not Found / Clean" card.
    type FoundWithoutData = {
      type: 'address';
      found: true;
      foundInWalletRegistry: true;
      foundInContractRegistry: false;
      data: null;
      unverified: readonly [];
    };

    const rejected: NotAssignable<FoundWithoutData, AddressSearchResult> = true;
    expect(rejected).toBe(true);
  });

  it('cannot express "not found, and a registry did not answer"', () => {
    // An unknown is not a negative result. The only way to say this is to throw
    // SearchUnavailableError, which no caller can read as clean.
    type NegativeWithGap = {
      type: 'address';
      found: false;
      foundInWalletRegistry: false;
      foundInContractRegistry: false;
      data: null;
      unverified: readonly ['wallet'];
    };

    const rejected: NotAssignable<NegativeWithGap, AddressSearchResult> = true;
    expect(rejected).toBe(true);
  });

  it('cannot express a negative that claims a registry hit', () => {
    // "Not found overall, but found in the wallet registry" is a contradiction, and the two
    // fields are read by different call sites.
    type ContradictoryNegative = {
      type: 'address';
      found: false;
      foundInWalletRegistry: true;
      foundInContractRegistry: false;
      data: null;
      unverified: readonly [];
    };

    const rejected: NotAssignable<ContradictoryNegative, AddressSearchResult> = true;
    expect(rejected).toBe(true);
  });

  it('reports the only constructible negative as a genuine not-found', () => {
    const clean: AddressSearchResult = {
      type: 'address',
      found: false,
      foundInWalletRegistry: false,
      foundInContractRegistry: false,
      data: null,
      unverified: [],
    };

    expect(getResultStatus(clean)).toBe('not-found');
    expect(isCompromised(clean)).toBe(false);
  });
});

// ─── Per-chain report lists are complete, or say that they are not ──────────────────────────
//
// `chains.length` is quoted verbatim in user-facing copy ("Flagged as a fraudulent contract on
// N chains"). CONTRACT_QUERY used to pin `limit: 10` and TRANSACTION_QUERY passed no limit at
// all, inheriting ponder's DEFAULT_LIMIT of 50 — in both cases with no cursor follow-up, so a
// contract flagged on 12 chains reported 10 and nothing said otherwise.
describe('per-chain report lists follow the cursor', () => {
  /** One page of contract rows, each on a distinct chain so the count is meaningful. */
  function contractPage(count: number, offset: number, pageInfo?: unknown) {
    return {
      fraudulentContracts: {
        items: Array.from({ length: count }, (_, i) => ({
          ...CONTRACT_ITEM,
          caip2ChainId: `eip155:${1000 + offset + i}`,
        })),
        pageInfo,
      },
    };
  }

  it('collects every page for a contract flagged on more chains than one page holds', async () => {
    let call = 0;
    mockRequest.mockImplementation((_url: unknown, document: unknown) => {
      if (document !== CONTRACT_QUERY) return Promise.resolve({ stolenWallets: { items: [] } });
      call += 1;
      return Promise.resolve(
        call === 1
          ? contractPage(REPORT_PAGE_SIZE, 0, { hasNextPage: true, endCursor: 'cursor-1' })
          : contractPage(2, REPORT_PAGE_SIZE, { hasNextPage: false, endCursor: null })
      );
    });

    const result = await searchContract(config, ADDRESS);

    expect(result?.chains).toHaveLength(REPORT_PAGE_SIZE + 2);
    expect(result?.chainsTruncated).toBe(false);
  });

  it('passes the previous page cursor on the follow-up request', async () => {
    let call = 0;
    mockRequest.mockImplementation((_url: unknown, document: unknown) => {
      if (document !== CONTRACT_QUERY) return Promise.resolve({ stolenWallets: { items: [] } });
      call += 1;
      return Promise.resolve(
        call === 1
          ? contractPage(1, 0, { hasNextPage: true, endCursor: 'cursor-1' })
          : contractPage(1, 1, { hasNextPage: false, endCursor: null })
      );
    });

    await searchContract(config, ADDRESS);

    const contractCalls = mockRequest.mock.calls.filter((c) => c[1] === CONTRACT_QUERY);
    expect(contractCalls[0]?.[2]).toMatchObject({ limit: REPORT_PAGE_SIZE, after: null });
    expect(contractCalls[1]?.[2]).toMatchObject({ limit: REPORT_PAGE_SIZE, after: 'cursor-1' });
  });

  it('flags truncation rather than passing a partial list off as the whole answer', async () => {
    // A server that never stops claiming another page: the walk must bound itself AND say so.
    mockRequest.mockImplementation((_url: unknown, document: unknown) =>
      Promise.resolve(
        document === CONTRACT_QUERY
          ? contractPage(1, 0, { hasNextPage: true, endCursor: 'always-more' })
          : { stolenWallets: { items: [] } }
      )
    );

    const result = await searchContract(config, ADDRESS);

    expect(result?.chainsTruncated).toBe(true);
    expect(mockRequest.mock.calls.filter((c) => c[1] === CONTRACT_QUERY)).toHaveLength(
      REPORT_MAX_PAGES
    );
  });

  it('renders a truncated count as a floor, not as the total', () => {
    const description = getAddressStatusDescription({
      type: 'address',
      found: true,
      foundInWalletRegistry: false,
      foundInContractRegistry: true,
      data: {
        address: ADDRESS.toLowerCase() as `0x${string}`,
        wallet: null,
        contract: {
          contractAddress: ADDRESS.toLowerCase() as `0x${string}`,
          chainsTruncated: true,
          chains: [
            {
              caip2ChainId: 'eip155:8453',
              chainName: 'Base',
              numericChainId: 8453,
              batchId: '5',
              operator: `0x${'c'.repeat(40)}`,
              reportedAt: 1n,
            },
          ],
        },
      },
      unverified: [],
    });

    expect(description).toContain('1+ chains');
  });

  it('stops on an empty page even if the server still claims another', async () => {
    // Guards the walk against a stub or a bug that echoes a stale cursor forever.
    mockRequest.mockImplementation((_url: unknown, document: unknown) =>
      Promise.resolve(
        document === TRANSACTION_QUERY
          ? { transactionInBatchs: { items: [], pageInfo: { hasNextPage: true, endCursor: 'x' } } }
          : {}
      )
    );

    const result = await searchTransaction(config, `0x${'d'.repeat(64)}`);

    expect(result.found).toBe(false);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('propagates a mid-walk failure instead of returning page 1 as complete', async () => {
    // A partial list presented as complete is the under-report this whole mechanism exists to
    // avoid; a rejection becomes an unverified registry one level up.
    let call = 0;
    mockRequest.mockImplementation((_url: unknown, document: unknown) => {
      if (document !== CONTRACT_QUERY) return Promise.resolve({ stolenWallets: { items: [] } });
      call += 1;
      if (call === 1) {
        return Promise.resolve(contractPage(1, 0, { hasNextPage: true, endCursor: 'cursor-1' }));
      }
      return Promise.reject(new Error('indexer unreachable'));
    });

    await expect(searchContract(config, ADDRESS)).rejects.toThrow('indexer unreachable');
  });
});

// ─── The wire values a consumer is handed are what the type says they are ────────────────────
describe('result fields carry the shape their types promise', () => {
  it('leaves address null for a non-EVM entry and exposes the raw identifier', async () => {
    const identifier = `0x${'e'.repeat(64)}`;
    mockByQuery({
      wallet: () => ({
        stolenWallets: {
          items: [
            {
              ...WALLET_ITEM,
              id: identifier,
              // The indexer writes null here: a 32-byte identifier has no address form.
              walletAddress: null,
              caip10: `solana:mainnet:${identifier}`,
            },
          ],
        },
      }),
      contract: emptyContract,
    });

    const result = await searchWallet(config, identifier);

    expect(result.found).toBe(true);
    // Previously this was the 66-char identifier typed as `Address`, so `isAddress(...)`
    // returned false on a genuine hit from a field the type said was an address.
    expect(result.data?.address).toBeNull();
    expect(result.data?.identifier).toBe(identifier);
  });

  it('returns the decimal batchId the indexer stores, not a hex string', async () => {
    mockRequest.mockImplementation((_url: unknown, document: unknown) =>
      Promise.resolve(
        document === TRANSACTION_QUERY
          ? {
              transactionInBatchs: {
                items: [
                  {
                    id: 'row-1',
                    txHash: `0x${'d'.repeat(64)}`,
                    caip2ChainId: 'eip155:8453',
                    numericChainId: 8453,
                    batchId: '5',
                    reporter: `0x${'c'.repeat(40)}`,
                    reportedAt: '1700000000',
                  },
                ],
              },
            }
          : {}
      )
    );

    const result = await searchTransaction(config, `0x${'d'.repeat(64)}`);

    expect(result.data?.chains[0]?.batchId).toBe('5');
  });
});
