#!/usr/bin/env node

import { Command } from 'commander';
import { config as loadEnv } from 'dotenv';
import chalk from 'chalk';

import { submitContracts } from './commands/submit-contracts.js';
import { submitWallets } from './commands/submit-wallets.js';
import { submitTransactions } from './commands/submit-transactions.js';
import { verify } from './commands/verify.js';
import { quote } from './commands/quote.js';
import { resolveCredential } from './lib/credentials.js';
import { ABSOLUTE_MAX_BATCH_SIZE, DEFAULT_MAX_BATCH_SIZE } from './lib/safety.js';
import type { CliEnvironment } from './lib/config.js';

// Load environment variables
loadEnv();

const program = new Command();

program.name('swr').description('Stolen Wallet Registry CLI for operators').version('0.1.0');

// ═══════════════════════════════════════════════════════════════════════════
// SHARED OPTION HANDLING
// ═══════════════════════════════════════════════════════════════════════════

const VALID_ENVIRONMENTS: readonly string[] = ['local', 'testnet', 'mainnet'];

interface SubmitOptions {
  file: string;
  env: string;
  privateKey?: string;
  keystore?: string;
  chainId: string;
  outputDir?: string;
  dryRun?: boolean;
  buildOnly?: boolean;
  dedupe?: boolean;
  maxBatchSize?: string;
  yes?: boolean;
}

function fail(message: string): never {
  console.error(chalk.red(`Error: ${message}`));
  process.exit(1);
}

/**
 * Validate shared submit options and resolve the operator signing credential.
 *
 * The credential policy (audit V7) lives in lib/credentials.ts: `--private-key` is refused on
 * any non-local network because argv is world-readable. Nothing here prints the key.
 */
async function prepareSubmit(options: SubmitOptions) {
  if (!VALID_ENVIRONMENTS.includes(options.env)) {
    fail(`Invalid environment: ${options.env}. Expected one of ${VALID_ENVIRONMENTS.join(', ')}.`);
  }
  const env = options.env as CliEnvironment;

  const chainId = Number(options.chainId);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    fail(`Invalid chain ID: ${options.chainId}`);
  }

  // Audit V16: parsed here rather than in the command so a typo fails before any network
  // call, and so all three submit commands reject it identically.
  let maxBatchSize: number | undefined;
  if (options.maxBatchSize !== undefined) {
    maxBatchSize = Number(options.maxBatchSize);
    if (!Number.isInteger(maxBatchSize) || maxBatchSize <= 0) {
      fail(`Invalid --max-batch-size: ${options.maxBatchSize}. Expected a positive integer.`);
    }
    if (maxBatchSize > ABSOLUTE_MAX_BATCH_SIZE) {
      fail(
        `--max-batch-size ${maxBatchSize} exceeds the hard ceiling of ${ABSOLUTE_MAX_BATCH_SIZE}. ` +
          'A batch that large cannot fit in a 25M gas transaction and would revert on chain.'
      );
    }
  }

  let privateKey;
  try {
    ({ privateKey } = await resolveCredential({
      env,
      privateKeyArg: options.privateKey,
      keystorePath: options.keystore,
      envPrivateKey: process.env.OPERATOR_PRIVATE_KEY,
      envKeystorePassword: process.env.SWR_KEYSTORE_PASSWORD,
      buildOnly: options.buildOnly,
      dryRun: options.dryRun,
    }));
  } catch (error) {
    fail((error as Error).message);
  }

  return {
    file: options.file,
    env,
    privateKey,
    chainId,
    outputDir: options.outputDir,
    dryRun: options.dryRun,
    buildOnly: options.buildOnly,
    dedupe: options.dedupe,
    maxBatchSize,
    yes: options.yes,
  };
}

/** Options shared by every submit command, in recommended-first order. */
function withSubmitOptions(command: Command): Command {
  return command
    .requiredOption('-f, --file <path>', 'Input file (JSON or CSV)')
    .option('-e, --env <env>', 'Environment: local, testnet, mainnet', 'local')
    .option('--build-only', 'Build transaction data for multisig (no key needed; use for mainnet)')
    .option('--keystore <path>', 'Encrypted V3 keystore file (passphrase prompted)')
    .option('-c, --chain-id <id>', 'Default chain ID for entries', '8453')
    .option('-o, --output-dir <path>', 'Directory to save transaction data')
    .option('--dry-run', 'Simulate without submitting')
    .option(
      '-y, --yes',
      'Skip the interactive confirmation. For scripted/CI use only — the batch is irreversible.'
    )
    .option('--dedupe', 'Drop repeated entries instead of refusing the file')
    .option(
      '--max-batch-size <n>',
      `Maximum entries per batch (default ${DEFAULT_MAX_BATCH_SIZE}, hard ceiling ${ABSOLUTE_MAX_BATCH_SIZE})`
    )
    .option(
      '-k, --private-key <key>',
      'Plaintext operator key. LOCAL DEVELOPMENT ONLY — refused for testnet/mainnet ' +
        'because process arguments are world-readable. Use --keystore or --build-only.'
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUBMIT COMMANDS
// ═══════════════════════════════════════════════════════════════════════════

withSubmitOptions(
  program.command('submit-contracts').description('Submit a batch of fraudulent contracts')
).action(async (options: SubmitOptions) => {
  const prepared = await prepareSubmit(options);
  try {
    await submitContracts(prepared);
  } catch (error) {
    fail((error as Error).message);
  }
});

withSubmitOptions(
  program.command('submit-wallets').description('Submit a batch of stolen wallets')
).action(async (options: SubmitOptions) => {
  const prepared = await prepareSubmit(options);
  try {
    await submitWallets(prepared);
  } catch (error) {
    fail((error as Error).message);
  }
});

withSubmitOptions(
  program.command('submit-transactions').description('Submit a batch of stolen transactions')
).action(async (options: SubmitOptions) => {
  const prepared = await prepareSubmit(options);
  try {
    await submitTransactions(prepared);
  } catch (error) {
    fail((error as Error).message);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY COMMANDS
// ═══════════════════════════════════════════════════════════════════════════

program
  .command('quote')
  .description('Get fee quote for batch submission')
  .option('-e, --env <env>', 'Environment: local, testnet, mainnet', 'local')
  .option('-t, --type <type>', 'Registry type: wallet, transaction, contract', 'contract')
  .action(async (options) => {
    try {
      await quote({
        env: options.env,
        type: options.type,
      });
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

program
  .command('verify')
  .description('Verify an entry exists in the registry')
  .requiredOption('-a, --address <address>', 'Address to verify')
  .option('-e, --env <env>', 'Environment: local, testnet, mainnet', 'local')
  .option('-c, --chain-id <id>', 'Chain ID', '8453')
  .option('-t, --type <type>', 'Registry type: wallet, contract', 'contract')
  .action(async (options) => {
    const chainId = Number(options.chainId);
    if (!Number.isInteger(chainId) || chainId <= 0) {
      console.error(chalk.red(`Error: Invalid chain ID: ${options.chainId}`));
      process.exit(1);
    }

    try {
      await verify({
        address: options.address,
        env: options.env,
        chainId,
        type: options.type,
      });
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

// Parse and execute
program.parse();
