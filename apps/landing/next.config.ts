import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable React strict mode
  reactStrictMode: true,

  // Transpile @swr/ui package for proper monorepo support
  transpilePackages: ['@swr/ui'],

  // Experimental features disabled - optimizeCss requires 'critters' package
  // experimental: {
  //   optimizeCss: true,
  // },
};

export default nextConfig;
