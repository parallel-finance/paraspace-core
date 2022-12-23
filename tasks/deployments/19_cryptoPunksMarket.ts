import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../helpers/hardhat-constants";

task(
  "deploy:crypto-punks-marketplace",
  "Deploy Crypto Punks Marketplace support"
).setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_19} = await import(
    "../../scripts/deployments/steps/19_cryptoPunksMarket"
  );
  await step_19(ETHERSCAN_VERIFICATION);
});
