export default {
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
  transform: {},
  collectCoverageFrom: [
    'index.js',
    '!node_modules/**'
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  },
  verbose: true,
  testTimeout: 10000
};
