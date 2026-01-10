/**
 * Bridge message ID extraction utilities.
 *
 * Extracts cross-chain message IDs from transaction receipts.
 * Uses the official Hyperlane SDK for reliable message parsing.
 *
 * NOTE: The Hyperlane SDK is dynamically imported to reduce main bundle size.
 * The SDK is ~15MB and only needed when extracting cross-chain message IDs.
 *
 * Further cross-chain development (Solana, etc.) may require
 * additional SDK integration. See @hyperlane-xyz/sdk for:
 * - MultiProvider chain management
 * - HyperlaneCore message handling
 * - InterchainGasPaymaster fee estimation
 * - Cross-chain token transfers (Warp Routes)
 */

import type { Log, TransactionReceipt } from 'viem';
import type { Hash } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';
import type { BridgeProvider } from '@swr/chains';

/**
 * Extract bridge message ID from transaction receipt.
 *
 * Uses the Hyperlane SDK's HyperlaneCore.getDispatchedMessages() for reliable
 * extraction of message IDs from Mailbox Dispatch events.
 *
 * @param receipt - Transaction receipt (viem format)
 * @param provider - Bridge provider to look for (default: hyperlane)
 * @returns The message ID or null if not found
 */
export async function extractBridgeMessageIdFromReceipt(
  receipt: TransactionReceipt,
  provider: BridgeProvider = 'hyperlane'
): Promise<Hash | null> {
  if (provider === 'hyperlane') {
    return extractHyperlaneMessageIdFromReceipt(receipt);
  }

  // Add other providers here as needed
  // if (provider === 'wormhole') return extractWormholeMessageId(receipt);
  // if (provider === 'ccip') return extractCcipMessageId(receipt);

  logger.registration.warn('Unknown bridge provider for message extraction', { provider });
  return null;
}

/**
 * Extract bridge message ID from transaction logs.
 *
 * Convenience wrapper that builds a minimal receipt from logs.
 * Prefer extractBridgeMessageIdFromReceipt when full receipt is available.
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
 * Extract Hyperlane message ID from full transaction receipt using SDK.
 *
 * The SDK's HyperlaneCore.getDispatchedMessages handles:
 * - Finding Dispatch events from Mailbox contract
 * - Decoding the message body
 * - Computing the message ID (keccak256 of encoded message)
 *
 * NOTE: SDK is dynamically imported to reduce main bundle size (~2-3MB savings).
 */
async function extractHyperlaneMessageIdFromReceipt(
  receipt: TransactionReceipt
): Promise<Hash | null> {
  try {
    // Dynamic import to avoid bundling the heavy SDK in main chunk
    const { HyperlaneCore } = await import('@hyperlane-xyz/sdk');

    // HyperlaneCore.getDispatchedMessages accepts viem TransactionReceipt directly
    const messages = HyperlaneCore.getDispatchedMessages(receipt);

    if (messages.length > 0) {
      const messageId = messages[0].id as Hash;
      logger.registration.info('Extracted Hyperlane message ID via SDK', {
        messageId,
        messageCount: messages.length,
      });
      return messageId;
    }

    logger.registration.debug('No Hyperlane Dispatch events found in receipt', {
      logCount: receipt.logs.length,
    });
    return null;
  } catch (error) {
    logger.registration.warn('Failed to parse Hyperlane messages from receipt', {
      error: error instanceof Error ? error.message : String(error),
      logCount: receipt.logs.length,
    });
    return null;
  }
}

/**
 * Extract Hyperlane message ID from logs array.
 *
 * Builds a minimal receipt structure for SDK compatibility.
 * NOTE: SDK is dynamically imported to reduce main bundle size (~2-3MB savings).
 */
async function extractHyperlaneMessageId(logs: Log[]): Promise<Hash | null> {
  try {
    // Dynamic import to avoid bundling the heavy SDK in main chunk
    const { HyperlaneCore } = await import('@hyperlane-xyz/sdk');

    // Build minimal receipt-like structure for SDK
    // The SDK only needs the logs array with proper typing
    const minimalReceipt = { logs } as TransactionReceipt;
    const messages = HyperlaneCore.getDispatchedMessages(minimalReceipt);

    if (messages.length > 0) {
      const messageId = messages[0].id as Hash;
      logger.registration.info('Extracted Hyperlane message ID via SDK', {
        messageId,
        messageCount: messages.length,
      });
      return messageId;
    }

    logger.registration.debug('No Hyperlane Dispatch events found in logs', {
      logCount: logs.length,
    });
    return null;
  } catch (error) {
    logger.registration.warn('Failed to parse Hyperlane messages', {
      error: error instanceof Error ? error.message : String(error),
      logCount: logs.length,
    });
    return null;
  }
}

/**
 * Check if transaction logs contain a bridge message dispatch.
 */
export async function hasBridgeMessage(
  logs: Log[],
  provider: BridgeProvider = 'hyperlane'
): Promise<boolean> {
  const messageId = await extractBridgeMessageId(logs, provider);
  return messageId !== null;
}
