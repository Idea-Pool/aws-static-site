module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  reporters: [
    "default",
    "jest-junit"
  ],
  testPathIgnorePatterns: [
    "/node_modules/",
    "dist"
  ],
  coverageDirectory: "./coverage",
  collectCoverageFrom: [
    "./lib/**/*.ts"
  ],
  moduleFileExtensions: [
    "ts",
    "js"
  ],
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },
  verbose: true,
};
