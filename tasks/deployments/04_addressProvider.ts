import {task} from "hardhat/config";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:address-provider", "Deploy addresses provider").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {step_04} = await import(
      "../../deploy/tasks/deployments/full-deployment/steps/04_addressProvider"
    );
    await step_04(verify);
  }
);
