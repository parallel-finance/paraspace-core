import rawBRE from "hardhat";
import {AIRDROP_CONTRACT} from "../../helpers/hardhat-constants";
import {DRE} from "../../helpers/misc-utils";
// import {deployAirdropper} from "../../helpers/contracts-deployments";

const adHoc = async () => {
  console.time("ad-hoc");
  console.log(await DRE.ethers.provider.getBalance(AIRDROP_CONTRACT));
  // await deployAirdropper("0x2f2d07d60ea7330DD2314f4413CCbB2dC25276EF", false);
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
