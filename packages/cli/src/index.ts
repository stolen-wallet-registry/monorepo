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
  .option('-n, --network <network>', 'Network: local, testnet, mainnet', 'local')
  .option('-k, --private-key <key>', 'Operator private key (or set OPERATOR_PRIVATE_KEY env)')
  .option('-c, --chain-id <id>', 'Default chain ID for entries', '8453')
  .option('-o, --output-dir <path>', 'Directory to save Merkle tree')
  .option('--dry-run', 'Simulate without submitting')
  .action(async (options) => {
    const privateKey = options.privateKey || process.env.OPERATOR_PRIVATE_KEY;
    if (!privateKey) {
      console.error(
        chalk.red('Error: Private key required. Use --private-key or set OPERATOR_PRIVATE_KEY')
      );
      process.exit(1);
    }

    try {
      await submitContracts({
        file: options.file,
        network: options.network,
        privateKey,
        chainId: parseInt(options.chainId),
        outputDir: options.outputDir,
        dryRun: options.dryRun,
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
  .option('-n, --network <network>', 'Network: local, testnet, mainnet', 'local')
  .option('-k, --private-key <key>', 'Operator private key')
  .option('-c, --chain-id <id>', 'Default chain ID', '8453')
  .option('-o, --output-dir <path>', 'Directory to save Merkle tree')
  .option('--dry-run', 'Simulate without submitting')
  .action(async (options) => {
    const privateKey = options.privateKey || process.env.OPERATOR_PRIVATE_KEY;
    if (!privateKey) {
      console.error(
        chalk.red('Error: Private key required. Use --private-key or set OPERATOR_PRIVATE_KEY')
      );
      process.exit(1);
    }

    try {
      await submitWallets({
        file: options.file,
        network: options.network,
        privateKey,
        chainId: parseInt(options.chainId),
        outputDir: options.outputDir,
        dryRun: options.dryRun,
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
  .option('-n, --network <network>', 'Network: local, testnet, mainnet', 'local')
  .option('-k, --private-key <key>', 'Operator private key')
  .option('-c, --chain-id <id>', 'Default chain ID', '8453')
  .option('-o, --output-dir <path>', 'Directory to save Merkle tree')
  .option('--dry-run', 'Simulate without submitting')
  .action(async (options) => {
    const privateKey = options.privateKey || process.env.OPERATOR_PRIVATE_KEY;
    if (!privateKey) {
      console.error(
        chalk.red('Error: Private key required. Use --private-key or set OPERATOR_PRIVATE_KEY')
      );
      process.exit(1);
    }

    try {
      await submitTransactions({
        file: options.file,
        network: options.network,
        privateKey,
        chainId: parseInt(options.chainId),
        outputDir: options.outputDir,
        dryRun: options.dryRun,
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
  .option('-n, --network <network>', 'Network: local, testnet, mainnet', 'local')
  .option('-t, --type <type>', 'Registry type: wallet, transaction, contract', 'contract')
  .action(async (options) => {
    try {
      await quote({
        network: options.network,
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
  .option('-n, --network <network>', 'Network: local, testnet, mainnet', 'local')
  .option('-c, --chain-id <id>', 'Chain ID', '8453')
  .option('-t, --type <type>', 'Registry type: wallet, contract', 'contract')
  .action(async (options) => {
    try {
      await verify({
        address: options.address,
        network: options.network,
        chainId: parseInt(options.chainId),
        type: options.type,
      });
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

// Parse and execute
program.parse();
