import {task} from "hardhat/config";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task(
  "deploy:all-aggregators",
  "Deploy all aggregators and reserves"
).setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_10} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/10_allAggregators"
  );
  await step_10(verify);
});
