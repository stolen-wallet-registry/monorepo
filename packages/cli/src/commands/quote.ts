import { createPublicClient, http, formatEther, zeroAddress } from 'viem';
import chalk from 'chalk';
import ora from 'ora';
import { getConfig } from '../lib/config.js';
import { formatBatchFee } from '../lib/format.js';
import { WalletRegistryABI, TransactionRegistryABI, OperatorSubmitterABI } from '@swr/abis';

export interface QuoteOptions {
  env: 'local' | 'testnet' | 'mainnet';
  type: 'wallet' | 'transaction' | 'contract';
}

export async function quote(options: QuoteOptions): Promise<void> {
  const spinner = ora();

  try {
    const config = getConfig(options.env);

    // Create a read-only client (no private key needed)
    const publicClient = createPublicClient({
      chain: config.chain,
      transport: http(config.rpcUrl),
    });

    spinner.start(`Fetching ${options.type} registry fee...`);

    let fee: bigint;
    let registryName: string;
    // Operator batch fees are quoted differently from individual registration fees, and are
    // free by default — rendered via formatBatchFee so a 0 quote reads as intentional.
    let isOperatorBatch = false;
    // For wallet/transaction the individual and operator prices are DIFFERENT figures:
    // individuals pay the registry's quoteRegistration() per entry, operators pay
    // OperatorSubmitter.quoteBatchFee() per batch (what submit-wallets/submit-transactions
    // actually send). Show both so an operator is never quoted the individual price.
    let batchFee: bigint | null = null;

    switch (options.type) {
      case 'wallet':
        if (config.contracts.stolenWalletRegistry === zeroAddress) {
          throw new Error('Wallet registry not configured for this environment');
        }
        fee = await publicClient.readContract({
          address: config.contracts.stolenWalletRegistry,
          abi: WalletRegistryABI,
          functionName: 'quoteRegistration',
          args: [zeroAddress],
        });
        registryName = 'Stolen Wallet Registry';
        break;

      case 'transaction':
        if (config.contracts.stolenTransactionRegistry === zeroAddress) {
          throw new Error('Transaction registry not configured for this environment');
        }
        fee = await publicClient.readContract({
          address: config.contracts.stolenTransactionRegistry,
          abi: TransactionRegistryABI,
          functionName: 'quoteRegistration',
          args: [zeroAddress],
        });
        registryName = 'Stolen Transaction Registry';
        break;

      case 'contract':
        if (config.contracts.operatorSubmitter === zeroAddress) {
          throw new Error('OperatorSubmitter not configured for this environment');
        }
        // The contract registry is operator-only: submissions go through OperatorSubmitter,
        // which applies the flat per-BATCH operator fee (free by default), not the
        // per-registration fee individuals pay. Quoting FeeManager.currentFeeWei() here
        // reported the individual price, which is a different figure entirely.
        fee = await publicClient.readContract({
          address: config.contracts.operatorSubmitter,
          abi: OperatorSubmitterABI,
          functionName: 'quoteBatchFee',
        });
        registryName = 'Fraudulent Contract Registry (operator batch)';
        isOperatorBatch = true;
        break;

      default:
        throw new Error(`Unknown registry type: ${options.type}`);
    }

    // Wallet/transaction also have an operator batch path — quote it alongside
    if (!isOperatorBatch && config.contracts.operatorSubmitter !== zeroAddress) {
      batchFee = await publicClient.readContract({
        address: config.contracts.operatorSubmitter,
        abi: OperatorSubmitterABI,
        functionName: 'quoteBatchFee',
      });
    }

    spinner.succeed('Fee retrieved');

    console.log(`\n${chalk.bold(registryName)}`);
    console.log(`  Environment: ${chalk.cyan(options.env)}`);
    if (isOperatorBatch) {
      console.log(`  Batch fee: ${formatBatchFee(fee)}`);
      console.log(`  Fee (wei): ${fee.toString()}`);
    } else {
      console.log(`  Individual registration fee: ${chalk.yellow(formatEther(fee))} ETH`);
      console.log(`  Individual fee (wei): ${fee.toString()}`);
      if (batchFee !== null) {
        console.log(`  Operator batch fee (per batch): ${formatBatchFee(batchFee)}`);
        console.log(`  Operator batch fee (wei): ${batchFee.toString()}`);
      }
    }
  } catch (error) {
    spinner.fail('Failed to get quote');
    throw error;
  }
}
