import {task} from "hardhat/config";
import {FORK} from "../../helpers/hardhat-constants";
import {ethers} from "ethers";
import EthersAdapter from "@safe-global/safe-ethers-lib";
import SafeServiceClient, {
  SafeMultisigTransactionListResponse,
} from "@safe-global/safe-service-client";
import {decodeMulti} from "ethers-multisend";

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
