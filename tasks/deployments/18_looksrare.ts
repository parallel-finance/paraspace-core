import {task} from "hardhat/config";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:looksrare", "Deploy looksrare").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_17} = await import(
    "../../deploy/tasks/deployments/testnet/steps/17_looksrare"
  );
  await step_17(verify);
});
