// ─────────────────────────────────────────────────────────────
//  guardo  ·  jest.config.js
//  Runs the TypeScript test suite via ts-jest (CommonJS).
// ─────────────────────────────────────────────────────────────

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts"],
  clearMocks: true,
  restoreMocks: true,
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
  },
};
