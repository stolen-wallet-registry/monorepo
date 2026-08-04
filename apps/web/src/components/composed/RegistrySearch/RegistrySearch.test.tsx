/**
 * Tests for how RegistrySearch surfaces a search that could not be completed.
 *
 * `@swr/search` fails CLOSED: when it cannot establish whether an identifier is registered it
 * throws `SearchUnavailableError` instead of returning something an integrator could read as
 * "clean". TanStack Query turns that throw into `error`, and if this component renders it as a
 * generic one-line "Error querying indexer: …" the user is told the *indexer* misbehaved rather
 * than the thing that actually matters: the registry was NOT checked, and this is not a clean
 * result. That is audit finding V2, and these tests pin the distinction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/test-utils';
import { SearchUnavailableError } from '@swr/search';
import { RegistrySearch } from './RegistrySearch';

const ADDRESS = '0x742D35CC6634c0532925A3b844BC9E7595F0BEb0';

const searchResult = {
  data: undefined as unknown,
  isLoading: false,
  error: null as unknown,
};

vi.mock('@/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks')>();
  return {
    ...actual,
    useRegistrySearch: () => searchResult,
    useEnsResolve: () => ({ address: undefined, isLoading: false, isError: false }),
    useIndexerStatus: () => ({ stale: false, data: undefined }),
  };
});

beforeEach(() => {
  searchResult.data = undefined;
  searchResult.isLoading = false;
  searchResult.error = null;
});

/** Language that would let the user conclude the address is safe. */
const AFFIRMATIVE_CLEAN = /\b(is not in the|not registered|no match found)\b/i;

describe('RegistrySearch — unavailable search', () => {
  it('renders the "Could Not Verify" card instead of a generic error line', () => {
    searchResult.error = new SearchUnavailableError(['wallet'], [new Error('fetch failed')]);

    render(<RegistrySearch defaultQuery={ADDRESS} />);

    expect(screen.getByText('Could Not Verify')).toBeInTheDocument();
    expect(screen.getByText('Unverified')).toBeInTheDocument();
    expect(screen.queryByText(/Error querying indexer/i)).not.toBeInTheDocument();
  });

  it('never reads as clean, not-found, or unregistered', () => {
    searchResult.error = new SearchUnavailableError(['wallet', 'contract'], [new Error('down')]);

    const { container } = render(<RegistrySearch defaultQuery={ADDRESS} />);

    expect(screen.queryByText('Clean')).not.toBeInTheDocument();
    expect(screen.queryByText('Not Found')).not.toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(AFFIRMATIVE_CLEAN);
    // The one permitted use of "clean" is the denial itself.
    expect(screen.getByText(/not.*a clean result/i)).toBeVisible();
  });

  it('names the registries that could not be consulted', () => {
    searchResult.error = new SearchUnavailableError(['contract'], [new Error('down')]);

    render(<RegistrySearch defaultQuery={ADDRESS} />);

    expect(screen.getByText(/fraudulent contract registry could not be checked/i)).toBeVisible();
  });

  it('tells an unreachable indexer apart from an identifier the registry cannot represent', () => {
    // 'unreachable' — the query was sent and failed, so retrying is the right advice.
    searchResult.error = new SearchUnavailableError(['wallet'], [new Error('down')], 'unreachable');
    const { unmount } = render(<RegistrySearch defaultQuery={ADDRESS} />);
    expect(screen.getByText(/try again/i)).toBeVisible();
    unmount();

    // 'unsupported-identifier' — nothing failed and nothing was queried. Telling the user to
    // retry sends them debugging an indexer that answered perfectly well.
    searchResult.error = new SearchUnavailableError(['contract'], [], 'unsupported-identifier');
    render(<RegistrySearch defaultQuery={ADDRESS} />);

    expect(screen.getByText('Could Not Verify')).toBeInTheDocument();
    expect(screen.getByText(/cannot be queried for this kind of identifier/i)).toBeVisible();
    expect(screen.queryByText(/try again/i)).not.toBeInTheDocument();
  });

  it('leaves every other error on the generic error path', () => {
    searchResult.error = new Error('boom');

    render(<RegistrySearch defaultQuery={ADDRESS} />);

    expect(screen.getByText(/Error querying indexer/i)).toBeInTheDocument();
    expect(screen.queryByText('Could Not Verify')).not.toBeInTheDocument();
  });
});

// ─── Finding UI-9: an error and a stale result must not render together ─────────────────────
//
// TanStack Query RETAINS `data` from the last successful fetch of a query key when a later
// background refetch throws. So `data` (stale, from when the registry was reachable) and
// `error` are both set at once — and `showResult` / `showUnavailable` were not mutually
// exclusive. The amber "Could Not Verify" card rendered with a green "Clean" card directly
// beneath it, and a user presented with both reads the reassuring one.
describe('RegistrySearch — stale data alongside an error', () => {
  /** What TanStack hands back after a successful fetch that later refetches into an error. */
  const staleCleanResult = {
    type: 'address' as const,
    found: false as const,
    foundInWalletRegistry: false as const,
    foundInContractRegistry: false as const,
    data: null,
    unverified: [] as const,
  };

  it('shows only "Could Not Verify" when a refetch throws SearchUnavailableError', () => {
    searchResult.data = staleCleanResult;
    searchResult.error = new SearchUnavailableError(['wallet'], [new Error('fetch failed')]);

    const { container } = render(<RegistrySearch defaultQuery={ADDRESS} />);

    expect(screen.getByText('Could Not Verify')).toBeInTheDocument();
    // The stale green card must be gone entirely — not merely ordered below the amber one.
    expect(screen.queryByText('Clean')).not.toBeInTheDocument();
    expect(screen.queryByText('Not Found')).not.toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(AFFIRMATIVE_CLEAN);
  });

  it('shows no result card when a refetch throws an ordinary error', () => {
    searchResult.data = staleCleanResult;
    searchResult.error = new Error('boom');

    const { container } = render(<RegistrySearch defaultQuery={ADDRESS} />);

    expect(screen.getByText(/Error querying indexer/i)).toBeInTheDocument();
    expect(screen.queryByText('Clean')).not.toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(AFFIRMATIVE_CLEAN);
  });

  it('does not announce a result to screen readers while erroring', () => {
    // The visual card and the live region are separate render paths; an aria-live
    // "No match found." is the same false clean, delivered to the user who can least
    // cross-check it against the amber card.
    searchResult.data = staleCleanResult;
    searchResult.error = new SearchUnavailableError(['wallet'], [new Error('down')]);

    render(<RegistrySearch defaultQuery={ADDRESS} />);

    expect(screen.queryByText(/No match found/i)).not.toBeInTheDocument();
    expect(screen.getByText(/registry was not checked/i)).toBeInTheDocument();
  });

  it('still renders the result when there is no error', () => {
    // The exclusion must not be so broad that it swallows ordinary results.
    searchResult.data = staleCleanResult;
    searchResult.error = null;

    render(<RegistrySearch defaultQuery={ADDRESS} />);

    expect(screen.getByText('Clean')).toBeInTheDocument();
    expect(screen.queryByText('Could Not Verify')).not.toBeInTheDocument();
  });
});
