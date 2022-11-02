import {task} from "hardhat/config";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:reserves-setup-helper", "Deploy reserves setup helper").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {step_08} = await import(
      "../../deploy/tasks/deployments/full-deployment/steps/08_reservesSetupHelper"
    );
    await step_08(verify);
  }
);
