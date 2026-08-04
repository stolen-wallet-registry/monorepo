import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    // '**/dist/**' (not 'dist/**'): vocs emits a second build tree at docs/dist/, and the
    // config-relative single-level glob leaves eslint linting those minified assets.
    ignores: ['**/dist/**', '.vocs/**'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      // `tseslint.configs.recommended` is an ARRAY of three configs: [base, eslint-recommended,
      // recommended]. Entry [0] is the base config and carries ZERO rules, so the previous
      // `...tseslint.configs.recommended[0]?.rules` spread silently applied nothing and this
      // package ran with no typescript-eslint rules at all. Merge the rules from every entry.
      ...Object.assign({}, ...tseslint.configs.recommended.map((config) => config.rules)),
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];
