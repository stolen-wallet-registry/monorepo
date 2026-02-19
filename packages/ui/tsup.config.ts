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
    // Externalize large icon/animation libraries so consuming apps can
    // tree-shake them via Next.js optimizePackageImports instead of
    // bundling everything into a single fat @swr/ui dist file.
    '@web3icons/react',
    /^@web3icons\//,
    'lucide-react',
    'motion',
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
