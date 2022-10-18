import {task} from "hardhat/config";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:seaport", "Deploy seaport").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_16} = await import(
    "../../deploy/tasks/deployments/testnet/steps/16_seaport"
  );
  await step_16(verify);
});
