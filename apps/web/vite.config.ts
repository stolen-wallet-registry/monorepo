/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
const dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  server: {
    port: Number(process.env.PORT) || 5173,
  },
  plugins: [
    react(),
    tailwindcss(),
    // Polyfill Node.js globals for browser (Buffer, process, etc.)
    // Required by @hyperlane-xyz/sdk and other Web3 libraries
    nodePolyfills({
      include: ['buffer', 'process'],
      globals: {
        Buffer: true,
        process: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
  // Pre-bundle Web3 dependencies for faster dev server startup
  optimizeDeps: {
    include: [
      '@rainbow-me/rainbowkit',
      'wagmi',
      'viem',
      '@tanstack/react-query',
      '@tanstack/react-query-devtools',
    ],
    esbuildOptions: {
      target: 'esnext',
    },
  },
  // Build configuration for production
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        // Split heavy vendor chunks for better caching and reduced initial load
        manualChunks: {
          'vendor-web3': ['wagmi', 'viem', '@tanstack/react-query'],
          'vendor-rainbow': ['@rainbow-me/rainbowkit'],
          'vendor-p2p': ['libp2p', '@libp2p/webrtc', '@libp2p/websockets'],
        },
      },
    },
  },
  // Global definitions for Web3 compatibility
  define: {
    global: 'globalThis',
  },
  test: {
    projects: [
      {
        extends: true,
        plugins: [
          // The plugin will run tests for the stories defined in your Storybook config
          // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
          storybookTest({
            configDir: path.join(dirname, '.storybook'),
          }),
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [
              {
                browser: 'chromium',
              },
            ],
          },
          setupFiles: ['.storybook/vitest.setup.ts'],
        },
      },
    ],
  },
});
