export default {
  // RESOURCE LIMITS - Use 50% of system resources
  maxWorkers: '50%',
  // 75% of 32GB / 9 workers = ~2.6GB per worker
  workerIdleMemoryLimit: '2GB',
  testTimeout: 120000, // Increased to 120s for CI/slow environments
  testEnvironment: 'node',

  // Settings to avoid test suite hangs
  forceExit: true,
  detectOpenHandles: false, // Disabled for speed (use only when debugging)
  detectLeaks: false, // Disabled because it is experimental and causes false positives
  bail: false, // Keep running even after failures
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,

  setupFiles: [
    '<rootDir>/tests/jest.setup.js'
  ],

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
    '!src/index.js', // Entry point - not directly testable
    '!src/cli/**', // CLI - tested separately via tests/cli/
    '!src/partition-drivers/**', // Experimental/alternative drivers not used
    '!src/concerns/high-performance-inserter.js', // Experimental
    '!src/concerns/optimized-encoding.js', // Experimental/not used
    '!src/concerns/partition-queue.js', // Experimental
    '!src/concerns/index.js', // Re-export only
    '!src/plugins/backup/s3-backup-driver.class.js', // S3-specific backup driver
    '!src/plugins/backup/base-backup-driver.class.js', // Abstract base class
    '!src/plugins/backup/multi-backup-driver.class.js', // Experimental multi-driver
    '!src/plugins/backup/index.js', // Re-export only
    '!src/plugins/replicators/postgres-replicator.class.js', // Requires external PostgreSQL
    '!src/plugins/replicators/bigquery-replicator.class.js', // Requires external BigQuery
    '!src/plugins/replicators/s3db-replicator.class.js', // S3DB-specific replicator
    '!src/plugins/consumers/rabbitmq-consumer.js', // Requires external RabbitMQ
  ],

  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/tests/',
    '/examples/',
  ],

  coverageThreshold: {
    global: {
      statements: 90,
      branches: 90,
      functions: 90,
      lines: 90,
    },
    'src/plugins/': {
      statements: 90,
      branches: 90,
      functions: 90,
      lines: 90,
    }
  },

  // Ignore slow tests in normal coverage runs
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/typescript/',
  ],

  transform: {
    '^.+\\.m?js$': 'babel-jest',
    '^.+\\.ts$': 'ts-jest',
  },

  // Allow TensorFlow.js to be transformed by Jest (fixes ESM import issues)
  transformIgnorePatterns: [
    'node_modules/(?!(@tensorflow)/)',
  ],

  reporters: [
    'default',
    '<rootDir>/tests/reporters/progress-reporter.cjs',
  ],
};
