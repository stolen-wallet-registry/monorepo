import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFile, rm, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { encodeFunctionData } from 'viem';
import {
  StolenWalletRegistryABI,
  FraudulentContractRegistryABI,
  StolenTransactionRegistryABI,
} from '@swr/abis';
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
  const testOutputDir = join(__dirname, '.test-output');

  beforeEach(async () => {
    // Clean up test output dir if it exists
    if (existsSync(testOutputDir)) {
      await rm(testOutputDir, { recursive: true });
    }
  });

  afterEach(async () => {
    // Clean up test output dir after tests
    if (existsSync(testOutputDir)) {
      await rm(testOutputDir, { recursive: true });
    }
  });

  describe('MultisigTransaction format', () => {
    it('generates correct wallet batch calldata', async () => {
      const entries = await parseWalletFile(walletsFixture, 8453n);
      const { root } = buildWalletMerkleTree(entries);

      const reportedChainId = chainIdToBytes32(8453n);
      const walletAddresses = entries.map((e) => e.address);
      const chainIds = entries.map((e) => e.chainId);

      const calldata = encodeFunctionData({
        abi: StolenWalletRegistryABI,
        functionName: 'registerBatchAsOperator',
        args: [root, reportedChainId, walletAddresses, chainIds],
      });

      expect(calldata).toMatch(/^0x[a-f0-9]+$/);
      // registerBatchAsOperator selector should be at start
      expect(calldata.slice(0, 10)).toBe(
        encodeFunctionData({
          abi: StolenWalletRegistryABI,
          functionName: 'registerBatchAsOperator',
          args: [root, reportedChainId, [], []],
        }).slice(0, 10)
      );
    });

    it('generates correct contract batch calldata', async () => {
      const entries = await parseContractFile(contractsFixture, 8453n);
      const { root } = buildContractMerkleTree(entries);

      const reportedChainId = chainIdToBytes32(8453n);
      const contractAddresses = entries.map((e) => e.address);
      const chainIds = entries.map((e) => e.chainId);

      const calldata = encodeFunctionData({
        abi: FraudulentContractRegistryABI,
        functionName: 'registerBatch',
        args: [root, reportedChainId, contractAddresses, chainIds],
      });

      expect(calldata).toMatch(/^0x[a-f0-9]+$/);
      // registerBatch selector
      expect(calldata.slice(0, 10)).toBe(
        encodeFunctionData({
          abi: FraudulentContractRegistryABI,
          functionName: 'registerBatch',
          args: [root, reportedChainId, [], []],
        }).slice(0, 10)
      );
    });

    it('generates correct transaction batch calldata', async () => {
      const entries = await parseTransactionFile(transactionsFixture, 8453n);
      const { root } = buildTransactionMerkleTree(entries);

      const reportedChainId = chainIdToBytes32(8453n);
      const txHashes = entries.map((e) => e.txHash);
      const chainIds = entries.map((e) => e.chainId);

      const calldata = encodeFunctionData({
        abi: StolenTransactionRegistryABI,
        functionName: 'registerBatchAsOperator',
        args: [root, reportedChainId, txHashes, chainIds],
      });

      expect(calldata).toMatch(/^0x[a-f0-9]+$/);
      // registerBatchAsOperator selector
      expect(calldata.slice(0, 10)).toBe(
        encodeFunctionData({
          abi: StolenTransactionRegistryABI,
          functionName: 'registerBatchAsOperator',
          args: [root, reportedChainId, [], []],
        }).slice(0, 10)
      );
    });
  });

  describe('MultisigTransaction structure', () => {
    it('wallet batch creates correct structure', async () => {
      const entries = await parseWalletFile(walletsFixture, 8453n);
      const { root } = buildWalletMerkleTree(entries);

      const fee = 1000000000000000n; // 0.001 ETH mock
      const targetContract = '0x1234567890123456789012345678901234567890';

      const reportedChainId = chainIdToBytes32(8453n);
      const walletAddresses = entries.map((e) => e.address);
      const chainIds = entries.map((e) => e.chainId);

      const calldata = encodeFunctionData({
        abi: StolenWalletRegistryABI,
        functionName: 'registerBatchAsOperator',
        args: [root, reportedChainId, walletAddresses, chainIds],
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
      expect(txData.data).toMatch(/^0x[a-f0-9]+$/);
      expect(txData.operation).toBe(0);
      expect(txData.description).toContain('3 stolen wallets');
      expect(txData.merkleRoot).toBe(root);
      expect(txData.entryCount).toBe(3);
    });

    it('contract batch creates correct structure', async () => {
      const entries = await parseContractFile(contractsFixture, 8453n);
      const { root } = buildContractMerkleTree(entries);

      const fee = 2000000000000000n; // 0.002 ETH mock
      const targetContract = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

      const reportedChainId = chainIdToBytes32(8453n);
      const contractAddresses = entries.map((e) => e.address);
      const chainIds = entries.map((e) => e.chainId);

      const calldata = encodeFunctionData({
        abi: FraudulentContractRegistryABI,
        functionName: 'registerBatch',
        args: [root, reportedChainId, contractAddresses, chainIds],
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
      expect(txData.description).toContain('3 fraudulent contracts');
      expect(txData.entryCount).toBe(3);
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
