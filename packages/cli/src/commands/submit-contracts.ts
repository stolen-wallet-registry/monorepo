import {
  formatEther,
  zeroAddress,
  encodeFunctionData,
  createPublicClient,
  http,
  pad,
  type Hex,
} from 'viem';
import chalk from 'chalk';
import ora from 'ora';
import { parseContractFile } from '../lib/files.js';
import { createClients } from '../lib/client.js';
import { getConfig } from '../lib/config.js';
import { OperatorSubmitterABI, FeeManagerABI } from '@swr/abis';
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
  entryCount: number;
}

export async function submitContracts(options: SubmitContractsOptions): Promise<void> {
  const spinner = ora();

  try {
    // 1. Load configuration
    const config = getConfig(options.env);

    if (config.contracts.operatorSubmitter === zeroAddress) {
      throw new Error(
        `OperatorSubmitter not configured for environment: ${options.env}. ` +
          'Set operatorSubmitter in @swr/chains hub contracts.'
      );
    }

    // 2. Parse input file
    spinner.start('Parsing input file...');
    const defaultChainId = options.chainId ? BigInt(options.chainId) : 8453n;
    const entries = await parseContractFile(options.file, defaultChainId);
    spinner.succeed(`Loaded ${entries.length} contract addresses`);

    // 3. Create public client for fee quote (no private key needed)
    const publicClient = createPublicClient({
      chain: config.chain,
      transport: http(config.rpcUrl),
    });

    // 4. Quote fee
    spinner.start('Fetching fee quote...');
    const fee = await publicClient.readContract({
      address: config.contracts.feeManager,
      abi: FeeManagerABI,
      functionName: 'currentFeeWei',
    });
    spinner.succeed(`Fee: ${chalk.yellow(formatEther(fee))} ETH`);

    // 5. Prepare transaction data
    const identifiers = entries.map((e) => pad(e.address, { size: 32 }));
    const reportedChainIds = entries.map((e) => e.chainId);
    const threatCategories = entries.map(() => 0); // default: unclassified

    // 6. Encode calldata for OperatorSubmitter
    const calldata = encodeFunctionData({
      abi: OperatorSubmitterABI,
      functionName: 'registerContractsAsOperator',
      args: [identifiers, reportedChainIds, threatCategories],
    });

    // Handle --build-only mode (for multisig/DAO workflows)
    if (options.buildOnly) {
      const txData: MultisigTransaction = {
        to: config.contracts.operatorSubmitter,
        value: fee.toString(),
        data: calldata,
        operation: 0,
        description: `Register ${entries.length} fraudulent contracts`,
        entryCount: entries.length,
      };

      if (options.outputDir) {
        const outputDir = options.outputDir;
        await mkdir(outputDir, { recursive: true });

        const timestamp = Date.now();
        const txFile = join(outputDir, `tx-contracts-${timestamp}.json`);

        await writeFile(txFile, JSON.stringify(txData, null, 2));

        console.log(chalk.green('\n✓ Transaction data built for multisig'));
        console.log(`  Transaction file: ${chalk.cyan(txFile)}`);
      } else {
        // Output to stdout if no output dir specified
        console.log(chalk.green('\n✓ Transaction data for multisig:'));
        console.log(JSON.stringify(txData, null, 2));
      }

      console.log(chalk.gray('\nImport the transaction JSON into your multisig UI (Safe, etc.)'));
      return;
    }

    // Handle --dry-run mode
    if (options.dryRun) {
      console.log(chalk.yellow('\n--- DRY RUN ---'));
      console.log('Would submit:');
      console.log(`  Contracts: ${entries.length}`);
      console.log(`  Fee: ${formatEther(fee)} ETH`);
      return;
    }

    // 7. For direct submission, private key is required
    if (!options.privateKey) {
      throw new Error(
        'Private key required for direct submission. Use --build-only for multisig workflows.'
      );
    }

    const { walletClient, account } = createClients(config, options.privateKey as `0x${string}`);

    console.log(chalk.gray(`Operator address: ${account}`));

    // 8. Submit through OperatorSubmitter
    spinner.start('Submitting batch...');
    const hash = await walletClient.writeContract({
      chain: config.chain,
      account,
      address: config.contracts.operatorSubmitter,
      abi: OperatorSubmitterABI,
      functionName: 'registerContractsAsOperator',
      args: [identifiers, reportedChainIds, threatCategories],
      value: fee,
    });
    spinner.succeed(`Transaction submitted: ${chalk.green(hash)}`);

    // 9. Wait for confirmation
    spinner.start('Waiting for confirmation...');
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: 120_000, // 2 minute timeout
    });
    spinner.succeed(`Confirmed in block ${receipt.blockNumber}`);

    // 10. Summary
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
