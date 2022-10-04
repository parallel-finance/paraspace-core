module.exports = {
  mocha: {
    grep: "@skip-on-coverage",
    invert: true,
  },
  skipFiles: [
    "contracts/dependencies",
    "contracts/mocks",
    "contracts/deployments",
  ],
  configureYulOptimizer: true,
};