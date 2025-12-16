import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    'react',
    'react-dom',
    'tailwindcss',
    // Externalize all @radix-ui packages
    /^@radix-ui\//,
  ],
  esbuildOptions(options) {
    options.banner = {
      js: '"use client";',
    };
  },
});
