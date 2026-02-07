// Export ABIs to packages/abis for frontend consumption
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../out');
const abiDir = join(__dirname, '../../abis/src');

// Foundry flattens output - artifacts are at ContractName.sol/ContractName.json
const contracts = [
  // Hub + Separate Registries (current architecture)
  'FraudRegistryHub.sol/FraudRegistryHub.json',
  'WalletRegistry.sol/WalletRegistry.json',
  'TransactionRegistry.sol/TransactionRegistry.json',
  'ContractRegistry.sol/ContractRegistry.json',
  'OperatorSubmitter.sol/OperatorSubmitter.json',
  'SpokeRegistry.sol/SpokeRegistry.json',
  'CrossChainInbox.sol/CrossChainInbox.json',
  // Infrastructure contracts
  'FeeManager.sol/FeeManager.json',
  'OperatorRegistry.sol/OperatorRegistry.json',
  'HyperlaneAdapter.sol/HyperlaneAdapter.json',
  // Soulbound contracts
  'TranslationRegistry.sol/TranslationRegistry.json',
  'WalletSoulbound.sol/WalletSoulbound.json',
  'SupportSoulbound.sol/SupportSoulbound.json',
  'SpokeSoulboundForwarder.sol/SpokeSoulboundForwarder.json',
  'SoulboundReceiver.sol/SoulboundReceiver.json',
];

mkdirSync(abiDir, { recursive: true });

const exportStatements = [];

for (const contract of contracts) {
  const artifactPath = join(outDir, contract);
  const [, filename] = contract.split('/').slice(-2);
  const name = filename.replace('.json', '');

  // Check if artifact file exists
  if (!existsSync(artifactPath)) {
    console.error(`Artifact not found: ${contract} - skipping`);
    continue;
  }

  try {
    const artifactContent = readFileSync(artifactPath, 'utf-8');
    const artifact = JSON.parse(artifactContent);

    if (!artifact.abi) {
      console.error(`No ABI found in artifact ${contract} - skipping`);
      continue;
    }

    writeFileSync(
      join(abiDir, `${name}.ts`),
      `export const ${name}ABI = ${JSON.stringify(artifact.abi, null, 2)} as const;\n`
    );
    exportStatements.push(`export { ${name}ABI } from './${name}';`);
    console.log(`Exported: ${name}`);
  } catch (err) {
    console.error(`Failed to load artifact ${contract}:`, err.message);
    continue;
  }
}

// Regenerate index.ts with all exports
writeFileSync(
  join(abiDir, 'index.ts'),
  `// Generated ABI exports - populated by \`pnpm --filter @swr/contracts export-abi\`\n` +
    `// Run \`forge build\` in packages/contracts first, then export-abi\n\n` +
    (exportStatements.length > 0 ? exportStatements.join('\n') + '\n' : 'export {};\n')
);

console.log(`\nABIs exported to packages/abis/src/ (${exportStatements.length} contracts)`);
