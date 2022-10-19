import {task} from "hardhat/config";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:seaport", "Deploy seaport").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {step_15} = await import(
      "../../deploy/tasks/deployments/testnet/steps/15_seaport"
    );
    await step_15(verify);
  }
);
