import {task} from "hardhat/config";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:flash-claim-registry", "Deploy flash claim registry").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_18} = await import(
    "../../deploy/tasks/deployments/testnet/steps/18_flashClaimRegistry"
  );
  await step_18(verify);
});
