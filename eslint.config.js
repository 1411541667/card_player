import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'release', 'launcher', 'server.cjs', 'node.exe', 'GameLauncher.exe', 'playwright-report', 'test-results'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        process: 'readonly',
        // Referenced inside Playwright page.evaluate callbacks, which are
        // serialized and evaluated in the browser rather than in Node.
        Blob: 'readonly',
        Image: 'readonly',
        URL: 'readonly',
        document: 'readonly',
      },
    },
  },
);
