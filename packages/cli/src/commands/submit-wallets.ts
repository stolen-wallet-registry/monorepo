import { zeroAddress, encodeFunctionData, createPublicClient, http, pad, type Hex } from 'viem';
import chalk from 'chalk';
import ora from 'ora';
import { parseWalletFile } from '../lib/files.js';
import { createClients } from '../lib/client.js';
import { getConfig } from '../lib/config.js';
import { formatBatchFee } from '../lib/format.js';
import {
  addressEntryKey,
  applyDuplicatePolicy,
  confirmSubmission,
  enforceBatchLimits,
} from '../lib/safety.js';
import { OperatorSubmitterABI } from '@swr/abis';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export interface SubmitWalletsOptions {
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

export async function submitWallets(options: SubmitWalletsOptions): Promise<void> {
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
    const parsed = await parseWalletFile(options.file, defaultChainId);
    spinner.succeed(`Loaded ${parsed.length} wallet addresses`);

    // 2b. Blast-radius rails (audit V16). Dedupe first so a file that is only oversized
    // because of repeats can still be fixed by --dedupe rather than by splitting it.
    const { entries, duplicates } = applyDuplicatePolicy(parsed, addressEntryKey, {
      dedupe: options.dedupe,
      label: 'wallets',
    });
    if (duplicates.length > 0) {
      console.warn(
        chalk.yellow(
          `Dropped ${parsed.length - entries.length} duplicate wallet ${
            parsed.length - entries.length === 1 ? 'entry' : 'entries'
          } (--dedupe); submitting ${entries.length}.`
        )
      );
    }
    enforceBatchLimits({
      count: entries.length,
      maxBatchSize: options.maxBatchSize,
      label: 'wallets',
    });

    // 3. Create public client for fee quote (no private key needed)
    const publicClient = createPublicClient({
      chain: config.chain,
      transport: http(config.rpcUrl),
    });

    // 4. Quote fee
    //
    // Must be OperatorSubmitter.quoteBatchFee(), NOT WalletRegistry.quoteRegistration().
    // These are two unrelated prices: quoteBatchFee is the flat per-BATCH operator fee
    // (free by default) collected by OperatorSubmitter._collectFee, while quoteRegistration
    // is the per-REGISTRATION fee charged to individual users — the registry's
    // registerWalletsFromOperator path is non-payable and collects nothing. Quoting the
    // individual fee overpays today (relying on the push refund, which reverts for a Safe
    // that cannot receive ETH) and under-funds the call the moment a batch fee is enabled,
    // reverting with OperatorSubmitter__InsufficientFee.
    spinner.start('Fetching batch fee quote...');
    const fee = await publicClient.readContract({
      address: config.contracts.operatorSubmitter,
      abi: OperatorSubmitterABI,
      functionName: 'quoteBatchFee',
    });
    spinner.succeed(`Batch fee: ${formatBatchFee(fee)}`);

    // 5. Prepare transaction data
    // Identifiers are addresses padded to bytes32, incidentTimestamps default to 0
    const identifiers = entries.map((e) => pad(e.address, { size: 32 }));
    const reportedChainIds = entries.map((e) => e.chainId);
    const incidentTimestamps = entries.map(() => 0n);

    // 6. Encode calldata for OperatorSubmitter
    const calldata = encodeFunctionData({
      abi: OperatorSubmitterABI,
      functionName: 'registerWalletsAsOperator',
      args: [identifiers, reportedChainIds, incidentTimestamps],
    });

    // Handle --build-only mode (for multisig/DAO workflows)
    if (options.buildOnly) {
      const txData: MultisigTransaction = {
        to: config.contracts.operatorSubmitter,
        value: fee.toString(),
        data: calldata,
        operation: 0,
        description: `Register ${entries.length} stolen wallets`,
        entryCount: entries.length,
      };

      if (options.outputDir) {
        const outputDir = options.outputDir;
        await mkdir(outputDir, { recursive: true });

        const timestamp = Date.now();
        const txFile = join(outputDir, `tx-wallets-${timestamp}.json`);

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
      console.log(`  Wallets: ${entries.length}`);
      console.log(`  Batch fee: ${formatBatchFee(fee)}`);
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
      label: 'wallets',
      count: entries.length,
      chainName: config.chain.name,
      chainId: config.chain.id,
      contractAddress: config.contracts.operatorSubmitter,
      fee: formatBatchFee(fee),
      sample: entries.slice(0, 3).map((e) => e.address),
      assumeYes: options.yes,
    });

    // 8. Submit through OperatorSubmitter
    spinner.start('Submitting batch...');
    const hash = await walletClient.writeContract({
      chain: config.chain,
      account,
      address: config.contracts.operatorSubmitter,
      abi: OperatorSubmitterABI,
      functionName: 'registerWalletsAsOperator',
      args: [identifiers, reportedChainIds, incidentTimestamps],
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
    console.log(`  Wallets: ${entries.length}`);
    console.log(`  Gas used: ${receipt.gasUsed}`);
  } catch (error) {
    spinner.fail('Failed');
    throw error;
  }
}
