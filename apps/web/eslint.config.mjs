import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['.next/**', 'next-env.d.ts', 'next.config.ts', 'playwright.config.ts', 'playwright-report/**', 'test-results/**'] },
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
);
