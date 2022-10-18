import {task} from "hardhat/config";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:pool", "Deploy pool components").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_07} = await import(
    "../../deploy/tasks/deployments/testnet/steps/07_pool"
  );
  await step_07(verify);
});
