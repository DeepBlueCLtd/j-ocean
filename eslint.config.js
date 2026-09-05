import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'scripts/gates/fixtures/**', 'test-results/**', 'playwright-report/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Principle III, belt and braces beside gate G-03: the model may not reach for the
    // harness or for anything that draws. The gate is the enforcement; this is the
    // message a developer gets in their editor before they ever run it.
    files: ['src/model/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-dom', 'react/*', 'react-dom/*'], message: 'constitution III: src/model/ imports no rendering module.' },
            { group: ['**/harness/**'], message: 'constitution III: the dependency direction is one way; the model does not import the harness.' },
          ],
        },
      ],
    },
  },
);
