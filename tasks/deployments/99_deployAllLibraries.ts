import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../helpers/hardhat-constants";

task("deploy:all-libraries", "Deploy All Libraries").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {deployAllLibraries} = await import(
      "../../helpers/contracts-deployments"
    );
    await deployAllLibraries(ETHERSCAN_VERIFICATION);
  }
);
