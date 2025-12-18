// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from 'eslint-plugin-storybook';

import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        // Required in monorepos to tell typescript-eslint which tsconfig to use
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Allow barrel exports and test utilities to re-export
      'react-refresh/only-export-components': [
        'warn',
        { allowExportNames: ['render', 'buttonVariants'] },
      ],
      // Allow underscore-prefixed unused variables (common pattern for intentionally unused params)
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Disable react-refresh for test files
    files: ['**/test/**', '**/*.test.*'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
]);
