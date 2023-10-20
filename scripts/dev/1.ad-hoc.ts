import rawBRE from "hardhat";
import {upgradePoolAAPositionMover} from "../upgrade/pool";
import {zeroAddress} from "ethereumjs-util";
import {deployAccountFactory} from "../../helpers/contracts-deployments";

const adHoc = async () => {
  console.time("ad-hoc");

  await deployAccountFactory(zeroAddress())
  await upgradePoolAAPositionMover(zeroAddress());

  console.timeEnd("ad-hoc");
};

async function main() {
  await rawBRE.run("set-DRE");
  await adHoc();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
