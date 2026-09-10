import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/**
 * Flat config for the whole workspace. Deliberately small: no stylistic rules
 * (the code already has a house style and nobody needs a linter arguing about
 * commas) and no type-checked rules, so `npm run lint` stays fast enough to
 * run on every commit. What is left is the class of thing a reader would not
 * catch: unused bindings, unreachable code, hooks called conditionally.
 *
 * It is `.mjs` rather than `.js` because the root package is CommonJS and this
 * file is ES modules.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**', '**/dist/**', '**/dist-electron/**',
      '**/build/**', '**/.expo/**', '**/release/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // The row mappers hand postgrest's untyped rows straight through, and
      // Electron's `app.isQuitting` is a field Electron does not declare.
      '@typescript-eslint/no-explicit-any': 'off',
      // TypeScript resolves identifiers itself, and knows about DOM and RN
      // globals this config would otherwise have to enumerate twice.
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        // `_e` in an IPC handler names the position rather than being used.
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  {
    files: ['**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      // Off, not warn: several effects narrow their dependencies on purpose --
      // the reminder loop, the nudge badge, the session ticker -- and each says
      // why in a comment the rule cannot read. Warnings nobody may act on are
      // worse than an honest exception recorded here.
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  {
    files: ['apps/desktop/electron/**/*.ts', 'scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/desktop/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx}', 'packages/*/src/**/*.ts'],
    // React Native and the storage layer both run on a host that provides the
    // timer and console globals without being a browser.
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
