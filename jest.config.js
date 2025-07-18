export default {
  verbose: false,
  testEnvironment: 'node',
  injectGlobals: true,
  maxWorkers: 1, // Run tests serially to avoid resource contention with MinIO
  testTimeout: 30000, // 30 second default timeout
  silent: true, // Suppress console output during tests for better performance

  setupFiles: [
    '<rootDir>/tests/jest.setup.js'
  ],

  transform: {
    '^.+\\.js?$': 'babel-jest',
  },

  moduleNameMapper: {
    '^#src/(.*)$': '<rootDir>/src/$1',
    '^#tests/(.*)$': '<rootDir>/tests/$1',
  },

  globals: {
    'ts-jest': {
      useESM: true,
    },
  },

  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/**/*.spec.js',
  ],

  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/tests/',
    '/examples/',
  ],

  // Ignore slow tests in normal coverage runs
  testPathIgnorePatterns: [
    '/node_modules/',
  ],
};
