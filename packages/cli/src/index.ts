#!/usr/bin/env node

import { Command } from 'commander';
import { config as loadEnv } from 'dotenv';
import chalk from 'chalk';

import { submitContracts } from './commands/submit-contracts.js';
import { submitWallets } from './commands/submit-wallets.js';
import { submitTransactions } from './commands/submit-transactions.js';
import { verify } from './commands/verify.js';
import { quote } from './commands/quote.js';

// Load environment variables
loadEnv();

const program = new Command();

program.name('swr').description('Stolen Wallet Registry CLI for operators').version('0.1.0');

// ═══════════════════════════════════════════════════════════════════════════
// SUBMIT COMMANDS
// ═══════════════════════════════════════════════════════════════════════════

program
  .command('submit-contracts')
  .description('Submit a batch of fraudulent contracts')
  .requiredOption('-f, --file <path>', 'Input file (JSON or CSV)')
  .option('-e, --env <env>', 'Environment: local, testnet, mainnet', 'local')
  .option('-k, --private-key <key>', 'Operator private key (or set OPERATOR_PRIVATE_KEY env)')
  .option('-c, --chain-id <id>', 'Default chain ID for entries', '8453')
  .option('-o, --output-dir <path>', 'Directory to save Merkle tree and transaction data')
  .option('--dry-run', 'Simulate without submitting')
  .option('--build-only', 'Build transaction data for multisig (no private key needed)')
  .action(async (options) => {
    const privateKey = options.privateKey || process.env.OPERATOR_PRIVATE_KEY;

    // Private key only required if not using --build-only or --dry-run
    if (!privateKey && !options.buildOnly && !options.dryRun) {
      console.error(
        chalk.red(
          'Error: Private key required. Use --private-key, set OPERATOR_PRIVATE_KEY, or use --build-only for multisig'
        )
      );
      process.exit(1);
    }

    const chainId = Number(options.chainId);
    if (!Number.isInteger(chainId) || chainId <= 0) {
      console.error(chalk.red(`Error: Invalid chain ID: ${options.chainId}`));
      process.exit(1);
    }

    if (privateKey && !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
      console.error(chalk.red('Error: Private key must be 32-byte hex with 0x prefix'));
      process.exit(1);
    }

    try {
      await submitContracts({
        file: options.file,
        env: options.env,
        privateKey,
        chainId,
        outputDir: options.outputDir,
        dryRun: options.dryRun,
        buildOnly: options.buildOnly,
      });
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

program
  .command('submit-wallets')
  .description('Submit a batch of stolen wallets')
  .requiredOption('-f, --file <path>', 'Input file (JSON or CSV)')
  .option('-e, --env <env>', 'Environment: local, testnet, mainnet', 'local')
  .option('-k, --private-key <key>', 'Operator private key')
  .option('-c, --chain-id <id>', 'Default chain ID', '8453')
  .option('-o, --output-dir <path>', 'Directory to save Merkle tree and transaction data')
  .option('--dry-run', 'Simulate without submitting')
  .option('--build-only', 'Build transaction data for multisig (no private key needed)')
  .action(async (options) => {
    const privateKey = options.privateKey || process.env.OPERATOR_PRIVATE_KEY;

    // Private key only required if not using --build-only or --dry-run
    if (!privateKey && !options.buildOnly && !options.dryRun) {
      console.error(
        chalk.red(
          'Error: Private key required. Use --private-key, set OPERATOR_PRIVATE_KEY, or use --build-only for multisig'
        )
      );
      process.exit(1);
    }

    const chainId = Number(options.chainId);
    if (!Number.isInteger(chainId) || chainId <= 0) {
      console.error(chalk.red(`Error: Invalid chain ID: ${options.chainId}`));
      process.exit(1);
    }

    if (privateKey && !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
      console.error(chalk.red('Error: Private key must be 32-byte hex with 0x prefix'));
      process.exit(1);
    }

    try {
      await submitWallets({
        file: options.file,
        env: options.env,
        privateKey,
        chainId,
        outputDir: options.outputDir,
        dryRun: options.dryRun,
        buildOnly: options.buildOnly,
      });
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

program
  .command('submit-transactions')
  .description('Submit a batch of stolen transactions')
  .requiredOption('-f, --file <path>', 'Input file (JSON or CSV)')
  .option('-e, --env <env>', 'Environment: local, testnet, mainnet', 'local')
  .option('-k, --private-key <key>', 'Operator private key')
  .option('-c, --chain-id <id>', 'Default chain ID', '8453')
  .option('-o, --output-dir <path>', 'Directory to save Merkle tree and transaction data')
  .option('--dry-run', 'Simulate without submitting')
  .option('--build-only', 'Build transaction data for multisig (no private key needed)')
  .action(async (options) => {
    const privateKey = options.privateKey || process.env.OPERATOR_PRIVATE_KEY;

    // Private key only required if not using --build-only or --dry-run
    if (!privateKey && !options.buildOnly && !options.dryRun) {
      console.error(
        chalk.red(
          'Error: Private key required. Use --private-key, set OPERATOR_PRIVATE_KEY, or use --build-only for multisig'
        )
      );
      process.exit(1);
    }

    const chainId = Number(options.chainId);
    if (!Number.isInteger(chainId) || chainId <= 0) {
      console.error(chalk.red(`Error: Invalid chain ID: ${options.chainId}`));
      process.exit(1);
    }

    if (privateKey && !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
      console.error(chalk.red('Error: Private key must be 32-byte hex with 0x prefix'));
      process.exit(1);
    }

    try {
      await submitTransactions({
        file: options.file,
        env: options.env,
        privateKey,
        chainId,
        outputDir: options.outputDir,
        dryRun: options.dryRun,
        buildOnly: options.buildOnly,
      });
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
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
