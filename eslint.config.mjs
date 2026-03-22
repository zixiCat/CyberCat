import nx from '@nx/eslint-plugin';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist', '**/out-tsc'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    plugins: {
      'unused-imports': unusedImports,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      /* normal */
      'no-console': [
        process.env.NX_NODE_ENV === 'production' ? 'error' : 'warn',
        { allow: ['warn', 'error', 'info'] },
      ],
      'prefer-const': 'error',
      'require-jsdoc': 'off',
      'valid-jsdoc': 'off',
      'camelcase': 'off',
      'no-magic-numbers': [
        'warn',
        {
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
        },
      ],
      /* simple-import-sort */
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      /* unused-imports */
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        process.env.NX_NODE_ENV === 'production' ? 'error' : 'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      /* react */
      // 'react/display-name': 'off',
      // 'react/react-in-jsx-scope': 'off',
      // 'react/self-closing-comp': 'error',
      // 'react/jsx-curly-brace-presence': 'error',
    },
  },
];
