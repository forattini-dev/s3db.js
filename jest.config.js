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
  ],
};
