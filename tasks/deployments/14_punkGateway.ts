import {task} from "hardhat/config";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:punk-gateway", "Deploy punk gateway").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_14} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/14_punkGateway"
  );
  await step_14(verify);
});
