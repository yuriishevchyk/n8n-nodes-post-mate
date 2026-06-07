module.exports = {
  root: true,
  env: { node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    sourceType: 'module',
    extraFileExtensions: ['.json'],
  },
  plugins: ['@typescript-eslint', 'n8n-nodes-base'],
  extends: [
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'n8n-nodes-base/node-filename-against-convention': 'error',
    'n8n-nodes-base/credential-class-name-unsuffixed': 'error',
  },
};
