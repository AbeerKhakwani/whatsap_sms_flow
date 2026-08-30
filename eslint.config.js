import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `backups/` holds archived snapshots of files (old sms-webhook versions, JSON dumps),
  // not code that runs. Linting them reported dead-code errors that drowned out live ones.
  globalIgnores(['dist', 'backups']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    // Server-side code: Vercel functions, shared libs, maintenance scripts and tests all
    // run in Node, not the browser. Without this they are linted against browser globals
    // only, which reported ~400 false `'process' is not defined` errors and drowned out
    // the real ones.
    files: ['api/**/*.js', 'lib/**/*.js', 'scripts/**/*.{js,mjs}', 'tests/**/*.js', '*.config.js'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'module',
    },
  },
])
