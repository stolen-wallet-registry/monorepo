import chalk from 'chalk';
import ora from 'ora';
import { createPublicClient, http, isAddress, zeroAddress, type Address, type Hex } from 'viem';
import { getConfig } from '../lib/config.js';
import { chainIdToBytes32 } from '../lib/caip.js';
import { FraudulentContractRegistryABI, StolenWalletRegistryABI } from '@swr/abis';

export interface VerifyOptions {
  address: string;
  network: 'local' | 'testnet' | 'mainnet';
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

    const config = getConfig(options.network);
    const chainIdBytes = chainIdToBytes32(BigInt(options.chainId));

    // Create a read-only client (no private key needed)
    const publicClient = createPublicClient({
      chain: config.chain,
      transport: http(config.rpcUrl),
    });

    spinner.start(`Checking ${options.type} registry...`);

    let entryHash: Hex;
    let isInvalidated: boolean;
    let registryName: string;

    switch (options.type) {
      case 'wallet': {
        if (config.contracts.stolenWalletRegistry === zeroAddress) {
          throw new Error('Wallet registry not configured for this network');
        }

        // Check if wallet is registered via individual registration
        const isRegistered = await publicClient.readContract({
          address: config.contracts.stolenWalletRegistry,
          abi: StolenWalletRegistryABI,
          functionName: 'isRegistered',
          args: [options.address as Address],
        });

        // Compute entry hash for operator batch entries
        entryHash = await publicClient.readContract({
          address: config.contracts.stolenWalletRegistry,
          abi: StolenWalletRegistryABI,
          functionName: 'computeWalletEntryHash',
          args: [options.address as Address, chainIdBytes],
        });

        isInvalidated = await publicClient.readContract({
          address: config.contracts.stolenWalletRegistry,
          abi: StolenWalletRegistryABI,
          functionName: 'isWalletEntryInvalidated',
          args: [entryHash],
        });

        registryName = 'Stolen Wallet Registry';
        spinner.succeed('Query complete');

        console.log(`\n${chalk.bold(registryName)}`);
        console.log(`  Address: ${chalk.cyan(options.address)}`);
        console.log(`  Chain ID: ${options.chainId}`);
        console.log(`  Entry Hash: ${entryHash}`);
        console.log(
          `  Individual Registration: ${isRegistered ? chalk.red('REGISTERED') : chalk.green('Not registered')}`
        );
        console.log(
          `  Entry Invalidated: ${isInvalidated ? chalk.yellow('Yes') : chalk.green('No')}`
        );
        break;
      }

      case 'contract': {
        if (config.contracts.fraudulentContractRegistry === zeroAddress) {
          throw new Error('Contract registry not configured for this network');
        }

        entryHash = await publicClient.readContract({
          address: config.contracts.fraudulentContractRegistry,
          abi: FraudulentContractRegistryABI,
          functionName: 'computeEntryHash',
          args: [options.address as Address, chainIdBytes],
        });

        isInvalidated = await publicClient.readContract({
          address: config.contracts.fraudulentContractRegistry,
          abi: FraudulentContractRegistryABI,
          functionName: 'isEntryInvalidated',
          args: [entryHash],
        });

        registryName = 'Fraudulent Contract Registry';
        spinner.succeed('Query complete');

        console.log(`\n${chalk.bold(registryName)}`);
        console.log(`  Address: ${chalk.cyan(options.address)}`);
        console.log(`  Chain ID: ${options.chainId}`);
        console.log(`  Entry Hash: ${entryHash}`);
        console.log(
          `  Entry Invalidated: ${isInvalidated ? chalk.yellow('Yes') : chalk.green('No')}`
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
