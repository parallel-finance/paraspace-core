import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../helpers/hardhat-constants";

task(
  "deploy:ui-incentive-data-provider",
  "Deploy UI incentive data provider"
).setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_12} = await import(
    "../../scripts/deployments/steps/12_uiIncentiveDataProvider"
  );
  await step_12(ETHERSCAN_VERIFICATION);
});

task("deploy:ui-pool-data-provider", "Deploy UI pool data provider").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {deployUiPoolDataProvider} = await import(
      "../../helpers/contracts-deployments"
    );
    const {getParaSpaceConfig} = await import("../../helpers/misc-utils");
    const paraSpaceConfig = getParaSpaceConfig();
    const chainlinkConfig = paraSpaceConfig.Chainlink;
    const oracleConfig = paraSpaceConfig.Oracle;
    await deployUiPoolDataProvider(
      chainlinkConfig[oracleConfig.BaseCurrency],
      chainlinkConfig[oracleConfig.BaseCurrency],
      ETHERSCAN_VERIFICATION
    );
  }
);
