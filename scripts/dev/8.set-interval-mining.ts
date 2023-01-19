import rawBRE from "hardhat";
import {DRE} from "../../helpers/misc-utils";

const setIntervalMining = async () => {
  console.time("interval-mining");
  await DRE.network.provider.send("evm_setAutomine", [false]);
  await DRE.network.provider.send("evm_setIntervalMining", [3000]);
  console.timeEnd("interval-mining");
};

async function main() {
  await rawBRE.run("set-DRE");
  await setIntervalMining();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
