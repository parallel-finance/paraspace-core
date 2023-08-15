import {DRE, getDb, shouldVerifyContract, sleep} from "./misc-utils";
import {ConstructorArgs, LibraryAddresses, tEthereumAddress} from "./types";
import axios from "axios";
import {
  ETHERSCAN_APIS,
  ETHERSCAN_KEY,
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
  contract?: string;
  constructorArguments: ConstructorArgs;
  relatedSources?: true;
  libraries?: LibraryAddresses;
};

const getIsVerified = async (contractId: string, address: string) => {
  const value = await getDb().get(`${contractId}.${DRE.network.name}`).value();
  const isVerified =
    value?.address == address &&
    (value?.verified || (await hasVerifiedSourceCode(address)));

  if (!value?.verified && isVerified) {
    await setIsVerified(contractId, address);
  }

  return isVerified;
};

const setIsVerified = async (contractId: string, address: string) => {
  const db = getDb();
  const key = `${contractId}.${DRE.network.name}`;
  const value = await db.get(key).value();
  if (value?.address != address || value?.verified) {
    return;
  }

  await verifyProxyContract(address);

  await db
    .set(key, {
      ...value,
      verified: true,
    })
    .write();
};

export const verifyEtherscanContract = async (
  id: string,
  address: string,
  contractFQN: string | undefined = undefined,
  constructorArgs: ConstructorArgs = [],
  libraries?: LibraryAddresses
) => {
  if (!shouldVerifyContract(id)) {
    return;
  }

  let isVerified = await getIsVerified(id, address);
  if (isVerified) {
    return;
  }

  console.log(`- Verifying ${id}`);
  console.log(`  - address: ${address}`);

  try {
    const msDelay = 3000;
    const times = ETHERSCAN_VERIFICATION_MAX_RETRIES;
    // Write a temporal file to host complex parameters for buidler-etherscan https://github.com/nomiclabs/buidler/tree/development/packages/buidler-etherscan#complex-arguments

    const params: VerificationArgs = {
      address,
      contract: contractFQN,
      constructorArguments: constructorArgs,
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

  if (isVerified) await setIsVerified(id, address);
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
  address: tEthereumAddress
): Promise<boolean> => {
  try {
    const {data} = await axios.get(
      `${
        ETHERSCAN_APIS[DRE.network.name]
      }?module=contract&action=getsourcecode&address=${address}&apikey=${ETHERSCAN_KEY}`
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
  address: tEthereumAddress
): Promise<boolean> => {
  try {
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
    };
    const {data} = await axios.post(
      `${
        ETHERSCAN_APIS[DRE.network.name]
      }?module=contract&action=verifyproxycontract&apikey=${ETHERSCAN_KEY}`,
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
