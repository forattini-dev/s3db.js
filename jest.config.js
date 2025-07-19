export default {
  silent: true,
  maxWorkers: 1,
  verbose: false,
  testTimeout: 30000,
  injectGlobals: true,
  testEnvironment: 'node',
  
  // Configurações para evitar travamentos
  forceExit: true,
  detectOpenHandles: true,
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
