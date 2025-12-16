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
  // Banner required because tsup bundles all components into single file,
  // losing source-level "use client" directives. Next.js only recognizes
  // the directive at the TOP of a file.
  esbuildOptions(options) {
    options.banner = {
      js: '"use client";',
    };
  },
});
