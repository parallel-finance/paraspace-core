import path from "path";
import {HardhatUserConfig} from "hardhat/types";
import dotenv from "dotenv";
import {
  MAINNET_CHAINID,
  MOCHA_JOBS,
  HARDFORK,
  DEFAULT_BLOCK_GAS_LIMIT,
  ETHERSCAN_KEY,
  REPORT_GAS,
  TENDERLY_PROJECT,
  TENDERLY_USERNAME,
  DEPLOYER,
  VERBOSE,
} from "./helpers/hardhat-constants";
import {accounts} from "./wallets";
import {accounts as evmAccounts} from "./evm-wallets";
import {
  buildForkConfig,
  CHAINS_ID,
  NETWORKS_RPC_URL,
} from "./helper-hardhat-config";
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
import {eEthereumNetwork} from "./helpers/types";

require(`${path.join(__dirname, "tasks/misc")}/set-bre.ts`);

["deployments", "upgrade", "dev"].forEach((folder) => {
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
    exclude: ["dependencies", "deployments", "mocks", "test"],
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
            runs: 2000,
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
    anvil: {
      chainId: CHAINS_ID[eEthereumNetwork.anvil],
      url: NETWORKS_RPC_URL[eEthereumNetwork.anvil],
      accounts: [
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
        "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
        "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
        "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
        "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
        "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
        "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356",
        "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97",
        "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6",
      ],
      gasPrice: 1000000000,
      gas: 30000000,
      allowUnlimitedContractSize: true,
    },
    localhost: {
      url: NETWORKS_RPC_URL[eEthereumNetwork.hardhat],
      chainId: CHAINS_ID[eEthereumNetwork.hardhat],
      accounts: DEPLOYER,
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
    moonbeam: {
      chainId: CHAINS_ID[eEthereumNetwork.moonbeam],
      url: NETWORKS_RPC_URL[eEthereumNetwork.moonbeam],
      accounts: DEPLOYER,
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
      loggingEnabled: VERBOSE,
      forking: buildForkConfig(),
      allowUnlimitedContractSize: true,
    },
    goerli: {
      chainId: CHAINS_ID[eEthereumNetwork.goerli],
      url: NETWORKS_RPC_URL[eEthereumNetwork.goerli],
      accounts: DEPLOYER,
    },
    mainnet: {
      chainId: CHAINS_ID[eEthereumNetwork.mainnet],
      url: NETWORKS_RPC_URL[eEthereumNetwork.mainnet],
      accounts: DEPLOYER,
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
