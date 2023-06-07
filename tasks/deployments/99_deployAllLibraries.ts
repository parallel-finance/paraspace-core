import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../helpers/hardhat-constants";

task("deploy:all-libraries", "Deploy All Libraries").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {deployAllLibraries} = await import(
      "../../helpers/contracts-deployments"
    );
    const allLibraries = await deployAllLibraries(ETHERSCAN_VERIFICATION);
    console.log(JSON.stringify(allLibraries, null, 2));
  }
);
