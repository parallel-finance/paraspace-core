import {task} from "hardhat/config";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task(
  "deploy:all-mock-aggregators",
  "Deploy all mock aggregators and reserves"
).setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_11} = await import(
    "../../deploy/tasks/deployments/testnet/steps/11_allMockAggregators"
  );
  await step_11(verify);
});
