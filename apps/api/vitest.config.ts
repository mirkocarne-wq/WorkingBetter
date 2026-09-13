import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC per i decoratori NestJS (esbuild non emette i metadata dei decoratori).
export default defineConfig({
  test: { include: ['test/**/*.e2e.test.ts', 'src/**/*.test.ts'], testTimeout: 30000, hookTimeout: 60000 },
  plugins: [swc.vite({ module: { type: 'es6' }, jsc: { transform: { decoratorMetadata: true, legacyDecorator: true }, target: 'es2022' } })],
});
