import {Overrides} from "@ethersproject/contracts";
import dotenv from "dotenv";
import {ethers} from "ethers";
import fs from "fs";
import {HttpNetworkAccountsUserConfig} from "hardhat/types";
import {input} from "./wallet-helpers";
import {version} from "../package.json";
import git from "git-rev-sync";

dotenv.config();

const getPrivateKeyfromEncryptedJson = (
  keystorePath: string | undefined
): string =>
  keystorePath && fs.existsSync(keystorePath)
    ? ethers.Wallet.fromEncryptedJsonSync(
        fs.readFileSync(keystorePath, "utf8"),
        input("password: ")
      ).privateKey
    : "";

export const HARDHAT_CHAINID = 31337;
export const GOERLI_CHAINID = 5;
export const FORK_CHAINID = 522;
export const MAINNET_CHAINID = 1;
export const PARALLEL_CHAINID = 1592;
export const MOONBEAM_CHAINID = 1284;
export const ARBITRUM_ONE_CHAINID = 42161;
export const ARBITRUM_GOERLI_CHAINID = 421613;

export const INFURA_KEY = process.env.INFURA_KEY || "";
export const ALCHEMY_KEY = process.env.ALCHEMY_KEY || "";

export const TENDERLY_FORK_ID = process.env.TENDERLY_FORK_ID || "";
export const TENDERLY_HEAD_ID = process.env.TENDERLY_HEAD_ID || "";
export const TENDERLY = process.env.TENDERLY === "true";
export const TENDERLY_PROJECT = process.env.TENDERLY_PROJECT || "";
export const TENDERLY_USERNAME = process.env.TENDERLY_USERNAME || "";

export const DEFENDER = process.env.DEFENDER === "true";
export const DEFENDER_API_KEY = process.env.DEFENDER_API_KEY || "";
export const DEFENDER_SECRET_KEY = process.env.DEFENDER_SECRET_KEY || "";

export const FORK = process.env.FORK || "";
export const FORK_BLOCK_NUMBER = process.env.FORK_BLOCK_NUMBER
  ? parseInt(process.env.FORK_BLOCK_NUMBER)
  : 0;

export const DEFAULT_BLOCK_GAS_LIMIT = 30000000;
export const HARDFORK = "london";
export const MOCHA_JOBS = parseInt(process.env.MOCHA_JOBS || "4");

export const REPORT_GAS = process.env.REPORT_GAS == "true" ? true : false;

export const DB_PATH = process.env.DB_PATH ?? ":memory:";

export const ETHERSCAN_KEY = process.env.ETHERSCAN_KEY || "";
export const ETHERSCAN_VERIFICATION =
  process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;
export const ETHERSCAN_VERIFICATION_CONTRACTS =
  process.env.ETHERSCAN_VERIFICATION_CONTRACTS?.trim().split(/\s?,\s?/);
export const ETHERSCAN_VERIFICATION_JOBS = parseInt(
  process.env.ETHERSCAN_VERIFICATION_JOBS || "1"
);
export const ETHERSCAN_VERIFICATION_MAX_RETRIES = parseInt(
  process.env.ETHERSCAN_VERIFICATION_MAX_RETRIES || "3"
);

export const DEPLOY_START = parseInt(process.env.DEPLOY_START || "0");
export const DEPLOY_END = parseInt(process.env.DEPLOY_END || "24");
export const DEPLOY_INCREMENTAL =
  process.env.DEPLOY_INCREMENTAL == "true" ? true : false;

export const KEYSTORE_PATH = "keystore";
export const DEPLOYER_PRIVATE_KEY = (
  process.env.DEPLOYER_PRIVATE_KEY ||
  getPrivateKeyfromEncryptedJson(process.env.DEPLOYER_KEYSTORE_PATH)
).trim();
export const DEPLOYER_MNEMONIC = (
  process.env.DEPLOYER_MNEMONIC ||
  "test test test test test test test test test test test junk"
).trim();
export const DEPLOYER: HttpNetworkAccountsUserConfig = DEPLOYER_PRIVATE_KEY
  ? [DEPLOYER_PRIVATE_KEY]
  : {
      mnemonic: DEPLOYER_MNEMONIC,
    };

export const BLOCKSCOUT_DISABLE_INDEXER =
  process.env.BLOCKSCOUT_DISABLE_INDEXER == "false" ? false : true;

export const GLOBAL_OVERRIDES: Overrides = {
  // maxFeePerGas: ethers.utils.parseUnits("20", "gwei"),
  // maxPriorityFeePerGas: ethers.utils.parseUnits("1.5", "gwei"),
  // type: 2,
  // gasLimit: 12_450_000,
};

export const RPC_URL = process.env.RPC_URL || "";
export const JSONRPC_VARIANT = process.env.JSONRPC_VARIANT || "hardhat";
export const VERBOSE = process.env.VERBOSE == "true" ? true : false;
export const DRY_RUN = process.env.DRY_RUN || "";

export const TIME_LOCK_BUFFERING_TIME = parseInt(
  process.env.TIME_LOCK_BUFFERING_TIME || "14400"
);
export const TIME_LOCK_DEFAULT_OPERATION =
  process.env.TIME_LOCK_DEFAULT_OPERATION || "queue";

export const IMPERSONATE_ADDRESS = process.env.IMPERSONATE_ADDRESS || "";
export const MULTI_SIG = process.env.MULTI_SIG || "";
export const MULTI_SEND = process.env.MULTI_SEND || "";
export const MULTI_SIG_NONCE = process.env.MULTI_SIG_NONCE
  ? parseInt(process.env.MULTI_SIG_NONCE)
  : undefined;
export const MULTI_SEND_CHUNK_SIZE = parseInt(
  process.env.MULTI_SEND_CHUNK_SIZE || "30"
);

export const VERSION = version;
export const COMMIT = git.short();
export const COMPILER_OPTIMIZER_RUNS = 800;
export const COMPILER_VERSION = "0.8.10";
export const PKG_DATA = {
  version: VERSION,
  git: {
    commit: COMMIT,
  },
  compiler: {
    version: COMPILER_VERSION,
    optimizer: {
      runs: COMPILER_OPTIMIZER_RUNS,
    },
  },
};

export const FLASHBOTS_RELAY_RPC = "https://relay.flashbots.net";

export const TIME_LOCK_SIGS = {
  "0xc1a287e2": "GRACE_PERIOD()",
  "0x7d645fab": "MAXIMUM_DELAY()",
  "0xb1b43ae5": "MINIMUM_DELAY()",
  "0x0e18b681": "acceptAdmin()",
  "0x1dc40b51": "cancelTransaction(address,uint256,string,bytes,uint256,bool)",
  "0x8902ab65": "executeTransaction(address,uint256,string,bytes,uint256,bool)",
  "0x6e9960c3": "getAdmin()",
  "0xcebc9a82": "getDelay()",
  "0xd0468156": "getPendingAdmin()",
  "0xb1fc8796": "isActionQueued(bytes32)",
  "0x8d8fe2e3": "queueTransaction(address,uint256,string,bytes,uint256,bool)",
  "0xe177246e": "setDelay(uint256)",
  "0x4dd18bf5": "setPendingAdmin(address)",
};
