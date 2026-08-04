/**
 * The relayer must refuse a relayed signature that is not for the wallet it agreed to pay for.
 *
 * `storeSignature` keys by `sig.address`, but every pay step looks the signature up by
 * `registeree` — which is `pairedWallet`, the address half of the pairing token. So a payload
 * naming any other address was stored under a key nothing reads, and the relayer was advanced
 * to a payment step regardless: a permanent "Waiting for signature from registeree…" with only
 * a log line to explain it. Payment itself stays gated by `useRelayedWalletSignatureReview`, so
 * this is a denial of the flow rather than a payment for the wrong wallet — but it is silent,
 * unrecoverable without a restart, and trivially triggered by the bound partner.
 *
 * The whole module graph of the page is mocked away: what is under test is the decision
 * `processSignature` makes, not libp2p.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const storeSignature = vi.fn();
const passStreamData = vi.fn(async (..._args: unknown[]) => undefined);
const getPairedWallet = vi.fn();

vi.mock('@/lib/p2p', () => ({
  PROTOCOLS: { ACK_REC: 'ack-rec', REG_REC: 'reg-rec' },
  setup: vi.fn(),
  readStreamData: vi.fn(),
  acceptStream: vi.fn(),
  isRelayerProtocolExpectedAtStep: vi.fn(),
  passStreamData: (...args: unknown[]) => passStreamData(...args),
  isStreamAbortError: vi.fn(),
  // The wire-shape gate runs before the pairing check and is not what this test exercises.
  isValidSignatureData: () => true,
}));

// Only `storeSignature` is replaced: the module is also the source of truth for
// SIGNATURE_TTL_MS and SIGNATURE_STEP, which components further down the page's import graph
// need at module-evaluation time.
vi.mock('@/lib/signatures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/signatures')>()),
  storeSignature: (...args: unknown[]) => storeSignature(...args),
}));

vi.mock('@/stores/p2pStore', () => ({
  useP2PStore: { getState: () => ({ pairedWallet: getPairedWallet() }) },
  isPreConnectionStep: vi.fn(),
}));

const { processSignature } = await import('@/components/p2p/processRelayedSignature');

const PAIRED = '0x1111111111111111111111111111111111111111';
const ATTACKER = '0x2222222222222222222222222222222222222222';
const RELAYER = '0x3333333333333333333333333333333333333333';

function payload(address: string) {
  return {
    signature: {
      value: `0x${'ab'.repeat(65)}`,
      deadline: '1800000000',
      nonce: '0',
      address,
      chainId: 31337,
    },
  } as never;
}

const connection = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  getPairedWallet.mockReturnValue(PAIRED);
});

describe('processSignature — pairing check', () => {
  it('stores and advances for the wallet named in the pairing code', async () => {
    const goToNextStep = vi.fn();

    const accepted = await processSignature(
      payload(PAIRED),
      connection,
      31337,
      1,
      'ack-rec',
      RELAYER as never,
      goToNextStep
    );

    expect(accepted).toBe(true);
    expect(storeSignature).toHaveBeenCalled();
    expect(goToNextStep).toHaveBeenCalled();
  });

  it('refuses a signature for any other wallet, without storing or advancing', async () => {
    const goToNextStep = vi.fn();

    const accepted = await processSignature(
      payload(ATTACKER),
      connection,
      31337,
      1,
      'ack-rec',
      RELAYER as never,
      goToNextStep
    );

    expect(accepted).toBe(false);
    expect(storeSignature).not.toHaveBeenCalled();
    expect(goToNextStep).not.toHaveBeenCalled();
  });

  // Fails closed: with no pairing there is no wallet to check against, and storing anyway is
  // what produced the unreadable-key hang.
  it('refuses when the session has no paired wallet at all', async () => {
    getPairedWallet.mockReturnValue(null);
    const goToNextStep = vi.fn();

    const accepted = await processSignature(
      payload(PAIRED),
      connection,
      31337,
      1,
      'ack-rec',
      RELAYER as never,
      goToNextStep
    );

    expect(accepted).toBe(false);
    expect(storeSignature).not.toHaveBeenCalled();
    expect(goToNextStep).not.toHaveBeenCalled();
  });

  it('matches the paired wallet case-insensitively', async () => {
    const goToNextStep = vi.fn();

    const accepted = await processSignature(
      payload(PAIRED.toUpperCase().replace('0X', '0x')),
      connection,
      31337,
      1,
      'ack-rec',
      RELAYER as never,
      goToNextStep
    );

    expect(accepted).toBe(true);
    expect(storeSignature).toHaveBeenCalled();
  });
});

/**
 * UI-2. The receipt write is the LAST thing `processSignature` does, and it used to be able to
 * take the step advance down with it.
 *
 * A circuit-relay drop mid-handler makes `passStreamData` throw — the exact condition
 * `isStreamAbortError` exists for. That throw propagated to the page's catch, which logged and
 * returned, so `goToNextStep()` never ran: the relayer HELD the stored signature but stayed on
 * the waiting screen, while the registeree, never receiving its receipt, had no resend control.
 * Neither side could get out.
 *
 * These cases were previously unreachable because the mock above always resolves — which is
 * exactly why the bug survived a test file dedicated to this function.
 */
describe('processSignature — receipt delivery', () => {
  it('advances anyway when the receipt write throws, and reports it', async () => {
    passStreamData.mockRejectedValueOnce(new Error('stream reset'));
    const goToNextStep = vi.fn();
    const onReceiptFailed = vi.fn();

    const accepted = await processSignature(
      payload(PAIRED),
      connection,
      31337,
      1,
      'ack-rec',
      RELAYER as never,
      goToNextStep,
      onReceiptFailed
    );

    // The signature IS stored and the pay step is where the relayer belongs, so the flow moves.
    expect(accepted).toBe(true);
    expect(storeSignature).toHaveBeenCalled();
    expect(goToNextStep).toHaveBeenCalledTimes(1);
    // ...and the human is told their partner has not been confirmed to.
    expect(onReceiptFailed).toHaveBeenCalledTimes(1);
    expect(onReceiptFailed.mock.calls[0]?.[0]).toMatch(/could not be delivered/i);
  });

  it('does not report a failure when the receipt is delivered', async () => {
    const goToNextStep = vi.fn();
    const onReceiptFailed = vi.fn();

    await processSignature(
      payload(PAIRED),
      connection,
      31337,
      1,
      'ack-rec',
      RELAYER as never,
      goToNextStep,
      onReceiptFailed
    );

    expect(goToNextStep).toHaveBeenCalledTimes(1);
    expect(onReceiptFailed).not.toHaveBeenCalled();
  });

  // A caller that does not care still must not be broken by the failure path.
  it('advances with no reporter supplied', async () => {
    passStreamData.mockRejectedValueOnce(new Error('stream reset'));
    const goToNextStep = vi.fn();

    const accepted = await processSignature(
      payload(PAIRED),
      connection,
      31337,
      1,
      'ack-rec',
      RELAYER as never,
      goToNextStep
    );

    expect(accepted).toBe(true);
    expect(goToNextStep).toHaveBeenCalledTimes(1);
  });

  // The mirror case: storage failing means there is nothing for the pay step to read back, so
  // advancing would strand the relayer with an empty payment screen.
  it('does not advance when the signature cannot be stored', async () => {
    storeSignature.mockImplementationOnce(() => {
      throw new Error('QuotaExceededError');
    });
    const goToNextStep = vi.fn();

    const accepted = await processSignature(
      payload(PAIRED),
      connection,
      31337,
      1,
      'ack-rec',
      RELAYER as never,
      goToNextStep
    );

    expect(accepted).toBe(false);
    expect(goToNextStep).not.toHaveBeenCalled();
    expect(passStreamData).not.toHaveBeenCalled();
  });
});
