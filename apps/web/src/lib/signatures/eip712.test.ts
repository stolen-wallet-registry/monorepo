import { describe, it, expect } from 'vitest';
import {
  getEIP712Domain,
  buildAcknowledgementTypedData,
  buildRegistrationTypedData,
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
  EIP712_TYPES,
  SIGNATURE_STEP,
  type AcknowledgementMessage,
  type RegistrationMessage,
} from './eip712';

describe('EIP-712 typed data', () => {
  const testChainId = 1;
  const testContract = '0x5FbDB2315678afecb367f032d93F642f64180aa3' as `0x${string}`;
  const testOwner = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as `0x${string}`;
  const testForwarder = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0' as `0x${string}`;

  describe('constants', () => {
    it('has correct domain name matching contract', () => {
      expect(EIP712_DOMAIN_NAME).toBe('StolenWalletRegistry');
    });

    it('has correct domain version matching contract', () => {
      expect(EIP712_DOMAIN_VERSION).toBe('4');
    });

    it('has correct signature step values', () => {
      expect(SIGNATURE_STEP.ACKNOWLEDGEMENT).toBe(1);
      expect(SIGNATURE_STEP.REGISTRATION).toBe(2);
    });

    it('has correct EIP712 type definitions', () => {
      expect(EIP712_TYPES.AcknowledgementOfRegistry).toEqual([
        { name: 'owner', type: 'address' },
        { name: 'forwarder', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ]);

      expect(EIP712_TYPES.Registration).toEqual([
        { name: 'owner', type: 'address' },
        { name: 'forwarder', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ]);
    });
  });

  describe('getEIP712Domain', () => {
    it('returns correct domain structure', () => {
      const domain = getEIP712Domain(testChainId, testContract);

      expect(domain.name).toBe(EIP712_DOMAIN_NAME);
      expect(domain.version).toBe(EIP712_DOMAIN_VERSION);
      expect(domain.chainId).toBe(BigInt(testChainId));
      expect(domain.verifyingContract).toBe(testContract);
    });

    it('converts chainId to BigInt', () => {
      const domain = getEIP712Domain(137, testContract);
      expect(domain.chainId).toBe(137n);
    });

    it('handles different chain IDs', () => {
      const chains = [1, 5, 137, 31337, 8453];

      for (const chainId of chains) {
        const domain = getEIP712Domain(chainId, testContract);
        expect(domain.chainId).toBe(BigInt(chainId));
      }
    });

    it('preserves contract address exactly', () => {
      const domain = getEIP712Domain(testChainId, testContract);
      expect(domain.verifyingContract).toBe(testContract);
    });
  });

  describe('buildAcknowledgementTypedData', () => {
    const message: AcknowledgementMessage = {
      owner: testOwner,
      forwarder: testForwarder,
      nonce: 0n,
      deadline: 12345678n,
    };

    it('returns correct primaryType', () => {
      const typedData = buildAcknowledgementTypedData(testChainId, testContract, message);
      expect(typedData.primaryType).toBe('AcknowledgementOfRegistry');
    });

    it('includes correct domain', () => {
      const typedData = buildAcknowledgementTypedData(testChainId, testContract, message);

      expect(typedData.domain.name).toBe(EIP712_DOMAIN_NAME);
      expect(typedData.domain.version).toBe(EIP712_DOMAIN_VERSION);
      expect(typedData.domain.chainId).toBe(BigInt(testChainId));
      expect(typedData.domain.verifyingContract).toBe(testContract);
    });

    it('includes all EIP712 types', () => {
      const typedData = buildAcknowledgementTypedData(testChainId, testContract, message);

      expect(typedData.types).toBe(EIP712_TYPES);
      expect(typedData.types.AcknowledgementOfRegistry).toBeDefined();
      expect(typedData.types.Registration).toBeDefined();
    });

    it('includes message with all fields', () => {
      const typedData = buildAcknowledgementTypedData(testChainId, testContract, message);

      expect(typedData.message.owner).toBe(testOwner);
      expect(typedData.message.forwarder).toBe(testForwarder);
      expect(typedData.message.nonce).toBe(0n);
      expect(typedData.message.deadline).toBe(12345678n);
    });

    it('preserves BigInt message values', () => {
      const largeMessage: AcknowledgementMessage = {
        owner: testOwner,
        forwarder: testForwarder,
        nonce: 999999999999n,
        deadline: 18000000n,
      };

      const typedData = buildAcknowledgementTypedData(testChainId, testContract, largeMessage);

      expect(typedData.message.nonce).toBe(999999999999n);
      expect(typedData.message.deadline).toBe(18000000n);
    });
  });

  describe('buildRegistrationTypedData', () => {
    const message: RegistrationMessage = {
      owner: testOwner,
      forwarder: testForwarder,
      nonce: 1n,
      deadline: 12345700n,
    };

    it('returns correct primaryType', () => {
      const typedData = buildRegistrationTypedData(testChainId, testContract, message);
      expect(typedData.primaryType).toBe('Registration');
    });

    it('includes correct domain', () => {
      const typedData = buildRegistrationTypedData(testChainId, testContract, message);

      expect(typedData.domain.name).toBe(EIP712_DOMAIN_NAME);
      expect(typedData.domain.version).toBe(EIP712_DOMAIN_VERSION);
      expect(typedData.domain.chainId).toBe(BigInt(testChainId));
      expect(typedData.domain.verifyingContract).toBe(testContract);
    });

    it('includes all EIP712 types', () => {
      const typedData = buildRegistrationTypedData(testChainId, testContract, message);

      expect(typedData.types).toBe(EIP712_TYPES);
    });

    it('includes message with all fields', () => {
      const typedData = buildRegistrationTypedData(testChainId, testContract, message);

      expect(typedData.message.owner).toBe(testOwner);
      expect(typedData.message.forwarder).toBe(testForwarder);
      expect(typedData.message.nonce).toBe(1n);
      expect(typedData.message.deadline).toBe(12345700n);
    });
  });

  describe('acknowledgement vs registration typed data', () => {
    it('differ only in primaryType', () => {
      const ackMessage: AcknowledgementMessage = {
        owner: testOwner,
        forwarder: testForwarder,
        nonce: 0n,
        deadline: 100n,
      };

      const regMessage: RegistrationMessage = {
        owner: testOwner,
        forwarder: testForwarder,
        nonce: 0n,
        deadline: 100n,
      };

      const ackData = buildAcknowledgementTypedData(testChainId, testContract, ackMessage);
      const regData = buildRegistrationTypedData(testChainId, testContract, regMessage);

      // Same domain
      expect(ackData.domain).toEqual(regData.domain);

      // Same types reference
      expect(ackData.types).toBe(regData.types);

      // Same message content
      expect(ackData.message).toEqual(regData.message);

      // Different primaryType
      expect(ackData.primaryType).toBe('AcknowledgementOfRegistry');
      expect(regData.primaryType).toBe('Registration');
    });
  });
});
