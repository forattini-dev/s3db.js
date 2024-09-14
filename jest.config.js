export default {
  verbose: true,
  testEnvironment: 'node',

  setupFiles: [
    '<rootDir>/tests/jest.setup.js'
  ],

  transform: {
    '^.+\\.js?$': 'babel-jest',
  },

  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },

  globals: {
    'ts-jest': {
      useESM: true,
    },
  },
};