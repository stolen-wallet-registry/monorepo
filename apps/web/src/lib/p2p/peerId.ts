/**
 * Persistent Peer ID management.
 *
 * Stores Ed25519 keypairs in localStorage keyed by wallet address.
 * Same wallet + browser = same peer ID across sessions.
 */

import { privateKeyFromProtobuf, privateKeyToProtobuf, generateKeyPair } from '@libp2p/crypto/keys';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import type { PeerId, PrivateKey } from '@libp2p/interface';
import { fromString, toString } from 'uint8arrays';

import { logger } from '@/lib/logger';

/** Storage key prefix for peer ID keypairs */
const STORAGE_KEY_PREFIX = 'swr-p2p-keypair-';

export interface PersistentPeerIdResult {
  peerId: PeerId;
  privateKey: PrivateKey;
}

/**
 * Get or create a persistent private key and peer ID for a wallet address.
 *
 * If a keypair exists in localStorage for this wallet, it will be restored.
 * Otherwise, a new Ed25519 keypair is generated and persisted.
 *
 * @param walletAddress - The connected wallet address
 * @returns The private key and derived PeerId that will be the same across sessions
 */
export async function getOrCreatePeerId(walletAddress: string): Promise<PersistentPeerIdResult> {
  const storageKey = `${STORAGE_KEY_PREFIX}${walletAddress.toLowerCase()}`;

  // Try to restore existing keypair
  const stored = localStorage.getItem(storageKey);
  if (stored) {
    try {
      const privateKeyBytes = fromString(stored, 'base64');
      const privateKey = privateKeyFromProtobuf(privateKeyBytes);
      const peerId = peerIdFromPrivateKey(privateKey);

      logger.p2p.debug('Restored persistent peer ID', {
        walletAddress: walletAddress.slice(0, 10) + '...',
        peerId: peerId.toString(),
      });

      return { peerId, privateKey };
    } catch (err) {
      // Corrupted storage - will regenerate
      logger.p2p.warn('Failed to restore peer ID, generating new one', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      localStorage.removeItem(storageKey);
    }
  }

  // Generate new keypair and persist
  const privateKey = await generateKeyPair('Ed25519');
  const privateKeyBytes = privateKeyToProtobuf(privateKey);
  localStorage.setItem(storageKey, toString(privateKeyBytes, 'base64'));

  const peerId = peerIdFromPrivateKey(privateKey);

  logger.p2p.info('Generated new persistent peer ID', {
    walletAddress: walletAddress.slice(0, 10) + '...',
    peerId: peerId.toString(),
  });

  return { peerId, privateKey };
}

/**
 * Clear the stored peer ID for a wallet address.
 *
 * Useful for debugging or if user wants a fresh identity.
 *
 * @param walletAddress - The wallet address to clear
 */
export function clearStoredPeerId(walletAddress: string): void {
  const storageKey = `${STORAGE_KEY_PREFIX}${walletAddress.toLowerCase()}`;
  localStorage.removeItem(storageKey);
  logger.p2p.info('Cleared stored peer ID', {
    walletAddress: walletAddress.slice(0, 10) + '...',
  });
}

/**
 * Check if a peer ID is stored for a wallet address.
 *
 * @param walletAddress - The wallet address to check
 * @returns true if a peer ID exists in storage
 */
export function hasStoredPeerId(walletAddress: string): boolean {
  const storageKey = `${STORAGE_KEY_PREFIX}${walletAddress.toLowerCase()}`;
  return localStorage.getItem(storageKey) !== null;
}
