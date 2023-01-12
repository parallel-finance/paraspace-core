import rawBRE from "hardhat";
import {IInterestRateStrategyParams} from "../../helpers/types";
import {utils} from "ethers";
import {deployReserveInterestRateStrategy} from "../../helpers/contracts-deployments";
import {getPoolAddressesProvider} from "../../helpers/contracts-getters";

const deployRateStrategy = async () => {
  console.time("deploy:new-rate-strategy");
  const addressProvider = await getPoolAddressesProvider();
  const strategy: IInterestRateStrategyParams = {
    name: "rateStrategyAPE",
    optimalUsageRatio: utils.parseUnits("0.9", 27).toString(),
    baseVariableBorrowRate: utils.parseUnits("0.6", 27).toString(),
    variableRateSlope1: utils.parseUnits("0.5", 27).toString(),
    variableRateSlope2: utils.parseUnits("0.6", 27).toString(),
  };
  const newStrategy = await deployReserveInterestRateStrategy(
    strategy.name,
    [
      addressProvider.address,
      strategy.optimalUsageRatio,
      strategy.baseVariableBorrowRate,
      strategy.variableRateSlope1,
      strategy.variableRateSlope2,
    ],
    false
  );
  console.log("strategy:", newStrategy.address);
  console.timeEnd("deploy:new-rate-strategy");
};

async function main() {
  await rawBRE.run("set-DRE");
  await deployRateStrategy();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
