import { describe, it, expect } from 'vitest';
import type { ParsedStreamData } from '@swr/p2p';
import { isValidSignatureData, isValidTxSignatureData } from './signatureData';

const CHAIN_ID = 8453;
const ADDRESS = `0x${'a'.repeat(40)}`;
const SIG = `0x${'b'.repeat(130)}`;
const BYTES32 = `0x${'c'.repeat(64)}`;

function walletMessage(overrides: Record<string, unknown> = {}): ParsedStreamData {
  return {
    signature: {
      keyRef: 'AcknowledgementOfRegistry',
      chainId: CHAIN_ID,
      address: ADDRESS,
      value: SIG,
      deadline: '1700000000',
      nonce: '3',
      ...overrides,
    },
  } as ParsedStreamData;
}

function txMessage(
  sigOverrides: Record<string, unknown> = {},
  batchOverrides: Record<string, unknown> = {}
): ParsedStreamData {
  return {
    signature: {
      keyRef: 'TransactionBatchAcknowledgement',
      chainId: CHAIN_ID,
      address: ADDRESS,
      value: SIG,
      deadline: '1700000000',
      nonce: '0',
      ...sigOverrides,
    },
    transactionBatch: {
      dataHash: BYTES32,
      reportedChainId: BYTES32,
      transactionCount: 2,
      transactionHashes: [BYTES32, BYTES32],
      chainIdHashes: [BYTES32, BYTES32],
      ...batchOverrides,
    },
  } as ParsedStreamData;
}

describe('isValidSignatureData (wallet flow)', () => {
  // Positive path first: without it, every rejection below could equally be explained by the
  // validator rejecting everything.
  it('accepts a well-formed payload for the expected chain', () => {
    expect(isValidSignatureData(walletMessage(), CHAIN_ID)).toBe(true);
  });

  it('rejects a signature minted for a different chain', () => {
    expect(isValidSignatureData(walletMessage({ chainId: 1 }), CHAIN_ID)).toBe(false);
  });

  it('rejects a signature that is not 65 bytes', () => {
    expect(isValidSignatureData(walletMessage({ value: `0x${'b'.repeat(128)}` }), CHAIN_ID)).toBe(
      false
    );
  });

  it('rejects a non-address in the address field', () => {
    expect(isValidSignatureData(walletMessage({ address: 'not-an-address' }), CHAIN_ID)).toBe(
      false
    );
  });

  it('rejects deadline and nonce values BigInt() would throw on', () => {
    expect(isValidSignatureData(walletMessage({ deadline: '1e9' }), CHAIN_ID)).toBe(false);
    expect(isValidSignatureData(walletMessage({ nonce: '-1' }), CHAIN_ID)).toBe(false);
  });
});

describe('isValidTxSignatureData (transaction flow)', () => {
  it('accepts a well-formed payload for the expected chain', () => {
    expect(isValidTxSignatureData(txMessage(), CHAIN_ID)).toBe(true);
  });

  // The whole point of the hardening: the presence-only predicate this replaced returned true
  // here, and the relayer then paid gas to submit a signature for another chain.
  it('rejects a signature minted for a different chain', () => {
    expect(isValidTxSignatureData(txMessage({ chainId: 1 }), CHAIN_ID)).toBe(false);
  });

  it('rejects a signature that is not 65 bytes', () => {
    expect(isValidTxSignatureData(txMessage({ value: '0xdeadbeef' }), CHAIN_ID)).toBe(false);
  });

  it('rejects a non-address reporter', () => {
    expect(isValidTxSignatureData(txMessage({ address: '0x1234' }), CHAIN_ID)).toBe(false);
  });

  it('rejects deadline and nonce values BigInt() would throw on', () => {
    expect(isValidTxSignatureData(txMessage({ deadline: 'later' }), CHAIN_ID)).toBe(false);
    expect(isValidTxSignatureData(txMessage({ nonce: '007' }), CHAIN_ID)).toBe(false);
  });

  it('rejects a dataHash or reportedChainId that is not bytes32', () => {
    expect(isValidTxSignatureData(txMessage({}, { dataHash: '0xabc' }), CHAIN_ID)).toBe(false);
    expect(isValidTxSignatureData(txMessage({}, { reportedChainId: '0xabc' }), CHAIN_ID)).toBe(
      false
    );
  });

  it('rejects a batch whose arrays disagree with transactionCount', () => {
    expect(isValidTxSignatureData(txMessage({}, { transactionCount: 3 }), CHAIN_ID)).toBe(false);
    expect(isValidTxSignatureData(txMessage({}, { chainIdHashes: [BYTES32] }), CHAIN_ID)).toBe(
      false
    );
  });

  it('rejects an out-of-range transactionCount', () => {
    expect(
      isValidTxSignatureData(
        txMessage({}, { transactionCount: 0, transactionHashes: [], chainIdHashes: [] }),
        CHAIN_ID
      )
    ).toBe(false);
  });

  it('rejects a batch entry that is not bytes32', () => {
    expect(
      isValidTxSignatureData(txMessage({}, { transactionHashes: [BYTES32, '0xnope'] }), CHAIN_ID)
    ).toBe(false);
  });

  it('rejects a signature with no batch attached', () => {
    const noBatch = txMessage();
    delete (noBatch as { transactionBatch?: unknown }).transactionBatch;
    expect(isValidTxSignatureData(noBatch, CHAIN_ID)).toBe(false);
  });
});
