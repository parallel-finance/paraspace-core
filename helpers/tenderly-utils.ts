import {HardhatRuntimeEnvironment} from "hardhat/types";
import {DRE} from "./misc-utils";
import {Contract} from "ethers";
import {TENDERLY} from "./hardhat-constants";

export const usingTenderly = () =>
  DRE &&
  ((DRE as HardhatRuntimeEnvironment).network.name.includes("tenderly") ||
    TENDERLY);

export const verifyAtTenderly = async (id: string, instance: Contract) => {
  console.log("\n- Doing Tenderly contract verification of", id);
  // eslint-disable-next-line
  await (DRE as any).tenderlyNetwork.verify({
    name: id,
    address: instance.address,
  });
  console.log(`  - Verified ${id} at Tenderly!`);
};
