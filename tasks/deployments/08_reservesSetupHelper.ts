import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../deploy/helpers/hardhat-constants";

task("deploy:reserves-setup-helper", "Deploy reserves setup helper").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {step_08} = await import(
      "../../deploy/tasks/deployments/full-deployment/steps/08_reservesSetupHelper"
    );
    await step_08(ETHERSCAN_VERIFICATION);
  }
);
