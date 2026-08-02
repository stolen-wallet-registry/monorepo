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
import { search, searchAddress, searchAddressByCAIP10, searchWallet } from './search';
import { isSearchUnavailableError, SearchUnavailableError } from './errors';
import { getAddressStatus, getAddressStatusLabel, getAddressStatusDescription } from './interpret';
import { CONTRACT_QUERY, WALLET_QUERY } from './queries';
import type { SearchConfig } from './types';

vi.mock('graphql-request', () => ({
  request: vi.fn(),
  gql: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, s, i) => acc + s + (i < values.length ? String(values[i]) : ''), ''),
}));

const mockRequest = vi.mocked(request);

const config: SearchConfig = { indexerUrl: 'http://indexer.test' };
const ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';

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

  // The contract registry is keyed by an EVM address and has no form for a non-EVM
  // identifier, so it genuinely cannot be consulted. That is still an UNKNOWN, not an
  // absence — and the package's rule is that an unknown with nothing found throws rather
  // than returning something a caller can read as clean. This branch used to return
  // `{ found: false, unverified: ['contract'] }`, which is exactly the shape the rule
  // exists to forbid: `if (!result.found) allow()` clears the address.
  it('fails closed for a non-EVM namespace with nothing found', async () => {
    mockByQuery({ fallback: emptyWallet });

    await expect(searchAddressByCAIP10(config, 'solana:mainnet:FN1abcDEF')).rejects.toThrow(
      SearchUnavailableError
    );
  });

  it('names the contract registry and explains why it could not be consulted', async () => {
    mockByQuery({ fallback: emptyWallet });

    const error = await searchAddressByCAIP10(config, 'solana:mainnet:FN1abcDEF').catch(
      (e: unknown) => e
    );

    expect(isSearchUnavailableError(error)).toBe(true);
    expect((error as SearchUnavailableError).unverified).toEqual(['contract']);
    expect((error as Error).message).toContain('NOT a clean result');
    // The indexer answered fine here — the registry simply has no form for this identifier.
    // Saying "the indexer did not answer" would send someone debugging the wrong thing.
    expect((error as Error).message).not.toContain('did not answer');
  });

  // A hit is still actionable under partial coverage, so the positive path returns rather
  // than throwing — with the gap stated, exactly as the EVM partial-failure path does.
  it('still returns a non-EVM wallet hit, flagging the contract registry as unverified', async () => {
    mockByQuery({ fallback: () => ({ stolenWallets: { items: [WALLET_ITEM] } }) });

    const result = await searchAddressByCAIP10(config, 'solana:mainnet:FN1abcDEF');

    expect(result.found).toBe(true);
    expect(result.foundInWalletRegistry).toBe(true);
    expect(result.unverified).toEqual(['contract']);
    expect(getAddressStatus(result)).toBe('registered');
    expect(getAddressStatusLabel(result)).not.toBe('Could Not Verify');
    expect(getAddressStatusDescription(result)).toContain('could not be checked');
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
