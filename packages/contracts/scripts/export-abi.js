// Export ABIs to packages/abis for frontend consumption
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../out');
const abiDir = join(__dirname, '../../abis/src');

const contracts = [
  'RegistryHub.sol/RegistryHub.json',
  'registries/StolenWalletRegistry.sol/StolenWalletRegistry.json',
  'FeeManager.sol/FeeManager.json',
];

mkdirSync(abiDir, { recursive: true });

for (const contract of contracts) {
  const [, filename] = contract.split('/').slice(-2);
  const name = filename.replace('.json', '');
  const artifact = JSON.parse(readFileSync(join(outDir, contract), 'utf-8'));
  writeFileSync(
    join(abiDir, `${name}.ts`),
    `export const ${name}ABI = ${JSON.stringify(artifact.abi, null, 2)} as const;\n`
  );
}

console.log('ABIs exported to packages/abis/src/');
