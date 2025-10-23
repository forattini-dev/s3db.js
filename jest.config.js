export default {
  silent: true,
  maxWorkers: process.env.CI ? 1 : '50%', // Use 1 worker in CI, 50% of CPUs locally
  verbose: false,
  testTimeout: 10000, // Reduced from 30s to 10s (specific tests have their own timeouts)
  injectGlobals: true,
  testEnvironment: 'node',

  // Configurações para evitar travamentos
  forceExit: true,
  detectOpenHandles: false, // Disabled for speed (use only when debugging)
  detectLeaks: false, // Desabilitado pois é experimental e causa falsos positivos
  bail: false, // Continua executando mesmo com falhas
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
    '!src/index.js', // Entry point - não testável diretamente
    '!src/cli/**', // CLI - testado separadamente via tests/cli/
    '!src/partition-drivers/**', // Drivers experimentais/alternativos não usados
    '!src/concerns/high-performance-inserter.js', // Experimental
    '!src/concerns/optimized-encoding.js', // Experimental/não usado
    '!src/concerns/partition-queue.js', // Experimental
    '!src/concerns/index.js', // Re-export only
    '!src/plugins/backup/s3-backup-driver.class.js', // Backup driver específico S3
    '!src/plugins/backup/base-backup-driver.class.js', // Base class abstrata
    '!src/plugins/backup/multi-backup-driver.class.js', // Multi-driver experimental
    '!src/plugins/backup/index.js', // Re-export only
    '!src/plugins/replicators/postgres-replicator.class.js', // Requer PostgreSQL externo
    '!src/plugins/replicators/bigquery-replicator.class.js', // Requer BigQuery externo
    '!src/plugins/replicators/s3db-replicator.class.js', // Replicator específico
    '!src/plugins/consumers/rabbitmq-consumer.js', // Requer RabbitMQ externo
  ],

  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/tests/',
    '/examples/',
  ],

  // Ignore slow tests in normal coverage runs
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/typescript/',
    '/docs/', // Exclude docs/examples (uses Node native test runner)
  ],
};
