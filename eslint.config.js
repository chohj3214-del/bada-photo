import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
export default [ { ignores: ['dist'] }, js.configs.recommended, ...tseslint.configs.recommended, { files: ['**/*.{ts,tsx}'], languageOptions: { ecmaVersion: 2020, globals: { window: 'readonly', document: 'readonly', navigator: 'readonly', indexedDB: 'readonly', crypto: 'readonly', FileReader: 'readonly', IDBDatabase: 'readonly', IDBTransaction: 'readonly', IDBRequest: 'readonly', MediaStream: 'readonly' } }, plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh }, rules: { ...reactHooks.configs.recommended.rules, 'react-refresh/only-export-components': ['warn',{allowConstantExport:true}], '@typescript-eslint/no-explicit-any': 'off' } } ];
