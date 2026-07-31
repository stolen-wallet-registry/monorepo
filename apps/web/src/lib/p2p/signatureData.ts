/**
 * Validation of signature payloads a relayer receives over P2P.
 *
 * A presence check is not enough here: this data becomes the arguments of a transaction the
 * relayer pays for. A signature of the wrong length, an address that is not an address, or a
 * signature minted for a different chain all produce a transaction that reverts after the
 * relayer has already spent gas.
 *
 * The protocol schema gate in `peerGuard.validateProtocolMessage` runs first and enforces the
 * wire shape (bytes32 fields, array parity, address regex). What is added here is what the
 * schema cannot know: the chain the relayer is actually about to submit on, and the numeric
 * strings being safe to hand to `BigInt()`.
 */

import type { ParsedStreamData } from '@swr/p2p';
import { logger } from '@/lib/logger';
import { isAddress } from '@/lib/types/ethereum';
import type { Address } from '@/lib/types/ethereum';

/** A 65-byte ECDSA signature: 0x + 130 hex characters. */
export const SIGNATURE_HEX = /^0x[0-9a-fA-F]{130}$/;

/** A decimal integer with no sign, exponent, or padding — safe to hand to BigInt(). */
export const DECIMAL_UINT = /^(0|[1-9][0-9]{0,77})$/;

/** A bytes32 hex string: 0x + 64 hex characters. */
const BYTES32_HEX = /^0x[0-9a-fA-F]{64}$/;

/** Largest batch the transaction flow will relay — mirrors the wire schema's cap. */
const MAX_BATCH_SIZE = 100;

/**
 * Shared checks over the `signature` envelope both flows send.
 *
 * @param data - Decoded stream message
 * @param expectedChainId - Chain the relayer is about to submit on
 */
function hasValidSignatureEnvelope(
  data: ParsedStreamData,
  expectedChainId: number
): data is ParsedStreamData & { signature: NonNullable<ParsedStreamData['signature']> } {
  const sig = data.signature;
  if (!sig) return false;

  if (!isAddress(sig.address)) {
    logger.p2p.warn('Signature rejected: address is not a valid Ethereum address', {
      address: sig.address,
    });
    return false;
  }

  if (typeof sig.value !== 'string' || !SIGNATURE_HEX.test(sig.value)) {
    logger.p2p.warn('Signature rejected: value is not a 65-byte hex signature', {
      length: typeof sig.value === 'string' ? sig.value.length : null,
    });
    return false;
  }

  if (sig.chainId !== expectedChainId) {
    logger.p2p.warn('Signature rejected: signed for a different chain', {
      signatureChainId: sig.chainId,
      expectedChainId,
    });
    return false;
  }

  // deadline and nonce are BigInt-coerced by the caller; reject anything BigInt() would throw on.
  if (typeof sig.deadline !== 'string' || !DECIMAL_UINT.test(sig.deadline)) {
    logger.p2p.warn('Signature rejected: deadline is not a plain decimal integer');
    return false;
  }
  if (typeof sig.nonce !== 'string' || !DECIMAL_UINT.test(sig.nonce)) {
    logger.p2p.warn('Signature rejected: nonce is not a plain decimal integer');
    return false;
  }

  // Registration-only anti-phishing commitment. Optional on the wire because acknowledgement
  // signatures carry none, but if either half is present both must be well-formed: the relayer
  // submits `windowBlock` as calldata and rebuilds the digest from `windowBlockHash`, so a
  // malformed pair is a transaction that reverts after the gas is spent.
  if (sig.windowBlock != null && !DECIMAL_UINT.test(sig.windowBlock)) {
    logger.p2p.warn('Signature rejected: windowBlock is not a plain decimal integer', {
      windowBlock: sig.windowBlock,
    });
    return false;
  }
  if (sig.windowBlockHash != null && !BYTES32_HEX.test(sig.windowBlockHash)) {
    logger.p2p.warn('Signature rejected: windowBlockHash is not bytes32');
    return false;
  }
  if ((sig.windowBlock == null) !== (sig.windowBlockHash == null)) {
    logger.p2p.warn('Signature rejected: windowBlock and windowBlockHash must travel together');
    return false;
  }

  return true;
}

/**
 * Validate a wallet-flow signature payload for the chain we are on.
 *
 * @param data - Decoded stream message
 * @param expectedChainId - Chain the relayer is about to submit on
 */
export function isValidSignatureData(
  data: ParsedStreamData,
  expectedChainId: number
): data is ParsedStreamData & {
  // `address` narrows to `Address` because this function proves it with `isAddress` below.
  // Without the narrowing every caller has to re-validate or assert something already
  // checked here — and asserting is how an unchecked wire value ends up used as a signer.
  signature: Omit<NonNullable<ParsedStreamData['signature']>, 'address'> & { address: Address };
} {
  if (!hasValidSignatureEnvelope(data, expectedChainId)) return false;

  const sig = data.signature;

  // Optional extended fields. `reportedChainId` here is a DECIMAL chain ID, not a bytes32
  // hash: the wallet contracts take `uint64 reportedChainId`, and the sender ships
  // `BigInt(chainId).toString()`. Only the transaction flow hashes it to a bytes32 CAIP-2
  // reference — see isValidTxSignatureData. Validating this one as bytes32 rejected every
  // relayed wallet signature.
  if (sig.reportedChainId != null && !DECIMAL_UINT.test(sig.reportedChainId)) {
    logger.p2p.warn('Signature rejected: reportedChainId is not a plain decimal integer', {
      reportedChainId: sig.reportedChainId,
    });
    return false;
  }
  if (sig.incidentTimestamp != null && !DECIMAL_UINT.test(sig.incidentTimestamp)) {
    logger.p2p.warn('Signature rejected: incidentTimestamp is not a plain decimal integer', {
      incidentTimestamp: sig.incidentTimestamp,
    });
    return false;
  }

  return true;
}

/**
 * Validate a transaction-flow signature payload plus its batch for the chain we are on.
 *
 * This used to be a presence-only check (`!!data.signature?.value && ...`), which accepted a
 * signature of any length, an address that is not an address, and — critically — a signature
 * minted for a different chain, all of which the relayer then paid gas to submit.
 *
 * @param data - Decoded stream message
 * @param expectedChainId - Chain the relayer is about to submit on
 */
export function isValidTxSignatureData(
  data: ParsedStreamData,
  expectedChainId: number
): data is ParsedStreamData & {
  signature: NonNullable<ParsedStreamData['signature']>;
  transactionBatch: NonNullable<ParsedStreamData['transactionBatch']>;
} {
  if (!hasValidSignatureEnvelope(data, expectedChainId)) return false;

  const batch = data.transactionBatch;
  if (!batch) {
    logger.p2p.warn('Transaction signature rejected: no transaction batch attached');
    return false;
  }

  if (typeof batch.dataHash !== 'string' || !BYTES32_HEX.test(batch.dataHash)) {
    logger.p2p.warn('Transaction signature rejected: dataHash is not bytes32');
    return false;
  }

  if (typeof batch.reportedChainId !== 'string' || !BYTES32_HEX.test(batch.reportedChainId)) {
    logger.p2p.warn('Transaction signature rejected: reportedChainId is not bytes32');
    return false;
  }

  if (
    !Number.isInteger(batch.transactionCount) ||
    batch.transactionCount <= 0 ||
    batch.transactionCount > MAX_BATCH_SIZE
  ) {
    logger.p2p.warn('Transaction signature rejected: transactionCount out of range', {
      transactionCount: batch.transactionCount,
    });
    return false;
  }

  if (!Array.isArray(batch.transactionHashes) || !Array.isArray(batch.chainIdHashes)) {
    logger.p2p.warn('Transaction signature rejected: batch arrays missing');
    return false;
  }

  // The relayer submits exactly these arrays. A length disagreement with transactionCount is
  // the reporter and the signed dataHash describing different batches.
  if (
    batch.transactionHashes.length !== batch.transactionCount ||
    batch.chainIdHashes.length !== batch.transactionCount
  ) {
    logger.p2p.warn('Transaction signature rejected: batch length does not match count', {
      transactionCount: batch.transactionCount,
      transactionHashes: batch.transactionHashes.length,
      chainIdHashes: batch.chainIdHashes.length,
    });
    return false;
  }

  if (
    !batch.transactionHashes.every((h) => typeof h === 'string' && BYTES32_HEX.test(h)) ||
    !batch.chainIdHashes.every((h) => typeof h === 'string' && BYTES32_HEX.test(h))
  ) {
    logger.p2p.warn('Transaction signature rejected: batch contains a non-bytes32 entry');
    return false;
  }

  return true;
}
