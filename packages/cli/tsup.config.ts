import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  // Bundle workspace packages since they export raw TypeScript
  noExternal: ['@swr/abis', '@swr/chains'],
});
