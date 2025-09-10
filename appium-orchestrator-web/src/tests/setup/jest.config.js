module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src/tests'],
  testMatch: ['**/*.test.js'],
  collectCoverage: false, // Desactivado inicialmente para Fase 0
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup/setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@public/(.*)$': '<rootDir>/public/$1',
  },
  testTimeout: 10000,
  collectCoverageFrom: [
    'public/js/**/*.js',
    '!public/js/**/*.test.js',
    '!public/js/**/index.js',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  transformIgnorePatterns: [
    '/node_modules/',
    '^.+\\.module\\.css$',
    '^.+\\.module\\.scss$',
  ],
};
