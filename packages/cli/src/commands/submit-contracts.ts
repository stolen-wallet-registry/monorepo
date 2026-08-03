import { zeroAddress, encodeFunctionData, createPublicClient, http, pad, type Hex } from 'viem';
import chalk from 'chalk';
import ora from 'ora';
import { parseContractFile } from '../lib/files.js';
import { createClients } from '../lib/client.js';
import { getConfig } from '../lib/config.js';
import { formatBatchFee } from '../lib/format.js';
import {
  addressEntryKey,
  applyDuplicatePolicy,
  confirmSubmission,
  describeDefaultedChains,
  describeUnusedOutputDir,
  enforceBatchLimits,
  formatReportedChain,
  summariseReportedChains,
} from '../lib/safety.js';
import { OperatorSubmitterABI } from '@swr/abis';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export interface SubmitContractsOptions {
  file: string;
  env: 'local' | 'testnet' | 'mainnet';
  privateKey?: Hex;
  chainId?: number;
  outputDir?: string;
  dryRun?: boolean;
  buildOnly?: boolean;
  /** `--dedupe`: drop repeated entries instead of refusing the file (audit V16). */
  dedupe?: boolean;
  /** `--max-batch-size`: raise the default cap, up to the hard ceiling (audit V16). */
  maxBatchSize?: number;
  /** `--yes`: skip the interactive confirmation for scripted use (audit V16). */
  yes?: boolean;
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

    // 1b. `-o` is only read on the --build-only path; say so before anything else runs rather
    // than leaving an empty output directory as the only clue.
    const unusedOutputDir = describeUnusedOutputDir(options);
    if (unusedOutputDir !== undefined) console.warn(chalk.yellow(`⚠ ${unusedOutputDir}`));

    // 2. Parse input file
    spinner.start('Parsing input file...');
    const defaultChainId = options.chainId ? BigInt(options.chainId) : 8453n;
    const parsed = await parseContractFile(options.file, defaultChainId);
    spinner.succeed(`Loaded ${parsed.length} contract addresses`);

    // 2b. Blast-radius rails (audit V16). Dedupe first so a file that is only oversized
    // because of repeats can still be fixed by --dedupe rather than by splitting it.
    const { entries, duplicates } = applyDuplicatePolicy(parsed, addressEntryKey, {
      dedupe: options.dedupe,
      label: 'contracts',
    });
    if (duplicates.length > 0) {
      console.warn(
        chalk.yellow(
          `Dropped ${parsed.length - entries.length} duplicate contract ${
            parsed.length - entries.length === 1 ? 'entry' : 'entries'
          } (--dedupe); submitting ${entries.length}.`
        )
      );
    }
    enforceBatchLimits({
      count: entries.length,
      maxBatchSize: options.maxBatchSize,
      label: 'contracts',
    });

    // 2c. Which chain(s) this batch ACCUSES (audit S-4). Distinct from config.chain, which is
    // where the transaction lands and is always the hub. Warn in every mode — --build-only
    // hands a multisig a transaction whose reported chain is otherwise invisible.
    const reportedChains = summariseReportedChains(entries);
    const defaultedWarning = describeDefaultedChains(reportedChains);
    if (defaultedWarning !== undefined) console.warn(chalk.yellow(`⚠ ${defaultedWarning}`));

    // 3. Create public client for fee quote (no private key needed)
    const publicClient = createPublicClient({
      chain: config.chain,
      transport: http(config.rpcUrl),
    });

    // 4. Quote fee
    //
    // Must be OperatorSubmitter.quoteBatchFee(), NOT FeeManager.currentFeeWei().
    // These are two unrelated prices: quoteBatchFee is the flat per-BATCH operator fee
    // (free by default), while currentFeeWei is the per-REGISTRATION fee charged to
    // individual users. Quoting the latter under-funds the call whenever a batch fee is
    // enabled, reverting with OperatorSubmitter__InsufficientFee.
    spinner.start('Fetching batch fee quote...');
    const fee = await publicClient.readContract({
      address: config.contracts.operatorSubmitter,
      abi: OperatorSubmitterABI,
      functionName: 'quoteBatchFee',
    });
    spinner.succeed(`Batch fee: ${formatBatchFee(fee)}`);

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
      for (const chain of reportedChains) {
        console.log(
          `  Reported on: ${formatReportedChain(chain.caip2)} — ${chain.count} contracts`
        );
      }
      console.log(`  Batch fee: ${formatBatchFee(fee)}`);
      console.log(
        chalk.gray(
          '  No simulation was performed — this checked the input file and quoted the fee. ' +
            'Operator approval, pause state and the block gas limit are only tested on submit.'
        )
      );
      return;
    }

    // 7. For direct submission, private key is required
    if (!options.privateKey) {
      throw new Error(
        'No signing credential resolved for direct submission. Use --keystore <path>, or --build-only for multisig workflows.'
      );
    }

    const { walletClient, account } = createClients(config, options.privateKey);

    console.log(chalk.gray(`Operator address: ${account}`));

    // 7b. Last stop before an irreversible write (audit V16).
    await confirmSubmission({
      env: options.env,
      label: 'contracts',
      count: entries.length,
      chainName: config.chain.name,
      chainId: config.chain.id,
      contractAddress: config.contracts.operatorSubmitter,
      fee: formatBatchFee(fee),
      reportedChains,
      sample: entries.slice(0, 3).map((e) => `${e.address} @ ${e.reportedChain}`),
      assumeYes: options.yes,
    });

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
