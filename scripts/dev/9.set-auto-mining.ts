import rawBRE from "hardhat";
import {DRE} from "../../helpers/misc-utils";

const setAutoMining = async () => {
  console.time("auto-mining");
  await DRE.network.provider.send("evm_setAutomine", [true]);
  await DRE.network.provider.send("evm_setIntervalMining", [0]);
  console.timeEnd("auto-mining");
};

async function main() {
  await rawBRE.run("set-DRE");
  await setAutoMining();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
