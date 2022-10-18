import {task} from "hardhat/config";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:x2y2", "Deploy x2y2").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_18} = await import(
    "../../deploy/tasks/deployments/testnet/steps/18_x2y2"
  );
  await step_18(verify);
});
