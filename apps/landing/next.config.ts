import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable React strict mode
  reactStrictMode: true,

  // Transpile @swr packages for proper monorepo support
  transpilePackages: ['@swr/ui', '@swr/abis'],

  // Experimental features disabled - optimizeCss requires 'critters' package
  // experimental: {
  //   optimizeCss: true,
  // },
};

export default nextConfig;
