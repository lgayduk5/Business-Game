// Lint: the recommended JavaScript and TypeScript rules, tuned to the house style. Run with `npm run lint`.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'shots/**', 'node_modules/**', 'public/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // the engine and UI pass loosely typed data across a few seams (modal payloads, JSON content)
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      '@typescript-eslint/no-unused-expressions': ['error', { allowTernary: true, allowShortCircuit: true }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'prefer-const': ['error', { destructuring: 'all' }],
      eqeqeq: ['error', 'smart'],
      'no-console': 'off',
    },
  },
  {
    // the engine must stay free of the DOM so it can run in a worker, in tests and in native wrappers
    files: ['engine/**/*.ts'],
    languageOptions: { globals: { ...globals.es2021 } },
    rules: { 'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'navigator'] },
  },
);
