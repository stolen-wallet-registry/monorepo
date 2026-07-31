/**
 * Bridge message ID extraction utilities.
 *
 * Extracts cross-chain message IDs from transaction receipts using viem, with no bridge SDK.
 *
 * WHY NOT @hyperlane-xyz/sdk (audit V30): this file previously dynamically imported the
 * Hyperlane SDK solely to call `HyperlaneCore.getDispatchedMessages(receipt)`. That one call
 * pulled protobufjs, @aws-sdk/client-s3, cosmjs, axios, h3, ws and bigint-buffer into the
 * page — ~15MB, and 30 of 39 apps/web high advisories plus all three browser-side criticals
 * sat under it. None of those was exploitable here (protobufjs code-exec needs an
 * attacker-controlled descriptor, fast-xml-parser needs attacker XML, and we decode an event
 * out of a receipt we already trust), so this is surface-area reduction rather than an
 * incident response. The decode itself is four lines of viem.
 *
 * The replacement is byte-identical to the SDK by construction. `HyperlaneCore` did:
 *   1. match logs against the Mailbox `Dispatch` event (topic only — any emitting address),
 *   2. take `log.args.message`,
 *   3. `id = messageId(message)`, which is `solidityKeccak256(['bytes'], [message])`.
 * Steps 1-3 below are the same three operations, and the equivalence was verified against the
 * real SDK on shared fixtures before the dependency was removed (see messageId.test.ts).
 */

import { parseEventLogs, keccak256, parseAbiItem } from 'viem';
import type { Log } from 'viem';
import type { Hash } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';
import type { BridgeProvider } from '@swr/chains';

/**
 * Hyperlane Mailbox `Dispatch`, the event that carries the full outbound message.
 *
 * Field order and indexing are load-bearing: they determine topic0, so a transcription error
 * here means every lookup silently returns null rather than failing loudly. Taken from the
 * vendored interface at
 * `packages/contracts/src/vendor/hyperlane/contracts/interfaces/IMailbox.sol:20`.
 */
export const DISPATCH_EVENT = parseAbiItem(
  'event Dispatch(address indexed sender, uint32 indexed destination, bytes32 indexed recipient, bytes message)'
);

/**
 * Hyperlane Mailbox `DispatchId`, emitted alongside `Dispatch` with the same message's ID.
 *
 * Only used as a cross-check. The ID we return is always derived from `Dispatch`, matching
 * what the SDK did, but the Mailbox publishes the same value here — so if the two ever
 * disagree, our decode is wrong and we want that in the logs rather than in a user's
 * explorer link.
 */
export const DISPATCH_ID_EVENT = parseAbiItem('event DispatchId(bytes32 indexed messageId)');

/**
 * Extract bridge message ID from transaction logs.
 *
 * @param logs - Transaction receipt logs (viem format)
 * @param provider - Bridge provider to look for (default: hyperlane)
 * @returns The message ID or null if not found
 */
export async function extractBridgeMessageId(
  logs: Log[],
  provider: BridgeProvider = 'hyperlane'
): Promise<Hash | null> {
  if (provider === 'hyperlane') {
    return extractHyperlaneMessageId(logs);
  }

  logger.registration.warn('Unknown bridge provider for message extraction', { provider });
  return null;
}

/**
 * Extract the Hyperlane message ID from a logs array.
 *
 * Kept `async` although nothing awaits: three call sites await this, and the signature is the
 * contract with them. Returns null rather than throwing — a missing message ID costs the user
 * an explorer link, not the registration, which has already been confirmed on chain by the
 * time this runs.
 */
async function extractHyperlaneMessageId(logs: Log[]): Promise<Hash | null> {
  try {
    // Matched on the event topic across every log, without pinning the Mailbox address —
    // the SDK did the same, and the emitting Mailbox differs per chain.
    const dispatched = parseEventLogs({ abi: [DISPATCH_EVENT], logs });

    const first = dispatched[0];
    if (!first) {
      logger.registration.debug('No Hyperlane Dispatch events found in logs', {
        logCount: logs.length,
      });
      return null;
    }

    // messageId = keccak256(message). `solidityKeccak256(['bytes'], [message])` in the SDK is
    // the same hash: a lone dynamic `bytes` is packed as its raw contents, unpadded.
    const messageId = keccak256(first.args.message);

    verifyAgainstDispatchId(logs, messageId);

    logger.registration.info('Extracted Hyperlane message ID', {
      messageId,
      messageCount: dispatched.length,
    });
    return messageId;
  } catch (error) {
    logger.registration.warn('Failed to parse Hyperlane messages', {
      error: error instanceof Error ? error.message : String(error),
      logCount: logs.length,
    });
    return null;
  }
}

/**
 * Warn if the Mailbox's own `DispatchId` disagrees with the ID we derived.
 *
 * Never throws and never changes the returned value: a cross-check that could break the happy
 * path would be worse than the problem it detects. Absence of `DispatchId` is not a failure —
 * only a present-and-different value is.
 */
function verifyAgainstDispatchId(logs: Log[], derivedId: Hash): void {
  try {
    const idLogs = parseEventLogs({ abi: [DISPATCH_ID_EVENT], logs });
    const first = idLogs[0];
    if (!first) return;

    if (first.args.messageId.toLowerCase() !== derivedId.toLowerCase()) {
      logger.registration.warn('Derived message ID disagrees with the Mailbox DispatchId event', {
        derivedId,
        dispatchId: first.args.messageId,
      });
    }
  } catch {
    // Cross-check only; a malformed DispatchId log must not affect the result.
  }
}
