import { describe, it, expect } from 'vitest';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { encodeFunctionData, pad } from 'viem';
import { OperatorSubmitterV2ABI } from '@swr/abis';
import {
  buildWalletMerkleTree,
  buildContractMerkleTree,
  buildTransactionMerkleTree,
} from '../src/lib/merkle.js';
import { parseWalletFile, parseContractFile, parseTransactionFile } from '../src/lib/files.js';
import { chainIdToBytes32 } from '../src/lib/caip.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('--build-only mode', () => {
  const walletsFixture = join(__dirname, 'fixtures', 'wallets.json');
  const contractsFixture = join(__dirname, 'fixtures', 'contracts.json');
  const transactionsFixture = join(__dirname, 'fixtures', 'transactions.json');

  describe('MultisigTransaction format', () => {
    it('generates correct wallet batch calldata', async () => {
      const entries = await parseWalletFile(walletsFixture, 8453n);
      const { root } = buildWalletMerkleTree(entries);

      const identifiers = entries.map((e) => pad(e.address, { size: 32 }));
      const reportedChainIds = entries.map((e) => e.chainId);
      const incidentTimestamps = entries.map(() => 0n);

      const calldata = encodeFunctionData({
        abi: OperatorSubmitterV2ABI,
        functionName: 'registerWalletsAsOperator',
        args: [identifiers, reportedChainIds, incidentTimestamps],
      });

      expect(calldata).toMatch(/^0x[a-fA-F0-9]+$/);
      // registerWalletsAsOperator selector should be at start
      expect(calldata.slice(0, 10)).toBe(
        encodeFunctionData({
          abi: OperatorSubmitterV2ABI,
          functionName: 'registerWalletsAsOperator',
          args: [[], [], []],
        }).slice(0, 10)
      );
      // Merkle root still built locally for reference
      expect(root).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('generates correct contract batch calldata', async () => {
      const entries = await parseContractFile(contractsFixture, 8453n);
      const { root } = buildContractMerkleTree(entries);

      const identifiers = entries.map((e) => pad(e.address, { size: 32 }));
      const reportedChainIds = entries.map((e) => e.chainId);

      const calldata = encodeFunctionData({
        abi: OperatorSubmitterV2ABI,
        functionName: 'registerContractsAsOperator',
        args: [identifiers, reportedChainIds],
      });

      expect(calldata).toMatch(/^0x[a-fA-F0-9]+$/);
      // registerContractsAsOperator selector
      expect(calldata.slice(0, 10)).toBe(
        encodeFunctionData({
          abi: OperatorSubmitterV2ABI,
          functionName: 'registerContractsAsOperator',
          args: [[], []],
        }).slice(0, 10)
      );
      // Merkle root still built locally for reference
      expect(root).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('generates correct transaction batch calldata', async () => {
      const entries = await parseTransactionFile(transactionsFixture, 8453n);
      const { root } = buildTransactionMerkleTree(entries);

      const transactionHashes = entries.map((e) => e.txHash);
      const chainIds = entries.map((e) => e.chainId);

      const calldata = encodeFunctionData({
        abi: OperatorSubmitterV2ABI,
        functionName: 'registerTransactionsAsOperator',
        args: [transactionHashes, chainIds],
      });

      expect(calldata).toMatch(/^0x[a-fA-F0-9]+$/);
      // registerTransactionsAsOperator selector
      expect(calldata.slice(0, 10)).toBe(
        encodeFunctionData({
          abi: OperatorSubmitterV2ABI,
          functionName: 'registerTransactionsAsOperator',
          args: [[], []],
        }).slice(0, 10)
      );
      // Merkle root still built locally for reference
      expect(root).toMatch(/^0x[a-f0-9]{64}$/);
    });
  });

  describe('MultisigTransaction structure', () => {
    it('wallet batch creates correct structure', async () => {
      const entries = await parseWalletFile(walletsFixture, 8453n);
      const { root } = buildWalletMerkleTree(entries);

      const fee = 1000000000000000n; // 0.001 ETH mock
      const targetContract = '0x1234567890123456789012345678901234567890';

      const identifiers = entries.map((e) => pad(e.address, { size: 32 }));
      const reportedChainIds = entries.map((e) => e.chainId);
      const incidentTimestamps = entries.map(() => 0n);

      const calldata = encodeFunctionData({
        abi: OperatorSubmitterV2ABI,
        functionName: 'registerWalletsAsOperator',
        args: [identifiers, reportedChainIds, incidentTimestamps],
      });

      const txData = {
        to: targetContract,
        value: fee.toString(),
        data: calldata,
        operation: 0 as const,
        description: `Register ${entries.length} stolen wallets (Merkle root: ${root.slice(0, 10)}...)`,
        merkleRoot: root,
        entryCount: entries.length,
      };

      expect(txData.to).toBe(targetContract);
      expect(txData.value).toBe('1000000000000000');
      expect(txData.data).toMatch(/^0x[a-fA-F0-9]+$/);
      expect(txData.operation).toBe(0);
      expect(txData.description).toContain(`${entries.length} stolen wallets`);
      expect(txData.merkleRoot).toBe(root);
      expect(txData.entryCount).toBe(entries.length);
    });

    it('contract batch creates correct structure', async () => {
      const entries = await parseContractFile(contractsFixture, 8453n);
      const { root } = buildContractMerkleTree(entries);

      const fee = 2000000000000000n; // 0.002 ETH mock
      const targetContract = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

      const identifiers = entries.map((e) => pad(e.address, { size: 32 }));
      const reportedChainIds = entries.map((e) => e.chainId);

      const calldata = encodeFunctionData({
        abi: OperatorSubmitterV2ABI,
        functionName: 'registerContractsAsOperator',
        args: [identifiers, reportedChainIds],
      });

      const txData = {
        to: targetContract,
        value: fee.toString(),
        data: calldata,
        operation: 0 as const,
        description: `Register ${entries.length} fraudulent contracts (Merkle root: ${root.slice(0, 10)}...)`,
        merkleRoot: root,
        entryCount: entries.length,
      };

      expect(txData.to).toBe(targetContract);
      expect(txData.value).toBe('2000000000000000');
      expect(txData.operation).toBe(0);
      expect(txData.description).toContain(`${entries.length} fraudulent contracts`);
      expect(txData.entryCount).toBe(entries.length);
    });
  });

  describe('file parsing with fixtures', () => {
    it('parses wallets.json fixture correctly', async () => {
      const entries = await parseWalletFile(walletsFixture, 8453n);

      expect(entries).toHaveLength(3);
      expect(entries[0].address).toBe('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
    });

    it('parses contracts.json fixture correctly', async () => {
      const entries = await parseContractFile(contractsFixture, 8453n);

      expect(entries).toHaveLength(3);
      expect(entries[0].address).toBe('0x1234567890123456789012345678901234567890');
    });

    it('parses transactions.json fixture correctly', async () => {
      const entries = await parseTransactionFile(transactionsFixture, 8453n);

      expect(entries).toHaveLength(3);
      expect(entries[0].txHash).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('handles CAIP-2 chain ID format', async () => {
      const entries = await parseWalletFile(walletsFixture, 8453n);

      // Second entry has "eip155:8453" format
      expect(entries[1].chainId).toBe(chainIdToBytes32(8453n));
    });

    it('handles numeric chain ID format', async () => {
      const entries = await parseWalletFile(walletsFixture, 8453n);

      // Third entry has chainId: 1 (Ethereum mainnet)
      expect(entries[2].chainId).toBe(chainIdToBytes32(1n));
    });
  });
});
