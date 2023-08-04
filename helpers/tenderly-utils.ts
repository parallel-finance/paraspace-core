import {HardhatRuntimeEnvironment} from "hardhat/types";
import {DRE} from "./misc-utils";
import {TENDERLY} from "./hardhat-constants";
import {tEthereumAddress} from "./types";

export const usingTenderly = () =>
  DRE &&
  ((DRE as HardhatRuntimeEnvironment).network.name.includes("tenderly") ||
    TENDERLY);

export const verifyAtTenderly = async (
  id: string,
  address: tEthereumAddress
) => {
  console.log("\n- Doing Tenderly contract verification of", id);
  // eslint-disable-next-line
  await (DRE as any).tenderlyNetwork.verify({
    name: id,
    address,
  });
  console.log(`  - Verified ${id} at Tenderly!`);
};
