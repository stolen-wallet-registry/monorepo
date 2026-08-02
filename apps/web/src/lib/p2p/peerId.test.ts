import { describe, it, expect, beforeEach, vi } from 'vitest';

import { getOrCreatePeerId, clearStoredPeerId, hasStoredPeerId } from './peerId';

const SESSION_KEY = 'swr-p2p-session-key';
const LEGACY_PREFIX = 'swr-p2p-keypair-';

const WALLET_A = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const WALLET_B = '0x742D35CC6634c0532925A3b844BC9E7595F0BEb0';

describe('V32 — session-scoped peer identity', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearStoredPeerId();
    vi.restoreAllMocks();
  });

  describe('storage location and shape', () => {
    it('persists to sessionStorage, never localStorage', async () => {
      await getOrCreatePeerId(WALLET_A);

      expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull();
      expect(localStorage.length).toBe(0);
    });

    // The wallet address in the storage key was half the finding: the key names alone
    // enumerated every wallet ever connected in this browser.
    it('does not put the wallet address anywhere in storage', async () => {
      await getOrCreatePeerId(WALLET_A);

      const keys = Object.keys(sessionStorage);
      expect(keys).toEqual([SESSION_KEY]);
      for (const key of keys) {
        expect(key.toLowerCase()).not.toContain(WALLET_A.toLowerCase());
        expect(sessionStorage.getItem(key)?.toLowerCase()).not.toContain(WALLET_A.toLowerCase());
      }
    });

    it('uses one identity regardless of which wallet asks', async () => {
      const first = await getOrCreatePeerId(WALLET_A);
      const second = await getOrCreatePeerId(WALLET_B);

      expect(second.peerId.toString()).toBe(first.peerId.toString());
      expect(Object.keys(sessionStorage)).toHaveLength(1);
    });

    it('works with no argument at all', async () => {
      const result = await getOrCreatePeerId();
      expect(result.peerId.toString()).toMatch(/^12D3KooW/);
    });
  });

  describe('stability across reloads', () => {
    // Load-bearing: the partner pins this peer ID, and authorizeStreamPeer drops any stream
    // whose remotePeer differs from the pin. An identity that changed on reload would break
    // mid-flow resume — the exact case partnerPeerId is persisted for.
    it('returns the same peer ID on a simulated reload', async () => {
      const before = await getOrCreatePeerId(WALLET_A);
      const stored = sessionStorage.getItem(SESSION_KEY);

      // A reload clears module state but not sessionStorage.
      clearStoredPeerId();
      sessionStorage.setItem(SESSION_KEY, stored!);

      const after = await getOrCreatePeerId(WALLET_A);
      expect(after.peerId.toString()).toBe(before.peerId.toString());
    });

    it('is repeatable within a session', async () => {
      const a = await getOrCreatePeerId(WALLET_A);
      const b = await getOrCreatePeerId(WALLET_A);
      expect(b.peerId.toString()).toBe(a.peerId.toString());
    });

    // Closing the tab drops sessionStorage; the next session must not inherit the identity.
    it('mints a fresh identity once the session ends', async () => {
      const before = await getOrCreatePeerId(WALLET_A);

      sessionStorage.clear();
      clearStoredPeerId();

      const after = await getOrCreatePeerId(WALLET_A);
      expect(after.peerId.toString()).not.toBe(before.peerId.toString());
    });
  });

  describe('legacy key purge', () => {
    // Without this, every browser that already ran the old code keeps its plaintext keys and
    // its wallet list forever — nothing else ever deleted them.
    it('removes retired per-wallet localStorage keys on first use', async () => {
      localStorage.setItem(`${LEGACY_PREFIX}${WALLET_A.toLowerCase()}`, 'ignored');
      localStorage.setItem(`${LEGACY_PREFIX}${WALLET_B.toLowerCase()}`, 'ignored');

      await getOrCreatePeerId(WALLET_A);

      expect(localStorage.getItem(`${LEGACY_PREFIX}${WALLET_A.toLowerCase()}`)).toBeNull();
      expect(localStorage.getItem(`${LEGACY_PREFIX}${WALLET_B.toLowerCase()}`)).toBeNull();
    });

    it('purges every legacy key, not just the current wallet', async () => {
      for (let i = 0; i < 5; i++) {
        localStorage.setItem(`${LEGACY_PREFIX}0xabc${i}`, 'ignored');
      }

      await getOrCreatePeerId(WALLET_A);

      expect(Object.keys(localStorage).filter((k) => k.startsWith(LEGACY_PREFIX))).toHaveLength(0);
    });

    it('leaves unrelated localStorage entries alone', async () => {
      localStorage.setItem('swr-p2p-state', '{"peerId":null}');
      localStorage.setItem('unrelated', 'keep me');

      await getOrCreatePeerId(WALLET_A);

      expect(localStorage.getItem('swr-p2p-state')).toBe('{"peerId":null}');
      expect(localStorage.getItem('unrelated')).toBe('keep me');
    });

    // The old key never decodes as a session key, but a user could also land here with a
    // corrupt value; either way it must recover rather than throw.
    it('recovers from a corrupt stored key', async () => {
      sessionStorage.setItem(SESSION_KEY, 'not-a-valid-protobuf-key');

      const result = await getOrCreatePeerId(WALLET_A);

      expect(result.peerId.toString()).toMatch(/^12D3KooW/);
      expect(sessionStorage.getItem(SESSION_KEY)).not.toBe('not-a-valid-protobuf-key');
    });
  });

  describe('clear and query helpers', () => {
    it('hasStoredPeerId reflects whether an identity exists', async () => {
      expect(hasStoredPeerId()).toBe(false);
      await getOrCreatePeerId(WALLET_A);
      expect(hasStoredPeerId()).toBe(true);
      clearStoredPeerId();
      expect(hasStoredPeerId()).toBe(false);
    });

    it('clearStoredPeerId forces a different identity next time', async () => {
      const before = await getOrCreatePeerId(WALLET_A);
      clearStoredPeerId(WALLET_A);
      const after = await getOrCreatePeerId(WALLET_A);

      expect(after.peerId.toString()).not.toBe(before.peerId.toString());
      expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull();
    });

    it('accepts the legacy wallet-address argument without using it', async () => {
      await getOrCreatePeerId(WALLET_A);
      expect(hasStoredPeerId(WALLET_B)).toBe(true);
      clearStoredPeerId(WALLET_B);
      expect(hasStoredPeerId(WALLET_A)).toBe(false);
    });
  });

  describe('storage unavailable (private mode)', () => {
    // Safari private mode and some webviews throw on storage access. The flow must still get
    // one stable identity for the page rather than a new peer ID on every call.
    it('stays stable within the page when sessionStorage throws', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('SecurityError');
      });

      const first = await getOrCreatePeerId(WALLET_A);
      const second = await getOrCreatePeerId(WALLET_A);

      expect(second.peerId.toString()).toBe(first.peerId.toString());
    });

    it('does not throw when storage is entirely unavailable', async () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('SecurityError');
      });
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new DOMException('SecurityError');
      });

      await expect(getOrCreatePeerId(WALLET_A)).resolves.toBeDefined();
      expect(() => clearStoredPeerId()).not.toThrow();
    });
  });

  describe('key material', () => {
    it('derives the peer ID from the stored key', async () => {
      const { peerId, privateKey } = await getOrCreatePeerId(WALLET_A);

      expect(peerId.toString()).toMatch(/^12D3KooW/);
      expect(privateKey.type).toBe('Ed25519');
    });

    it('generates a distinct key per session', async () => {
      const a = await getOrCreatePeerId(WALLET_A);
      sessionStorage.clear();
      clearStoredPeerId();
      const b = await getOrCreatePeerId(WALLET_A);

      expect(b.privateKey.equals(a.privateKey)).toBe(false);
    });
  });
});
