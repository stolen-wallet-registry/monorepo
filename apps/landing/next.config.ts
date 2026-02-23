import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable React strict mode
  reactStrictMode: true,

  // NOTE: @swr/ui and @swr/abis are pre-built by tsup (dist/index.js).
  // Do NOT add them to transpilePackages — that forces Next.js to re-compile
  // them from scratch on every build, adding 30-60 seconds for no benefit.

  experimental: {
    // Transform barrel re-exports into direct imports.
    // @web3icons/react has 2,143 named exports — without this,
    // Next.js resolves/parses ALL of them even though we use ~30 icons.
    optimizePackageImports: ['@web3icons/react', '@swr/ui', 'lucide-react'],
  },
};

export default nextConfig;
