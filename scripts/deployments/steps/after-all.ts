import {BLOCKSCOUT_DISABLE_INDEXER} from "../../../helpers/hardhat-constants";
import {DRE, isFork} from "../../../helpers/misc-utils";

export const afterAll = async () => {
  console.log("running after all hook");
  if (!isFork() && BLOCKSCOUT_DISABLE_INDEXER) {
    return;
  }
  await DRE.network.provider.send("evm_setAutomine", [false]);
  await DRE.network.provider.send("evm_setIntervalMining", [3000]);
};
