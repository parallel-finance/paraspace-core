import {DRE, getDb, sleep} from "./misc-utils";
import {ConstructorArgs, LibraryAddresses, tEthereumAddress} from "./types";
import axios from "axios";
import minimatch from "minimatch";
import {
  ETHERSCAN_KEY,
  ETHERSCAN_VERIFICATION_CONTRACTS,
  ETHERSCAN_VERIFICATION_MAX_RETRIES,
} from "./hardhat-constants";

const ALREADY_VERIFIED = "Already Verified";

const fatalErrors = [
  `The address provided as argument contains a contract, but its bytecode`,
  `Daily limit of 100 source code submissions reached`,
  `has no bytecode. Is the contract deployed to this network`,
  `The constructor for`,
  ALREADY_VERIFIED,
];

const okErrors = [`Contract source code already verified`];

const unableVerifyError = "Fail - Unable to verify";

type VerificationArgs = {
  address: string;
  constructorArguments: ConstructorArgs;
  relatedSources?: true;
  libraries?: LibraryAddresses;
};

export const ETHERSCAN_NETWORKS = [
  "mainnet",
  "ropsten",
  "kovan",
  "matic",
  "mumbai",
  "rinkeby",
  "goerli",
  "localhost",
];

export const ETHERSCAN_APIS = {
  mainnet: "api.etherscan.io",
  ropsten: "api-ropsten.etherscan.io",
  kovan: "api-kovan.etherscan.io",
  rinkeby: "api-rinkeby.etherscan.io",
  goerli: "api-goerli.etherscan.io",
};

const getIsVerified = async (
  contractId: string,
  address: string,
  network: string
) => {
  const value = await getDb().get(`${contractId}.${network}`).value();
  const isVerified =
    value?.address == address &&
    (value?.verified || (await hasVerifiedSourceCode(address, network)));

  if (!value?.verified && isVerified) {
    await setIsVerified(contractId, address, network);
  }

  return isVerified;
};

const setIsVerified = async (
  contractId: string,
  address: string,
  network: string
) => {
  const db = getDb();
  const key = `${contractId}.${network}`;
  const value = await db.get(key).value();
  if (value?.address != address || value?.verified) {
    return;
  }

  await verifyProxyContract(address, network);

  await db
    .set(key, {
      ...value,
      verified: true,
    })
    .write();
};

export const verifyEtherscanContract = async (
  contractId: string,
  address: string,
  constructorArguments: ConstructorArgs = [],
  libraries?: LibraryAddresses
) => {
  const currentNetwork = DRE.network.name;

  if (!ETHERSCAN_NETWORKS.includes(currentNetwork)) {
    return;
  }

  if (
    ETHERSCAN_VERIFICATION_CONTRACTS?.every((p) => !minimatch(contractId, p))
  ) {
    return;
  }

  if (!ETHERSCAN_KEY) {
    throw Error("Missing ETHERSCAN_KEY.");
  }

  let isVerified = await getIsVerified(contractId, address, currentNetwork);
  if (isVerified) {
    return;
  }

  console.log(`- Verifying ${contractId}`);
  console.log(`  - address: ${address}`);

  try {
    const msDelay = 3000;
    const times = ETHERSCAN_VERIFICATION_MAX_RETRIES;
    // Write a temporal file to host complex parameters for buidler-etherscan https://github.com/nomiclabs/buidler/tree/development/packages/buidler-etherscan#complex-arguments

    const params: VerificationArgs = {
      address,
      constructorArguments,
      relatedSources: true,
      libraries,
    };
    await runTaskWithRetry("verify:verify", params, times, msDelay);
    isVerified = true;
    // eslint-disable-next-line
  } catch (error: any) {
    const errMsg = error.message || error;
    console.error(errMsg);
    isVerified = errMsg.includes(ALREADY_VERIFIED);
  }

  if (isVerified) await setIsVerified(contractId, address, currentNetwork);
};

export const runTaskWithRetry = async (
  task: string,
  params: VerificationArgs,
  times: number,
  msDelay: number
) => {
  let counter = times;
  await sleep(msDelay);

  try {
    if (times > 1) {
      await DRE.run(task, params);
      return Promise.resolve();
    } else if (times === 1) {
      console.log(
        "[ETHERSCAN][WARNING] Trying to verify via uploading all sources."
      );
      delete params.relatedSources;
      await DRE.run(task, params);
      return Promise.resolve();
    } else {
      const errMsg =
        "[ETHERSCAN][ERROR] Errors after all the retries, check the logs for more information.";
      return Promise.reject(new Error(errMsg));
    }
    // eslint-disable-next-line
  } catch (error: any) {
    counter--;
    if (okErrors.some((okReason) => error.message.includes(okReason))) {
      console.info(
        "[ETHERSCAN][INFO] Skipping due OK response: ",
        error.message
      );
      return Promise.resolve();
    }

    if (fatalErrors.some((fatalError) => error.message.includes(fatalError))) {
      const errMsg = `[ETHERSCAN][ERROR] Fatal error detected, skip retries and resume deployment.${error.message}`;
      return Promise.reject(new Error(errMsg));
    }

    console.error("[ETHERSCAN][ERROR]", error.message);
    console.log();
    console.info(`[ETHERSCAN][[INFO] Retrying attempts: ${counter}.`);
    if (error.message.includes(unableVerifyError)) {
      console.log(
        "[ETHERSCAN][WARNING] Trying to verify via uploading all sources."
      );
      delete params.relatedSources;
    }
    await runTaskWithRetry(task, params, counter, msDelay);
  }
};

const hasVerifiedSourceCode = async (
  address: tEthereumAddress,
  network: string
): Promise<boolean> => {
  try {
    const {data} = await axios.get(
      `https://${ETHERSCAN_APIS[network]}/api?module=contract&action=getsourcecode&address=${address}&apikey=${ETHERSCAN_KEY}`
    );
    return (
      data.status === "1" &&
      data.message === "OK" &&
      data.result.length > 0 &&
      data.result.some(({SourceCode}) => !!SourceCode)
    );
  } catch (e) {
    return false;
  }
};

const verifyProxyContract = async (
  address: tEthereumAddress,
  network: string
): Promise<boolean> => {
  try {
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
    };
    const {data} = await axios.post(
      `https://${ETHERSCAN_APIS[network]}/api?module=contract&action=verifyproxycontract&apikey=${ETHERSCAN_KEY}`,
      `address=${address}`,
      {
        headers,
      }
    );
    return (
      data.status === "1" && data.message === "OK" && data.result.length > 0
    );
  } catch (e) {
    return false;
  }
};
