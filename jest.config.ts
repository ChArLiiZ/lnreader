import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@database/(.*)$': '<rootDir>/src/database/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@plugins/(.*)$': '<rootDir>/src/plugins/$1',
    '^@hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@strings/(.*)$': '<rootDir>/strings/$1',
    '^@theme/(.*)$': '<rootDir>/src/theme/$1',
    '^@navigators/(.*)$': '<rootDir>/src/navigators/$1',
    '^@api/(.*)$': '<rootDir>/src/api/$1',
    '^@screens/(.*)$': '<rootDir>/src/screens/$1',
    '^@type/(.*)$': '<rootDir>/src/type/$1',
    '^@specs/(.*)$': '<rootDir>/specs/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
      },
    ],
  },
};

export default config;
