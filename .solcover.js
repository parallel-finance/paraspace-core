module.exports = {
  mocha: {
    grep: "@skip-on-coverage",
    invert: true,
  },
  skipFiles: [
    "dependencies",
    "mocks",
    "deployments",
  ],
  configureYulOptimizer: true,
};
