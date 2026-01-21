import { formatEther } from 'viem';
import chalk from 'chalk';
import ora from 'ora';
import { createClients } from '../lib/client.js';
import { getConfig } from '../lib/config.js';
import {
  FraudulentContractRegistryABI,
  StolenWalletRegistryABI,
  StolenTransactionRegistryABI,
} from '@swr/abis';

export interface QuoteOptions {
  network: 'local' | 'testnet' | 'mainnet';
  type: 'wallet' | 'transaction' | 'contract';
  privateKey?: string;
}

export async function quote(options: QuoteOptions): Promise<void> {
  const spinner = ora();

  try {
    const config = getConfig(options.network);

    // Create a read-only client (no private key needed)
    const { publicClient } = createClients(
      config,
      // Use a dummy key for read-only operations
      '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`
    );

    spinner.start(`Fetching ${options.type} registry fee...`);

    let fee: bigint;
    let registryName: string;

    switch (options.type) {
      case 'wallet':
        if (
          config.contracts.stolenWalletRegistry === '0x0000000000000000000000000000000000000000'
        ) {
          throw new Error('Wallet registry not configured for this network');
        }
        fee = await publicClient.readContract({
          address: config.contracts.stolenWalletRegistry,
          abi: StolenWalletRegistryABI,
          functionName: 'quoteOperatorRegistration',
        });
        registryName = 'Stolen Wallet Registry';
        break;

      case 'transaction':
        if (
          config.contracts.stolenTransactionRegistry ===
          '0x0000000000000000000000000000000000000000'
        ) {
          throw new Error('Transaction registry not configured for this network');
        }
        fee = await publicClient.readContract({
          address: config.contracts.stolenTransactionRegistry,
          abi: StolenTransactionRegistryABI,
          functionName: 'quoteOperatorRegistration',
        });
        registryName = 'Stolen Transaction Registry';
        break;

      case 'contract':
        if (
          config.contracts.fraudulentContractRegistry ===
          '0x0000000000000000000000000000000000000000'
        ) {
          throw new Error('Contract registry not configured for this network');
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
    console.log(`  Network: ${chalk.cyan(options.network)}`);
    console.log(`  Fee: ${chalk.yellow(formatEther(fee))} ETH`);
    console.log(`  Fee (wei): ${fee.toString()}`);
  } catch (error) {
    spinner.fail('Failed to get quote');
    throw error;
  }
}
