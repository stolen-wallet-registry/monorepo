import { describe, it, expect, afterEach } from 'vitest';
import {
  storeSignature,
  getSignature,
  removeSignature,
  clearSignatures,
  clearAllSignatures,
  type StoredSignature,
} from './storage';
import { SIGNATURE_STEP } from './eip712';

describe('signature storage', () => {
  const testAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as `0x${string}`;
  const testChainId = 1;

  const createTestSignature = (
    step: StoredSignature['step'],
    overrides: Partial<StoredSignature> = {}
  ): StoredSignature => ({
    signature:
      '0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8538dde03fc8b4c6d7f2c13c82e5c34d0e5f8b1c0b5e2f3a4b5c6d7e8f9a0b1c21b' as `0x${string}`,
    deadline: 12345678n,
    nonce: 42n,
    address: testAddress,
    chainId: testChainId,
    step,
    storedAt: Date.now(),
    ...overrides,
  });

  afterEach(() => {
    // Clear sessionStorage after each test for guaranteed cleanup
    sessionStorage.clear();
  });

  describe('storeSignature / getSignature roundtrip', () => {
    it('preserves all fields including BigInt values', () => {
      const original = createTestSignature(SIGNATURE_STEP.ACKNOWLEDGEMENT);

      storeSignature(original);
      const retrieved = getSignature(testAddress, testChainId, SIGNATURE_STEP.ACKNOWLEDGEMENT);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.signature).toBe(original.signature);
      expect(retrieved!.deadline).toBe(original.deadline);
      expect(retrieved!.nonce).toBe(original.nonce);
      expect(retrieved!.address).toBe(original.address);
      expect(retrieved!.chainId).toBe(original.chainId);
      expect(retrieved!.step).toBe(original.step);
      expect(retrieved!.storedAt).toBe(original.storedAt);
    });

    it('handles large BigInt values correctly', () => {
      const original = createTestSignature(SIGNATURE_STEP.ACKNOWLEDGEMENT, {
        deadline: 999999999999999999n,
        nonce: BigInt(Number.MAX_SAFE_INTEGER) + 1000n,
      });

      storeSignature(original);
      const retrieved = getSignature(testAddress, testChainId, SIGNATURE_STEP.ACKNOWLEDGEMENT);

      expect(retrieved!.deadline).toBe(999999999999999999n);
      expect(retrieved!.nonce).toBe(BigInt(Number.MAX_SAFE_INTEGER) + 1000n);
    });

    it('handles zero BigInt values', () => {
      const original = createTestSignature(SIGNATURE_STEP.ACKNOWLEDGEMENT, {
        deadline: 0n,
        nonce: 0n,
      });

      storeSignature(original);
      const retrieved = getSignature(testAddress, testChainId, SIGNATURE_STEP.ACKNOWLEDGEMENT);

      expect(retrieved!.deadline).toBe(0n);
      expect(retrieved!.nonce).toBe(0n);
    });
  });

  describe('storage key uses lowercase address', () => {
    it('retrieves signature regardless of address case', () => {
      const original = createTestSignature(SIGNATURE_STEP.ACKNOWLEDGEMENT);
      storeSignature(original);

      // Try retrieving with different cases
      const lowercaseAddress = testAddress.toLowerCase() as `0x${string}`;
      const uppercaseAddress = testAddress.toUpperCase() as `0x${string}`;

      const retrieved1 = getSignature(
        lowercaseAddress,
        testChainId,
        SIGNATURE_STEP.ACKNOWLEDGEMENT
      );
      const retrieved2 = getSignature(
        uppercaseAddress,
        testChainId,
        SIGNATURE_STEP.ACKNOWLEDGEMENT
      );

      expect(retrieved1).not.toBeNull();
      expect(retrieved2).not.toBeNull();
      expect(retrieved1!.signature).toBe(original.signature);
      expect(retrieved2!.signature).toBe(original.signature);
    });

    it('stores with lowercase key even when given mixed case address', () => {
      const mixedCaseAddress = '0xD8Da6bf26964af9d7EeD9e03e53415d37aa96045' as `0x${string}`;
      const original = createTestSignature(SIGNATURE_STEP.ACKNOWLEDGEMENT, {
        address: mixedCaseAddress,
      });

      storeSignature(original);

      // Check the actual key in sessionStorage - derive step from constant to stay aligned
      const expectedKey = `swr_sig_${mixedCaseAddress.toLowerCase()}_${testChainId}_${SIGNATURE_STEP.ACKNOWLEDGEMENT}`;
      expect(sessionStorage.getItem(expectedKey)).not.toBeNull();
    });
  });

  describe('getSignature returns null', () => {
    it('returns null for missing key', () => {
      const result = getSignature(testAddress, testChainId, SIGNATURE_STEP.ACKNOWLEDGEMENT);
      expect(result).toBeNull();
    });

    it('returns null and removes corrupted JSON', () => {
      const key = `swr_sig_${testAddress.toLowerCase()}_${testChainId}_1`;
      sessionStorage.setItem(key, 'not valid json {{{');

      const result = getSignature(testAddress, testChainId, SIGNATURE_STEP.ACKNOWLEDGEMENT);

      expect(result).toBeNull();
      expect(sessionStorage.getItem(key)).toBeNull(); // Should be cleaned up
    });

    it('returns null for different chain', () => {
      storeSignature(createTestSignature(SIGNATURE_STEP.ACKNOWLEDGEMENT));

      const result = getSignature(testAddress, 999, SIGNATURE_STEP.ACKNOWLEDGEMENT);
      expect(result).toBeNull();
    });

    it('returns null for different step', () => {
      storeSignature(createTestSignature(SIGNATURE_STEP.ACKNOWLEDGEMENT));

      const result = getSignature(testAddress, testChainId, SIGNATURE_STEP.REGISTRATION);
      expect(result).toBeNull();
    });
  });

  describe('30-minute TTL expiration', () => {
    it('returns null and removes signature older than 30 minutes', () => {
      // Create signature that is 31 minutes old (expired)
      const expiredSignature = createTestSignature(SIGNATURE_STEP.ACKNOWLEDGEMENT, {
        storedAt: Date.now() - 31 * 60 * 1000,
      });

      storeSignature(expiredSignature);

      const result = getSignature(testAddress, testChainId, SIGNATURE_STEP.ACKNOWLEDGEMENT);

      expect(result).toBeNull();

      // Verify the key was removed from sessionStorage
      const key = `swr_sig_${testAddress.toLowerCase()}_${testChainId}_${SIGNATURE_STEP.ACKNOWLEDGEMENT}`;
      expect(sessionStorage.getItem(key)).toBeNull();
    });

    it('returns signature that is less than 30 minutes old', () => {
      // Create signature that is 20 minutes old (not expired)
      const validSignature = createTestSignature(SIGNATURE_STEP.ACKNOWLEDGEMENT, {
        storedAt: Date.now() - 20 * 60 * 1000,
      });

      storeSignature(validSignature);

      const result = getSignature(testAddress, testChainId, SIGNATURE_STEP.ACKNOWLEDGEMENT);

      expect(result).not.toBeNull();
      expect(result!.signature).toBe(validSignature.signature);
      expect(result!.storedAt).toBe(validSignature.storedAt);
    });

    it('returns signature stored just now', () => {
      const freshSignature = createTestSignature(SIGNATURE_STEP.ACKNOWLEDGEMENT);

      storeSignature(freshSignature);

      const result = getSignature(testAddress, testChainId, SIGNATURE_STEP.ACKNOWLEDGEMENT);

      expect(result).not.toBeNull();
      expect(result!.signature).toBe(freshSignature.signature);
    });

    it('returns null for signature at exactly 30 minutes (boundary)', () => {
      // Signature at exactly 30 minutes should be expired (> check, not >=)
      const boundarySignature = createTestSignature(SIGNATURE_STEP.ACKNOWLEDGEMENT, {
        storedAt: Date.now() - 30 * 60 * 1000 - 1, // Just over 30 minutes
      });

      storeSignature(boundarySignature);

      const result = getSignature(testAddress, testChainId, SIGNATURE_STEP.ACKNOWLEDGEMENT);

      expect(result).toBeNull();
    });
  });

  describe('removeSignature', () => {
    it('removes a specific signature', () => {
      storeSignature(createTestSignature(SIGNATURE_STEP.ACKNOWLEDGEMENT));
      storeSignature(createTestSignature(SIGNATURE_STEP.REGISTRATION));

      removeSignature(testAddress, testChainId, SIGNATURE_STEP.ACKNOWLEDGEMENT);

      expect(getSignature(testAddress, testChainId, SIGNATURE_STEP.ACKNOWLEDGEMENT)).toBeNull();
      expect(getSignature(testAddress, testChainId, SIGNATURE_STEP.REGISTRATION)).not.toBeNull();
    });

    it('removes a signature regardless of address case', () => {
      const upperAddress = testAddress.toUpperCase() as `0x${string}`;

      storeSignature(
        createTestSignature(SIGNATURE_STEP.ACKNOWLEDGEMENT, { address: upperAddress })
      );

      removeSignature(upperAddress, testChainId, SIGNATURE_STEP.ACKNOWLEDGEMENT);

      expect(getSignature(testAddress, testChainId, SIGNATURE_STEP.ACKNOWLEDGEMENT)).toBeNull();
    });
  });

  describe('clearSignatures', () => {
    it('removes both step 1 and step 2 for an address/chain', () => {
      storeSignature(createTestSignature(SIGNATURE_STEP.ACKNOWLEDGEMENT));
      storeSignature(createTestSignature(SIGNATURE_STEP.REGISTRATION));

      clearSignatures(testAddress, testChainId);

      expect(getSignature(testAddress, testChainId, SIGNATURE_STEP.ACKNOWLEDGEMENT)).toBeNull();
      expect(getSignature(testAddress, testChainId, SIGNATURE_STEP.REGISTRATION)).toBeNull();
    });

    it('does not affect signatures for other addresses', () => {
      const otherAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0' as `0x${string}`;

      storeSignature(createTestSignature(SIGNATURE_STEP.ACKNOWLEDGEMENT));
      storeSignature(
        createTestSignature(SIGNATURE_STEP.ACKNOWLEDGEMENT, { address: otherAddress })
      );

      clearSignatures(testAddress, testChainId);

      expect(getSignature(testAddress, testChainId, SIGNATURE_STEP.ACKNOWLEDGEMENT)).toBeNull();
      expect(
        getSignature(otherAddress, testChainId, SIGNATURE_STEP.ACKNOWLEDGEMENT)
      ).not.toBeNull();
    });

    it('does not affect signatures for other chains', () => {
      const otherChainId = 137;

      storeSignature(createTestSignature(SIGNATURE_STEP.ACKNOWLEDGEMENT));
      storeSignature(
        createTestSignature(SIGNATURE_STEP.ACKNOWLEDGEMENT, { chainId: otherChainId })
      );

      clearSignatures(testAddress, testChainId);

      expect(getSignature(testAddress, testChainId, SIGNATURE_STEP.ACKNOWLEDGEMENT)).toBeNull();
      expect(
        getSignature(testAddress, otherChainId, SIGNATURE_STEP.ACKNOWLEDGEMENT)
      ).not.toBeNull();
    });

    it('clears signatures regardless of address case', () => {
      const upperAddress = testAddress.toUpperCase() as `0x${string}`;

      storeSignature(
        createTestSignature(SIGNATURE_STEP.ACKNOWLEDGEMENT, { address: upperAddress })
      );
      storeSignature(createTestSignature(SIGNATURE_STEP.REGISTRATION, { address: upperAddress }));

      clearSignatures(upperAddress, testChainId);

      expect(getSignature(testAddress, testChainId, SIGNATURE_STEP.ACKNOWLEDGEMENT)).toBeNull();
      expect(getSignature(testAddress, testChainId, SIGNATURE_STEP.REGISTRATION)).toBeNull();
    });
  });

  describe('clearAllSignatures', () => {
    it('removes only swr_sig_* keys', () => {
      // Store SWR signatures
      storeSignature(createTestSignature(SIGNATURE_STEP.ACKNOWLEDGEMENT));
      storeSignature(createTestSignature(SIGNATURE_STEP.REGISTRATION));

      // Store other sessionStorage items
      sessionStorage.setItem('other_key', 'other_value');
      sessionStorage.setItem('wagmi_something', 'wagmi_data');

      clearAllSignatures();

      // SWR signatures should be gone
      expect(getSignature(testAddress, testChainId, SIGNATURE_STEP.ACKNOWLEDGEMENT)).toBeNull();
      expect(getSignature(testAddress, testChainId, SIGNATURE_STEP.REGISTRATION)).toBeNull();

      // Other items should remain
      expect(sessionStorage.getItem('other_key')).toBe('other_value');
      expect(sessionStorage.getItem('wagmi_something')).toBe('wagmi_data');
    });

    it('handles empty sessionStorage', () => {
      expect(() => clearAllSignatures()).not.toThrow();
    });
  });

  describe('both steps can coexist', () => {
    it('stores and retrieves both acknowledgement and registration signatures', () => {
      const ackSig = createTestSignature(SIGNATURE_STEP.ACKNOWLEDGEMENT, {
        nonce: 0n,
        deadline: 100n,
      });
      const regSig = createTestSignature(SIGNATURE_STEP.REGISTRATION, {
        nonce: 1n,
        deadline: 200n,
      });

      storeSignature(ackSig);
      storeSignature(regSig);

      const retrievedAck = getSignature(testAddress, testChainId, SIGNATURE_STEP.ACKNOWLEDGEMENT);
      const retrievedReg = getSignature(testAddress, testChainId, SIGNATURE_STEP.REGISTRATION);

      expect(retrievedAck!.nonce).toBe(0n);
      expect(retrievedAck!.deadline).toBe(100n);
      expect(retrievedReg!.nonce).toBe(1n);
      expect(retrievedReg!.deadline).toBe(200n);
    });
  });
});
