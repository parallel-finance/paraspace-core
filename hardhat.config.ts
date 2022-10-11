import path from "path";
import {HardhatUserConfig} from "hardhat/types";
import dotenv from "dotenv";
import {
  HARDHAT_CHAINID,
  COVERAGE_CHAINID,
  FORK_MAINNET_CHAINID,
  RINKEBY_CHAINID,
  MAINNET_CHAINID,
  GOERLI_CHAINID,
} from "./deploy/helpers/hardhat-constants";
import {accounts} from "./deploy/test-wallets";
import {accounts as evmAccounts} from "./deploy/evm-wallets";
import {buildForkConfig} from "./deploy/helper-hardhat-config";

dotenv.config();

import "solidity-docgen";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@openzeppelin/hardhat-upgrades";
import "hardhat-gas-reporter";
import "@tenderly/hardhat-tenderly";
import "solidity-coverage";
import "hardhat-contract-sizer";

const DEFAULT_BLOCK_GAS_LIMIT = 12450000;
const HARDFORK = "london";
const ETHERSCAN_KEY = process.env.ETHERSCAN_KEY || "";

require(`${path.join(__dirname, "deploy/tasks/misc")}/set-bre.ts`);

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
            runs: 1,
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
    timeout: 200000,
  },
  tenderly: {
    project: process.env.TENDERLY_PROJECT || "",
    username: process.env.TENDERLY_USERNAME || "",
    forkNetwork: `${MAINNET_CHAINID}`, //Network id of the network we want to fork
  },
  networks: {
    evm: {
      url: "http://localhost:29933",
      chainId: 1592,
      accounts: evmAccounts.map(
        ({secretKey}: {secretKey: string; balance: string}) => secretKey
      ),
      gasPrice: 4e9,
      gas: 4e6,
      allowUnlimitedContractSize: true,
    },
    localhost: {
      url: "http://localhost:8545",
      chainId: HARDHAT_CHAINID,
    },
    coverage: {
      url: "http://localhost:8555",
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
      url: "http://127.0.0.1:8545",
      chainId: FORK_MAINNET_CHAINID,
      accounts: {
        mnemonic: process.env.DEPLOYER_MNEMONIC || "",
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 20,
      },
    },
    rinkeby: {
      chainId: RINKEBY_CHAINID,
      url: process.env.RPC_URL || "",
      accounts: {
        mnemonic: process.env.DEPLOYER_MNEMONIC || "",
      },
    },
    goerli: {
      chainId: GOERLI_CHAINID,
      url: process.env.RPC_URL || "",
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
