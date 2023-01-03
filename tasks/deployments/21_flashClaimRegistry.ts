import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../helpers/hardhat-constants";

task("deploy:flash-claim-registry", "Deploy flash claim registry").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {step_21} = await import(
      "../../scripts/deployments/steps/21_flashClaimRegistry"
    );
    await step_21(ETHERSCAN_VERIFICATION);
  }
);
