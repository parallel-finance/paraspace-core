import {task} from "hardhat/config";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:weth-gateway", "Deploy weth gateway").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_13} = await import(
    "../../deploy/tasks/deployments/testnet/steps/13_wethGateway"
  );
  await step_13(verify);
});
