import { describe, it, expect } from 'vitest';
import {
  getEIP712Domain,
  buildAcknowledgementTypedData,
  buildRegistrationTypedData,
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
  EIP712_TYPES,
  SIGNATURE_STEP,
  STATEMENTS,
  type AcknowledgementMessage,
  type RegistrationMessage,
} from './eip712';
import type { Address } from '@/lib/types/ethereum';

describe('EIP-712 typed data', () => {
  const testChainId = 1;
  const testContract = '0x5FbDB2315678afecb367f032d93F642f64180aa3' as Address;
  const testWallet = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as Address;
  const testForwarder = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0' as Address;

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
      // Statement is FIRST field for visibility in wallet UI (MetaMask)
      expect(EIP712_TYPES.AcknowledgementOfRegistry).toEqual([
        { name: 'statement', type: 'string' },
        { name: 'wallet', type: 'address' },
        { name: 'forwarder', type: 'address' },
        { name: 'reportedChainId', type: 'uint64' },
        { name: 'incidentTimestamp', type: 'uint64' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ]);

      expect(EIP712_TYPES.Registration).toEqual([
        { name: 'statement', type: 'string' },
        { name: 'wallet', type: 'address' },
        { name: 'forwarder', type: 'address' },
        { name: 'reportedChainId', type: 'uint64' },
        { name: 'incidentTimestamp', type: 'uint64' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ]);
    });

    it('has correct statement constants', () => {
      expect(STATEMENTS.WALLET_ACK).toBe(
        'This signature acknowledges that the signing wallet is being reported as stolen to the Stolen Wallet Registry.'
      );
      expect(STATEMENTS.WALLET_REG).toBe(
        'This signature confirms permanent registration of the signing wallet in the Stolen Wallet Registry. This action is irreversible.'
      );
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
    const message: Omit<AcknowledgementMessage, 'statement'> = {
      wallet: testWallet,
      forwarder: testForwarder,
      reportedChainId: 1n,
      incidentTimestamp: 0n,
      nonce: 0n,
      deadline: 12345678n,
    };

    it('returns correct primaryType', () => {
      const typedData = buildAcknowledgementTypedData(testChainId, testContract, true, message);
      expect(typedData.primaryType).toBe('AcknowledgementOfRegistry');
    });

    it('includes correct domain', () => {
      const typedData = buildAcknowledgementTypedData(testChainId, testContract, true, message);

      expect(typedData.domain.name).toBe(EIP712_DOMAIN_NAME);
      expect(typedData.domain.version).toBe(EIP712_DOMAIN_VERSION);
      expect(typedData.domain.chainId).toBe(BigInt(testChainId));
      expect(typedData.domain.verifyingContract).toBe(testContract);
    });

    it('includes all EIP712 types', () => {
      const typedData = buildAcknowledgementTypedData(testChainId, testContract, true, message);

      expect(typedData.types).toBe(EIP712_TYPES);
      expect(typedData.types.AcknowledgementOfRegistry).toBeDefined();
      expect(typedData.types.Registration).toBeDefined();
    });

    it('includes message with all fields including statement', () => {
      const typedData = buildAcknowledgementTypedData(testChainId, testContract, true, message);

      expect(typedData.message.statement).toBe(STATEMENTS.WALLET_ACK);
      expect(typedData.message.wallet).toBe(testWallet);
      expect(typedData.message.forwarder).toBe(testForwarder);
      expect(typedData.message.nonce).toBe(0n);
      expect(typedData.message.deadline).toBe(12345678n);
    });

    it('preserves BigInt message values', () => {
      const largeMessage: Omit<AcknowledgementMessage, 'statement'> = {
        wallet: testWallet,
        forwarder: testForwarder,
        reportedChainId: 1n,
        incidentTimestamp: 0n,
        nonce: 999999999999n,
        deadline: 18000000n,
      };

      const typedData = buildAcknowledgementTypedData(
        testChainId,
        testContract,
        true,
        largeMessage
      );

      expect(typedData.message.nonce).toBe(999999999999n);
      expect(typedData.message.deadline).toBe(18000000n);
    });
  });

  describe('buildRegistrationTypedData', () => {
    const message: Omit<RegistrationMessage, 'statement'> = {
      wallet: testWallet,
      forwarder: testForwarder,
      reportedChainId: 1n,
      incidentTimestamp: 0n,
      nonce: 1n,
      deadline: 12345700n,
    };

    it('returns correct primaryType', () => {
      const typedData = buildRegistrationTypedData(testChainId, testContract, true, message);
      expect(typedData.primaryType).toBe('Registration');
    });

    it('includes correct domain', () => {
      const typedData = buildRegistrationTypedData(testChainId, testContract, true, message);

      expect(typedData.domain.name).toBe(EIP712_DOMAIN_NAME);
      expect(typedData.domain.version).toBe(EIP712_DOMAIN_VERSION);
      expect(typedData.domain.chainId).toBe(BigInt(testChainId));
      expect(typedData.domain.verifyingContract).toBe(testContract);
    });

    it('includes all EIP712 types', () => {
      const typedData = buildRegistrationTypedData(testChainId, testContract, true, message);

      expect(typedData.types).toBe(EIP712_TYPES);
    });

    it('includes message with all fields including statement', () => {
      const typedData = buildRegistrationTypedData(testChainId, testContract, true, message);

      expect(typedData.message.statement).toBe(STATEMENTS.WALLET_REG);
      expect(typedData.message.wallet).toBe(testWallet);
      expect(typedData.message.forwarder).toBe(testForwarder);
      expect(typedData.message.nonce).toBe(1n);
      expect(typedData.message.deadline).toBe(12345700n);
    });
  });

  describe('acknowledgement vs registration typed data', () => {
    it('differ in primaryType and statement', () => {
      const ackMessage: Omit<AcknowledgementMessage, 'statement'> = {
        wallet: testWallet,
        forwarder: testForwarder,
        reportedChainId: 1n,
        incidentTimestamp: 0n,
        nonce: 0n,
        deadline: 100n,
      };

      const regMessage: Omit<RegistrationMessage, 'statement'> = {
        wallet: testWallet,
        forwarder: testForwarder,
        reportedChainId: 1n,
        incidentTimestamp: 0n,
        nonce: 0n,
        deadline: 100n,
      };

      const ackData = buildAcknowledgementTypedData(testChainId, testContract, true, ackMessage);
      const regData = buildRegistrationTypedData(testChainId, testContract, true, regMessage);

      // Same domain
      expect(ackData.domain).toEqual(regData.domain);

      // Same types reference
      expect(ackData.types).toBe(regData.types);

      // Different statements (human-readable intent)
      expect(ackData.message.statement).toBe(STATEMENTS.WALLET_ACK);
      expect(regData.message.statement).toBe(STATEMENTS.WALLET_REG);

      // Same other message fields
      expect(ackData.message.wallet).toBe(regData.message.wallet);
      expect(ackData.message.forwarder).toBe(regData.message.forwarder);
      expect(ackData.message.nonce).toBe(regData.message.nonce);
      expect(ackData.message.deadline).toBe(regData.message.deadline);

      // Different primaryType
      expect(ackData.primaryType).toBe('AcknowledgementOfRegistry');
      expect(regData.primaryType).toBe('Registration');
    });
  });
});
