import {task} from "hardhat/config";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:reserves-setup-helper", "Deploy reserves setup helper").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {step_09} = await import(
      "../../deploy/tasks/deployments/testnet/steps/09_reservesSetupHelper"
    );
    await step_09(verify);
  }
);
