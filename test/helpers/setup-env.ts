import hre from "hardhat";
import {initializeMakeSuite} from "./make-suite";

export async function testEnvFixture() {
  await hre.run("deploy:all");
  return await initializeMakeSuite();
}
