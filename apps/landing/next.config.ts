import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable React strict mode
  reactStrictMode: true,

  // Transpile @swr packages for proper monorepo support
  transpilePackages: ['@swr/ui', '@swr/abis'],

  experimental: {
    // Transform barrel re-exports into direct imports.
    // @web3icons/react has 2,143 named exports in one barrel file — without this,
    // Next.js resolves/parses ALL of them even though we use ~20 icons.
    optimizePackageImports: ['@web3icons/react', '@swr/ui', 'lucide-react'],
  },
};

export default nextConfig;
