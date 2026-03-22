import nx from '@nx/eslint-plugin';
import eslintPluginBetterTailwindcss from 'eslint-plugin-better-tailwindcss';

import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  ...nx.configs['flat/react'],
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    settings: {
      'better-tailwindcss': {
        entryPoint: 'src/styles.css',
      },
    },
    plugins: {
      'better-tailwindcss': eslintPluginBetterTailwindcss,
    },
    // Override or add rules here
    rules: {
      'better-tailwindcss/enforce-consistent-line-wrapping': [
        'error',
        {
          printWidth: 100,
          classesPerLine: 0,
          group: 'emptyLine',
          preferSingleLine: false,
        },
      ],
      'better-tailwindcss/enforce-consistent-class-order': 'error',
      'better-tailwindcss/enforce-consistent-variable-syntax': 'error',
      'better-tailwindcss/enforce-consistent-important-position': 'error',
      'better-tailwindcss/enforce-shorthand-classes': 'error',
      'better-tailwindcss/enforce-canonical-classes': 'error',
      'better-tailwindcss/no-duplicate-classes': 'error',
      'better-tailwindcss/no-deprecated-classes': 'error',
      'better-tailwindcss/no-unnecessary-whitespace': 'error',
    },
  },
];
