import { describe, it, expect } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import {
  buildAcknowledgementTypedData,
  buildRegistrationTypedData,
  buildTxAcknowledgementTypedData,
  buildTxRegistrationTypedData,
  SIGNATURE_STEP,
  TX_SIGNATURE_STEP,
} from '@swr/signatures';
import {
  recoverWalletSignatureSigner,
  recoverTxSignatureSigner,
  reviewRelayedSignature,
  describeRelaySignatureIssue,
} from './relayVerification';
import type { Address, Hash, Hex } from '@/lib/types/ethereum';

const VICTIM = privateKeyToAccount(`0x${'11'.repeat(32)}`);
const ATTACKER = privateKeyToAccount(`0x${'22'.repeat(32)}`);
const RELAYER = `0x${'33'.repeat(20)}` as Address;
const CONTRACT = `0x${'44'.repeat(20)}` as Address;
const CHAIN_ID = 8453;
const BYTES32 = `0x${'cc'.repeat(32)}` as Hash;
const WINDOW_BLOCK_HASH = `0x${'ab'.repeat(32)}` as Hash;
const OTHER_WINDOW_BLOCK_HASH = `0x${'ba'.repeat(32)}` as Hash;

const walletMessage = {
  wallet: VICTIM.address as Address,
  trustedForwarder: RELAYER,
  reportedChainId: BigInt(CHAIN_ID),
  incidentTimestamp: 0n,
  nonce: 4n,
  deadline: 1_900_000_000n,
};

const txMessage = {
  reporter: VICTIM.address as Address,
  trustedForwarder: RELAYER,
  dataHash: BYTES32,
  reportedChainId: BYTES32,
  transactionCount: 2,
  nonce: 4n,
  deadline: 1_900_000_000n,
};

describe('recoverWalletSignatureSigner', () => {
  it('recovers the address that actually signed the acknowledgement', async () => {
    const typedData = buildAcknowledgementTypedData(CHAIN_ID, CONTRACT, true, walletMessage);
    const signature = (await VICTIM.signTypedData(typedData)) as Hex;

    const recovered = await recoverWalletSignatureSigner({
      step: SIGNATURE_STEP.ACKNOWLEDGEMENT,
      signature,
      chainId: CHAIN_ID,
      verifyingContract: CONTRACT,
      isHub: true,
      ...walletMessage,
    });

    expect(recovered?.toLowerCase()).toBe(VICTIM.address.toLowerCase());
  });

  // The attack B6 exists for: a peer sends a syntactically perfect signature that a
  // different key produced. Presence checks and schema validation both pass; only recovery
  // catches it, and it must catch it before the relayer spends gas.
  it('recovers a different address when someone else signed the same struct', async () => {
    const typedData = buildAcknowledgementTypedData(CHAIN_ID, CONTRACT, true, walletMessage);
    const signature = (await ATTACKER.signTypedData(typedData)) as Hex;

    const recovered = await recoverWalletSignatureSigner({
      step: SIGNATURE_STEP.ACKNOWLEDGEMENT,
      signature,
      chainId: CHAIN_ID,
      verifyingContract: CONTRACT,
      isHub: true,
      ...walletMessage,
    });

    expect(recovered?.toLowerCase()).toBe(ATTACKER.address.toLowerCase());
    expect(recovered?.toLowerCase()).not.toBe(VICTIM.address.toLowerCase());
  });

  // A registration signature is not an acknowledgement signature: recovering one against the
  // other's typehash yields a stranger, which the review step then rejects.
  it('does not recover the signer when the struct differs from what was signed', async () => {
    const typedData = buildRegistrationTypedData(CHAIN_ID, CONTRACT, true, {
      ...walletMessage,
      windowBlockHash: WINDOW_BLOCK_HASH,
    });
    const signature = (await VICTIM.signTypedData(typedData)) as Hex;

    const recovered = await recoverWalletSignatureSigner({
      step: SIGNATURE_STEP.ACKNOWLEDGEMENT,
      signature,
      chainId: CHAIN_ID,
      verifyingContract: CONTRACT,
      isHub: true,
      ...walletMessage,
    });

    expect(recovered?.toLowerCase()).not.toBe(VICTIM.address.toLowerCase());
  });

  it('recovers the signer of a registration when the window block hash matches', async () => {
    const typedData = buildRegistrationTypedData(CHAIN_ID, CONTRACT, true, {
      ...walletMessage,
      windowBlockHash: WINDOW_BLOCK_HASH,
    });
    const signature = (await VICTIM.signTypedData(typedData)) as Hex;

    const recovered = await recoverWalletSignatureSigner({
      step: SIGNATURE_STEP.REGISTRATION,
      signature,
      chainId: CHAIN_ID,
      verifyingContract: CONTRACT,
      isHub: true,
      ...walletMessage,
      windowBlockHash: WINDOW_BLOCK_HASH,
    });

    expect(recovered?.toLowerCase()).toBe(VICTIM.address.toLowerCase());
  });

  // The whole point of the freshness commitment: the signature is bound to ONE block. Swapping
  // the hash produces a different digest, so the signature no longer belongs to the signer and
  // cannot be replayed against a window the victim never agreed to.
  it('does not verify a registration against a different window block hash', async () => {
    const typedData = buildRegistrationTypedData(CHAIN_ID, CONTRACT, true, {
      ...walletMessage,
      windowBlockHash: WINDOW_BLOCK_HASH,
    });
    const signature = (await VICTIM.signTypedData(typedData)) as Hex;

    const recovered = await recoverWalletSignatureSigner({
      step: SIGNATURE_STEP.REGISTRATION,
      signature,
      chainId: CHAIN_ID,
      verifyingContract: CONTRACT,
      isHub: true,
      ...walletMessage,
      windowBlockHash: OTHER_WINDOW_BLOCK_HASH,
    });

    expect(recovered?.toLowerCase()).not.toBe(VICTIM.address.toLowerCase());
  });

  // Without the hash there is no digest to rebuild. Returning null (rather than recovering
  // some unrelated address) keeps "field missing" from being reported to the relayer as fraud.
  it('returns null for a registration with no window block hash supplied', async () => {
    const typedData = buildRegistrationTypedData(CHAIN_ID, CONTRACT, true, {
      ...walletMessage,
      windowBlockHash: WINDOW_BLOCK_HASH,
    });
    const signature = (await VICTIM.signTypedData(typedData)) as Hex;

    const recovered = await recoverWalletSignatureSigner({
      step: SIGNATURE_STEP.REGISTRATION,
      signature,
      chainId: CHAIN_ID,
      verifyingContract: CONTRACT,
      isHub: true,
      ...walletMessage,
    });

    expect(recovered).toBeNull();
  });

  it('returns null for a malformed signature instead of throwing', async () => {
    const recovered = await recoverWalletSignatureSigner({
      step: SIGNATURE_STEP.ACKNOWLEDGEMENT,
      signature: '0xdeadbeef' as Hex,
      chainId: CHAIN_ID,
      verifyingContract: CONTRACT,
      isHub: true,
      ...walletMessage,
    });

    expect(recovered).toBeNull();
  });
});

describe('recoverTxSignatureSigner', () => {
  it('recovers the reporter that signed the batch acknowledgement', async () => {
    const typedData = buildTxAcknowledgementTypedData(CHAIN_ID, CONTRACT, true, txMessage);
    const signature = (await VICTIM.signTypedData(typedData)) as Hex;

    const recovered = await recoverTxSignatureSigner({
      step: TX_SIGNATURE_STEP.ACKNOWLEDGEMENT,
      signature,
      chainId: CHAIN_ID,
      verifyingContract: CONTRACT,
      isHub: true,
      ...txMessage,
    });

    expect(recovered?.toLowerCase()).toBe(VICTIM.address.toLowerCase());
  });

  it('recovers a different address when the batch was signed by someone else', async () => {
    const typedData = buildTxAcknowledgementTypedData(CHAIN_ID, CONTRACT, true, txMessage);
    const signature = (await ATTACKER.signTypedData(typedData)) as Hex;

    const recovered = await recoverTxSignatureSigner({
      step: TX_SIGNATURE_STEP.ACKNOWLEDGEMENT,
      signature,
      chainId: CHAIN_ID,
      verifyingContract: CONTRACT,
      isHub: true,
      ...txMessage,
    });

    expect(recovered?.toLowerCase()).toBe(ATTACKER.address.toLowerCase());
  });

  // Same freshness property as the wallet flow — the batch registration signature is bound to
  // one block, so a substituted hash must not verify.
  it('does not verify a batch registration against a different window block hash', async () => {
    const typedData = buildTxRegistrationTypedData(CHAIN_ID, CONTRACT, true, {
      ...txMessage,
      windowBlockHash: WINDOW_BLOCK_HASH,
    });
    const signature = (await VICTIM.signTypedData(typedData)) as Hex;

    const matching = await recoverTxSignatureSigner({
      step: TX_SIGNATURE_STEP.REGISTRATION,
      signature,
      chainId: CHAIN_ID,
      verifyingContract: CONTRACT,
      isHub: true,
      ...txMessage,
      windowBlockHash: WINDOW_BLOCK_HASH,
    });
    const swapped = await recoverTxSignatureSigner({
      step: TX_SIGNATURE_STEP.REGISTRATION,
      signature,
      chainId: CHAIN_ID,
      verifyingContract: CONTRACT,
      isHub: true,
      ...txMessage,
      windowBlockHash: OTHER_WINDOW_BLOCK_HASH,
    });

    expect(matching?.toLowerCase()).toBe(VICTIM.address.toLowerCase());
    expect(swapped?.toLowerCase()).not.toBe(VICTIM.address.toLowerCase());
  });
});

describe('reviewRelayedSignature', () => {
  const base = {
    recoveredSigner: VICTIM.address as Address,
    expectedSigner: VICTIM.address as Address,
    signatureNonce: 4n,
    onChainNonce: 4n,
    deadline: 1_900_000_000n,
    nowSeconds: 1_800_000_000n,
  };

  // Positive path: a correct signature must actually clear the gate, otherwise every
  // rejection below is indistinguishable from "blocks everything".
  it('accepts a signature from the expected signer with a matching nonce and live deadline', () => {
    const review = reviewRelayedSignature(base);

    expect(review.ok).toBe(true);
    expect(review.issues).toEqual([]);
    expect(review.recoveredSigner).toBe(VICTIM.address);
  });

  it('rejects a signature produced by a wallet other than the expected one', () => {
    const review = reviewRelayedSignature({
      ...base,
      recoveredSigner: ATTACKER.address as Address,
    });

    expect(review.ok).toBe(false);
    expect(review.issues).toContain('signer-mismatch');
  });

  it('rejects when recovery failed entirely', () => {
    const review = reviewRelayedSignature({ ...base, recoveredSigner: null });

    expect(review.ok).toBe(false);
    expect(review.issues).toContain('recovery-failed');
  });

  it('rejects a nonce the contract has already moved past', () => {
    const review = reviewRelayedSignature({ ...base, onChainNonce: 5n });

    expect(review.ok).toBe(false);
    expect(review.issues).toContain('nonce-mismatch');
  });

  // Blocking on an unread nonce is deliberate: the check exists precisely to consult the
  // chain rather than trust the payload, so "haven't looked yet" cannot mean "fine".
  it('blocks payment while the on-chain nonce is still unknown', () => {
    const review = reviewRelayedSignature({ ...base, onChainNonce: undefined });

    expect(review.ok).toBe(false);
    expect(review.issues).toContain('nonce-unknown');
  });

  it('rejects an expired signature', () => {
    const review = reviewRelayedSignature({ ...base, nowSeconds: 1_900_000_001n });

    expect(review.ok).toBe(false);
    expect(review.issues).toContain('deadline-expired');
  });

  // No pairing code means there is no out-of-band statement of which wallet is being paid
  // for, so the check has nothing to compare against and must fail closed. Reported as its
  // own issue rather than as a mismatch: the remedy is "get a pairing code", not "do not
  // trust your partner", and conflating them would hide the case where the app itself lost
  // the pairing.
  it('rejects when the relayer has no out-of-band wallet to check against', () => {
    const review = reviewRelayedSignature({ ...base, expectedSigner: undefined });

    expect(review.ok).toBe(false);
    expect(review.issues).toContain('pairing-unknown');
    expect(review.issues).not.toContain('signer-mismatch');
  });

  /**
   * W-2. `WINDOW_BLOCK_HISTORY_LIMIT` was exported and never referenced, so this — the only
   * invalidating condition knowable client-side without an extra chain read — was never
   * checked. A relayer who takes longer than ~8.5 minutes on Base, or retries once after an
   * RPC failure, spends gas on a guaranteed `TimingConfig__WindowBlockTooOld` revert.
   */
  it('rejects a registration whose committed block has aged out of the blockhash window', () => {
    const review = reviewRelayedSignature({
      ...base,
      windowBlock: 1_000_000n,
      currentBlock: 1_000_300n,
    });

    expect(review.ok).toBe(false);
    expect(review.issues).toContain('window-block-stale');
  });

  it('accepts a registration still inside the blockhash window', () => {
    const review = reviewRelayedSignature({
      ...base,
      windowBlock: 1_000_000n,
      currentBlock: 1_000_100n,
    });

    expect(review.ok).toBe(true);
    expect(review.issues).toEqual([]);
  });

  /**
   * Acknowledgement signatures carry no window commitment, and a chain-head read that has not
   * landed is not evidence of staleness. Neither may block payment on its own.
   */
  it('asserts nothing about staleness when the window block or chain head is unknown', () => {
    expect(reviewRelayedSignature({ ...base, currentBlock: 1_000_300n }).ok).toBe(true);
    expect(reviewRelayedSignature({ ...base, windowBlock: 1_000_000n }).ok).toBe(true);
  });

  it('reports every issue rather than only the first', () => {
    const review = reviewRelayedSignature({
      ...base,
      recoveredSigner: ATTACKER.address as Address,
      onChainNonce: 9n,
      nowSeconds: 2_000_000_000n,
    });

    expect(review.issues).toEqual(
      expect.arrayContaining(['signer-mismatch', 'nonce-mismatch', 'deadline-expired'])
    );
  });
});

describe('describeRelaySignatureIssue', () => {
  it('gives an actionable message for every issue', () => {
    for (const issue of [
      'recovery-failed',
      'signer-mismatch',
      'nonce-mismatch',
      'nonce-unknown',
      'deadline-expired',
      'window-block-stale',
    ] as const) {
      expect(describeRelaySignatureIssue(issue).length).toBeGreaterThan(10);
    }
  });
});
