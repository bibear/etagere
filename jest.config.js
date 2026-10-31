// macOS AppleDouble files (`._*`) appear on exFAT volumes: never tests.
const testPathIgnorePatterns = ['/node_modules/', '/\\._', '/__tests__/support/'];
const tsJest = {
  '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs' }, diagnostics: false }],
};

/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'shared',
      rootDir: '<rootDir>/packages/shared',
      testEnvironment: 'node',
      testPathIgnorePatterns,
      modulePathIgnorePatterns: ['/\\._'],
      transform: tsJest,
    },
    {
      displayName: 'server',
      rootDir: '<rootDir>/server',
      testEnvironment: 'node',
      testPathIgnorePatterns,
      modulePathIgnorePatterns: ['/\\._'],
      transform: tsJest,
    },
    {
      displayName: 'app',
      rootDir: '<rootDir>/app',
      preset: 'jest-expo',
      testPathIgnorePatterns,
      modulePathIgnorePatterns: ['/\\._', '<rootDir>/dist/'],
      setupFiles: ['<rootDir>/jest.setup.ts'],
    },
  ],
};
