import {fromBn} from "evm-bn";
import rawBRE from "hardhat";
import {WAD} from "../../helpers/constants";
import {getAutoCompoundApe} from "../../helpers/contracts-getters";

const adHoc = async () => {
  console.time("ad-hoc");
  const cape = await getAutoCompoundApe();
  console.log(await cape.owner());
  console.log(await cape.paused());
  console.log(fromBn(await cape.getPooledApeByShares(WAD)));
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
