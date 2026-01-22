import { createPublicClient, http, formatEther, zeroAddress } from 'viem';
import chalk from 'chalk';
import ora from 'ora';
import { getConfig } from '../lib/config.js';
import {
  FraudulentContractRegistryABI,
  StolenWalletRegistryABI,
  StolenTransactionRegistryABI,
} from '@swr/abis';

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

    switch (options.type) {
      case 'wallet':
        if (config.contracts.stolenWalletRegistry === zeroAddress) {
          throw new Error('Wallet registry not configured for this environment');
        }
        // Use operator batch quote for CLI (operators use batch registration)
        fee = await publicClient.readContract({
          address: config.contracts.stolenWalletRegistry,
          abi: StolenWalletRegistryABI,
          functionName: 'quoteOperatorBatchRegistration',
        });
        registryName = 'Stolen Wallet Registry';
        break;

      case 'transaction':
        if (config.contracts.stolenTransactionRegistry === zeroAddress) {
          throw new Error('Transaction registry not configured for this environment');
        }
        // quoteRegistration takes reporter param (unused on hub, for interface compatibility)
        fee = await publicClient.readContract({
          address: config.contracts.stolenTransactionRegistry,
          abi: StolenTransactionRegistryABI,
          functionName: 'quoteRegistration',
          args: [zeroAddress],
        });
        registryName = 'Stolen Transaction Registry';
        break;

      case 'contract':
        if (config.contracts.fraudulentContractRegistry === zeroAddress) {
          throw new Error('Contract registry not configured for this environment');
        }
        fee = await publicClient.readContract({
          address: config.contracts.fraudulentContractRegistry,
          abi: FraudulentContractRegistryABI,
          functionName: 'quoteRegistration',
        });
        registryName = 'Fraudulent Contract Registry';
        break;

      default:
        throw new Error(`Unknown registry type: ${options.type}`);
    }

    spinner.succeed('Fee retrieved');

    console.log(`\n${chalk.bold(registryName)}`);
    console.log(`  Environment: ${chalk.cyan(options.env)}`);
    console.log(`  Fee: ${chalk.yellow(formatEther(fee))} ETH`);
    console.log(`  Fee (wei): ${fee.toString()}`);
  } catch (error) {
    spinner.fail('Failed to get quote');
    throw error;
  }
}
