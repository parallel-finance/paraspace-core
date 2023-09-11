import {utils} from "ethers";
import rawBRE from "hardhat";
import {deployReserveInterestRateStrategy} from "../../helpers/contracts-deployments";
import {
  getAllTokens,
  getPoolAddressesProvider,
  getPoolConfiguratorProxy,
} from "../../helpers/contracts-getters";
import {dryRunMultipleEncodedData} from "../../helpers/contracts-helpers";
import {
  ERC20TokenContractId,
  IInterestRateStrategyParams,
  tEthereumAddress,
} from "../../helpers/types";

const adHoc = async () => {
  console.time("ad-hoc");
  const allTokens = await getAllTokens();
  const configurator = await getPoolConfiguratorProxy();
  const tokens = [
    ERC20TokenContractId.WETH,
    ERC20TokenContractId.USDC,
    ERC20TokenContractId.WBTC,
  ];
  const addressProvider = await getPoolAddressesProvider();
  const target: tEthereumAddress[] = [];
  const data: string[] = [];

  const strategy: IInterestRateStrategyParams = {
    name: "rateStrategyWETH",
    optimalUsageRatio: utils.parseUnits("0.85", 27).toString(),
    baseVariableBorrowRate: utils.parseUnits("0.04", 27).toString(),
    variableRateSlope1: utils.parseUnits("0.08", 27).toString(),
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

  for (const token of tokens) {
    const encodedData = configurator.interface.encodeFunctionData(
      "setReserveInterestRateStrategyAddress",
      [allTokens[token].address, newStrategy.address]
    );

    target.push(configurator.address);
    data.push(encodedData);
  }

  await dryRunMultipleEncodedData(target, data, []);

  console.timeEnd("ad-hoc");
};

async function main() {
  await rawBRE.run("set-DRE");
  await adHoc();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
