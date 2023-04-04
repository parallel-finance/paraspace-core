import {ZERO_ADDRESS} from "../../../helpers/constants";
import {
  deployHotWalletProxy,
  deployMockIncentivesController,
  deployMockReserveAuctionStrategy,
} from "../../../helpers/contracts-deployments";
import {
  getAllTokens,
  getProtocolDataProvider,
} from "../../../helpers/contracts-getters";
import {
  getContractAddresses,
  getParaSpaceAdmins,
} from "../../../helpers/contracts-helpers";
import {
  configureReservesByHelper,
  initReservesByHelper,
} from "../../../helpers/init-helpers";
import {
  chunk,
  getParaSpaceConfig,
  isLocalTestnet,
} from "../../../helpers/misc-utils";
import {
  eContractid,
  IReserveParams,
  tEthereumAddress,
} from "../../../helpers/types";
import {auctionStrategyLinear} from "../../../market-config/auctionStrategies";

export const step_11 = async (verify = false) => {
  try {
    const allTokens = await getAllTokens();
    const {paraSpaceAdminAddress} = await getParaSpaceAdmins();
    const reservesParams = getParaSpaceConfig().ReservesConfig;
    const protocolDataProvider = await getProtocolDataProvider();

    const allTokenAddresses = getContractAddresses(allTokens);

    console.log("Initialize configuration");

    const config = getParaSpaceConfig();

    const {PTokenNamePrefix, VariableDebtTokenNamePrefix, SymbolPrefix} =
      config;
    const treasuryAddress = config.Treasury;

    // Add an IncentivesController
    let incentivesController = config.IncentivesController;
    let auctionStrategy: tEthereumAddress | undefined = undefined;
    let timeLockStrategy: tEthereumAddress | undefined = undefined;
    let hotWallet: tEthereumAddress | undefined = config.HotWallet;

    if (isLocalTestnet()) {
      incentivesController = (await deployMockIncentivesController(verify))
        .address;
      const {
        maxPriceMultiplier,
        minExpPriceMultiplier,
        minPriceMultiplier,
        stepLinear,
        stepExp,
        tickLength,
      } = auctionStrategyLinear;
      auctionStrategy = (
        await deployMockReserveAuctionStrategy(
          [
            maxPriceMultiplier,
            minExpPriceMultiplier,
            minPriceMultiplier,
            stepLinear,
            stepExp,
            tickLength,
          ],
          verify
        )
      ).address;
      timeLockStrategy = ZERO_ADDRESS;
      if (!hotWallet) {
        const proxy = await deployHotWalletProxy();
        await proxy.initialize(paraSpaceAdminAddress, paraSpaceAdminAddress);
        hotWallet = proxy.address;
      }
    }

    const reserves = Object.entries(reservesParams).filter(
      ([, {xTokenImpl}]) =>
        xTokenImpl === eContractid.DelegationAwarePTokenImpl ||
        xTokenImpl === eContractid.PTokenImpl ||
        xTokenImpl === eContractid.NTokenImpl ||
        xTokenImpl === eContractid.NTokenBAYCImpl ||
        xTokenImpl === eContractid.NTokenMAYCImpl ||
        xTokenImpl === eContractid.NTokenMoonBirdsImpl ||
        xTokenImpl === eContractid.NTokenUniswapV3Impl ||
        xTokenImpl === eContractid.PTokenStETHImpl ||
        xTokenImpl === eContractid.PTokenATokenImpl ||
        xTokenImpl === eContractid.PTokenSApeImpl ||
        xTokenImpl === eContractid.PTokenCApeImpl ||
        xTokenImpl === eContractid.PYieldTokenImpl ||
        xTokenImpl === eContractid.NTokenBAKCImpl
    ) as [string, IReserveParams][];
    const chunkedReserves = chunk(reserves, 20);

    for (
      let chunkIndex = 0;
      chunkIndex < chunkedReserves.length;
      chunkIndex++
    ) {
      const reserves = chunkedReserves[chunkIndex];
      await initReservesByHelper(
        reserves,
        allTokenAddresses,
        PTokenNamePrefix,
        VariableDebtTokenNamePrefix,
        SymbolPrefix,
        paraSpaceAdminAddress,
        treasuryAddress,
        incentivesController,
        hotWallet || ZERO_ADDRESS,
        verify,
        undefined,
        undefined,
        undefined,
        undefined,
        auctionStrategy,
        timeLockStrategy
      );

      await configureReservesByHelper(
        reserves,
        allTokenAddresses,
        protocolDataProvider,
        paraSpaceAdminAddress
      );
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
