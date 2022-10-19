import {task} from "hardhat/config";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:pool-configurator", "Deploy pool configurator").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {step_08} = await import(
      "../../deploy/tasks/deployments/testnet/steps/08_poolConfigurator"
    );
    await step_08(verify);
  }
);
