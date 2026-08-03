/**
 * Tests for the address result card, focused on what the user is told when the registry
 * could not be consulted.
 *
 * This card is where a false negative becomes a decision: a green "Clean" badge over an
 * unreachable registry is how someone clears a wallet that IS registered stolen. The search
 * layer refuses to produce that state, and these tests make sure the UI cannot paint it
 * either.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TooltipProvider } from '@swr/ui';
import { AddressSearchResult, type AddressSearchResultProps } from './AddressSearchResult';
import type { AddressSearchData, WalletSearchData } from '@swr/search';

function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

const ADDRESS = '0x742D35CC6634c0532925A3b844BC9E7595F0BEb0';

const walletData: WalletSearchData = {
  address: ADDRESS,
  caip10: `eip155:*:${ADDRESS.toLowerCase()}`,
  registeredAt: 1700000000n,
  transactionHash: `0x${'a'.repeat(64)}`,
  isSponsored: false,
};

const foundData: AddressSearchData = {
  address: ADDRESS,
  wallet: walletData,
  contract: null,
};

describe('AddressSearchResult — unverified registries', () => {
  it('shows "Clean" only when every registry answered', () => {
    renderWithProviders(
      <AddressSearchResult
        found={false}
        foundInWalletRegistry={false}
        foundInContractRegistry={false}
        data={null}
        unverified={[]}
      />
    );

    expect(screen.getByText('Clean')).toBeInTheDocument();
  });

  it('never shows "Clean" when a registry could not be checked', () => {
    renderWithProviders(
      <AddressSearchResult
        found={false}
        foundInWalletRegistry={false}
        foundInContractRegistry={false}
        data={null}
        unverified={['wallet']}
      />
    );

    expect(screen.queryByText('Clean')).not.toBeInTheDocument();
    expect(screen.queryByText('Not Found')).not.toBeInTheDocument();
    expect(screen.getByText('Could Not Verify')).toBeInTheDocument();
    expect(screen.getByText('Unverified')).toBeInTheDocument();
  });

  it('names the registry that could not be checked and says it is not clean', () => {
    renderWithProviders(
      <AddressSearchResult
        found={false}
        foundInWalletRegistry={false}
        foundInContractRegistry={false}
        data={null}
        unverified={['contract']}
      />
    );

    expect(screen.getByText(/fraudulent contract registry could not be checked/i)).toBeVisible();
    expect(screen.getByText(/not.*a clean result/i)).toBeVisible();
  });

  it('reports both registries when neither answered', () => {
    renderWithProviders(
      <AddressSearchResult
        found={false}
        foundInWalletRegistry={false}
        foundInContractRegistry={false}
        data={null}
        unverified={['wallet', 'contract']}
      />
    );

    expect(
      screen.getByText(/stolen wallet and fraudulent contract registries could not be checked/i)
    ).toBeVisible();
  });

  it('still reports a hit when the other registry is down, with the gap stated', () => {
    // A positive result is actionable under partial coverage, but must not imply the
    // unreachable registry came back empty.
    renderWithProviders(
      <AddressSearchResult
        found
        foundInWalletRegistry
        foundInContractRegistry={false}
        data={foundData}
        unverified={['contract']}
      />
    );

    expect(screen.getByText('Registered as Stolen Wallet')).toBeInTheDocument();
    expect(screen.getByText(/could not be checked/i)).toBeVisible();
  });

  it('defaults to full coverage when the prop is omitted', () => {
    renderWithProviders(
      <AddressSearchResult
        found={false}
        foundInWalletRegistry={false}
        foundInContractRegistry={false}
        data={null}
      />
    );

    expect(screen.getByText('Clean')).toBeInTheDocument();
  });
});

// ─── Finding UI-8: a hit with no data must not resolve downward into "Clean" ────────────────
//
// The guard used to be `if (found && data)`. A result with `found: true, data: null` failed
// it, then failed the amber branch too (because `unverified` was empty), and fell all the way
// through to the green "Not Found / Clean" card — for an address the registry had MATCHED.
// That is the single most dangerous output this component can produce.
describe('AddressSearchResult — found without data (UI-8)', () => {
  /** Compile-time proof that `T` is NOT assignable to `U`. Resolves to `never` if it is. */
  type NotAssignable<T, U> = T extends U ? never : true;

  it('cannot be constructed through the props type', () => {
    // The primary fix is structural: the props are a discriminated union on `found`, so a
    // caller cannot pass this combination at all. If this assertion stops compiling, the
    // union has been loosened back into a shape that can express the false clean.
    type FoundWithoutData = {
      found: true;
      foundInWalletRegistry: true;
      foundInContractRegistry: false;
      data: null;
    };

    const rejected: NotAssignable<FoundWithoutData, AddressSearchResultProps> = true;
    expect(rejected).toBe(true);
  });

  it('renders "Could Not Verify", never "Clean", if it reaches the component anyway', () => {
    // Types do not survive to runtime. Props can arrive from plain JS, an untyped test
    // fixture, or a `data` payload that failed to parse — so the downward resolution is
    // blocked at runtime too. The cast is how a JS caller would reach this state.
    renderWithProviders(
      <AddressSearchResult
        {...({
          found: true,
          foundInWalletRegistry: true,
          foundInContractRegistry: false,
          data: null,
          unverified: [],
        } as unknown as AddressSearchResultProps)}
      />
    );

    expect(screen.queryByText('Clean')).not.toBeInTheDocument();
    expect(screen.queryByText('Not Found')).not.toBeInTheDocument();
    expect(screen.getByText('Could Not Verify')).toBeInTheDocument();
    expect(screen.getByText(/not.*a clean result/i)).toBeVisible();
  });

  it('tells the user to treat it as registered rather than to retry', () => {
    renderWithProviders(
      <AddressSearchResult
        {...({
          found: true,
          foundInWalletRegistry: true,
          foundInContractRegistry: false,
          data: null,
        } as unknown as AddressSearchResultProps)}
      />
    );

    // A match we cannot describe is still a match. "Try again" understates it.
    expect(screen.getByText(/treat it as registered/i)).toBeVisible();
  });
});
