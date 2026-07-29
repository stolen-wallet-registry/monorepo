/**
 * The selection-wipe regression for the self-relay transaction flow.
 *
 * The page used to clear the user's transaction selection from an effect keyed on
 * `[address, step]`, which fires on EVERY mount of the selection step and every time the
 * user navigates BACK to it — discarding picks they had just made, and picks that survived
 * a reload in the persisted store. It should only clear when the user actually switches
 * wallets.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render as rtlRender } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Address, Hash } from '@/lib/types/ethereum';

const h = vi.hoisted(() => ({
  address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address,
  isConnected: true,
}));

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAccount: () => ({ address: h.address, isConnected: h.isConnected }),
  useChainId: () => 8453,
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/', vi.fn()],
}));

vi.mock('@/hooks/transactions', () => ({
  useUserTransactions: () => ({ transactions: [], isLoading: false, isError: false }),
}));

vi.mock('@/components/composed/TransactionSelector', () => ({
  TransactionSelector: () => <div data-testid="transaction-selector" />,
}));

vi.mock('@/components/registration/tx-steps', () => ({
  TxAcknowledgeSignStep: () => <div />,
  TxAcknowledgePayStep: () => <div />,
  TxGracePeriodStep: () => <div />,
  TxRegisterSignStep: () => <div />,
  TxRegisterPayStep: () => <div />,
  TxSuccessStep: () => <div />,
}));

import { TransactionSelfRelayRegistrationPage } from './TransactionSelfRelayRegistrationPage';
import { useTransactionFormStore } from '@/stores/transactionFormStore';
import { useTransactionRegistrationStore } from '@/stores/transactionRegistrationStore';

/** The page reaches wagmi hooks (ENS in AddressInput), which need a QueryClient. */
function render(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

const TX_A = `0x${'1'.repeat(64)}` as Hash;
const TX_B = `0x${'2'.repeat(64)}` as Hash;

function seedSelection() {
  const store = useTransactionFormStore.getState();
  store.setSelectedTxHashes([TX_A, TX_B]);
  store.setSelectedTxDetails([
    { hash: TX_A, to: null, value: '0', blockNumber: '0' },
    { hash: TX_B, to: null, value: '0', blockNumber: '0' },
  ]);
}

const selected = () => useTransactionFormStore.getState().selectedTxHashes;

beforeEach(() => {
  h.address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
  h.isConnected = true;
  useTransactionFormStore.getState().reset();
  useTransactionRegistrationStore.getState().reset();
  useTransactionRegistrationStore.getState().setRegistrationType('selfRelay');
  useTransactionRegistrationStore.getState().setStep('select-transactions');
});

describe('TransactionSelfRelayRegistrationPage selection persistence', () => {
  it('keeps a persisted selection when the selection step mounts', () => {
    seedSelection();

    render(<TransactionSelfRelayRegistrationPage />);

    expect(selected()).toEqual([TX_A, TX_B]);
  });

  it('keeps the selection when the user navigates back to the selection step', () => {
    seedSelection();

    const { rerender } = render(<TransactionSelfRelayRegistrationPage />);

    act(() => useTransactionRegistrationStore.getState().setStep('acknowledge-sign'));
    rerender(<TransactionSelfRelayRegistrationPage />);
    act(() => useTransactionRegistrationStore.getState().setStep('select-transactions'));
    rerender(<TransactionSelfRelayRegistrationPage />);

    expect(selected()).toEqual([TX_A, TX_B]);
  });

  it('keeps the selection across a remount, as a reload would produce', () => {
    seedSelection();

    const { unmount } = render(<TransactionSelfRelayRegistrationPage />);
    unmount();
    render(<TransactionSelfRelayRegistrationPage />);

    expect(selected()).toEqual([TX_A, TX_B]);
  });

  // The behaviour the wipe was actually there for: the selection belongs to the reporter
  // wallet, so switching wallets during selection must discard it.
  it('clears the selection when the user switches wallets during selection', () => {
    seedSelection();

    const { rerender } = render(<TransactionSelfRelayRegistrationPage />);
    expect(selected()).toEqual([TX_A, TX_B]);

    h.address = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;
    rerender(<TransactionSelfRelayRegistrationPage />);

    expect(selected()).toEqual([]);
  });
});
