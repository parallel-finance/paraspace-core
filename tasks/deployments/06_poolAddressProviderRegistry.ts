import {task} from "hardhat/config";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task(
  "deploy:pool-addresses-provider-registry",
  "Deploy pool addresses provider registry"
).setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_06} = await import(
    "../../deploy/tasks/deployments/testnet/steps/06_poolAddressesProviderRegistry"
  );
  await step_06(verify);
});
