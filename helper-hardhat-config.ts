import {HardhatNetworkForkingUserConfig} from "hardhat/types";
import {eEthereumNetwork, iParamsPerNetwork} from "./helpers/types";
import dotenv from "dotenv";
import {
  ALCHEMY_KEY,
  FORK,
  FORK_BLOCK_NUMBER,
  FORK_CHAINID,
  GOERLI_CHAINID,
  HARDHAT_CHAINID,
  INFURA_KEY,
  MAINNET_CHAINID,
  MOONBEAM_CHAINID,
  PARALLEL_CHAINID,
  RPC_URL,
  TENDERLY_FORK_ID,
} from "./helpers/hardhat-constants";

dotenv.config();

// const GWEI = 1000 * 1000 * 1000;

export const buildForkConfig = ():
  | HardhatNetworkForkingUserConfig
  | undefined => {
  let forkMode: HardhatNetworkForkingUserConfig | undefined;
  if (FORK) {
    forkMode = {
      url: NETWORKS_RPC_URL[FORK],
    };
    if (FORK_BLOCK_NUMBER || BLOCK_TO_FORK[FORK]) {
      forkMode.blockNumber = FORK_BLOCK_NUMBER || BLOCK_TO_FORK[FORK];
    }
  }
  return forkMode;
};

export const NETWORKS_RPC_URL: iParamsPerNetwork<string> = {
  [eEthereumNetwork.kovan]:
    RPC_URL || ALCHEMY_KEY
      ? `https://eth-kovan.alchemyapi.io/v2/${ALCHEMY_KEY}`
      : `https://kovan.infura.io/v3/${INFURA_KEY}`,
  [eEthereumNetwork.ropsten]:
    RPC_URL || ALCHEMY_KEY
      ? `https://eth-ropsten.alchemyapi.io/v2/${ALCHEMY_KEY}`
      : `https://ropsten.infura.io/v3/${INFURA_KEY}`,
  [eEthereumNetwork.goerli]:
    RPC_URL || ALCHEMY_KEY
      ? `https://eth-goerli.alchemyapi.io/v2/${ALCHEMY_KEY}`
      : `https://goerli.infura.io/v3/${INFURA_KEY}`,
  [eEthereumNetwork.mainnet]:
    RPC_URL || ALCHEMY_KEY
      ? `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_KEY}`
      : `https://mainnet.infura.io/v3/${INFURA_KEY}`,
  [eEthereumNetwork.hardhat]: RPC_URL || "http://localhost:8545",
  [eEthereumNetwork.anvil]: RPC_URL || "http://localhost:8545",
  [eEthereumNetwork.ganache]: RPC_URL || "http://localhost:8545",
  [eEthereumNetwork.tenderlyMain]:
    RPC_URL || `https://rpc.tenderly.co/fork/${TENDERLY_FORK_ID}`,
  [eEthereumNetwork.parallel]: RPC_URL || "http://localhost:29933",
  [eEthereumNetwork.moonbeam]: "https://rpc.api.moonbeam.network",
};

export const CHAINS_ID: iParamsPerNetwork<number | undefined> = {
  [eEthereumNetwork.mainnet]: MAINNET_CHAINID,
  [eEthereumNetwork.kovan]: undefined,
  [eEthereumNetwork.ropsten]: undefined,
  [eEthereumNetwork.goerli]: GOERLI_CHAINID,
  [eEthereumNetwork.hardhat]: FORK ? FORK_CHAINID : HARDHAT_CHAINID,
  [eEthereumNetwork.anvil]: HARDHAT_CHAINID,
  [eEthereumNetwork.ganache]: undefined,
  [eEthereumNetwork.parallel]: PARALLEL_CHAINID,
  [eEthereumNetwork.tenderlyMain]: undefined,
  [eEthereumNetwork.moonbeam]: MOONBEAM_CHAINID,
};

export const BLOCK_TO_FORK: iParamsPerNetwork<number | undefined> = {
  [eEthereumNetwork.mainnet]: 16374650,
  [eEthereumNetwork.kovan]: undefined,
  [eEthereumNetwork.ropsten]: undefined,
  [eEthereumNetwork.goerli]: 8281045,
  [eEthereumNetwork.hardhat]: undefined,
  [eEthereumNetwork.anvil]: undefined,
  [eEthereumNetwork.ganache]: undefined,
  [eEthereumNetwork.parallel]: undefined,
  [eEthereumNetwork.tenderlyMain]: 16367614,
  [eEthereumNetwork.moonbeam]: 2690782,
};
