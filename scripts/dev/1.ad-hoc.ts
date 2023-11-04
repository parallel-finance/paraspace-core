import rawBRE from "hardhat";
import {upgradeNToken} from "../upgrade/ntoken";
import {deployUiPoolDataProvider} from "../../helpers/contracts-deployments";
import {getNToken} from "../../helpers/contracts-getters";

const adHoc = async () => {
  console.time("ad-hoc");
  await deployUiPoolDataProvider(
    "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419"
  );
  await upgradeNToken(false);
  const nBAYC = await getNToken("0x7285e8F0186a0A41E73ceF7603AD7b80A2d5a793");
  await nBAYC.revokeDelegation("0x00000000000076A84feF008CDAbe6409d2FE638B");
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
