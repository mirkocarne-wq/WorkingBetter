import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@wb/shared'],
  // In Docker produciamo l'output standalone (server.js autonomo con le sole dipendenze necessarie).
  ...(process.env.DOCKER_BUILD === '1' ? { output: 'standalone' as const, outputFileTracingRoot: root } : {}),
};
export default config;
