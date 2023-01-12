import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../helpers/hardhat-constants";

task("deploy:P2PPairStaking", "Deploy P2PPairStaking").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {step_20} = await import(
      "../../scripts/deployments/steps/20_p2pPairStaking"
    );
    await step_20(ETHERSCAN_VERIFICATION);
  }
);
