import path from "path";
import {HardhatUserConfig} from "hardhat/types";
import dotenv from "dotenv";
import {
  MAINNET_CHAINID,
  GOERLI_CHAINID,
  MOCHA_JOBS,
  HARDFORK,
  DEFAULT_BLOCK_GAS_LIMIT,
  ETHERSCAN_KEY,
  REPORT_GAS,
  TENDERLY_PROJECT,
  TENDERLY_USERNAME,
  DEPLOYER_MNEMONIC,
} from "./deploy/helpers/hardhat-constants";
import {accounts} from "./deploy/wallets";
import {accounts as evmAccounts} from "./deploy/evm-wallets";
import {
  buildForkConfig,
  CHAINS_ID,
  NETWORKS_RPC_URL,
} from "./deploy/helper-hardhat-config";
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
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  docgen: {
    outputDir: "docs",
    pages: "items",
    exclude: ["dependencies", "deployments", "mocks"],
  },
  gasReporter: {
    enabled: REPORT_GAS,
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
    project: TENDERLY_PROJECT,
    username: TENDERLY_USERNAME,
    forkNetwork: `${MAINNET_CHAINID}`, //Network id of the network we want to fork
  },
  networks: {
    localhost: {
      chainId: CHAINS_ID[eEthereumNetwork.hardhat],
      accounts: accounts.map(({privateKey}) => privateKey),
      gasPrice: "auto",
      gas: "auto",
      allowUnlimitedContractSize: true,
    },
    parallel: {
      url: NETWORKS_RPC_URL[eEthereumNetwork.parallel],
      chainId: CHAINS_ID[eEthereumNetwork.parallel],
      accounts: evmAccounts.map(({privateKey}) => privateKey),
      gasPrice: 4e9,
      gas: 4e6,
      allowUnlimitedContractSize: true,
    },
    hardhat: {
      hardfork: HARDFORK,
      blockGasLimit: DEFAULT_BLOCK_GAS_LIMIT,
      gas: DEFAULT_BLOCK_GAS_LIMIT,
      gasPrice: "auto",
      chainId: CHAINS_ID[eEthereumNetwork.hardhat],
      throwOnTransactionFailures: true,
      throwOnCallFailures: true,
      accounts,
      loggingEnabled: false,
      forking: buildForkConfig(),
      allowUnlimitedContractSize: true,
    },
    goerli: {
      chainId: GOERLI_CHAINID,
      url: NETWORKS_RPC_URL[eEthereumNetwork.goerli],
      accounts: {
        mnemonic: DEPLOYER_MNEMONIC,
      },
    },
    mainnet: {
      chainId: MAINNET_CHAINID,
      url: NETWORKS_RPC_URL[eEthereumNetwork.mainnet],
      accounts: {
        mnemonic: DEPLOYER_MNEMONIC,
      },
    },
  },
  etherscan: {
    apiKey: {
      mainnet: ETHERSCAN_KEY,
      goerli: ETHERSCAN_KEY,
      localhost: ETHERSCAN_KEY,
    },
    customChains: [
      {
        network: eEthereumNetwork.localhost,
        chainId: CHAINS_ID[eEthereumNetwork.hardhat]!,
        urls: {
          apiURL: "http://localhost:4000/api",
          browserURL: "http://localhost:4000",
        },
      },
    ],
  },
};

export default hardhatConfig;
