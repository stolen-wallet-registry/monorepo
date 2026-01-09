/**
 * Bridge message ID extraction utilities.
 *
 * Extracts cross-chain message IDs from transaction receipts.
 * Uses the official Hyperlane SDK for reliable message parsing.
 *
 * NOTE: Further cross-chain development (Solana, etc.) may require
 * additional SDK integration. See @hyperlane-xyz/sdk for:
 * - MultiProvider chain management
 * - HyperlaneCore message handling
 * - InterchainGasPaymaster fee estimation
 * - Cross-chain token transfers (Warp Routes)
 */

import { HyperlaneCore } from '@hyperlane-xyz/sdk';
import type { Log, TransactionReceipt } from 'viem';
import type { Hash } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';
import type { BridgeProvider } from '@/lib/explorer';

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
export function extractBridgeMessageIdFromReceipt(
  receipt: TransactionReceipt,
  provider: BridgeProvider = 'hyperlane'
): Hash | null {
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
export function extractBridgeMessageId(
  logs: Log[],
  provider: BridgeProvider = 'hyperlane'
): Hash | null {
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
 */
function extractHyperlaneMessageIdFromReceipt(receipt: TransactionReceipt): Hash | null {
  try {
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
 */
function extractHyperlaneMessageId(logs: Log[]): Hash | null {
  try {
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
export function hasBridgeMessage(logs: Log[], provider: BridgeProvider = 'hyperlane'): boolean {
  return extractBridgeMessageId(logs, provider) !== null;
}
