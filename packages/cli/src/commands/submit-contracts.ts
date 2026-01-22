import {
  formatEther,
  zeroAddress,
  encodeFunctionData,
  createPublicClient,
  http,
  type Hex,
} from 'viem';
import chalk from 'chalk';
import ora from 'ora';
import { buildContractMerkleTree, serializeTree } from '../lib/merkle.js';
import { parseContractFile } from '../lib/files.js';
import { createClients } from '../lib/client.js';
import { getConfig } from '../lib/config.js';
import { chainIdToBytes32 } from '../lib/caip.js';
import { FraudulentContractRegistryABI } from '@swr/abis';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export interface SubmitContractsOptions {
  file: string;
  env: 'local' | 'testnet' | 'mainnet';
  privateKey?: string;
  chainId?: number;
  outputDir?: string;
  dryRun?: boolean;
  buildOnly?: boolean;
}

/** Transaction data for multisig import (Safe, Zodiac, etc.) */
export interface MultisigTransaction {
  to: string;
  value: string;
  data: Hex;
  operation: 0; // Call (not DelegateCall)
  description: string;
  merkleRoot: Hex;
  entryCount: number;
}

export async function submitContracts(options: SubmitContractsOptions): Promise<void> {
  const spinner = ora();

  try {
    // 1. Load configuration
    const config = getConfig(options.env);

    if (config.contracts.fraudulentContractRegistry === zeroAddress) {
      throw new Error(`Contract addresses not configured for environment: ${options.env}`);
    }

    // 2. Parse input file
    spinner.start('Parsing input file...');
    const defaultChainId = options.chainId ? BigInt(options.chainId) : 8453n;
    const entries = await parseContractFile(options.file, defaultChainId);
    spinner.succeed(`Loaded ${entries.length} contract addresses`);

    // 3. Build Merkle tree
    spinner.start('Building Merkle tree...');
    const { root, tree } = buildContractMerkleTree(entries);
    spinner.succeed(`Merkle root: ${chalk.cyan(root)}`);

    // 4. Create public client for fee quote (no private key needed)
    const publicClient = createPublicClient({
      chain: config.chain,
      transport: http(config.rpcUrl),
    });

    // 5. Quote fee
    spinner.start('Fetching fee quote...');
    const fee = await publicClient.readContract({
      address: config.contracts.fraudulentContractRegistry,
      abi: FraudulentContractRegistryABI,
      functionName: 'quoteRegistration',
    });
    spinner.succeed(`Fee: ${chalk.yellow(formatEther(fee))} ETH`);

    // 6. Prepare transaction data
    const reportedChainId = chainIdToBytes32(defaultChainId);
    const contractAddresses = entries.map((e) => e.address);
    const chainIds = entries.map((e) => e.chainId);

    // 7. Encode calldata
    const calldata = encodeFunctionData({
      abi: FraudulentContractRegistryABI,
      functionName: 'registerBatch',
      args: [root, reportedChainId, contractAddresses, chainIds],
    });

    // Handle --build-only mode (for multisig/DAO workflows)
    if (options.buildOnly) {
      const txData: MultisigTransaction = {
        to: config.contracts.fraudulentContractRegistry,
        value: fee.toString(),
        data: calldata,
        operation: 0,
        description: `Register ${entries.length} fraudulent contracts (Merkle root: ${root.slice(0, 10)}...)`,
        merkleRoot: root,
        entryCount: entries.length,
      };

      // Save merkle tree alongside transaction data
      if (options.outputDir) {
        const outputDir = options.outputDir;
        await mkdir(outputDir, { recursive: true });

        const timestamp = Date.now();
        const txFile = join(outputDir, `tx-contracts-${timestamp}.json`);
        const treeFile = join(outputDir, `tree-contracts-${timestamp}.json`);

        await writeFile(txFile, JSON.stringify(txData, null, 2));
        await writeFile(treeFile, serializeTree(tree));

        console.log(chalk.green('\n✓ Transaction data built for multisig'));
        console.log(`  Transaction file: ${chalk.cyan(txFile)}`);
        console.log(`  Merkle tree file: ${chalk.cyan(treeFile)}`);
      } else {
        // Output to stdout if no output dir specified
        console.log(chalk.green('\n✓ Transaction data for multisig:'));
        console.log(JSON.stringify(txData, null, 2));
      }

      console.log(chalk.gray('\nImport the transaction JSON into your multisig UI (Safe, etc.)'));
      console.log(chalk.gray('Keep the Merkle tree file for future verification.'));
      return;
    }

    // Handle --dry-run mode
    if (options.dryRun) {
      console.log(chalk.yellow('\n--- DRY RUN ---'));
      console.log('Would submit:');
      console.log(`  Merkle root: ${root}`);
      console.log(`  Chain ID: ${reportedChainId}`);
      console.log(`  Contracts: ${entries.length}`);
      console.log(`  Fee: ${formatEther(fee)} ETH`);
      return;
    }

    // 8. For direct submission, private key is required
    if (!options.privateKey) {
      throw new Error(
        'Private key required for direct submission. Use --build-only for multisig workflows.'
      );
    }

    const { walletClient, account } = createClients(config, options.privateKey as `0x${string}`);

    console.log(chalk.gray(`Operator address: ${account}`));

    // 9. Submit transaction
    spinner.start('Submitting batch...');
    const hash = await walletClient.writeContract({
      chain: config.chain,
      account,
      address: config.contracts.fraudulentContractRegistry,
      abi: FraudulentContractRegistryABI,
      functionName: 'registerBatch',
      args: [root, reportedChainId, contractAddresses, chainIds],
      value: fee,
    });
    spinner.succeed(`Transaction submitted: ${chalk.green(hash)}`);

    // 10. Wait for confirmation
    spinner.start('Waiting for confirmation...');
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: 120_000, // 2 minute timeout
    });
    spinner.succeed(`Confirmed in block ${receipt.blockNumber}`);

    // 11. Save tree for verification
    if (options.outputDir) {
      const outputDir = options.outputDir;
      await mkdir(outputDir, { recursive: true });

      const treeFile = join(outputDir, `tree-${hash.slice(0, 10)}.json`);
      await writeFile(treeFile, serializeTree(tree));
      console.log(chalk.gray(`Tree saved to: ${treeFile}`));
    }

    // 12. Summary
    console.log(chalk.green('\n✓ Batch registered successfully!'));
    console.log(`  Transaction: ${hash}`);
    console.log(`  Block: ${receipt.blockNumber}`);
    console.log(`  Contracts: ${entries.length}`);
    console.log(`  Gas used: ${receipt.gasUsed}`);
  } catch (error) {
    spinner.fail('Failed');
    throw error;
  }
}
