import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../deploy/helpers/hardhat-constants";

task("deploy:flash-claim-registry", "Deploy flash claim registry").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {step_18} = await import(
      "../../deploy/tasks/deployments/full-deployment/steps/18_flashClaimRegistry"
    );
    await step_18(ETHERSCAN_VERIFICATION);
  }
);
