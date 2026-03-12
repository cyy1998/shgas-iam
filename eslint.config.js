import antfu from '@antfu/eslint-config';

export default antfu({
  formatters: true,
  stylistic: {
    semi: true,
  },
  rules: {
    'no-console': 'warn',
    'node/prefer-global/process': 'off',
    'node/prefer-global/buffer': 'off',
    'ts/consistent-type-definitions': ['error', 'type'],
  },
  ignores: [
    'src/db/generated',
  ],
});
