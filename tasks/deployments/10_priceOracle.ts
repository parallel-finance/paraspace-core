import {task} from "hardhat/config";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:price-oracle", "Deploy price oracle").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_10} = await import(
    "../../deploy/tasks/deployments/testnet/steps/10_priceOracle"
  );
  await step_10(verify);
});
