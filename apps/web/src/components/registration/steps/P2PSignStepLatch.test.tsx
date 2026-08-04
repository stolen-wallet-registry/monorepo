/**
 * The sign steps must record that they produced a signature (audit V3, ordering half).
 *
 * `ACK_REC` / `REG_REC` are payload-free receipts. Gating them on "did we actually send the
 * thing you claim to have received" only works if the sign step reports it — otherwise the gate
 * is permanently shut and the flow deadlocks instead of being walked forward. This pins the
 * reporting half; `sentSignatureLatch.test.ts` pins the gate.
 *
 * `useP2PSignFlow` is mocked because the real one needs a wallet, a contract read and a libp2p
 * node. What is under test is the component's reaction to a signature existing, which is
 * exactly what the mock controls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@/test/test-utils';

import { P2PAckSignStep } from './P2PAckSignStep';
import { P2PRegSignStep } from './P2PRegSignStep';
import { hasSentSignature, resetSentSignatures } from '@/hooks/p2p/sentSignatureLatch';
import type { Hex } from '@/lib/types/ethereum';

const signFlow = {
  status: 'idle' as const,
  errorMessage: null as string | null,
  signature: null as Hex | null,
  isLoading: false,
  isReady: true,
  hashData: { deadline: 1_800_000_000n },
  nonce: 0n,
  registeree: '0x1111111111111111111111111111111111111111',
  relayer: '0x2222222222222222222222222222222222222222',
  chainId: 31337,
  handleSign: vi.fn(),
};

vi.mock('@/hooks/useP2PSignFlow', () => ({
  useP2PSignFlow: () => signFlow,
}));

const SIGNATURE = `0x${'ab'.repeat(65)}` as Hex;

beforeEach(() => {
  resetSentSignatures();
  signFlow.signature = null;
  signFlow.status = 'idle';
});

describe('P2P sign steps record what they sent', () => {
  it('does not latch the acknowledgement before a signature exists', () => {
    render(<P2PAckSignStep getLibp2p={() => null} />);

    expect(hasSentSignature('wallet-ack')).toBe(false);
  });

  it('latches the acknowledgement once the signature exists', () => {
    signFlow.signature = SIGNATURE;
    render(<P2PAckSignStep getLibp2p={() => null} />);

    expect(hasSentSignature('wallet-ack')).toBe(true);
    // Strictly the acknowledgement — a receipt for the registration must not ride on it.
    expect(hasSentSignature('wallet-reg')).toBe(false);
  });

  it('does not latch the registration before a signature exists', () => {
    render(<P2PRegSignStep getLibp2p={() => null} />);

    expect(hasSentSignature('wallet-reg')).toBe(false);
  });

  it('latches the registration once the signature exists', () => {
    signFlow.signature = SIGNATURE;
    render(<P2PRegSignStep getLibp2p={() => null} />);

    expect(hasSentSignature('wallet-reg')).toBe(true);
  });
});
