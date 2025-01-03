export default {
    testMatch: [
      "**/__tests__/**/*.[jt]s?(x)",
      "**/?(*.)+(spec|test).[jt]s?(x)",
      "**/__tests__/**/*.mjs?(x)",
      "**/?(*.)+(spec|test).mjs?(x)"
    ],
    moduleFileExtensions: [
      "mjs",
      "js"
    ],
    transform: {},
    testPathIgnorePatterns: [
      "/node_modules/",
      "/.aws-sam/"
    ]
  };