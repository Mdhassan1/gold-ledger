module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/jest.setup.js'],
  transformIgnorePatterns: ['/node_modules/(?!(@noble)/)'],
  clearMocks: true,
};
