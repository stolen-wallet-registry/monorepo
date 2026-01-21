import { formatEther } from 'viem';
import chalk from 'chalk';
import ora from 'ora';
import { buildWalletMerkleTree, serializeTree } from '../lib/merkle.js';
import { parseWalletFile } from '../lib/files.js';
import { createClients } from '../lib/client.js';
import { getConfig } from '../lib/config.js';
import { chainIdToBytes32 } from '../lib/caip.js';
import { StolenWalletRegistryABI } from '@swr/abis';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export interface SubmitWalletsOptions {
  file: string;
  network: 'local' | 'testnet' | 'mainnet';
  privateKey: string;
  chainId?: number;
  outputDir?: string;
  dryRun?: boolean;
}

export async function submitWallets(options: SubmitWalletsOptions): Promise<void> {
  const spinner = ora();

  try {
    // 1. Load configuration
    const config = getConfig(options.network);

    if (config.contracts.stolenWalletRegistry === '0x0000000000000000000000000000000000000000') {
      throw new Error(`Contract addresses not configured for network: ${options.network}`);
    }

    // 2. Parse input file
    spinner.start('Parsing input file...');
    const defaultChainId = options.chainId ? BigInt(options.chainId) : 8453n;
    const entries = await parseWalletFile(options.file, defaultChainId);
    spinner.succeed(`Loaded ${entries.length} wallet addresses`);

    // 3. Build Merkle tree
    spinner.start('Building Merkle tree...');
    const { root, tree } = buildWalletMerkleTree(entries);
    spinner.succeed(`Merkle root: ${chalk.cyan(root)}`);

    // 4. Setup client
    const { publicClient, walletClient, account } = createClients(
      config,
      options.privateKey as `0x${string}`
    );

    console.log(chalk.gray(`Operator address: ${account}`));

    // 5. Quote fee
    spinner.start('Fetching fee quote...');
    const fee = await publicClient.readContract({
      address: config.contracts.stolenWalletRegistry,
      abi: StolenWalletRegistryABI,
      functionName: 'quoteOperatorRegistration',
    });
    spinner.succeed(`Fee: ${chalk.yellow(formatEther(fee))} ETH`);

    // 6. Prepare transaction data
    const reportedChainId = chainIdToBytes32(defaultChainId);
    const walletAddresses = entries.map((e) => e.address);
    const chainIds = entries.map((e) => e.chainId);

    if (options.dryRun) {
      console.log(chalk.yellow('\n--- DRY RUN ---'));
      console.log('Would submit:');
      console.log(`  Merkle root: ${root}`);
      console.log(`  Chain ID: ${reportedChainId}`);
      console.log(`  Wallets: ${entries.length}`);
      console.log(`  Fee: ${formatEther(fee)} ETH`);
      return;
    }

    // 7. Submit transaction
    spinner.start('Submitting batch...');
    const hash = await walletClient.writeContract({
      chain: config.chain,
      account,
      address: config.contracts.stolenWalletRegistry,
      abi: StolenWalletRegistryABI,
      functionName: 'registerBatch',
      args: [root, reportedChainId, walletAddresses, chainIds],
      value: fee,
    });
    spinner.succeed(`Transaction submitted: ${chalk.green(hash)}`);

    // 8. Wait for confirmation
    spinner.start('Waiting for confirmation...');
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    spinner.succeed(`Confirmed in block ${receipt.blockNumber}`);

    // 9. Save tree for verification
    if (options.outputDir) {
      const outputDir = options.outputDir;
      await mkdir(outputDir, { recursive: true });

      const treeFile = join(outputDir, `tree-${hash.slice(0, 10)}.json`);
      await writeFile(treeFile, serializeTree(tree));
      console.log(chalk.gray(`Tree saved to: ${treeFile}`));
    }

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
