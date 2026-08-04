import { describe, it, expect } from 'vitest';
import type { ParsedStreamData } from '@swr/p2p';
import { computeTransactionDataHash } from '@swr/signatures';
import { isValidSignatureData, isValidTxSignatureData } from './signatureData';
import type { Hash } from '@/lib/types/ethereum';

const CHAIN_ID = 8453;
const ADDRESS = `0x${'a'.repeat(40)}`;
const SIG = `0x${'b'.repeat(130)}`;
const BYTES32 = `0x${'c'.repeat(64)}`;
const OTHER_BYTES32 = `0x${'d'.repeat(64)}`;

// The default batch's real commitment. Computed rather than hard-coded so the fixture cannot
// drift from `computeTransactionDataHash`, which is the same function the reporter signs over
// and the contract recomputes.
const DEFAULT_DATA_HASH = computeTransactionDataHash(
  [BYTES32, BYTES32] as Hash[],
  [BYTES32, BYTES32] as Hash[]
);

// Mirrors exactly what useP2PSignFlow puts on the wire, including the extended fields —
// reportedChainId as a DECIMAL chain ID (the contracts take uint64), not a bytes32 hash.
function walletMessage(overrides: Record<string, unknown> = {}): ParsedStreamData {
  return {
    signature: {
      keyRef: 'AcknowledgementOfRegistry',
      chainId: CHAIN_ID,
      address: ADDRESS,
      value: SIG,
      deadline: '1700000000',
      nonce: '3',
      reportedChainId: '84532',
      incidentTimestamp: '0',
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
      dataHash: DEFAULT_DATA_HASH,
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

  // The wallet contracts take `uint64 reportedChainId` and the sender ships
  // `BigInt(chainId).toString()`. Validating it as bytes32 (as the transaction flow's
  // CAIP-2 hash genuinely is) rejected every relayed wallet signature as malformed.
  it('accepts a decimal reportedChainId and rejects a bytes32 one', () => {
    expect(isValidSignatureData(walletMessage({ reportedChainId: '1' }), CHAIN_ID)).toBe(true);
    expect(isValidSignatureData(walletMessage({ reportedChainId: BYTES32 }), CHAIN_ID)).toBe(false);
  });

  it('accepts a payload omitting the optional extended fields', () => {
    expect(
      isValidSignatureData(
        walletMessage({ reportedChainId: undefined, incidentTimestamp: undefined }),
        CHAIN_ID
      )
    ).toBe(true);
  });

  it('rejects an incidentTimestamp BigInt() would throw on', () => {
    expect(isValidSignatureData(walletMessage({ incidentTimestamp: 'today' }), CHAIN_ID)).toBe(
      false
    );
  });

  // The relayer submits windowBlock as calldata and rebuilds the digest from windowBlockHash;
  // a malformed pair is gas spent on a guaranteed revert. Registration payloads carry both,
  // acknowledgement payloads carry neither — one without the other is a broken sender.
  it('accepts a registration payload carrying the freshness commitment', () => {
    expect(
      isValidSignatureData(
        walletMessage({ windowBlock: '4242', windowBlockHash: BYTES32 }),
        CHAIN_ID
      )
    ).toBe(true);
  });

  it('rejects a malformed windowBlock or windowBlockHash', () => {
    expect(
      isValidSignatureData(
        walletMessage({ windowBlock: '0x1092', windowBlockHash: BYTES32 }),
        CHAIN_ID
      )
    ).toBe(false);
    expect(
      isValidSignatureData(
        walletMessage({ windowBlock: '4242', windowBlockHash: '0xdeadbeef' }),
        CHAIN_ID
      )
    ).toBe(false);
  });

  it('rejects a windowBlock without its hash, and vice versa', () => {
    expect(isValidSignatureData(walletMessage({ windowBlock: '4242' }), CHAIN_ID)).toBe(false);
    expect(isValidSignatureData(walletMessage({ windowBlockHash: BYTES32 }), CHAIN_ID)).toBe(false);
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

  // W-3. The relayer submits `transactionHashes`/`chainIdHashes` while the reporter signed
  // `dataHash`; nothing above ties the two together, so a selection that changed between
  // signing and sending passed every shape check and reverted on-chain after the relayer's gas
  // was spent. This is the same computation the contract performs.
  it('rejects a batch whose arrays do not hash to the signed dataHash', () => {
    expect(isValidTxSignatureData(txMessage({}, { dataHash: BYTES32 }), CHAIN_ID)).toBe(false);
  });

  it('rejects a batch where one entry was swapped after signing', () => {
    // Same length, same shapes, same count — only the content differs, which is precisely
    // what every other check in this validator is blind to.
    expect(
      isValidTxSignatureData(
        txMessage({}, { transactionHashes: [BYTES32, OTHER_BYTES32] }),
        CHAIN_ID
      )
    ).toBe(false);
    expect(
      isValidTxSignatureData(txMessage({}, { chainIdHashes: [BYTES32, OTHER_BYTES32] }), CHAIN_ID)
    ).toBe(false);
  });

  it('accepts a batch whose arrays hash to the signed dataHash', () => {
    const hashes = [BYTES32, OTHER_BYTES32] as Hash[];
    const chainIds = [OTHER_BYTES32, BYTES32] as Hash[];
    expect(
      isValidTxSignatureData(
        txMessage(
          {},
          {
            transactionHashes: hashes,
            chainIdHashes: chainIds,
            dataHash: computeTransactionDataHash(hashes, chainIds),
          }
        ),
        CHAIN_ID
      )
    ).toBe(true);
  });

  // The hash is order-sensitive (abi.encode of two arrays), so the same set in a different
  // order is a different batch — and the contract agrees.
  it('rejects the same entries in a different order', () => {
    const hashes = [BYTES32, OTHER_BYTES32] as Hash[];
    const chainIds = [OTHER_BYTES32, BYTES32] as Hash[];
    expect(
      isValidTxSignatureData(
        txMessage(
          {},
          {
            transactionHashes: [OTHER_BYTES32, BYTES32],
            chainIdHashes: chainIds,
            dataHash: computeTransactionDataHash(hashes, chainIds),
          }
        ),
        CHAIN_ID
      )
    ).toBe(false);
  });

  it('accepts a dataHash that differs only in hex casing', () => {
    expect(
      isValidTxSignatureData(
        txMessage({}, { dataHash: DEFAULT_DATA_HASH.toUpperCase().replace('0X', '0x') }),
        CHAIN_ID
      )
    ).toBe(true);
  });

  it('rejects a signature with no batch attached', () => {
    const noBatch = txMessage();
    delete (noBatch as { transactionBatch?: unknown }).transactionBatch;
    expect(isValidTxSignatureData(noBatch, CHAIN_ID)).toBe(false);
  });
});
