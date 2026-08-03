/**
 * Forwarder binding and write failure for transaction-batch signatures.
 *
 * The wallet flow already had both of these; the transaction flow shipped without either, and
 * the consequences are the same on both sides — see `getTxSignature`'s `expectedForwarder`
 * note and `SignatureStorageError`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TX_SIGNATURE_STEP } from '@swr/signatures';
import { SignatureStorageError } from '@/lib/signatures';
import { storeTxSignature, getTxSignature, type StoredTxSignature } from './storage';
import type { Address, Hash, Hex } from '@/lib/types/ethereum';

const CHAIN_ID = 8453;
const DATA_HASH = `0x${'c'.repeat(64)}` as Hash;
const REPORTED_CHAIN = `0x${'d'.repeat(64)}` as Hash;
const REPORTER = '0x742D35CC6634c0532925A3b844BC9E7595F0BEb0' as Address;
// A second reporter whose batch and chain are identical — the collision case.
const OTHER_REPORTER = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0' as Address;
// Two distinct gas wallets: A is signed over, B is what the reporter switches to.
const GAS_WALLET_A = '0x1111111111111111111111111111111111111111' as Address;
const GAS_WALLET_B = '0x2222222222222222222222222222222222222222' as Address;

function record(overrides: Partial<StoredTxSignature> = {}): StoredTxSignature {
  return {
    signature: `0x${'ab'.repeat(65)}` as Hex,
    deadline: 1_800_000_000n,
    nonce: 0n,
    dataHash: DATA_HASH,
    reportedChainId: REPORTED_CHAIN,
    transactionCount: 2,
    reporter: REPORTER,
    trustedForwarder: GAS_WALLET_A,
    chainId: CHAIN_ID,
    step: TX_SIGNATURE_STEP.ACKNOWLEDGEMENT,
    storedAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getTxSignature — forwarder binding', () => {
  it('returns the signature when no forwarder is expected', () => {
    storeTxSignature(record());
    expect(
      getTxSignature(REPORTER, DATA_HASH, CHAIN_ID, TX_SIGNATURE_STEP.ACKNOWLEDGEMENT)
    ).not.toBeNull();
  });

  it('returns the signature for the forwarder it was signed over', () => {
    storeTxSignature(record());
    const got = getTxSignature(
      REPORTER,
      DATA_HASH,
      CHAIN_ID,
      TX_SIGNATURE_STEP.ACKNOWLEDGEMENT,
      GAS_WALLET_A
    );
    expect(got?.trustedForwarder).toBe(GAS_WALLET_A);
  });

  /**
   * The bug this exists for. The storage key is `dataHash/chainId/step` — the forwarder is not
   * in it — so a reporter who goes back and swaps the gas wallet got the OLD signature handed
   * straight back, and the pay step then demanded they connect the wallet they had just
   * deliberately replaced. There is no re-sign path from there; the flow dead-ends until
   * sessionStorage is cleared by hand.
   */
  it('refuses a signature made for a different gas wallet', () => {
    storeTxSignature(record());
    expect(
      getTxSignature(REPORTER, DATA_HASH, CHAIN_ID, TX_SIGNATURE_STEP.ACKNOWLEDGEMENT, GAS_WALLET_B)
    ).toBeNull();
  });

  /**
   * Refusing must not DELETE. Switching back to the original gas wallet has to make the
   * original signature usable again — otherwise a stray glance at the wrong wallet silently
   * costs the reporter a second wallet prompt.
   */
  it('does not discard the refused signature', () => {
    storeTxSignature(record());
    getTxSignature(REPORTER, DATA_HASH, CHAIN_ID, TX_SIGNATURE_STEP.ACKNOWLEDGEMENT, GAS_WALLET_B);
    expect(
      getTxSignature(REPORTER, DATA_HASH, CHAIN_ID, TX_SIGNATURE_STEP.ACKNOWLEDGEMENT, GAS_WALLET_A)
    ).not.toBeNull();
  });

  /**
   * The forwarder reaches storage from a form input or a P2P payload and may not be
   * checksummed. Rejecting on casing alone would force a re-sign for nothing.
   */
  it('compares case-insensitively', () => {
    storeTxSignature(record());
    const lowered = GAS_WALLET_A.toLowerCase() as Address;
    expect(
      getTxSignature(REPORTER, DATA_HASH, CHAIN_ID, TX_SIGNATURE_STEP.ACKNOWLEDGEMENT, lowered)
    ).not.toBeNull();
  });

  it('applies the same binding to registration signatures', () => {
    storeTxSignature(
      record({ step: TX_SIGNATURE_STEP.REGISTRATION, windowBlock: 4242n, nonce: 1n })
    );
    expect(
      getTxSignature(REPORTER, DATA_HASH, CHAIN_ID, TX_SIGNATURE_STEP.REGISTRATION, GAS_WALLET_B)
    ).toBeNull();
    expect(
      getTxSignature(REPORTER, DATA_HASH, CHAIN_ID, TX_SIGNATURE_STEP.REGISTRATION, GAS_WALLET_A)
    ).not.toBeNull();
  });
});

describe('getTxSignature — reporter binding', () => {
  /**
   * The bug this exists for. `dataHash` is `keccak256(abi.encode(txHashes, chainIds))` and
   * carries no identity, so the old key (`dataHash/chainId/step`) was shared by any two
   * reporters filing the same transaction set on the same chain. A relayer's browser running
   * back-to-back P2P sessions handed reporter A's signature — and A's `reporter` field — to
   * reporter B's flow. P2P fails closed on the `pairedWallet` signer check; standard and
   * self-relay have no such gate and would submit a signature that cannot verify.
   */
  it('does not return another reporter’s signature for the same batch and chain', () => {
    storeTxSignature(record());
    expect(
      getTxSignature(OTHER_REPORTER, DATA_HASH, CHAIN_ID, TX_SIGNATURE_STEP.ACKNOWLEDGEMENT)
    ).toBeNull();
  });

  /** Both records coexist rather than one overwriting the other. */
  it('keeps each reporter’s signature separately', () => {
    storeTxSignature(record());
    storeTxSignature(record({ reporter: OTHER_REPORTER, nonce: 7n }));

    expect(
      getTxSignature(REPORTER, DATA_HASH, CHAIN_ID, TX_SIGNATURE_STEP.ACKNOWLEDGEMENT)?.nonce
    ).toBe(0n);
    expect(
      getTxSignature(OTHER_REPORTER, DATA_HASH, CHAIN_ID, TX_SIGNATURE_STEP.ACKNOWLEDGEMENT)?.nonce
    ).toBe(7n);
  });

  /** The reporter reaches the key from persisted form state and may not be checksummed. */
  it('compares the reporter case-insensitively', () => {
    storeTxSignature(record());
    const lowered = REPORTER.toLowerCase() as Address;
    expect(
      getTxSignature(lowered, DATA_HASH, CHAIN_ID, TX_SIGNATURE_STEP.ACKNOWLEDGEMENT)
    ).not.toBeNull();
  });

  /**
   * A hand-edited record whose stored `reporter` disagrees with its key is not what the key
   * claims, and the stored value is what the pay step submits as the signer. Discard it.
   */
  it('discards a record whose stored reporter disagrees with its key', () => {
    const key = `swr_tx_sig_${REPORTER.toLowerCase()}_${DATA_HASH.toLowerCase()}_${CHAIN_ID}_${TX_SIGNATURE_STEP.ACKNOWLEDGEMENT}`;
    storeTxSignature(record());
    const raw = JSON.parse(sessionStorage.getItem(key) as string);
    sessionStorage.setItem(key, JSON.stringify({ ...raw, reporter: OTHER_REPORTER }));

    expect(
      getTxSignature(REPORTER, DATA_HASH, CHAIN_ID, TX_SIGNATURE_STEP.ACKNOWLEDGEMENT)
    ).toBeNull();
    expect(sessionStorage.getItem(key)).toBeNull();
  });
});

describe('storeTxSignature — write failure', () => {
  /**
   * The write happens AFTER the user approved the signature in their wallet. Safari's private
   * mode reports a zero quota and throws on the first `setItem`, so swallowing this loses a
   * signature that has already been produced and lands the user on "signature not found" with
   * nothing explaining why.
   */
  it('throws a specific error when sessionStorage refuses the write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    expect(() => storeTxSignature(record())).toThrow(SignatureStorageError);
    expect(() => storeTxSignature(record())).toThrow(/private browsing/i);
  });
});
