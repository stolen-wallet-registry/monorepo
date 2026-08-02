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
import { AddressSearchResult } from './AddressSearchResult';
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
