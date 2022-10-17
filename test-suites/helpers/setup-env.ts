import hre from "hardhat";
import {setDRE} from "../../deploy/helpers/misc-utils";
import {initializeMakeSuite} from "./make-suite";

export async function testEnvFixture() {
  setDRE(hre);
  await hre.run("deploy:all");
  return await initializeMakeSuite();
}
