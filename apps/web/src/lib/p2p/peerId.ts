/**
 * Session-scoped libp2p peer identity.
 *
 * SECURITY (audit V32): this module used to write the Ed25519 private key to `localStorage`
 * under `swr-p2p-keypair-<wallet address>`, with no expiry and no caller other than the dev
 * panel able to clear it. Two problems, neither of which is fund seizure — an intercepted
 * signature still names the honest relayer as its forwarder, so `WalletRegistry.register`
 * rejects an attacker's submission — but both of which are real:
 *
 *   1. **Durable impersonation.** Anyone with read access to the profile keeps a key that
 *      still produces the victim's peer ID months later, and a peer ID is exactly what the
 *      counterparty's pin check authenticates. That buys griefing: dial the partner first,
 *      get pinned, and lock the legitimate peer out of a registration they may have no other
 *      way to complete.
 *   2. **A permanent on-disk wallet list.** One key per address means the storage keys alone
 *      enumerate every wallet ever connected in this browser, long after the flow ended.
 *
 * Both come from the same two decisions — persist forever, and key by wallet address. This
 * module drops both: one identity per browsing session, no wallet address anywhere in the
 * storage key, and the key dies with the tab.
 *
 * WHY NOT A NON-EXTRACTABLE WEBCRYPTO KEY (the audit's first suggestion): it cannot work with
 * libp2p. `Ed25519PrivateKey` in `@libp2p/interface` declares `readonly raw: Uint8Array` ("the
 * raw private key bytes"), and `@libp2p/crypto`'s implementation signs with
 * `crypto.hashAndSign(this.raw, message)` — the raw material is a hard requirement of the
 * type, not an implementation detail we could route around. A non-extractable key by
 * definition never yields it. libp2p's own WebCrypto probe even generates with
 * `extractable: true`; it uses WebCrypto as an optional accelerator over bytes it already
 * holds. Honouring that suggestion would mean forking the key implementation and the noise
 * handshake, which is not a proportionate response to a Low finding.
 *
 * WHY SESSION SCOPE RATHER THAN FULLY EPHEMERAL: the peer ID must survive a reload, because
 * the partner pins it. `authorizeStreamPeer` rejects any stream whose `remotePeer` differs
 * from the pinned `partnerPeerId`, and `partnerPeerId` is deliberately persisted so a
 * mid-flow reload (grace period, payment step) comes back with its partner still pinned. A
 * per-page-load identity would therefore break exactly the case the persistence exists for:
 * the registeree reloads, re-dials with a new peer ID, and the relayer drops the CONNECT as
 * an impostor. `sessionStorage` keeps the identity stable across reloads in the tab that owns
 * the flow, and discards it when that tab closes.
 *
 * Per-tab isolation is a side benefit: two tabs previously shared one identity (same wallet,
 * same key), so both would claim the same peer ID on the relay. Now they do not.
 */

import { privateKeyFromProtobuf, privateKeyToProtobuf, generateKeyPair } from '@libp2p/crypto/keys';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import type { PeerId, PrivateKey } from '@libp2p/interface';
import { fromString, toString as uint8ToString } from 'uint8arrays';

import { logger } from '@/lib/logger';

/**
 * Storage key for the session identity. Deliberately constant: a per-wallet key is what made
 * the old scheme enumerate every address ever used in this browser.
 */
const SESSION_KEY = 'swr-p2p-session-key';

/** Prefix of the retired per-wallet localStorage entries, purged on first use. */
const LEGACY_KEY_PREFIX = 'swr-p2p-keypair-';

/** SSR safety: check if we're in a browser environment */
const isBrowser = typeof window !== 'undefined';

export interface PersistentPeerIdResult {
  peerId: PeerId;
  privateKey: PrivateKey;
}

/**
 * Identity for the current page when `sessionStorage` is unavailable.
 *
 * Safari's private mode and some embedded webviews throw on storage access. Falling back to a
 * module-level value keeps one stable identity for the life of the page — without it, each
 * call would mint a different peer ID and the node's identity would change mid-flow.
 */
let inMemoryIdentity: string | null = null;

/**
 * Remove the retired per-wallet keys.
 *
 * This is the part of the fix that helps existing users: without it, every browser that has
 * already run the old code keeps its plaintext keys and its wallet list indefinitely, since
 * nothing else ever deleted them.
 */
function purgeLegacyKeys(): void {
  if (!isBrowser) return;
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(LEGACY_KEY_PREFIX)) stale.push(key);
    }
    for (const key of stale) localStorage.removeItem(key);

    if (stale.length > 0) {
      // Count only — the keys themselves contain the wallet addresses we are purging.
      logger.p2p.info('Purged legacy per-wallet peer ID keys from localStorage', {
        count: stale.length,
      });
    }
  } catch {
    // Storage unavailable; nothing to purge and nothing worth failing over.
  }
}

function readSessionKey(): string | null {
  if (!isBrowser) return inMemoryIdentity;
  try {
    return sessionStorage.getItem(SESSION_KEY) ?? inMemoryIdentity;
  } catch {
    return inMemoryIdentity;
  }
}

function writeSessionKey(value: string): void {
  inMemoryIdentity = value;
  if (!isBrowser) return;
  try {
    sessionStorage.setItem(SESSION_KEY, value);
  } catch {
    // Private mode / storage disabled. inMemoryIdentity already holds it for this page.
    logger.p2p.warn('sessionStorage unavailable; peer identity will not survive a reload');
  }
}

/**
 * Get or create this session's private key and peer ID.
 *
 * Stable across reloads within the tab, discarded when the tab closes.
 *
 * @param _walletAddress - Ignored. Retained so existing callers keep compiling; the identity
 *   is deliberately no longer derived from or keyed by the wallet address (audit V32).
 * @returns The private key and derived PeerId for this session
 */
export async function getOrCreatePeerId(_walletAddress?: string): Promise<PersistentPeerIdResult> {
  purgeLegacyKeys();

  const stored = readSessionKey();
  if (stored) {
    try {
      const privateKey = privateKeyFromProtobuf(fromString(stored, 'base64'));
      const peerId = peerIdFromPrivateKey(privateKey);

      logger.p2p.debug('Restored session peer ID', { peerId: peerId.toString() });

      return { peerId, privateKey };
    } catch (err) {
      logger.p2p.warn('Failed to restore session peer ID, generating a new one', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      clearStoredPeerId();
    }
  }

  const privateKey = await generateKeyPair('Ed25519');
  writeSessionKey(uint8ToString(privateKeyToProtobuf(privateKey), 'base64'));

  const peerId = peerIdFromPrivateKey(privateKey);

  // No wallet address in this log line: the point of the change is that the identity is not
  // associated with one.
  logger.p2p.info('Generated new session peer ID', { peerId: peerId.toString() });

  return { peerId, privateKey };
}

/**
 * Discard this session's peer identity. The next call to `getOrCreatePeerId` mints a new one.
 *
 * @param _walletAddress - Ignored; retained for call-site compatibility.
 */
export function clearStoredPeerId(_walletAddress?: string): void {
  inMemoryIdentity = null;
  if (!isBrowser) return;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing persisted to remove.
  }
  logger.p2p.info('Cleared session peer ID');
}

/**
 * Whether this session already has a peer identity.
 *
 * @param _walletAddress - Ignored; retained for call-site compatibility.
 */
export function hasStoredPeerId(_walletAddress?: string): boolean {
  return readSessionKey() !== null;
}
