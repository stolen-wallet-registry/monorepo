/**
 * Message queue with retry for P2P stream messages.
 *
 * Queues failed messages and retries them after reconnection.
 */

import type { Libp2p, Connection } from '@libp2p/interface';

import { logger } from '@/lib/logger';
import { passStreamData, getPeerConnection } from './libp2p';
import { reconnectToPeer } from './reconnect';
import type { ParsedStreamData } from './types';

/** Maximum messages to queue */
const MAX_QUEUE_SIZE = 10;

/** Maximum age of a queued message in ms (5 minutes) */
const MAX_MESSAGE_AGE_MS = 5 * 60 * 1000;

/** Maximum retry attempts per message */
const MAX_MESSAGE_RETRIES = 3;

export interface QueuedMessage {
  /** Unique message ID */
  id: string;
  /** Protocol(s) to send on */
  protocols: string[];
  /** Message data */
  data: ParsedStreamData;
  /** Number of retry attempts */
  retries: number;
  /** When the message was queued */
  createdAt: number;
  /** Last error message */
  lastError?: string;
}

export interface MessageQueueState {
  /** Queued messages */
  messages: QueuedMessage[];
  /** Whether currently processing the queue */
  isProcessing: boolean;
  /** Last processing error */
  lastError: string | null;
}

export interface SendWithRetryOptions {
  /** libp2p node instance */
  libp2p: Libp2p;
  /** Remote peer ID to send to */
  remotePeerId: string;
  /** Protocol(s) to use */
  protocols: string[];
  /** Data to send */
  streamData: ParsedStreamData;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Callback when message is queued for retry */
  onQueued?: (message: QueuedMessage) => void;
  /** Callback when message fails after all retries */
  onFailed?: (message: QueuedMessage, error: Error) => void;
  /** Callback when message is successfully sent */
  onSuccess?: () => void;
}

/**
 * Simple in-memory message queue.
 * Persisting to localStorage is avoided because messages contain sensitive data.
 */
class MessageQueue {
  private messages: QueuedMessage[] = [];
  private isProcessing = false;

  /**
   * Add a message to the queue.
   */
  add(message: Omit<QueuedMessage, 'id' | 'retries' | 'createdAt'>): QueuedMessage {
    // Remove old messages
    this.cleanup();

    // Check queue size
    if (this.messages.length >= MAX_QUEUE_SIZE) {
      // Remove oldest message
      const removed = this.messages.shift();
      if (removed) {
        logger.p2p.warn('Message queue full, removing oldest message', {
          removedId: removed.id,
          queueSize: this.messages.length,
        });
      }
    }

    const queuedMessage: QueuedMessage = {
      ...message,
      id: `msg-${crypto.randomUUID()}`,
      retries: 0,
      createdAt: Date.now(),
    };

    this.messages.push(queuedMessage);

    logger.p2p.info('Message queued for retry', {
      id: queuedMessage.id,
      protocols: queuedMessage.protocols,
      queueSize: this.messages.length,
    });

    return queuedMessage;
  }

  /**
   * Remove a message from the queue.
   */
  remove(id: string): void {
    this.messages = this.messages.filter((m) => m.id !== id);
  }

  /**
   * Get all pending messages.
   */
  getAll(): QueuedMessage[] {
    this.cleanup();
    return [...this.messages];
  }

  /**
   * Get queue size.
   */
  size(): number {
    return this.messages.length;
  }

  /**
   * Clear all messages.
   */
  clear(): void {
    this.messages = [];
  }

  /**
   * Increment retry count for a message.
   */
  incrementRetries(id: string, error?: string): void {
    const message = this.messages.find((m) => m.id === id);
    if (message) {
      message.retries++;
      message.lastError = error;
    }
  }

  /**
   * Remove expired messages.
   */
  private cleanup(): void {
    const now = Date.now();
    const before = this.messages.length;
    this.messages = this.messages.filter((m) => now - m.createdAt < MAX_MESSAGE_AGE_MS);

    const removed = before - this.messages.length;
    if (removed > 0) {
      logger.p2p.debug('Cleaned up expired messages', { removed });
    }
  }

  /**
   * Process all queued messages.
   */
  async processAll(
    libp2p: Libp2p,
    remotePeerId: string,
    onMessageProcessed?: (message: QueuedMessage, success: boolean) => void
  ): Promise<{ processed: number; failed: number }> {
    if (this.isProcessing) {
      logger.p2p.debug('Queue already being processed');
      return { processed: 0, failed: 0 };
    }

    this.isProcessing = true;
    let processed = 0;
    let failed = 0;

    try {
      const messages = this.getAll();

      if (messages.length === 0) {
        return { processed: 0, failed: 0 };
      }

      logger.p2p.info('Processing message queue', { count: messages.length });

      // Get or establish connection
      let connection: Connection;
      try {
        connection = await getPeerConnection({ libp2p, remotePeerId });
      } catch (err) {
        logger.p2p.warn('Cannot get connection for queue processing', {
          error: err instanceof Error ? err.message : 'Unknown error',
        });
        return { processed: 0, failed: messages.length };
      }

      for (const message of messages) {
        try {
          await passStreamData({
            connection,
            protocols: message.protocols,
            streamData: message.data,
          });

          this.remove(message.id);
          processed++;
          onMessageProcessed?.(message, true);

          logger.p2p.info('Queued message sent successfully', {
            id: message.id,
            protocols: message.protocols,
          });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          this.incrementRetries(message.id, errorMsg);

          // After incrementRetries, message.retries is already updated
          if (message.retries >= MAX_MESSAGE_RETRIES) {
            this.remove(message.id);
            failed++;
            onMessageProcessed?.(message, false);
            logger.p2p.error('Queued message failed after max retries', {
              id: message.id,
              retries: message.retries,
            });
          } else {
            logger.p2p.warn('Queued message send failed, will retry', {
              id: message.id,
              retries: message.retries,
              error: errorMsg,
            });
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return { processed, failed };
  }
}

// Singleton instance
const messageQueue = new MessageQueue();

/**
 * Send data to a peer with automatic retry on failure.
 *
 * If the send fails, the message is queued for retry when the connection
 * is re-established.
 *
 * @example
 * ```typescript
 * await sendWithRetry({
 *   libp2p,
 *   remotePeerId: partnerPeerId,
 *   protocols: [PROTOCOLS.ACK_PAY],
 *   streamData: { hash: txHash, success: true },
 *   onQueued: (msg) => setQueuedMessages(prev => [...prev, msg]),
 *   onFailed: (msg, err) => setError(`Failed to send: ${err.message}`),
 *   onSuccess: () => goToNextStep(),
 * });
 * ```
 */
export async function sendWithRetry({
  libp2p,
  remotePeerId,
  protocols,
  streamData,
  maxRetries = MAX_MESSAGE_RETRIES,
  onQueued,
  onFailed,
  onSuccess,
}: SendWithRetryOptions): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Try to get or establish connection
      const connection = await getPeerConnection({ libp2p, remotePeerId });

      // Try to send
      await passStreamData({
        connection,
        protocols,
        streamData,
      });

      // Success!
      onSuccess?.();
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Unknown error');

      logger.p2p.warn('Send attempt failed', {
        attempt: attempt + 1,
        maxRetries,
        error: lastError.message,
      });

      // On first failure, try to reconnect
      if (attempt === 0) {
        const { result } = await reconnectToPeer(libp2p, remotePeerId);
        if (!result.success) {
          // Connection truly lost - queue the message
          const queued = messageQueue.add({
            protocols,
            data: streamData,
          });
          onQueued?.(queued);
          return;
        }
        // Reconnected successfully, loop will retry
      }
    }
  }

  // All retries exhausted - queue for later
  const queued = messageQueue.add({
    protocols,
    data: streamData,
    lastError: lastError?.message,
  });
  onQueued?.(queued);
  onFailed?.(queued, lastError ?? new Error('All retries exhausted'));
}

/**
 * Process all queued messages.
 *
 * Call this after reconnecting to flush the queue.
 */
export async function processMessageQueue(
  libp2p: Libp2p,
  remotePeerId: string,
  onMessageProcessed?: (message: QueuedMessage, success: boolean) => void
): Promise<{ processed: number; failed: number }> {
  return messageQueue.processAll(libp2p, remotePeerId, onMessageProcessed);
}

/**
 * Get all pending messages in the queue.
 */
export function getPendingMessages(): QueuedMessage[] {
  return messageQueue.getAll();
}

/**
 * Get the number of pending messages.
 */
export function getPendingMessageCount(): number {
  return messageQueue.size();
}

/**
 * Clear all pending messages.
 */
export function clearMessageQueue(): void {
  messageQueue.clear();
}
