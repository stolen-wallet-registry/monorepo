/**
 * The P2P half of the S3/E19 rule: a Retry after a signature-invalidating revert must
 * discard the signature and restart, never resubmit identical calldata. On the P2P path
 * "restart" additionally means asking the partner — who holds the signature — to sign again.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  parseAbi,
} from 'viem';

import { PROTOCOLS, ParsedStreamDataSchema, PROTOCOL_SCHEMAS } from '@swr/p2p';

import {
  classifyP2PRetry,
  parseResignReason,
  resignNoticeForRecipient,
  resignRequestMessage,
  resignTargetStep,
  txResignTargetStep,
  sendResignRequest,
  MAX_RESIGN_REQUESTS,
} from './p2pResignRequest';

const passStreamData = vi.hoisted(() => vi.fn());
const getPeerConnection = vi.hoisted(() => vi.fn());

vi.mock('@/lib/p2p', () => ({ passStreamData, getPeerConnection }));

const ABI = parseAbi([
  'error WalletRegistry__DeadlineExpired()',
  'error WalletRegistry__InvalidNonce()',
  'error WalletRegistry__AlreadyRegistered()',
  'error FeeManager__InvalidPrice()',
  'function register() returns (bool)',
]);

function revertWith(errorName: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedAbi = ABI as any;
  const data = encodeErrorResult({ abi: typedAbi, errorName } as never);
  const reverted = new ContractFunctionRevertedError({
    abi: typedAbi,
    data,
    functionName: 'register',
  });
  return new ContractFunctionExecutionError(reverted, { abi: typedAbi, functionName: 'register' });
}

describe('classifyP2PRetry', () => {
  it('leaves a plain resubmit in place when there is no error at all', () => {
    expect(classifyP2PRetry({ isError: false, error: null })).toEqual({ kind: 'resubmit' });
  });

  // A gas/RPC-class failure is exactly what Retry-as-resubmit is for; narrowing it to a
  // re-sign would cost the partner an extra signing prompt for nothing.
  it('leaves a plain resubmit in place for a revert that does not touch the signature', () => {
    expect(
      classifyP2PRetry({ isError: true, error: revertWith('FeeManager__InvalidPrice') })
    ).toEqual({ kind: 'resubmit' });
    expect(
      classifyP2PRetry({ isError: true, error: revertWith('WalletRegistry__AlreadyRegistered') })
    ).toEqual({ kind: 'resubmit' });
  });

  // The core of the finding: with `onRetry={reset}` this case rebuilt byte-identical
  // calldata forever. It must never resolve to 'resubmit'.
  it('never resubmits after a signature-invalidating revert', () => {
    for (const name of ['WalletRegistry__DeadlineExpired', 'WalletRegistry__InvalidNonce']) {
      const action = classifyP2PRetry({ isError: true, error: revertWith(name) });
      expect(action.kind).toBe('request-resign');
    }
  });

  it('asks only for a new signature when the window is still open', () => {
    expect(
      classifyP2PRetry({
        isError: true,
        error: revertWith('WalletRegistry__DeadlineExpired'),
        windowClosed: false,
      })
    ).toEqual({
      kind: 'request-resign',
      reason: 'signature-invalidated',
      discardAcknowledgement: false,
    });
  });

  // DeadlineExpired covers both a stale signature and a closed on-chain window. Only the
  // on-chain read separates them, and only the closed case invalidates the acknowledgement
  // as well — signing a new registration would revert identically.
  it('escalates to a full restart when the on-chain window has closed', () => {
    expect(
      classifyP2PRetry({
        isError: true,
        error: revertWith('WalletRegistry__DeadlineExpired'),
        windowClosed: true,
      })
    ).toEqual({
      kind: 'request-resign',
      reason: 'window-closed',
      discardAcknowledgement: true,
    });
  });

  // windowClosed is read from the chain independently of the error, so it must not turn a
  // retryable failure into a restart on its own.
  it('does not escalate a retryable failure just because the window is closed', () => {
    expect(
      classifyP2PRetry({
        isError: true,
        error: revertWith('FeeManager__InvalidPrice'),
        windowClosed: true,
      })
    ).toEqual({ kind: 'resubmit' });
  });
});

describe('resignRequestMessage', () => {
  it('tells the partner what to do, not just that something failed', () => {
    const text = resignRequestMessage('signature-invalidated', 'wallet');
    expect(text).toContain('wallet registration');
    expect(text).toMatch(/sign again/i);
  });

  it('says the acknowledgement has to be redone when the window closed', () => {
    const text = resignRequestMessage('window-closed', 'transaction');
    expect(text).toContain('transaction batch registration');
    expect(text).toMatch(/acknowledgement/i);
  });

  it('fits the 1000-char wire limit for `message`', () => {
    for (const reason of ['signature-invalidated', 'window-closed'] as const) {
      for (const flow of ['wallet', 'transaction'] as const) {
        expect(resignRequestMessage(reason, flow).length).toBeLessThanOrEqual(1000);
      }
    }
  });
});

describe('parseResignReason', () => {
  it('accepts the two reasons the schema allows', () => {
    expect(parseResignReason('window-closed')).toBe('window-closed');
    expect(parseResignReason('signature-invalidated')).toBe('signature-invalidated');
  });

  // The recovery path is chosen from this value, so anything unrecognised must yield null
  // and be dropped rather than falling back to a default.
  it('fails closed on anything else', () => {
    for (const bad of [
      undefined,
      null,
      '',
      'please sign again',
      'window-closed: something',
      'WINDOW-CLOSED',
      0,
      {},
      ['window-closed'],
    ]) {
      expect(parseResignReason(bad)).toBeNull();
    }
  });
});

describe('resignTargetStep', () => {
  // The whole bound on the only backwards transition an inbound message can cause.
  it('recovers within the same phase while the window is open', () => {
    expect(resignTargetStep('acknowledgement-payment', 'signature-invalidated')).toBe(
      'acknowledge-and-sign'
    );
    expect(resignTargetStep('registration-payment', 'signature-invalidated')).toBe(
      'register-and-sign'
    );
  });

  // The acknowledgement's nonce is spent and its window shut, so no registration signature
  // can succeed. The restart goes to the START of the two-phase flow — it re-imposes every
  // control rather than skipping one.
  it('restarts from the acknowledgement when the window closed under a registration', () => {
    expect(resignTargetStep('registration-payment', 'window-closed')).toBe('acknowledge-and-sign');
  });

  // There is no completed acknowledgement to have expired at the acknowledgement step, so a
  // window-closed claim there buys the sender nothing extra.
  it('ignores a window-closed claim made at the acknowledgement step', () => {
    expect(resignTargetStep('acknowledgement-payment', 'window-closed')).toBe(
      'acknowledge-and-sign'
    );
  });

  it('never names a step outside the two sign steps, for any input', () => {
    const steps = [
      null,
      'wait-for-connection',
      'acknowledge-and-sign',
      'acknowledgement-payment',
      'grace-period',
      'register-and-sign',
      'registration-payment',
      'success',
    ] as const;

    for (const step of steps) {
      for (const reason of ['signature-invalidated', 'window-closed'] as const) {
        const target = resignTargetStep(step, reason);
        if (target !== null) {
          expect(['acknowledge-and-sign', 'register-and-sign']).toContain(target);
        }
      }
    }
  });

  // Belt and braces against the ordering gate: even if a resign request somehow reached a
  // handler at one of these steps, it could not move the flow.
  it('returns null everywhere except the two payment steps', () => {
    for (const step of [
      null,
      'wait-for-connection',
      'acknowledge-and-sign',
      'grace-period',
      'register-and-sign',
      'success',
    ] as const) {
      expect(resignTargetStep(step, 'signature-invalidated')).toBeNull();
      expect(resignTargetStep(step, 'window-closed')).toBeNull();
    }
  });
});

describe('txResignTargetStep', () => {
  it('mirrors the wallet flow on the transaction flow steps', () => {
    expect(txResignTargetStep('acknowledgement-payment', 'signature-invalidated')).toBe(
      'acknowledge-sign'
    );
    expect(txResignTargetStep('registration-payment', 'signature-invalidated')).toBe(
      'register-sign'
    );
    expect(txResignTargetStep('registration-payment', 'window-closed')).toBe('acknowledge-sign');
  });

  // What gets reported is chosen locally. A relayer must not be able to push the reporter
  // back into the selection, where the batch (and therefore the dataHash) could change.
  it('never sends the reporter back to transaction selection', () => {
    const steps = [
      null,
      'wait-for-connection',
      'select-transactions',
      'acknowledge-sign',
      'acknowledgement-payment',
      'grace-period',
      'register-sign',
      'registration-payment',
      'success',
    ] as const;

    for (const step of steps) {
      for (const reason of ['signature-invalidated', 'window-closed'] as const) {
        expect(txResignTargetStep(step, reason)).not.toBe('select-transactions');
      }
    }
  });

  it('returns null everywhere except the two payment steps', () => {
    for (const step of [
      null,
      'wait-for-connection',
      'select-transactions',
      'acknowledge-sign',
      'grace-period',
      'register-sign',
      'success',
    ] as const) {
      expect(txResignTargetStep(step, 'signature-invalidated')).toBeNull();
      expect(txResignTargetStep(step, 'window-closed')).toBeNull();
    }
  });
});

describe('resignNoticeForRecipient', () => {
  // The victim is about to be asked to sign again; the copy has to say so and has to be OURS.
  it('tells the recipient what is being asked and to verify it out of band', () => {
    for (const reason of ['signature-invalidated', 'window-closed'] as const) {
      for (const flow of ['wallet', 'transaction'] as const) {
        const text = resignNoticeForRecipient(reason, flow);
        expect(text).toMatch(/sign/i);
        expect(text).toMatch(/check with your relayer/i);
      }
    }
  });
});

describe('re-sign request bound', () => {
  it('caps how many times one flow will honour a request', () => {
    // Each honoured request is a wallet signing prompt the sender chose to trigger. The
    // number matters less than that it is finite and small.
    expect(MAX_RESIGN_REQUESTS).toBeGreaterThan(0);
    expect(MAX_RESIGN_REQUESTS).toBeLessThanOrEqual(3);
  });
});

/**
 * The receive-side schema for RESIGN_REQ, looked up the way `validateProtocolMessage` does.
 * Asserted present rather than optional-chained: an absent entry is the failure this whole
 * counterpart exists to fix, so it should fail loudly here.
 */
function resignSchema() {
  const schema = PROTOCOL_SCHEMAS[PROTOCOLS.RESIGN_REQ];
  expect(schema, 'RESIGN_REQ must have a registered protocol schema').toBeDefined();
  return schema!;
}

describe('sendResignRequest', () => {
  const connection = { remotePeer: 'peer' };

  beforeEach(() => {
    passStreamData.mockReset().mockResolvedValue(undefined);
    getPeerConnection.mockReset().mockResolvedValue(connection);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes the request to the partner on the re-sign protocol', async () => {
    const delivered = await sendResignRequest({
      getLibp2p: () => ({}) as never,
      partnerPeerId: 'peer',
      reason: 'window-closed',
      flow: 'wallet',
    });

    expect(delivered).toBe(true);
    expect(passStreamData).toHaveBeenCalledWith({
      connection,
      protocols: [PROTOCOLS.RESIGN_REQ],
      streamData: {
        success: false,
        reason: 'window-closed',
        message: resignRequestMessage('window-closed', 'wallet'),
      },
    });
  });

  // This is the whole point of the counterpart work: before it landed, the protocol was a
  // string this module invented, so negotiation failed and this always returned false. It
  // has to be a registered member of PROTOCOLS for a peer to have a handler mounted for it.
  it('sends on a protocol that is actually registered in @swr/p2p', () => {
    expect(PROTOCOLS.RESIGN_REQ).toBe('/swr/resign-request/1.0.0');
    expect(Object.values(PROTOCOLS)).toContain(PROTOCOLS.RESIGN_REQ);
  });

  // A payload the receiver's own validators reject is as undelivered as one that never
  // negotiated: `readStreamData` checks ParsedStreamDataSchema, then peerGuard checks the
  // per-protocol schema. Both must accept exactly what this module puts on the wire.
  it('sends a payload both receive-side validators accept', async () => {
    for (const reason of ['signature-invalidated', 'window-closed'] as const) {
      passStreamData.mockClear();
      await sendResignRequest({
        getLibp2p: () => ({}) as never,
        partnerPeerId: 'peer',
        reason,
        flow: 'transaction',
      });

      const sent = passStreamData.mock.calls[0]?.[0]?.streamData;
      expect(ParsedStreamDataSchema.safeParse(sent).success).toBe(true);
      expect(resignSchema().safeParse(sent).success).toBe(true);
      expect(parseResignReason(sent.reason)).toBe(reason);
    }
  });

  // Fail-closed on the receive side: a request with no reason, or one outside the enum, is
  // dropped by the protocol schema before any handler sees it.
  it('is rejected by the protocol schema without a valid reason', () => {
    const schema = resignSchema();
    expect(schema.safeParse({ success: false, message: 'please sign again' }).success).toBe(false);
    expect(schema.safeParse({ reason: 'whatever' }).success).toBe(false);
    expect(schema.safeParse({ reason: 'window-closed' }).success).toBe(true);
  });

  // The relayer's UI branches on this boolean to tell the user to contact their partner
  // out of band, so a failed send must report false rather than throw or resolve true.
  it('reports non-delivery instead of throwing when the peer cannot be reached', async () => {
    getPeerConnection.mockRejectedValue(new Error('unsupported protocol'));

    await expect(
      sendResignRequest({
        getLibp2p: () => ({}) as never,
        partnerPeerId: 'peer',
        reason: 'signature-invalidated',
        flow: 'transaction',
      })
    ).resolves.toBe(false);
    expect(passStreamData).not.toHaveBeenCalled();
  });

  it('reports non-delivery when there is no node or no partner', async () => {
    await expect(
      sendResignRequest({
        getLibp2p: () => null,
        partnerPeerId: 'peer',
        reason: 'signature-invalidated',
        flow: 'wallet',
      })
    ).resolves.toBe(false);

    await expect(
      sendResignRequest({
        getLibp2p: () => ({}) as never,
        partnerPeerId: null,
        reason: 'signature-invalidated',
        flow: 'wallet',
      })
    ).resolves.toBe(false);

    expect(getPeerConnection).not.toHaveBeenCalled();
  });
});

/**
 * The relayed pay steps must reach this decision through the classifier, not around it.
 *
 * `TxAcknowledgePayStep` used to compute `isError && isSignatureInvalidatingError(error)`
 * inline and hardcode `reason: 'signature-invalidated'` at the send site. That agreed with the
 * classifier — an acknowledgement step has no prior window to have closed, so the classifier
 * can only return that same reason there — but it was a second copy of "which reverts kill a
 * signature, and does recovery also discard the acknowledgement", which is exactly the decision
 * a future edit to `classifyP2PRetry` would silently miss in a file that does not call it.
 *
 * A source check rather than a render test because these components have none, so nothing else
 * would notice the copy coming back.
 */
describe('the relayed pay steps classify Retry through classifyP2PRetry', () => {
  const PAY_STEPS = [
    'steps/P2PAckPayStep.tsx',
    'steps/P2PRegPayStep.tsx',
    'tx-steps/TxAcknowledgePayStep.tsx',
    'tx-steps/TxRegisterPayStep.tsx',
  ];

  const dir = dirname(fileURLToPath(import.meta.url));
  const source = (file: string) => readFileSync(join(dir, file), 'utf8');

  it.each(PAY_STEPS)('%s calls classifyP2PRetry', (file) => {
    expect(source(file)).toContain('classifyP2PRetry({');
  });

  /**
   * `TxRegisterPayStep` is knowingly absent.
   *
   * It calls the classifier, but only INSIDE its P2P branch; the gate that opens that branch is
   * still its own inline `isError && isSignatureInvalidatingError(error)`. The two agree today
   * for the same reason every other pairing does, and rewiring it is a separate change with its
   * own blast radius — it also drives the non-P2P `windowClosed` recovery below the branch.
   * Listed here so its absence reads as a known gap rather than an oversight.
   */
  const GATES_ON_THE_CLASSIFIER = PAY_STEPS.filter(
    (file) => file !== 'tx-steps/TxRegisterPayStep.tsx'
  );

  it.each(GATES_ON_THE_CLASSIFIER)('%s does not decide invalidation itself', (file) => {
    expect(source(file)).not.toMatch(/isError && isSignatureInvalidatingError\(error\)/);
  });

  // The transaction acknowledgement step now takes the wire `reason` off the classifier result
  // rather than writing the literal at the send site, so a classifier that grows a third reason
  // reaches the peer instead of being flattened here.
  it('TxAcknowledgePayStep takes the wire reason from the classifier', () => {
    const text = source('tx-steps/TxAcknowledgePayStep.tsx');
    expect(text).toContain('reason: retryAction.reason');
    expect(text).not.toMatch(/reason: '(signature-invalidated|window-closed)'/);
  });
});
