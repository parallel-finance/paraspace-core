import {
  tEthereumAddress,
  iAssetBase,
  iAssetAggregatorBase,
  ERC721TokenContractId,
  ERC20TokenContractId,
  eContractid,
} from "./types";
import {
  CLCETHSynchronicityPriceAdapter,
  CLExchangeRateSynchronicityPriceAdapter,
  CLFixedPriceSynchronicityPriceAdapter,
  CLwstETHSynchronicityPriceAdapter,
  ERC721OracleWrapper,
  MockAggregator,
  PriceOracle,
  UniswapV3OracleWrapper,
} from "../types";
import {
  deployERC721OracleWrapper,
  deployAggregator,
  deployUniswapV3OracleWrapper,
  deployCLwstETHSynchronicityPriceAdapter,
  deployFixedPriceSynchronicityPriceAdapter,
  deployExchangeRateSynchronicityPriceAdapter,
  deployCTokenSynchronicityPriceAdapter,
} from "./contracts-deployments";
import {getParaSpaceConfig, waitForTx} from "./misc-utils";
import {
  getAggregator,
  getAllTokens,
  getPoolAddressesProvider,
  getUniswapV3Factory,
} from "./contracts-getters";
import {
  getContractAddresses,
  insertContractAddressInDb,
} from "./contracts-helpers";
import {GLOBAL_OVERRIDES} from "./hardhat-constants";
import {upperFirst} from "lodash";

export const setInitialAssetPricesInOracle = async (
  prices: Partial<iAssetBase<tEthereumAddress>>,
  assetsAddresses: Partial<iAssetBase<tEthereumAddress>>,
  priceOracleInstance: PriceOracle
) => {
  for (const [assetSymbol, price] of Object.entries(prices)) {
    console.log(`set ${assetSymbol} price`);
    await waitForTx(
      await priceOracleInstance.setAssetPrice(
        assetsAddresses[assetSymbol],
        price,
        GLOBAL_OVERRIDES
      )
    );
  }
};

export const deployAllAggregators = async (
  nftFloorOracle: tEthereumAddress,
  initialPrices?: iAssetAggregatorBase<string>,
  verify?: boolean
) => {
  const tokens = await getAllTokens();
  const aggregators: {
    [tokenSymbol: string]:
      | MockAggregator
      | UniswapV3OracleWrapper
      | CLwstETHSynchronicityPriceAdapter
      | ERC721OracleWrapper
      | CLExchangeRateSynchronicityPriceAdapter
      | CLFixedPriceSynchronicityPriceAdapter
      | CLCETHSynchronicityPriceAdapter;
  } = {};
  const addressesProvider = await getPoolAddressesProvider();
  const paraSpaceConfig = getParaSpaceConfig();
  const oracleConfig = paraSpaceConfig.Oracle;
  const chainlinkConfig = paraSpaceConfig.Chainlink;
  for (const tokenSymbol of Object.keys(tokens)) {
    if (tokenSymbol === ERC20TokenContractId[oracleConfig.BaseCurrency]) {
      continue;
    }
    if (chainlinkConfig[tokenSymbol]) {
      await insertContractAddressInDb(
        eContractid.Aggregator.concat(upperFirst(tokenSymbol)),
        chainlinkConfig[tokenSymbol],
        false
      );
      aggregators[tokenSymbol] = await getAggregator(undefined, tokenSymbol);
      continue;
    }

    if (
      ERC20TokenContractId[oracleConfig.BaseCurrency] ==
        ERC20TokenContractId.WETH &&
      [ERC20TokenContractId.bendETH, ERC20TokenContractId.aWETH].includes(
        tokenSymbol as ERC20TokenContractId
      )
    ) {
      aggregators[tokenSymbol] =
        await deployFixedPriceSynchronicityPriceAdapter(
          oracleConfig.BaseCurrencyUnit.toString(),
          tokenSymbol,
          verify
        );
    } else if (tokenSymbol === ERC20TokenContractId.cETH) {
      aggregators[tokenSymbol] = await deployCTokenSynchronicityPriceAdapter(
        tokens[tokenSymbol].address,
        tokenSymbol,
        verify
      );
    } else if (tokenSymbol === ERC721TokenContractId.SFVLDR) {
      aggregators[tokenSymbol] =
        await deployFixedPriceSynchronicityPriceAdapter(
          oracleConfig.BaseCurrencyUnit.mul(32).toString(),
          tokenSymbol,
          verify
        );
    } else if (tokenSymbol === ERC20TokenContractId.wstETH) {
      aggregators[tokenSymbol] = await deployCLwstETHSynchronicityPriceAdapter(
        aggregators[ERC20TokenContractId.stETH].address,
        tokens[ERC20TokenContractId.stETH].address,
        oracleConfig.BaseCurrencyDecimals,
        verify
      );
    } else if (tokenSymbol === ERC20TokenContractId.awstETH) {
      aggregators[tokenSymbol] = aggregators[ERC20TokenContractId.wstETH];
    } else if (tokenSymbol === ERC20TokenContractId.astETH) {
      aggregators[tokenSymbol] = aggregators[ERC20TokenContractId.stETH];
    } else if (tokenSymbol === ERC20TokenContractId.rETH) {
      aggregators[tokenSymbol] =
        await deployExchangeRateSynchronicityPriceAdapter(
          tokens[ERC20TokenContractId.rETH].address,
          tokenSymbol,
          verify
        );
    } else if (tokenSymbol === ERC721TokenContractId.UniswapV3) {
      const univ3Factory = await getUniswapV3Factory();
      const univ3Token = tokens[ERC721TokenContractId.UniswapV3];
      aggregators[tokenSymbol] = await deployUniswapV3OracleWrapper(
        univ3Factory.address,
        univ3Token.address,
        addressesProvider.address,
        verify
      );
    } else if (!initialPrices) {
      aggregators[tokenSymbol] = await deployERC721OracleWrapper(
        addressesProvider.address,
        nftFloorOracle,
        tokens[tokenSymbol].address,
        tokenSymbol,
        verify
      );
    } else if (initialPrices[tokenSymbol]) {
      aggregators[tokenSymbol] = await deployAggregator(
        tokenSymbol,
        initialPrices[tokenSymbol],
        verify
      );
    } else {
      continue;
    }
  }

  const allTokenAddresses = getContractAddresses(tokens);
  const allAggregatorsAddresses = getContractAddresses(aggregators);

  return [allTokenAddresses, allAggregatorsAddresses];
};

export const getPairsTokenAggregators = (
  allAssetsAddresses: {
    [tokenSymbol: string]: tEthereumAddress;
  },
  aggregatorsAddresses: {[tokenSymbol: string]: tEthereumAddress}
): [string[], string[]] => {
  const paraSpaceConfig = getParaSpaceConfig();
  const oracleConfig = paraSpaceConfig.Oracle;
  const pairs = Object.entries(allAssetsAddresses)
    .filter(
      ([tokenSymbol]) =>
        tokenSymbol !== ERC20TokenContractId[oracleConfig.BaseCurrency]
    )
    .map(([tokenSymbol, tokenAddress]) => {
      return [tokenAddress, aggregatorsAddresses[tokenSymbol]];
    }) as [string, string][];

  const mappedPairs = pairs.map(([asset]) => asset);
  const mappedAggregators = pairs.map(([, source]) => source);

  return [mappedPairs, mappedAggregators];
};
