import {task} from "hardhat/config";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:looksrare", "Deploy looksrare").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_16} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/16_looksrare"
  );
  await step_16(verify);
});
