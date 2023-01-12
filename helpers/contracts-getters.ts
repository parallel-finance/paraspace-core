import {utils} from "ethers";
import {
  ProtocolDataProvider__factory,
  PToken__factory,
  NToken__factory,
  ReservesSetupHelper__factory,
  PoolAddressesProvider__factory,
  PoolAddressesProviderRegistry__factory,
  PoolConfigurator__factory,
  MintableERC20__factory,
  MintableERC721__factory,
  MockVariableDebtToken__factory,
  PriceOracle__factory,
  VariableDebtToken__factory,
  WETH9Mocked__factory,
  ParaSpaceOracle__factory,
  MockInitializableImple__factory,
  MockInitializableImpleV2__factory,
  SupplyLogic__factory,
  BorrowLogic__factory,
  LiquidationLogic__factory,
  ACLManager__factory,
  DefaultReserveInterestRateStrategy__factory,
  UiPoolDataProvider__factory,
  UiIncentiveDataProvider__factory,
  WETHGateway__factory,
  WPunk__factory,
  CryptoPunksMarket__factory,
  WPunkGateway__factory,
  MockAggregator__factory,
  ERC20__factory,
  MockTokenFaucet__factory,
  IERC20Detailed__factory,
  MockIncentivesController__factory,
  ERC721__factory,
  Moonbirds__factory,
  ConduitController__factory,
  Seaport__factory,
  LooksRareExchange__factory,
  StrategyStandardSaleForFixedPrice__factory,
  TransferManagerERC721__factory,
  X2Y2R1__factory,
  ERC721Delegate__factory,
  PausableZoneController__factory,
  PausableZone__factory,
  Conduit__factory,
  NTokenMoonBirds__factory,
  UniswapV3Factory__factory,
  UniswapV3OracleWrapper__factory,
  NTokenUniswapV3__factory,
  StETHMocked__factory,
  PTokenStETH__factory,
  MockAToken__factory,
  PTokenAToken__factory,
  NFTFloorOracle__factory,
  UserFlashclaimRegistry__factory,
  MockAirdropProject__factory,
  IPool__factory,
  MockReserveAuctionStrategy__factory,
  NTokenBAYC__factory,
  NTokenMAYC__factory,
  ApeCoinStaking__factory,
  PTokenSApe__factory,
  StandardPolicyERC721__factory,
  BlurExchange__factory,
  ExecutionDelegate__factory,
  MarketplaceLogic__factory,
  FlashClaimLogic__factory,
  PoolLogic__factory,
  SeaportAdapter__factory,
  LooksRareAdapter__factory,
  BlurAdapter__factory,
  X2Y2Adapter__factory,
  AutoCompoundApe__factory,
  InitializableAdminUpgradeabilityProxy__factory,
  StETHDebtToken__factory,
  ApeStakingLogic__factory,
  MintableERC721Logic__factory,
  NTokenBAKC__factory,
  P2PPairStaking__factory,
  ExecutorWithTimelock__factory,
  MultiSendCallOnly__factory,
} from "../types";
import {
  getEthersSigners,
  ERC20TokenMap,
  ERC721TokenMap,
  impersonateAddress,
  getParaSpaceAdmins,
} from "./contracts-helpers";
import {DRE, getDb, getParaSpaceConfig} from "./misc-utils";
import {
  eContractid,
  ERC721TokenContractId,
  tEthereumAddress,
  ERC20TokenContractId,
} from "./types";
import {first, last} from "lodash";
import {
  INonfungiblePositionManager__factory,
  ISwapRouter__factory,
} from "../types";
import {RPC_URL} from "./hardhat-constants";

export const getFirstSigner = async () => {
  if (!RPC_URL) {
    return first(await getEthersSigners())!;
  }

  const {paraSpaceAdminAddress} = await getParaSpaceAdmins();
  return (await impersonateAddress(paraSpaceAdminAddress)).signer;
};

export const getLastSigner = async () => last(await getEthersSigners())!;

export const getPoolAddressesProvider = async (address?: tEthereumAddress) => {
  return await PoolAddressesProvider__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.PoolAddressesProvider}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );
};

export const getACLManager = async (address?: tEthereumAddress) => {
  return await ACLManager__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.ACLManager}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );
};

export const getPoolConfiguratorProxy = async (address?: tEthereumAddress) => {
  return await PoolConfigurator__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.PoolConfiguratorProxy}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );
};

export const getSupplyLogic = async (address?: tEthereumAddress) =>
  await SupplyLogic__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.SupplyLogic}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getBorrowLogic = async (address?: tEthereumAddress) =>
  await BorrowLogic__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.BorrowLogic}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getLiquidationLogic = async (address?: tEthereumAddress) =>
  await LiquidationLogic__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.LiquidationLogic}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getMarketplaceLogic = async (address?: tEthereumAddress) =>
  await MarketplaceLogic__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.MarketplaceLogic}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getFlashClaimLogic = async (address?: tEthereumAddress) =>
  await FlashClaimLogic__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.FlashClaimRegistry}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getPoolLogic = async (address?: tEthereumAddress) =>
  await PoolLogic__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.PoolLogic}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getPoolProxy = async (address?: tEthereumAddress) =>
  await IPool__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.PoolProxy}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getPriceOracle = async (address?: tEthereumAddress) =>
  await PriceOracle__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.PriceOracle}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getUiPoolDataProvider = async (address?: tEthereumAddress) =>
  await UiPoolDataProvider__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.UiPoolDataProvider}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getUiIncentiveDataProviderV3 = async (
  address?: tEthereumAddress
) =>
  await UiIncentiveDataProvider__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.UiIncentiveDataProvider}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getPToken = async (address?: tEthereumAddress) =>
  await PToken__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.PTokenImpl}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getNToken = async (address?: tEthereumAddress) =>
  await NToken__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.NTokenImpl}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getVariableDebtToken = async (address?: tEthereumAddress) =>
  await VariableDebtToken__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.VariableDebtTokenImpl}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getStETHDebtToken = async (address?: tEthereumAddress) =>
  await StETHDebtToken__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.StETHDebtToken}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getIRStrategy = async (address?: tEthereumAddress) =>
  await DefaultReserveInterestRateStrategy__factory.connect(
    address ||
      (
        await getDb()
          .get(
            `${eContractid.DefaultReserveInterestRateStrategy}.${DRE.network.name}`
          )
          .value()
      ).address,
    await getFirstSigner()
  );

export const getMintableERC20 = async (address?: tEthereumAddress) =>
  await MintableERC20__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.MintableERC20}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getMintableERC721 = async (address?: tEthereumAddress) =>
  await MintableERC721__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.MintableERC721}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getIErc20Detailed = async (address: tEthereumAddress) =>
  await IERC20Detailed__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.IERC20Detailed}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getProtocolDataProvider = async (address?: tEthereumAddress) =>
  await ProtocolDataProvider__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.ProtocolDataProvider}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getParaSpaceOracle = async (address?: tEthereumAddress) =>
  await ParaSpaceOracle__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.ParaSpaceOracle}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getAllERC20Tokens = async () => {
  const db = getDb();
  const paraSpaceConfig = getParaSpaceConfig();
  const tokens: ERC20TokenMap = await Object.keys(ERC20TokenContractId)
    .filter((tokenSymbol) => !!paraSpaceConfig.ReservesConfig[tokenSymbol])
    .reduce<Promise<ERC20TokenMap>>(async (acc, tokenSymbol) => {
      const accumulator = await acc;
      const address = db
        .get(`${tokenSymbol}.${DRE.network.name}`)
        .value()?.address;
      if (address) {
        accumulator[tokenSymbol] = await getMintableERC20(address);
        return Promise.resolve(accumulator);
      } else {
        if (tokenSymbol === ERC20TokenContractId.cAPE) {
          return Promise.resolve(accumulator);
        }
        return Promise.reject(`${tokenSymbol} is not in db`);
      }
    }, Promise.resolve({}));
  return tokens;
};

export const getAllERC721Tokens = async () => {
  const db = getDb();
  const paraSpaceConfig = getParaSpaceConfig();
  const tokens: ERC721TokenMap = await Object.keys(ERC721TokenContractId)
    .filter((tokenSymbol) => !!paraSpaceConfig.ReservesConfig[tokenSymbol])
    .reduce<Promise<ERC721TokenMap>>(async (acc, tokenSymbol) => {
      const accumulator = await acc;
      const address = db
        .get(`${tokenSymbol}.${DRE.network.name}`)
        .value()?.address;
      if (address) {
        accumulator[tokenSymbol] = await getMintableERC721(address);
        return Promise.resolve(accumulator);
      } else {
        return Promise.reject(`${tokenSymbol} is not in db`);
      }
    }, Promise.resolve({}));
  return tokens;
};
export const getAllTokens = async () => {
  return Object.assign(await getAllERC20Tokens(), await getAllERC721Tokens());
};

export const getPoolAddressesProviderRegistry = async (
  address?: tEthereumAddress
) =>
  await PoolAddressesProviderRegistry__factory.connect(
    address ||
      (
        await getDb()
          .get(
            `${eContractid.PoolAddressesProviderRegistry}.${DRE.network.name}`
          )
          .value()
      ).address,
    await getFirstSigner()
  );

export const getReservesSetupHelper = async (address?: tEthereumAddress) =>
  await ReservesSetupHelper__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.ReservesSetupHelper}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getWETH = async (address?: tEthereumAddress) =>
  await WETH9Mocked__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.WETH}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getPunks = async (address?: tEthereumAddress) =>
  await CryptoPunksMarket__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.PUNKS}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getWPunk = async (address?: tEthereumAddress) =>
  await WPunk__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.WPunk}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getWETHGateway = async (address?: tEthereumAddress) =>
  await WETHGateway__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.WETHGatewayImpl}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getWETHGatewayProxy = async (address?: tEthereumAddress) =>
  await WETHGateway__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.WETHGatewayProxy}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getWPunkGateway = async (address?: tEthereumAddress) =>
  await WPunkGateway__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.WPunkGatewayImpl}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getWPunkGatewayProxy = async (address?: tEthereumAddress) =>
  await WPunkGateway__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.WPunkGatewayProxy}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getMockVariableDebtToken = async (address?: tEthereumAddress) =>
  await MockVariableDebtToken__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.MockVariableDebtToken}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getMockInitializableImple = async (address?: tEthereumAddress) =>
  await MockInitializableImple__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.MockInitializableImple}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getMockInitializableImpleV2 = async (address?: tEthereumAddress) =>
  await MockInitializableImpleV2__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.MockInitializableImpleV2}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getAggregator = async (
  address?: tEthereumAddress,
  symbol?: string
) =>
  await MockAggregator__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.Aggregator}.${symbol}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

// export const getParaSpaceToken = async (address?: tEthereumAddress) =>
//   await ParaSpaceToken__factory.connect(
//     address ||
//       (
//         await getDb().get(`${eContractid.ParaSpace}.${DRE.network.name}`).value()
//       ).address,
//     await getFirstSigner()
//   );

// export const getStakedParaSpaceToken = async (address?: tEthereumAddress) =>
//   await StakedParaSpaceV3__factory.connect(
//     address ||
//       (
//         await getDb().get(`${eContractid.sParaSpace}.${DRE.network.name}`).value()
//       ).address,
//     await getFirstSigner()
//   );

// export const getPCV = async (address?: tEthereumAddress) =>
//   await PCV__factory.connect(
//     address ||
//       (
//         await getDb().get(`${eContractid.PCV}.${DRE.network.name}`).value()
//       ).address,
//     await getFirstSigner()
//   );

export const getERC20 = async (address?: tEthereumAddress) =>
  await ERC20__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.MintableERC20}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getERC721 = async (address?: tEthereumAddress) =>
  await ERC721__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.MintableERC721}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getMoonBirds = async (address?: tEthereumAddress) =>
  await Moonbirds__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.MOONBIRD}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getNTokenMoonBirds = async (address?: tEthereumAddress) =>
  await NTokenMoonBirds__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.NTokenMoonBirdsImpl}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getUniswapV3Factory = async (address?: tEthereumAddress) =>
  await UniswapV3Factory__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.UniswapV3Factory}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getNonfungiblePositionManager = async (
  address?: tEthereumAddress
) => {
  return await INonfungiblePositionManager__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.UniswapV3}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );
};

export const getUniswapV3SwapRouter = async (address?: tEthereumAddress) => {
  return await ISwapRouter__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.UniswapV3SwapRouter}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );
};

export const getUniswapV3OracleWrapper = async (address?: tEthereumAddress) => {
  return await UniswapV3OracleWrapper__factory.connect(
    address ||
      (
        await getDb()
          .get(
            `${eContractid.Aggregator.concat(`.${eContractid.UniswapV3}`)}.${
              DRE.network.name
            }`
          )
          .value()
      ).address,
    await getFirstSigner()
  );
};

export const getNTokenUniswapV3 = async (address?: tEthereumAddress) =>
  await NTokenUniswapV3__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.NTokenUniswapV3Impl}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getChainId = async () =>
  (await DRE.ethers.provider.getNetwork()).chainId;

export const getProxyAdmin = async (proxyAddress: string) => {
  const EIP1967_ADMIN_SLOT =
    "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
  const adminStorageSlot = await DRE.ethers.provider.getStorageAt(
    proxyAddress,
    EIP1967_ADMIN_SLOT,
    "latest"
  );
  const adminAddress = utils.defaultAbiCoder
    .decode(["address"], adminStorageSlot)
    .toString();
  return utils.getAddress(adminAddress);
};

export const getMockTokenFaucet = async (address?: tEthereumAddress) =>
  await MockTokenFaucet__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.MockTokenFaucet}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getConduitController = async (address?: tEthereumAddress) =>
  await ConduitController__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.ConduitController}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getConduit = async (address?: tEthereumAddress) =>
  await Conduit__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.Conduit}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getConduitKey = async () =>
  await getDb().get(`${eContractid.ConduitKey}.${DRE.network.name}`).value()
    .address;

export const getPausableZoneController = async (address?: tEthereumAddress) =>
  await PausableZoneController__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.PausableZoneController}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getPausableZone = async (address?: tEthereumAddress) =>
  await PausableZone__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.PausableZone}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getSeaport = async (address?: tEthereumAddress) =>
  await Seaport__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.Seaport}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getLooksRareExchange = async (address?: tEthereumAddress) =>
  await LooksRareExchange__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.LooksRareExchange}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getStrategyStandardSaleForFixedPrice = async (
  address?: tEthereumAddress
) =>
  await StrategyStandardSaleForFixedPrice__factory.connect(
    address ||
      (
        await getDb()
          .get(
            `${eContractid.StrategyStandardSaleForFixedPrice}.${DRE.network.name}`
          )
          .value()
      ).address,
    await getFirstSigner()
  );

export const getTransferManagerERC721 = async (address?: tEthereumAddress) =>
  await TransferManagerERC721__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.TransferManagerERC721}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getX2Y2R1 = async (address?: tEthereumAddress) =>
  await X2Y2R1__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.X2Y2R1}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getERC721Delegate = async (address?: tEthereumAddress) =>
  await ERC721Delegate__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.ERC721Delegate}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getMockIncentivesController = async (address?: tEthereumAddress) =>
  await MockIncentivesController__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.MockIncentivesController}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getStETH = async (address?: tEthereumAddress) =>
  await StETHMocked__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.StETH}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );
export const getPTokenStETH = async (address?: tEthereumAddress) =>
  await PTokenStETH__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.PTokenStETHImpl}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getPTokenSApe = async (address?: tEthereumAddress) =>
  await PTokenSApe__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.PTokenSApeImpl}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getMockAToken = async (address?: tEthereumAddress) =>
  await MockAToken__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.MockAToken}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getPTokenAToken = async (address?: tEthereumAddress) =>
  await PTokenAToken__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.PTokenATokenImpl}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getNFTFloorOracle = async (address?: tEthereumAddress) =>
  await NFTFloorOracle__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.NFTFloorOracle}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getUserFlashClaimRegistry = async (address?: tEthereumAddress) =>
  await UserFlashclaimRegistry__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.FlashClaimRegistry}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getMockAirdropProject = async (address?: tEthereumAddress) =>
  await MockAirdropProject__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.MockAirdropProject}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getMockReserveAuctionStrategy = async (
  address?: tEthereumAddress
) =>
  await MockReserveAuctionStrategy__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.MockReserveAuctionStrategy}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getNTokenBAYC = async (address?: tEthereumAddress) =>
  await NTokenBAYC__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.NTokenImpl}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getNTokenMAYC = async (address?: tEthereumAddress) =>
  await NTokenMAYC__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.NTokenImpl}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getNTokenBAKC = async (address?: tEthereumAddress) =>
  await NTokenBAKC__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.NTokenBAKCImpl}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getApeCoinStaking = async (address?: tEthereumAddress) =>
  await ApeCoinStaking__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.ApeCoinStaking}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getApeStakingLogic = async (address?: tEthereumAddress) =>
  await ApeStakingLogic__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.ApeStakingLogic}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getMintableERC721Logic = async (address?: tEthereumAddress) =>
  await MintableERC721Logic__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.MintableERC721Logic}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getExecutionDelegate = async (address?: tEthereumAddress) =>
  await ExecutionDelegate__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.ExecutionDelegate}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getStandardPolicyERC721 = async (address?: tEthereumAddress) =>
  await StandardPolicyERC721__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.StandardPolicyERC721}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getBlurExchangeProxy = async (address?: tEthereumAddress) =>
  await BlurExchange__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.BlurExchangeProxy}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getAutoCompoundApe = async (address?: tEthereumAddress) =>
  await AutoCompoundApe__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.cAPE}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getP2PPairStaking = async (address?: tEthereumAddress) =>
  await P2PPairStaking__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.P2PPairStaking}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getInitializableAdminUpgradeabilityProxy = async (
  address: tEthereumAddress
) =>
  await InitializableAdminUpgradeabilityProxy__factory.connect(
    address,
    await getFirstSigner()
  );

export const getSeaportAdapter = async (address?: tEthereumAddress) =>
  await SeaportAdapter__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.SeaportAdapter}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getLooksRareAdapter = async (address?: tEthereumAddress) =>
  await LooksRareAdapter__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.LooksRareAdapter}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getX2Y2Adapter = async (address?: tEthereumAddress) =>
  await X2Y2Adapter__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.X2Y2Adapter}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getBlurAdapter = async (address?: tEthereumAddress) =>
  await BlurAdapter__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.BlurAdapter}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getTimeLockExecutor = async (address?: tEthereumAddress) =>
  await ExecutorWithTimelock__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.TimeLockExecutor}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getMultiSendCallOnly = async (address?: tEthereumAddress) =>
  await MultiSendCallOnly__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.MultiSendCallOnly}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );
