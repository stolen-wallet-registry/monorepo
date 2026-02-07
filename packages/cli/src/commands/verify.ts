import chalk from 'chalk';
import ora from 'ora';
import { createPublicClient, http, isAddress, zeroAddress, type Address } from 'viem';
import { getConfig } from '../lib/config.js';
import { chainIdToBytes32 } from '../lib/caip.js';
import { WalletRegistryABI, ContractRegistryABI } from '@swr/abis';

export interface VerifyOptions {
  address: string;
  env: 'local' | 'testnet' | 'mainnet';
  chainId: number;
  type: 'wallet' | 'contract';
}

export async function verify(options: VerifyOptions): Promise<void> {
  const spinner = ora();

  try {
    // Validate address
    if (!isAddress(options.address)) {
      throw new Error(`Invalid address: ${options.address}`);
    }

    const config = getConfig(options.env);

    // Note: options.chainId is the chain where the wallet/contract resides (e.g., Ethereum mainnet = 1).
    // config.chain is the hub chain where the registry is deployed (e.g., Base).
    // These are intentionally different - we query the hub registry to verify entries from any chain.
    const chainIdBytes = chainIdToBytes32(BigInt(options.chainId));

    // Create a read-only client (no private key needed)
    const publicClient = createPublicClient({
      chain: config.chain,
      transport: http(config.rpcUrl),
    });

    spinner.start(`Checking ${options.type} registry...`);

    let registryName: string;

    switch (options.type) {
      case 'wallet': {
        if (config.contracts.stolenWalletRegistry === zeroAddress) {
          throw new Error('Wallet registry not configured for this environment');
        }

        // Check if wallet is registered
        const isRegistered = await publicClient.readContract({
          address: config.contracts.stolenWalletRegistry,
          abi: WalletRegistryABI,
          functionName: 'isWalletRegistered',
          args: [options.address as Address],
        });

        // Check if wallet is pending (acknowledged but not yet registered)
        const isPending = await publicClient.readContract({
          address: config.contracts.stolenWalletRegistry,
          abi: WalletRegistryABI,
          functionName: 'isWalletPending',
          args: [options.address as Address],
        });

        registryName = 'Stolen Wallet Registry';
        spinner.succeed('Query complete');

        console.log(`\n${chalk.bold(registryName)}`);
        console.log(`  Address: ${chalk.cyan(options.address)}`);
        console.log(`  Chain ID: ${options.chainId}`);
        console.log(
          `  Registered: ${isRegistered ? chalk.red('YES - STOLEN') : chalk.green('No')}`
        );
        console.log(
          `  Pending: ${isPending ? chalk.yellow('Yes (acknowledged, awaiting registration)') : chalk.green('No')}`
        );
        break;
      }

      case 'contract': {
        if (config.contracts.fraudulentContractRegistry === zeroAddress) {
          throw new Error('Contract registry not configured for this environment');
        }

        const isRegistered = await publicClient.readContract({
          address: config.contracts.fraudulentContractRegistry,
          abi: ContractRegistryABI,
          functionName: 'isContractRegistered',
          args: [options.address as Address, chainIdBytes],
        });

        registryName = 'Fraudulent Contract Registry';
        spinner.succeed('Query complete');

        console.log(`\n${chalk.bold(registryName)}`);
        console.log(`  Address: ${chalk.cyan(options.address)}`);
        console.log(`  Chain ID: ${options.chainId}`);
        console.log(
          `  Registered: ${isRegistered ? chalk.red('YES - FRAUDULENT') : chalk.green('No')}`
        );
        break;
      }

      default:
        throw new Error(`Unknown registry type: ${options.type}`);
    }
  } catch (error) {
    spinner.fail('Verification failed');
    throw error;
  }
}
