import {task} from "hardhat/config";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:fallback-oracle", "Deploy fallback oracle").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_09} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/09_fallbackOracle"
  );
  await step_09(verify);
});
