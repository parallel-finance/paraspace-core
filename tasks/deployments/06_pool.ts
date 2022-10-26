import {task} from "hardhat/config";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:pool", "Deploy pool components").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_06} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/06_pool"
  );
  await step_06(verify);
});
