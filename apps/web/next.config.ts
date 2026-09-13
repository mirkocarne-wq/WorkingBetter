import type { NextConfig } from 'next';
const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@wb/shared'],
  output: 'standalone',
};
export default config;
