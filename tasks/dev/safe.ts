import {task} from "hardhat/config";
import {FORK} from "../../helpers/hardhat-constants";
import {ethers} from "ethers";
import EthersAdapter from "@safe-global/safe-ethers-lib";
import SafeServiceClient, {
  SafeMultisigTransactionListResponse,
} from "@safe-global/safe-service-client";
import {decodeMulti} from "ethers-multisend";
import Safe from "@safe-global/safe-core-sdk";
import {SafeTransactionDataPartial} from "@safe-global/safe-core-sdk-types";

const MULTI_SIG = "0xe965198731CDdB2f06e91DD0CDff74b71e4b3714";
const MULTI_SEND = "0x40A2aCCbd92BCA938b02010E17A5b8929b49130D";

task("list-pending-safe-txs", "List pending safe txs").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {getFirstSigner} = await import("../../helpers/contracts-getters");
    const signer = await getFirstSigner();
    const ethAdapter = new EthersAdapter({
      ethers,
      signerOrProvider: signer,
    });

    const safeService = new SafeServiceClient({
      txServiceUrl: `https://safe-transaction-${
        FORK || DRE.network.name
      }.safe.global`,
      ethAdapter,
    });
    const res: SafeMultisigTransactionListResponse =
      await safeService.getPendingTransactions(MULTI_SIG);

    for (const tx of res.results) {
      const {to, data} = tx;
      if (!data) {
        continue;
      }

      if (to === MULTI_SEND) {
        const txs = decodeMulti(data);
        for (const tx of txs) {
          console.log();
          console.log(" to:", tx.to);
          console.log(" data:", tx.data);
        }
      } else {
        console.log();
        console.log(" to:", to);
        console.log(" data:", data);
      }
    }
  }
);

task("propose-buffered-txs", "Propose buffered timelock transactions")
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
