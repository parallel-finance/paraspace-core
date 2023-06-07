import {task} from "hardhat/config";
import {
  ETHERSCAN_VERIFICATION,
  ZK_LIBRARIES_PATH,
} from "../../helpers/hardhat-constants";
import fs from "fs";

task("deploy:all-libraries", "Deploy All Libraries").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {deployAllLibraries} = await import(
      "../../helpers/contracts-deployments"
    );
    const allLibraries = await deployAllLibraries(ETHERSCAN_VERIFICATION);
    fs.writeFileSync(ZK_LIBRARIES_PATH, JSON.stringify(allLibraries));
  }
);
