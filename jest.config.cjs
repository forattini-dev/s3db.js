const { defaults } = require('jest-config');

/** @type {import('jest').Config} */
module.exports = {
  verbose: true,
  testEnvironment: 'node',

  setupFiles: [
    '<rootDir>/tests/jest.setup.js'
  ],

  transform: {
    '^.+\\.js?$': 'babel-jest',
  },

  moduleFileExtensions: [
    ...defaults.moduleFileExtensions,
    'mts',
    'cts'
  ],
};