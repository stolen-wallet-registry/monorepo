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

// A missing/renamed artifact must FAIL the export, not silently drop the ABI — a silent
// skip degrades to a confusing compile error (or worse, a stale committed ABI) downstream.
// All artifacts are parsed BEFORE anything is written: failing mid-loop would leave fresh
// ABI files alongside a stale index.ts, the exact partial state the failure exists to prevent.
const failures = [];
const parsed = [];

for (const contract of contracts) {
  const artifactPath = join(outDir, contract);
  const [, filename] = contract.split('/').slice(-2);
  const name = filename.replace('.json', '');

  // Check if artifact file exists
  if (!existsSync(artifactPath)) {
    console.error(`Artifact not found: ${contract}`);
    failures.push(contract);
    continue;
  }

  try {
    const artifactContent = readFileSync(artifactPath, 'utf-8');
    const artifact = JSON.parse(artifactContent);

    if (!artifact.abi) {
      console.error(`No ABI found in artifact ${contract}`);
      failures.push(contract);
      continue;
    }

    parsed.push({ name, abi: artifact.abi });
  } catch (err) {
    console.error(`Failed to load artifact ${contract}:`, err.message);
    failures.push(contract);
    continue;
  }
}

if (failures.length > 0) {
  console.error(
    `\nexport-abi FAILED: ${failures.length} artifact(s) missing or unreadable:\n` +
      failures.map((f) => `  - ${f}`).join('\n') +
      `\nDid a contract get renamed? Update the list in scripts/export-abi.js and re-run forge build.` +
      `\nNo files were written.`
  );
  process.exit(1);
}

const exportStatements = [];
for (const { name, abi } of parsed) {
  writeFileSync(
    join(abiDir, `${name}.ts`),
    `export const ${name}ABI = ${JSON.stringify(abi, null, 2)} as const;\n`
  );
  exportStatements.push(`export { ${name}ABI } from './${name}';`);
  console.log(`Exported: ${name}`);
}

// Regenerate index.ts with all exports
writeFileSync(
  join(abiDir, 'index.ts'),
  `// Generated ABI exports - populated by \`pnpm --filter @swr/contracts export-abi\`\n` +
    `// Run \`forge build\` in packages/contracts first, then export-abi\n\n` +
    (exportStatements.length > 0 ? exportStatements.join('\n') + '\n' : 'export {};\n')
);

console.log(`\nABIs exported to packages/abis/src/ (${exportStatements.length} contracts)`);
