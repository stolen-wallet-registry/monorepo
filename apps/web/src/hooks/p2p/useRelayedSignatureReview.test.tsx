/**
 * Tests for the relayer's pre-payment signature review (audit V4).
 *
 * The property under test is narrow but is the whole point of the finding: the address the
 * recovered signer is compared against must be the one agreed OUT OF BAND (`pairedWallet`,
 * the address half of the pasted pairing code), never anything the peer sent. Before the fix
 * the comparison used the form-store `registeree`, which on the relayer side was written from
 * the peer's own CONNECT payload — so `signer-mismatch` compared a claim with itself and could
 * not fire, while `review.ok` gated the pay button.
 *
 * Also covered: the stale-verdict hole, where an effect that bailed out before resetting state
 * left the PREVIOUS signature's verdict standing for a replacement signature that was never
 * checked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useRelayedWalletSignatureReview } from './useRelayedSignatureReview';
import { useP2PStore } from '@/stores/p2pStore';
import { SIGNATURE_STEP, type SignatureStep } from '@swr/signatures';
import type { StoredSignature } from '@/lib/signatures';
import type { Address, Hash, Hex } from '@/lib/types/ethereum';

const VICTIM = '0x1111111111111111111111111111111111111111' as Address;
const ATTACKER = '0x2222222222222222222222222222222222222222' as Address;
const RELAYER = '0x3333333333333333333333333333333333333333' as Address;
const REGISTRY = '0x4444444444444444444444444444444444444444' as Address;

const h = vi.hoisted(() => ({
  /** Whatever `recoverWalletSignatureSigner` should resolve to for the next render. */
  recovered: null as string | null,
  nonce: 0n as bigint | undefined,
}));

vi.mock('wagmi', () => ({ useChainId: () => 31337 }));

vi.mock('@/hooks/useContractNonce', () => ({
  useContractNonce: () => ({ nonce: h.nonce }),
  useTxContractNonce: () => ({ nonce: h.nonce }),
}));

vi.mock('@/lib/contracts/resolveContract', () => ({
  resolveRegistryContract: () => ({ address: REGISTRY, role: 'hub' }),
}));

vi.mock('@/lib/signatures/relayVerification', async () => {
  const actual = await vi.importActual<typeof import('@/lib/signatures/relayVerification')>(
    '@/lib/signatures/relayVerification'
  );
  return {
    ...actual,
    recoverWalletSignatureSigner: vi.fn(async () => h.recovered),
  };
});

/** A complete acknowledgement signature; fields are only shape-checked by the hook. */
function storedSig(overrides: Partial<StoredSignature> = {}): StoredSignature {
  return {
    signature: `0x${'ab'.repeat(65)}` as Hex,
    deadline: 9_999_999_999n,
    nonce: 0n,
    address: VICTIM,
    chainId: 31337,
    step: SIGNATURE_STEP.ACKNOWLEDGEMENT,
    storedAt: 0,
    trustedForwarder: RELAYER,
    reportedChainId: 1n,
    incidentTimestamp: 1n,
    ...overrides,
  } as StoredSignature;
}

function renderReview(
  signature: StoredSignature,
  step: SignatureStep = SIGNATURE_STEP.ACKNOWLEDGEMENT
) {
  return renderHook(
    (props: { sig: StoredSignature }) =>
      useRelayedWalletSignatureReview({
        enabled: true,
        step,
        storedSignature: props.sig,
        // The peer's claim. Deliberately set to the value an attacker would supply — it must
        // make no difference to the verdict.
        expectedSigner: ATTACKER,
        trustedForwarder: RELAYER,
      }),
    { initialProps: { sig: signature } }
  );
}

describe('useRelayedWalletSignatureReview', () => {
  beforeEach(() => {
    h.recovered = null;
    h.nonce = 0n;
    useP2PStore.getState().reset();
  });

  it('accepts a signature whose recovered signer is the wallet from the pairing code', async () => {
    useP2PStore.getState().setPairedWallet(VICTIM);
    h.recovered = VICTIM;

    const { result } = renderReview(storedSig());

    await waitFor(() => expect(result.current.review).not.toBeNull());
    expect(result.current.review?.ok).toBe(true);
  });

  // The core of V4: the peer claims the signature belongs to ATTACKER and it genuinely does,
  // so every self-referential check passes. Only the out-of-band wallet catches it.
  it('blocks payment when the recovered signer is not the wallet from the pairing code', async () => {
    useP2PStore.getState().setPairedWallet(VICTIM);
    h.recovered = ATTACKER;

    const { result } = renderReview(storedSig());

    await waitFor(() => expect(result.current.review).not.toBeNull());
    expect(result.current.review?.ok).toBe(false);
    expect(result.current.review?.issues).toContain('signer-mismatch');
  });

  // Fails closed. A relayer with no pairing has no statement of which wallet it agreed to pay
  // for, and falling back to the peer's claim is the hole itself.
  it('blocks payment when the session has no pairing code at all', async () => {
    h.recovered = VICTIM;

    const { result } = renderReview(storedSig());

    await waitFor(() => expect(result.current.review).not.toBeNull());
    expect(result.current.review?.ok).toBe(false);
    expect(result.current.review?.issues).toContain('pairing-unknown');
  });

  // The sibling residual: a replacement signature missing a required field used to hit an
  // early return placed BEFORE the state reset, leaving the previous (passing) verdict in
  // place — and `ok` gates the pay button.
  it('drops the previous verdict when a replacement signature is missing a required field', async () => {
    useP2PStore.getState().setPairedWallet(VICTIM);
    h.recovered = VICTIM;

    const { result, rerender } = renderReview(storedSig());
    await waitFor(() => expect(result.current.review?.ok).toBe(true));

    rerender({ sig: storedSig({ incidentTimestamp: undefined }) });

    await waitFor(() => expect(result.current.review).toBeNull());
  });

  // windowBlockHash is part of the registration digest and is passed into recovery. Without
  // it recovery runs against a different digest and returns an unrelated address, which used
  // to surface as "signer mismatch" — an accusation against the partner for a truncated
  // message.
  it('refuses to recover a registration signature that arrived without its window block hash', async () => {
    useP2PStore.getState().setPairedWallet(VICTIM);
    h.recovered = VICTIM;

    const { result } = renderReview(
      storedSig({ step: SIGNATURE_STEP.REGISTRATION, windowBlockHash: undefined }),
      SIGNATURE_STEP.REGISTRATION
    );

    await waitFor(() => expect(result.current.isChecking).toBe(false));
    expect(result.current.review).toBeNull();
  });

  it('reviews a registration signature that does carry its window block hash', async () => {
    useP2PStore.getState().setPairedWallet(VICTIM);
    h.recovered = VICTIM;

    const { result } = renderReview(
      storedSig({
        step: SIGNATURE_STEP.REGISTRATION,
        windowBlockHash: `0x${'cd'.repeat(32)}` as Hash,
      }),
      SIGNATURE_STEP.REGISTRATION
    );

    await waitFor(() => expect(result.current.review?.ok).toBe(true));
  });

  // The clock must be read when the verdict is produced, not captured at mount. These hooks
  // mount DISABLED — `enabled` is `role === 'relayer' && !!storedSig`, and the signature
  // arrives later — so a value seeded into state by a `useState` initialiser is as old as the
  // wait for the partner. A deadline that lapsed during that wait then reads as still valid
  // and unblocks the pay button; the contract rejects the signature, so the relayer pays gas
  // to discover what this check exists to tell them first.
  it('judges the deadline against the current clock, not the clock at mount', async () => {
    useP2PStore.getState().setPairedWallet(VICTIM);
    h.recovered = VICTIM;

    const mountMs = 1_800_000_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(mountMs);

    // Valid at mount, lapsed 50s before the signature actually arrives.
    const sig = storedSig({ deadline: BigInt(Math.floor(mountMs / 1000) + 10) });

    const { result, rerender } = renderHook(
      (props: { enabled: boolean }) =>
        useRelayedWalletSignatureReview({
          enabled: props.enabled,
          step: SIGNATURE_STEP.ACKNOWLEDGEMENT,
          storedSignature: sig,
          expectedSigner: ATTACKER,
          trustedForwarder: RELAYER,
        }),
      { initialProps: { enabled: false } }
    );

    nowSpy.mockReturnValue(mountMs + 60_000);
    rerender({ enabled: true });

    await waitFor(() => expect(result.current.review).not.toBeNull());
    expect(result.current.review?.issues).toContain('deadline-expired');
    expect(result.current.review?.ok).toBe(false);

    nowSpy.mockRestore();
  });
});
