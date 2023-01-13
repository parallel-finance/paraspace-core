import {task} from "hardhat/config";
import {FORK} from "../../helpers/hardhat-constants";
import {ethers} from "ethers";
import {decodeMulti} from "ethers-multisend";
import {SafeTransactionDataPartial} from "@safe-global/safe-core-sdk-types";
import InputDataDecoder from "ethereum-input-data-decoder";
import Safe from "@safe-global/safe-core-sdk";
import EthersAdapter from "@safe-global/safe-ethers-lib";
import SafeServiceClient from "@safe-global/safe-service-client";
import {findLastIndex} from "lodash";

const MULTI_SIG = "0xe965198731CDdB2f06e91DD0CDff74b71e4b3714";
const MULTI_SEND = "0x40A2aCCbd92BCA938b02010E17A5b8929b49130D";

const TIME_LOCK_SIGS = {
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

const getAbi = async () => {
  const {
    ACLManager__factory,
    ExecutorWithTimelock__factory,
    ParaSpaceOracle__factory,
    PoolAddressesProvider__factory,
    PoolConfigurator__factory,
    ReservesSetupHelper__factory,
  } = await import("../../types");

  return [
    ...ReservesSetupHelper__factory.abi,
    ...ExecutorWithTimelock__factory.abi,
    ...PoolAddressesProvider__factory.abi,
    ...PoolConfigurator__factory.abi,
    ...ParaSpaceOracle__factory.abi,
    ...ACLManager__factory.abi,
  ];
};

task("decode-safe-txs", "Decode safe txs").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {getFirstSigner, getTimeLockExecutor} = await import(
    "../../helpers/contracts-getters"
  );
  const timeLock = await getTimeLockExecutor();
  const signer = await getFirstSigner();
  const ethAdapter = new EthersAdapter({
    ethers,
    signerOrProvider: signer,
  });
  const decoder = new InputDataDecoder(await getAbi());

  const safeService = new SafeServiceClient({
    txServiceUrl: `https://safe-transaction-${
      FORK || DRE.network.name
    }.safe.global`,
    ethAdapter,
  });
  const res = (
    await safeService.getPendingTransactions(MULTI_SIG)
  ).results.sort((a, b) =>
    a.nonce > b.nonce
      ? 1
      : a.nonce === b.nonce &&
        new Date(a.submissionDate).valueOf() >
          new Date(b.submissionDate).valueOf()
      ? 1
      : -1
  );

  const txs = res
    .filter((x, i) => findLastIndex(res, (y) => y.nonce === x.nonce) === i)
    .reduce((ite, cur) => {
      if (!cur.data) {
        return ite;
      }

      const toConcatenate = (
        cur.to === MULTI_SEND
          ? decodeMulti(cur.data).map((x) => ({to: x.to, data: x.data}))
          : [{to: cur.to, data: cur.data}]
      ).map(({to, data}) => {
        if (to != timeLock.address) {
          return {to, data};
        }

        const sig = TIME_LOCK_SIGS[data.slice(0, 10)];
        if (!sig) {
          return {to, data};
        }

        [to, , , data] = timeLock.interface.decodeFunctionData(sig, data);
        return {to, data};
      });

      ite = ite.concat(toConcatenate);

      return ite;
    }, [] as {to: string; data: string}[]);

  for (const tx of txs) {
    const {to, data} = tx;
    console.log();
    console.log(to);
    const inputData = decoder.decodeData(data);
    const normalized = JSON.stringify(inputData, (k, v) => {
      return v.type === "BigNumber" ? +v.hex.toString(10) : v;
    });
    console.log(JSON.stringify(JSON.parse(normalized), null, 4));
  }
});

task("propose-safe-txs", "Propose buffered timelock transactions")
  .addPositionalParam("type", "queue|execute|cancel", "queue")
  .setAction(async ({type}, DRE) => {
    await DRE.run("set-DRE");
    const {getTimeLockDataInDb} = await import(
      "../../helpers/contracts-helpers"
    );
    const {getTimeLockExecutor, getFirstSigner} = await import(
      "../../helpers/contracts-getters"
    );
    const timeLock = await getTimeLockExecutor();
    const signer = await getFirstSigner();
    const actions = await getTimeLockDataInDb();
    const ethAdapter = new EthersAdapter({
      ethers,
      signerOrProvider: signer,
    });

    const safeSdk: Safe = await Safe.create({
      ethAdapter,
      safeAddress: MULTI_SIG,
    });
    const safeService = new SafeServiceClient({
      txServiceUrl: `https://safe-transaction-${
        FORK || DRE.network.name
      }.safe.global`,
      ethAdapter,
    });

    for (const a of actions) {
      const data =
        type === "execute"
          ? a.executeData
          : type === "cancel"
          ? a.cancelData
          : a.queueData;
      const safeTransactionData: SafeTransactionDataPartial = {
        to: timeLock.address,
        value: "0",
        data,
      };
      const safeTransaction = await safeSdk.createTransaction({
        safeTransactionData,
      });
      const signature = await safeSdk.signTypedData(safeTransaction);
      safeTransaction.addSignature(signature);
      await safeService.proposeTransaction({
        safeAddress: MULTI_SIG,
        safeTransactionData: safeTransaction.data,
        safeTxHash: await safeSdk.getTransactionHash(safeTransaction),
        senderAddress: await signer.getAddress(),
        senderSignature: signature.data,
      });
    }
  });
