/**
 * Store a signature received over P2P and move the relayer to its payment step.
 *
 * Lives outside the page because it is protocol logic, not page logic: it decides whether a
 * payload the relayer just received is one it is willing to act on, and that decision is worth
 * testing without standing up a libp2p node or rendering a route.
 */

import type { Connection } from '@libp2p/interface';

import { passStreamData, isValidSignatureData, type ParsedStreamData } from '@/lib/p2p';
import { storeSignature, SIGNATURE_STEP, type StoredSignature } from '@/lib/signatures';
import { isSameAddress } from '@/lib/p2p/pairingToken';
import { useP2PStore } from '@/stores/p2pStore';
import { logger } from '@/lib/logger';
import type { Address, Hash, Hex } from '@/lib/types/ethereum';

/**
 * Process a received signature: validate, store, confirm receipt, and advance step.
 *
 * Exported for testing — the pairing check below is the only thing standing between a bound
 * partner and a silently unrecoverable flow, and it is worth pinning without a libp2p node.
 */
export async function processSignature(
  data: ParsedStreamData,
  connection: Connection,
  expectedChainId: number,
  step: typeof SIGNATURE_STEP.ACKNOWLEDGEMENT | typeof SIGNATURE_STEP.REGISTRATION,
  receiptProtocol: string,
  trustedForwarder: Address,
  goToNextStep: () => void
): Promise<boolean> {
  if (!isValidSignatureData(data, expectedChainId)) {
    logger.p2p.warn(
      `Received malformed ${step === SIGNATURE_STEP.ACKNOWLEDGEMENT ? 'ACK' : 'REG'} signature data`,
      { data }
    );
    return false;
  }

  const sig = data.signature;

  // The signature must be FOR the wallet named in the pairing code, and nothing else.
  //
  // `storeSignature` keys by `sig.address`, but every pay step retrieves by `registeree` —
  // which is `pairedWallet`. Storing a mismatched address therefore files the signature under a
  // key nothing reads, and advancing anyway strands the relayer on a payment step showing
  // "Waiting for signature from registeree…" forever, with only a log line to explain it.
  // Payment stays gated by `useRelayedWalletSignatureReview` either way, so this is a denial of
  // the flow rather than a wrong payment — but it is silent and needs a restart to escape.
  //
  // Fails closed with no pairing at all: there is then no wallet to check against, and that is
  // precisely the state in which anything would be accepted.
  const pairedWallet = useP2PStore.getState().pairedWallet;
  if (!pairedWallet || !isSameAddress(sig.address, pairedWallet)) {
    logger.p2p.warn('Rejected relayed signature that is not for the paired wallet', {
      claimed: sig.address,
      paired: pairedWallet,
    });
    return false;
  }

  let stored: StoredSignature;
  try {
    stored = {
      signature: sig.value as Hex,
      deadline: BigInt(sig.deadline),
      nonce: BigInt(sig.nonce),
      address: sig.address,
      chainId: sig.chainId,
      step,
      storedAt: Date.now(),
      // The registeree signed over this relayer as the forwarder, so record it. `getSignature`
      // treats a missing trustedForwarder as a mismatch when a forwarder is expected, and the
      // pay steps always pass one — without this the relayer could never retrieve what it just
      // stored.
      trustedForwarder,
      reportedChainId: sig.reportedChainId != null ? BigInt(sig.reportedChainId) : undefined,
      incidentTimestamp: sig.incidentTimestamp != null ? BigInt(sig.incidentTimestamp) : undefined,
      // Registration only: the block the registeree's signature committed to. The relayer
      // submits it verbatim — it cannot be re-derived here, since the chain has moved on.
      windowBlock: sig.windowBlock != null ? BigInt(sig.windowBlock) : undefined,
      windowBlockHash: sig.windowBlockHash != null ? (sig.windowBlockHash as Hash) : undefined,
    };
  } catch (e) {
    logger.p2p.warn('Failed to parse signature fields as BigInt', { error: e, data });
    return false;
  }
  storeSignature(stored);

  // Confirm receipt
  await passStreamData({
    connection,
    protocols: [receiptProtocol],
    streamData: { success: true, message: 'Signature received' },
  });

  logger.p2p.info(
    `${step === SIGNATURE_STEP.ACKNOWLEDGEMENT ? 'ACK' : 'REG'} signature stored, advancing to payment`
  );
  goToNextStep();
  return true;
}
