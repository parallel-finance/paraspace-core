import path from "path";
import {HardhatUserConfig} from "hardhat/types";
import dotenv from "dotenv";
import {
  HARDHAT_CHAINID,
  COVERAGE_CHAINID,
  FORK_MAINNET_CHAINID,
  MAINNET_CHAINID,
  GOERLI_CHAINID,
} from "./deploy/helpers/hardhat-constants";
import {accounts} from "./deploy/test-wallets";
import {accounts as evmAccounts} from "./deploy/evm-wallets";
import {buildForkConfig, NETWORKS_RPC_URL} from "./deploy/helper-hardhat-config";
import fs from "fs";

dotenv.config();

import "solidity-docgen-forked";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "hardhat-gas-reporter";
import "@tenderly/hardhat-tenderly";
import "solidity-coverage";
import "hardhat-contract-sizer";
import {eEthereumNetwork} from "./deploy/helpers/types";

const DEFAULT_BLOCK_GAS_LIMIT = 12450000;
const HARDFORK = "london";
const ETHERSCAN_KEY = process.env.ETHERSCAN_KEY || "";
const MOCHA_JOBS = parseInt(process.env.MOCHA_JOBS ?? "4")

require(`${path.join(__dirname, "deploy/tasks/misc")}/set-bre.ts`);

["deployments"].forEach((folder) => {
  const tasksPath = path.join(__dirname, "tasks", folder);
  fs.readdirSync(tasksPath)
    .filter((pth) => pth.includes(".ts"))
    .forEach((task) => {
      require(`${tasksPath}/${task}`);
    });
});

const hardhatConfig: HardhatUserConfig = {
  contractSizer: {
    alphaSort: true,
    runOnCompile: false,
    disambiguatePaths: false,
    except: ["Mock*"],
  },
  paths: {
    sources: "./contracts",
    tests: "./test-suites",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  docgen: {
    outputDir: "docs",
    pages: "items",
    exclude: ["dependencies", "deployments", "mocks"],
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS == "true" ? true : false,
  },
  solidity: {
    // Docs for the compiler https://docs.soliditylang.org/en/v0.8.7/using-the-compiler.html
    compilers: [
      {
        version: "0.8.10",
        settings: {
          optimizer: {
            enabled: true,
            runs: 8000,
          },
          evmVersion: "london",
        },
      },
      {
        version: "0.7.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 800,
          },
          metadata: {
            bytecodeHash: "none",
          },
        },
      },
    ],
  },
  typechain: {
    outDir: "types",
    target: "ethers-v5",
  },
  mocha: {
    parallel: !isNaN(MOCHA_JOBS) && MOCHA_JOBS > 1,
    jobs: MOCHA_JOBS,
    timeout: 200000,
  },
  tenderly: {
    project: process.env.TENDERLY_PROJECT || "",
    username: process.env.TENDERLY_USERNAME || "",
    forkNetwork: `${MAINNET_CHAINID}`, //Network id of the network we want to fork
  },
  networks: {
    parallel: {
      url: NETWORKS_RPC_URL[eEthereumNetwork.parallel],
      chainId: 1592,
      accounts: evmAccounts.map(
        ({secretKey}: {secretKey: string; balance: string}) => secretKey
      ),
      gasPrice: 4e9,
      gas: 4e6,
      allowUnlimitedContractSize: true,
    },
    localhost: {
      url: NETWORKS_RPC_URL[eEthereumNetwork.hardhat],
      chainId: HARDHAT_CHAINID,
    },
    coverage: {
      url: NETWORKS_RPC_URL[eEthereumNetwork.coverage],
      chainId: COVERAGE_CHAINID,
      throwOnTransactionFailures: true,
      throwOnCallFailures: true,
    },
    hardhat: {
      hardfork: HARDFORK,
      blockGasLimit: DEFAULT_BLOCK_GAS_LIMIT,
      gas: DEFAULT_BLOCK_GAS_LIMIT,
      gasPrice: 8000000000,
      chainId: HARDHAT_CHAINID,
      throwOnTransactionFailures: true,
      throwOnCallFailures: true,
      accounts: accounts.map(
        ({secretKey, balance}: {secretKey: string; balance: string}) => ({
          privateKey: secretKey,
          balance,
        })
      ),
      forking: buildForkConfig(),
      allowUnlimitedContractSize: true,
    },
    ganache: {
      url: NETWORKS_RPC_URL[eEthereumNetwork.ganache],
      chainId: FORK_MAINNET_CHAINID,
      accounts: {
        mnemonic: process.env.DEPLOYER_MNEMONIC || "",
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 20,
      },
    },
    goerli: {
      chainId: GOERLI_CHAINID,
      url: NETWORKS_RPC_URL[eEthereumNetwork.goerli],
      accounts: {
        mnemonic: process.env.DEPLOYER_MNEMONIC || "",
      },
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_KEY,
  },
};

export default hardhatConfig;
