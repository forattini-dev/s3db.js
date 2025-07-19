export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: [
    '**/tests/**/*.test.js',
    '**/?(*.)+(spec|test).js'
  ],
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/index.js',
    '!**/*.test.js',
    '!**/*.spec.js',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!**/examples/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov'
  ],
  coverageThreshold: {
    'src/plugins/cache/filesystem-cache.class.js': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  testTimeout: 30000,
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.js']
};
