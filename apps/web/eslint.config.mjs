import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['.next/**', 'next-env.d.ts', 'next.config.ts'] },
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
);
