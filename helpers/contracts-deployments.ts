import {DRE, getDb, getParaSpaceConfig, waitForTx} from "./misc-utils";
import {
  eContractid,
  ERC20TokenContractId,
  ERC721TokenContractId,
  tEthereumAddress,
  tStringTokenSmallUnits,
} from "./types";
import {
  ACLManager,
  ACLManager__factory,
  ApeCoinStaking__factory,
  ApeStakingLogic,
  ApeStakingLogic__factory,
  ATokenDebtToken,
  ATokenDebtToken__factory,
  AuctionLogic,
  AuctionLogic__factory,
  AutoCompoundApe__factory,
  Azuki,
  Azuki__factory,
  BlurAdapter,
  BlurAdapter__factory,
  BlurExchange,
  BlurExchange__factory,
  BoredApeYachtClub,
  BoredApeYachtClub__factory,
  BorrowLogic,
  BorrowLogic__factory,
  CApeDebtToken,
  CApeDebtToken__factory,
  CloneX,
  CloneX__factory,
  ConduitController,
  ConduitController__factory,
  ConfiguratorLogic,
  ConfiguratorLogic__factory,
  CryptoPunksMarket,
  CryptoPunksMarket__factory,
  CurrencyManager,
  CurrencyManager__factory,
  DefaultReserveAuctionStrategy,
  DefaultReserveAuctionStrategy__factory,
  DefaultReserveInterestRateStrategy,
  DefaultReserveInterestRateStrategy__factory,
  DelegationAwarePToken,
  DelegationAwarePToken__factory,
  Doodles,
  Doodles__factory,
  ERC721Delegate,
  ERC721Delegate__factory,
  ERC721OracleWrapper,
  ERC721OracleWrapper__factory,
  ExecutionDelegate,
  ExecutionDelegate__factory,
  ExecutionManager,
  ExecutionManager__factory,
  ExecutorWithTimelock,
  ExecutorWithTimelock__factory,
  FlashClaimLogic,
  FlashClaimLogic__factory,
  InitializableImmutableAdminUpgradeabilityProxy,
  InitializableImmutableAdminUpgradeabilityProxy__factory,
  Land,
  Land__factory,
  LiquidationLogic,
  LiquidationLogic__factory,
  LooksRareAdapter,
  LooksRareAdapter__factory,
  LooksRareExchange,
  LooksRareExchange__factory,
  MarketplaceLogic,
  MarketplaceLogic__factory,
  Meebits,
  Meebits__factory,
  MerkleVerifier,
  MerkleVerifier__factory,
  MintableDelegationERC20,
  MintableDelegationERC20__factory,
  MintableERC20,
  MintableERC20__factory,
  MintableERC721,
  MintableERC721__factory,
  MintableERC721Logic,
  MintableERC721Logic__factory,
  MockAggregator,
  MockAggregator__factory,
  MockAirdropProject,
  MockAirdropProject__factory,
  MockMultiAssetAirdropProject,
  MockMultiAssetAirdropProject__factory,
  MockAToken,
  MockAToken__factory,
  MockIncentivesController,
  MockIncentivesController__factory,
  MockInitializableFromConstructorImple,
  MockInitializableFromConstructorImple__factory,
  MockInitializableImple,
  MockInitializableImple__factory,
  MockInitializableImpleV2,
  MockInitializableImpleV2__factory,
  MockNToken,
  MockNToken__factory,
  MockPToken,
  MockPToken__factory,
  MockReentrantInitializableImple,
  MockReentrantInitializableImple__factory,
  MockReserveAuctionStrategy,
  MockReserveAuctionStrategy__factory,
  MockReserveConfiguration,
  MockReserveConfiguration__factory,
  MockTokenFaucet__factory,
  MockVariableDebtToken,
  MockVariableDebtToken__factory,
  Moonbirds,
  Moonbirds__factory,
  MutantApeYachtClub,
  MutantApeYachtClub__factory,
  NFTFloorOracle,
  NFTFloorOracle__factory,
  NToken,
  NToken__factory,
  NTokenBAYC,
  NTokenBAYC__factory,
  NTokenMAYC,
  NTokenMAYC__factory,
  NTokenMoonBirds,
  NTokenMoonBirds__factory,
  NTokenUniswapV3,
  NTokenUniswapV3__factory,
  ParaProxy__factory,
  ParaSpaceOracle,
  ParaSpaceOracle__factory,
  PausableZoneController,
  PausableZoneController__factory,
  PolicyManager,
  PolicyManager__factory,
  PoolAddressesProvider,
  PoolAddressesProvider__factory,
  PoolAddressesProviderRegistry,
  PoolAddressesProviderRegistry__factory,
  PoolApeStaking,
  PoolApeStaking__factory,
  PoolConfigurator,
  PoolConfigurator__factory,
  PoolCore,
  PoolCore__factory,
  PoolLogic,
  PoolLogic__factory,
  PoolMarketplace,
  PoolMarketplace__factory,
  PoolParameters,
  PoolParameters__factory,
  PriceOracle,
  PriceOracle__factory,
  ProtocolDataProvider,
  ProtocolDataProvider__factory,
  PToken,
  PToken__factory,
  PTokenAToken,
  PTokenAToken__factory,
  PTokenCApe,
  PTokenCApe__factory,
  PTokenSApe,
  PTokenSApe__factory,
  PTokenStETH,
  PTokenStETH__factory,
  ReservesSetupHelper,
  ReservesSetupHelper__factory,
  RoyaltyFeeManager,
  RoyaltyFeeManager__factory,
  RoyaltyFeeRegistry,
  RoyaltyFeeRegistry__factory,
  Seaport,
  Seaport__factory,
  SeaportAdapter,
  SeaportAdapter__factory,
  StandardPolicyERC721,
  StandardPolicyERC721__factory,
  StETHMocked,
  StETHMocked__factory,
  StETHDebtToken,
  StETHDebtToken__factory,
  StrategyStandardSaleForFixedPrice,
  StrategyStandardSaleForFixedPrice__factory,
  SupplyLogic,
  SupplyLogic__factory,
  TransferManagerERC1155,
  TransferManagerERC1155__factory,
  TransferManagerERC721,
  TransferManagerERC721__factory,
  TransferSelectorNFT,
  TransferSelectorNFT__factory,
  UiIncentiveDataProvider,
  UiIncentiveDataProvider__factory,
  UiPoolDataProvider,
  UiPoolDataProvider__factory,
  UniswapV3Factory,
  UniswapV3Factory__factory,
  UniswapV3OracleWrapper,
  UniswapV3OracleWrapper__factory,
  UserFlashclaimRegistry,
  UserFlashclaimRegistry__factory,
  VariableDebtToken,
  VariableDebtToken__factory,
  WalletBalanceProvider,
  WalletBalanceProvider__factory,
  WETH9Mocked,
  WETH9Mocked__factory,
  WETHGateway,
  WETHGateway__factory,
  WPunk,
  WPunk__factory,
  WPunkGateway,
  WPunkGateway__factory,
  X2Y2Adapter,
  X2Y2Adapter__factory,
  X2Y2R1,
  X2Y2R1__factory,
  AutoCompoundApe,
  InitializableAdminUpgradeabilityProxy__factory,
  InitializableAdminUpgradeabilityProxy,
  ParaProxyInterfaces__factory,
  ParaProxyInterfaces,
  MockedDelegateRegistry,
  MockedDelegateRegistry__factory,
  NTokenBAKC,
  NTokenBAKC__factory,
  P2PPairStaking__factory,
  P2PPairStaking,
  AirdropFlashClaimReceiver__factory,
  AirdropFlashClaimReceiver,
  CLwstETHSynchronicityPriceAdapter__factory,
  CLExchangeRateSynchronicityPriceAdapter__factory,
  CLwstETHSynchronicityPriceAdapter,
  WstETHMocked__factory,
  WstETHMocked,
  BAYCSewerPass__factory,
  BAYCSewerPass,
  BAYCSewerPassClaim__factory,
  AutoYieldApe__factory,
  AutoYieldApe,
  PYieldToken__factory,
  PYieldToken,
  UniswapV3TwapOracleWrapper,
  UniswapV3TwapOracleWrapper__factory,
  HelperContract,
  HelperContract__factory,
  ParaSpaceAirdrop__factory,
  ParaSpaceAirdrop,
  CLExchangeRateSynchronicityPriceAdapter,
  CLBaseCurrencySynchronicityPriceAdapter__factory,
  PTokenAStETH__factory,
  PTokenAStETH,
  AStETHDebtToken__factory,
  AStETHDebtToken,
  MockAStETH,
  MockAStETH__factory,
  MockRETH,
  MockRETH__factory,
  CLCETHSynchronicityPriceAdapter__factory,
  CLCETHSynchronicityPriceAdapter,
  MockCToken,
  MockCToken__factory,
  TimeLock__factory,
  DefaultTimeLockStrategy__factory,
  DefaultTimeLockStrategy,
  NTokenOtherdeed__factory,
  NTokenOtherdeed,
  HotWalletProxy__factory,
  HotWalletProxy,
  NTokenStakefish__factory,
  NTokenStakefish,
  StakefishNFTOracleWrapper__factory,
  StakefishNFTOracleWrapper,
  DelegationRegistry,
  DelegationRegistry__factory,
  StakefishNFTManager__factory,
  StakefishNFTManager,
  StakefishValidatorV1__factory,
  StakefishValidatorV1,
  DepositContract__factory,
  DepositContract,
  StakefishValidatorFactory__factory,
  StakefishValidatorFactory,
  MockFeePool,
  MockFeePool__factory,
  MockLendPool__factory,
  PoolPositionMover__factory,
  PoolPositionMover,
  PositionMoverLogic,
  PositionMoverLogic__factory,
} from "../types";
import {MockContract} from "ethereum-waffle";
import {
  getAllTokens,
  getBAYCSewerPass,
  getFirstSigner,
  getProtocolDataProvider,
  getPoolProxy,
  getPunks,
  getUniswapV3SwapRouter,
  getWETH,
  getTimeLockProxy,
  getInitializableAdminUpgradeabilityProxy,
  getACLManager,
} from "./contracts-getters";
import {
  convertToCurrencyDecimals,
  getContractAddressInDb,
  getFunctionSignatures,
  getFunctionSignaturesFromDb,
  getParaSpaceAdmins,
  insertContractAddressInDb,
  withSaveAndVerify,
} from "./contracts-helpers";

import * as nonfungiblePositionManager from "@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json";
import * as uniSwapRouter from "@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json";
import * as nFTDescriptor from "@uniswap/v3-periphery/artifacts/contracts/libraries/NFTDescriptor.sol/NFTDescriptor.json";
import * as nonfungibleTokenPositionDescriptor from "@uniswap/v3-periphery/artifacts/contracts/NonfungibleTokenPositionDescriptor.sol/NonfungibleTokenPositionDescriptor.json";
import {Address} from "hardhat-deploy/dist/types";
import {Contract} from "ethers";

import {LiquidationLogicLibraryAddresses} from "../types/factories/contracts/protocol/libraries/logic/LiquidationLogic__factory";
import {MarketplaceLogicLibraryAddresses} from "../types/factories/contracts/protocol/libraries/logic/MarketplaceLogic__factory";
import {PoolCoreLibraryAddresses} from "../types/factories/contracts/protocol/pool/PoolCore__factory";
import {PoolMarketplaceLibraryAddresses} from "../types/factories/contracts/protocol/pool/PoolMarketplace__factory";
import {PoolParametersLibraryAddresses} from "../types/factories/contracts/protocol/pool/PoolParameters__factory";
import {PositionMoverLogicLibraryAddresses} from "../types/factories/contracts/protocol/libraries/logic/PositionMoverLogic__factory";

import {pick, upperFirst} from "lodash";
import {ZERO_ADDRESS} from "./constants";
import {GLOBAL_OVERRIDES} from "./hardhat-constants";
import {parseEther} from "ethers/lib/utils";

export const deployPoolAddressesProvider = async (
  marketId: string,
  owner: string,
  verify?: boolean
) =>
  withSaveAndVerify(
    new PoolAddressesProvider__factory(await getFirstSigner()),
    eContractid.PoolAddressesProvider,
    [marketId, owner],
    verify
  ) as Promise<PoolAddressesProvider>;

export const deployPoolAddressesProviderRegistry = async (
  owner: string,
  verify?: boolean
) =>
  withSaveAndVerify(
    new PoolAddressesProviderRegistry__factory(await getFirstSigner()),
    eContractid.PoolAddressesProviderRegistry,
    [owner],
    verify
  ) as Promise<PoolAddressesProviderRegistry>;

export const deployACLManager = async (
  provider: tEthereumAddress,
  verify?: boolean
) =>
  withSaveAndVerify(
    new ACLManager__factory(await getFirstSigner()),
    eContractid.ACLManager,
    [provider],
    verify
  ) as Promise<ACLManager>;

export const deployConfiguratorLogicLibrary = async (verify?: boolean) =>
  withSaveAndVerify(
    new ConfiguratorLogic__factory(await getFirstSigner()),
    eContractid.ConfiguratorLogic,
    [],
    verify
  ) as Promise<ConfiguratorLogic>;

export const deployPoolConfigurator = async (verify?: boolean) => {
  const configuratorLogic = await deployConfiguratorLogicLibrary(verify);
  const libraries = {
    ["contracts/protocol/libraries/logic/ConfiguratorLogic.sol:ConfiguratorLogic"]:
      configuratorLogic.address,
  };
  return withSaveAndVerify(
    new PoolConfigurator__factory(libraries, await getFirstSigner()),
    eContractid.PoolConfiguratorImpl,
    [],
    verify,
    false,
    libraries
  ) as Promise<PoolConfigurator>;
};

export const deploySupplyLogic = async (verify?: boolean) =>
  withSaveAndVerify(
    new SupplyLogic__factory(await getFirstSigner()),
    eContractid.SupplyLogic,
    [],
    verify
  ) as Promise<SupplyLogic>;

export const deployFlashClaimLogic = async (verify?: boolean) =>
  withSaveAndVerify(
    new FlashClaimLogic__factory(await getFirstSigner()),
    eContractid.FlashClaimLogic,
    [],
    verify
  ) as Promise<FlashClaimLogic>;

export const deployBorrowLogic = async (verify?: boolean) =>
  withSaveAndVerify(
    new BorrowLogic__factory(await getFirstSigner()),
    eContractid.BorrowLogic,
    [],
    verify
  ) as Promise<BorrowLogic>;

export const deployLiquidationLogic = async (
  libraries: LiquidationLogicLibraryAddresses,
  verify?: boolean
) =>
  withSaveAndVerify(
    new LiquidationLogic__factory(libraries, await getFirstSigner()),
    eContractid.LiquidationLogic,
    [],
    verify,
    false,
    libraries
  ) as Promise<LiquidationLogic>;

export const deployAuctionLogic = async (verify?: boolean) =>
  withSaveAndVerify(
    new AuctionLogic__factory(await getFirstSigner()),
    eContractid.AuctionLogic,
    [],
    verify
  ) as Promise<AuctionLogic>;

export const deployPoolLogic = async (verify?: boolean) =>
  withSaveAndVerify(
    new PoolLogic__factory(await getFirstSigner()),
    eContractid.PoolLogic,
    [],
    verify
  ) as Promise<PoolLogic>;

export const deployPositionMoverLogic = async (
  libraries: PositionMoverLogicLibraryAddresses,
  verify?: boolean
) =>
  withSaveAndVerify(
    new PositionMoverLogic__factory(libraries, await getFirstSigner()),
    eContractid.PositionMoverLogic,
    [],
    verify
  ) as Promise<PositionMoverLogic>;

export const deployPoolCoreLibraries = async (
  verify?: boolean
): Promise<PoolCoreLibraryAddresses> => {
  const supplyLogic = await deploySupplyLogic(verify);
  const borrowLogic = await deployBorrowLogic(verify);
  const auctionLogic = await deployAuctionLogic(verify);
  const liquidationLogic = await deployLiquidationLogic(
    {
      ["contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic"]:
        supplyLogic.address,
    },
    verify
  );
  const flashClaimLogic = await deployFlashClaimLogic(verify);

  return {
    ["contracts/protocol/libraries/logic/AuctionLogic.sol:AuctionLogic"]:
      auctionLogic.address,
    ["contracts/protocol/libraries/logic/LiquidationLogic.sol:LiquidationLogic"]:
      liquidationLogic.address,
    ["contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic"]:
      supplyLogic.address,
    ["contracts/protocol/libraries/logic/BorrowLogic.sol:BorrowLogic"]:
      borrowLogic.address,
    ["contracts/protocol/libraries/logic/FlashClaimLogic.sol:FlashClaimLogic"]:
      flashClaimLogic.address,
  };
};

export const deployPoolCore = async (provider: string, verify?: boolean) => {
  const coreLibraries = await deployPoolCoreLibraries(verify);
  const {poolCoreSelectors} = getPoolSignatures();

  const poolCore = (await withSaveAndVerify(
    new PoolCore__factory(coreLibraries, await getFirstSigner()),
    eContractid.PoolCoreImpl,
    [
      provider,
      (await getContractAddressInDb(eContractid.TimeLockProxy)) ||
        (
          await deployTimeLockProxy(verify)
        ).address,
    ],
    verify,
    false,
    coreLibraries,
    poolCoreSelectors
  )) as PoolCore;

  return {
    poolCore,
    poolCoreSelectors: poolCoreSelectors.map((s) => s.signature),
  };
};

export const deployPoolMarketplace = async (
  provider: string,
  verify?: boolean
) => {
  const supplyLogic = await deploySupplyLogic(verify);
  const borrowLogic = await deployBorrowLogic(verify);
  const marketplaceLogic = await deployMarketplaceLogic(
    {
      "contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic":
        supplyLogic.address,
      "contracts/protocol/libraries/logic/BorrowLogic.sol:BorrowLogic":
        borrowLogic.address,
    },
    verify
  );
  const marketplaceLibraries = {
    "contracts/protocol/libraries/logic/MarketplaceLogic.sol:MarketplaceLogic":
      marketplaceLogic.address,
  };

  const {poolMarketplaceSelectors} = getPoolSignatures();

  const poolMarketplace = (await withSaveAndVerify(
    new PoolMarketplace__factory(marketplaceLibraries, await getFirstSigner()),
    eContractid.PoolMarketplaceImpl,
    [provider],
    verify,
    false,
    marketplaceLibraries,
    poolMarketplaceSelectors
  )) as PoolCore;

  return {
    poolMarketplace,
    poolMarketplaceSelectors: poolMarketplaceSelectors.map((s) => s.signature),
  };
};

export const deployPoolApeStaking = async (
  provider: string,
  verify?: boolean
) => {
  const supplyLogic = await deploySupplyLogic(verify);
  const borrowLogic = await deployBorrowLogic(verify);

  const apeStakingLibraries = {
    "contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic":
      supplyLogic.address,
    "contracts/protocol/libraries/logic/BorrowLogic.sol:BorrowLogic":
      borrowLogic.address,
  };

  const APE_WETH_FEE = 3000;
  const WETH_USDC_FEE = 500;

  const {poolApeStakingSelectors} = await getPoolSignatures();

  const allTokens = await getAllTokens();

  const poolApeStaking = (await withSaveAndVerify(
    new PoolApeStaking__factory(apeStakingLibraries, await getFirstSigner()),
    eContractid.PoolApeStakingImpl,
    [
      provider,
      (await getContractAddressInDb(eContractid.cAPE)) ||
        (
          await deployAutoCompoundApe(verify)
        ).address,
      allTokens.APE.address,
      allTokens.USDC.address,
      (await getUniswapV3SwapRouter()).address,
      allTokens.WETH.address,
      APE_WETH_FEE,
      WETH_USDC_FEE,
    ],
    verify,
    false,
    apeStakingLibraries,
    poolApeStakingSelectors
  )) as PoolApeStaking;

  return {
    poolApeStaking,
    poolApeStakingSelectors: poolApeStakingSelectors.map((s) => s.signature),
  };
};

export const deployPoolParameters = async (
  provider: string,
  verify?: boolean
) => {
  const poolLogic = await deployPoolLogic(verify);

  const {poolParametersSelectors} = await getPoolSignatures();
  const parametersLibraries = {
    "contracts/protocol/libraries/logic/PoolLogic.sol:PoolLogic":
      poolLogic.address,
  };

  const poolParameters = (await withSaveAndVerify(
    new PoolParameters__factory(parametersLibraries, await getFirstSigner()),
    eContractid.PoolParametersImpl,
    [provider],
    verify,
    false,
    parametersLibraries,
    poolParametersSelectors
  )) as PoolParameters;

  return {
    poolParameters,
    poolParametersSelectors: poolParametersSelectors.map((s) => s.signature),
  };
};

export const deployPoolParaProxyInterfaces = async (verify?: boolean) => {
  const {poolParaProxyInterfacesSelectors} = await getPoolSignatures();
  const poolParaProxyInterfaces = (await withSaveAndVerify(
    new ParaProxyInterfaces__factory(await getFirstSigner()),
    eContractid.ParaProxyInterfacesImpl,
    [],
    verify,
    false,
    undefined,
    poolParaProxyInterfacesSelectors
  )) as ParaProxyInterfaces;

  return {
    poolParaProxyInterfaces,
    poolParaProxyInterfacesSelectors: poolParaProxyInterfacesSelectors.map(
      (s) => s.signature
    ),
  };
};

export const deployPoolPositionMover = async (
  provider: tEthereumAddress,
  bendDaoLendPoolLoan: tEthereumAddress,
  bendDaoLendPool: tEthereumAddress,
  verify?: boolean
) => {
  const supplyLogic = await deploySupplyLogic(verify);
  const borrowLogic = await deployBorrowLogic(verify);
  const positionMoverLibraries = {
    "contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic":
      supplyLogic.address,
    "contracts/protocol/libraries/logic/BorrowLogic.sol:BorrowLogic":
      borrowLogic.address,
  };
  const positionMoverLogic = await deployPositionMoverLogic(
    positionMoverLibraries,
    verify
  );

  const {poolPositionMoverSelectors} = await getPoolSignatures();
  const poolPositionMover = (await withSaveAndVerify(
    new PoolPositionMover__factory(
      {
        ["contracts/protocol/libraries/logic/PositionMoverLogic.sol:PositionMoverLogic"]:
          positionMoverLogic.address,
      },
      await getFirstSigner()
    ),
    eContractid.PoolPositionMoverImpl,
    [provider, bendDaoLendPoolLoan, bendDaoLendPool],
    verify,
    false,
    undefined,
    poolPositionMoverSelectors
  )) as PoolPositionMover;

  return {
    poolPositionMover,
    poolPositionMoverSelectors: poolPositionMoverSelectors.map(
      (s) => s.signature
    ),
  };
};

export const deployPoolMarketplaceLibraries = async (
  coreLibraries: PoolCoreLibraryAddresses,
  verify?: boolean
): Promise<PoolMarketplaceLibraryAddresses> => {
  const marketplaceLogic = await deployMarketplaceLogic(
    pick(coreLibraries, [
      "contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic",
      "contracts/protocol/libraries/logic/BorrowLogic.sol:BorrowLogic",
    ]),
    verify
  );
  return {
    ["contracts/protocol/libraries/logic/MarketplaceLogic.sol:MarketplaceLogic"]:
      marketplaceLogic.address,
  };
};

export const deployPoolParametersLibraries = async (
  verify?: boolean
): Promise<PoolParametersLibraryAddresses> => {
  const poolLogic = await deployPoolLogic(verify);
  return {
    ["contracts/protocol/libraries/logic/PoolLogic.sol:PoolLogic"]:
      poolLogic.address,
  };
};

export const getPoolSignatures = () => {
  const poolCoreSelectors = getFunctionSignatures(PoolCore__factory.abi);

  const poolParametersSelectors = getFunctionSignatures(
    PoolParameters__factory.abi
  );

  const poolMarketplaceSelectors = getFunctionSignatures(
    PoolMarketplace__factory.abi
  );

  const poolApeStakingSelectors = getFunctionSignatures(
    PoolApeStaking__factory.abi
  );

  const poolPositionMoverSelectors = getFunctionSignatures(
    PoolPositionMover__factory.abi
  );

  const poolProxySelectors = getFunctionSignatures(ParaProxy__factory.abi);

  const poolParaProxyInterfacesSelectors = getFunctionSignatures(
    ParaProxyInterfaces__factory.abi
  );

  const allSelectors = {};
  const poolSelectors = [
    ...poolCoreSelectors,
    ...poolParametersSelectors,
    ...poolMarketplaceSelectors,
    ...poolApeStakingSelectors,
    ...poolProxySelectors,
    ...poolParaProxyInterfacesSelectors,
    ...poolPositionMoverSelectors,
  ];
  for (const selector of poolSelectors) {
    if (!allSelectors[selector.signature]) {
      allSelectors[selector.signature] = selector;
    } else {
      throw new Error(
        `added function ${selector.name} conflict with exist function:${
          allSelectors[selector.signature].name
        }`
      );
    }
  }

  return {
    poolCoreSelectors,
    poolParametersSelectors,
    poolMarketplaceSelectors,
    poolApeStakingSelectors,
    poolParaProxyInterfacesSelectors,
    poolPositionMoverSelectors,
  };
};

export const getPoolSignaturesFromDb = async () => {
  const poolCoreSelectors = await getFunctionSignaturesFromDb(
    eContractid.PoolCoreImpl
  );

  const poolParametersSelectors = await getFunctionSignaturesFromDb(
    eContractid.PoolParametersImpl
  );

  const poolMarketplaceSelectors = await getFunctionSignaturesFromDb(
    eContractid.PoolMarketplaceImpl
  );

  const poolApeStakingSelectors = await getFunctionSignaturesFromDb(
    eContractid.PoolApeStakingImpl
  );

  const poolParaProxyInterfacesSelectors = await getFunctionSignaturesFromDb(
    eContractid.ParaProxyInterfacesImpl
  );

  const poolPositionMoverSelectors = await getFunctionSignaturesFromDb(
    eContractid.PoolPositionMoverImpl
  );

  return {
    poolCoreSelectors,
    poolParametersSelectors,
    poolMarketplaceSelectors,
    poolApeStakingSelectors,
    poolParaProxyInterfacesSelectors,
    poolPositionMoverSelectors,
  };
};

export const deployPoolComponents = async (
  provider: string,
  verify?: boolean
) => {
  const paraSpaceConfig = getParaSpaceConfig();
  const coreLibraries = await deployPoolCoreLibraries(verify);
  const marketplaceLibraries = await deployPoolMarketplaceLibraries(
    coreLibraries,
    verify
  );

  const parametersLibraries = await deployPoolParametersLibraries(verify);

  const apeStakingLibraries = pick(coreLibraries, [
    "contracts/protocol/libraries/logic/BorrowLogic.sol:BorrowLogic",
    "contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic",
  ]);

  const positionMoverLogic = await deployPositionMoverLogic(
    apeStakingLibraries,
    verify
  );
  const allTokens = await getAllTokens();

  const APE_WETH_FEE = 3000;
  const WETH_USDC_FEE = 500;

  const {
    poolCoreSelectors,
    poolParametersSelectors,
    poolMarketplaceSelectors,
    poolApeStakingSelectors,
    poolPositionMoverSelectors,
  } = getPoolSignatures();

  const positionMoverLibraries = {
    ["contracts/protocol/libraries/logic/PositionMoverLogic.sol:PositionMoverLogic"]:
      positionMoverLogic.address,
  };

  const bendDaoLendPoolLoan =
    paraSpaceConfig.BendDAO.LendingPoolLoan ||
    (await getContractAddressInDb(eContractid.MockBendDaoLendPool)) ||
    (await deployMockBendDaoLendPool((await getWETH()).address)).address;
  const bendDaoLendPool =
    paraSpaceConfig.BendDAO.LendingPool ||
    (await getContractAddressInDb(eContractid.MockBendDaoLendPool)) ||
    (await deployMockBendDaoLendPool((await getWETH()).address)).address;

  const poolPositionMover = (await withSaveAndVerify(
    new PoolPositionMover__factory(
      positionMoverLibraries,
      await getFirstSigner()
    ),
    eContractid.PoolPositionMoverImpl,
    [provider, bendDaoLendPoolLoan, bendDaoLendPool],
    verify,
    false,
    positionMoverLibraries,
    poolPositionMoverSelectors
  )) as PoolPositionMover;

  const poolCore = (await withSaveAndVerify(
    new PoolCore__factory(coreLibraries, await getFirstSigner()),
    eContractid.PoolCoreImpl,
    [
      provider,
      (await getContractAddressInDb(eContractid.TimeLockProxy)) ||
        (
          await deployTimeLockProxy(verify)
        ).address,
    ],
    verify,
    false,
    coreLibraries,
    poolCoreSelectors
  )) as PoolCore;

  const poolParameters = (await withSaveAndVerify(
    new PoolParameters__factory(parametersLibraries, await getFirstSigner()),
    eContractid.PoolParametersImpl,
    [provider],
    verify,
    false,
    parametersLibraries,
    poolParametersSelectors
  )) as PoolParameters;

  const poolMarketplace = (await withSaveAndVerify(
    new PoolMarketplace__factory(marketplaceLibraries, await getFirstSigner()),
    eContractid.PoolMarketplaceImpl,
    [provider],
    verify,
    false,
    marketplaceLibraries,
    poolMarketplaceSelectors
  )) as PoolMarketplace;

  const poolApeStaking = allTokens.APE
    ? ((await withSaveAndVerify(
        new PoolApeStaking__factory(
          apeStakingLibraries,
          await getFirstSigner()
        ),
        eContractid.PoolApeStakingImpl,
        [
          provider,
          (await getContractAddressInDb(eContractid.cAPE)) ||
            (
              await deployAutoCompoundApe(verify)
            ).address,
          allTokens.APE.address,
          allTokens.USDC.address,
          (await getUniswapV3SwapRouter()).address,
          allTokens.WETH.address,
          APE_WETH_FEE,
          WETH_USDC_FEE,
        ],
        verify,
        false,
        apeStakingLibraries,
        poolApeStakingSelectors
      )) as PoolApeStaking)
    : undefined;

  return {
    poolCore,
    poolParameters,
    poolMarketplace,
    poolApeStaking,
    poolPositionMover,
    poolCoreSelectors: poolCoreSelectors.map((s) => s.signature),
    poolParametersSelectors: poolParametersSelectors.map((s) => s.signature),
    poolMarketplaceSelectors: poolMarketplaceSelectors.map((s) => s.signature),
    poolApeStakingSelectors: poolApeStakingSelectors.map((s) => s.signature),
    poolPositionMoverSelectors: poolPositionMoverSelectors.map(
      (s) => s.signature
    ),
  };
};

export const deployPriceOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    new PriceOracle__factory(await getFirstSigner()),
    eContractid.PriceOracle,
    [],
    verify
  ) as Promise<PriceOracle>;

export const deployAggregator = async (
  symbol: string,
  price: tStringTokenSmallUnits,
  verify?: boolean
) =>
  withSaveAndVerify(
    new MockAggregator__factory(await getFirstSigner()),
    eContractid.Aggregator.concat(upperFirst(symbol)),
    [price],
    verify
  ) as Promise<MockAggregator>;

export const deployParaSpaceOracle = async (
  args: [
    tEthereumAddress,
    tEthereumAddress[],
    tEthereumAddress[],
    tEthereumAddress,
    tEthereumAddress,
    string
  ],
  verify?: boolean
) =>
  withSaveAndVerify(
    new ParaSpaceOracle__factory(await getFirstSigner()),
    eContractid.ParaSpaceOracle,
    [...args],
    verify
  ) as Promise<ParaSpaceOracle>;

export const deployNFTFloorPriceOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    new NFTFloorOracle__factory(await getFirstSigner()),
    eContractid.NFTFloorOracle,
    [],
    verify
  ) as Promise<NFTFloorOracle>;

export const deployProtocolDataProvider = async (
  addressesProvider: tEthereumAddress,
  verify?: boolean
) =>
  withSaveAndVerify(
    new ProtocolDataProvider__factory(await getFirstSigner()),
    eContractid.ProtocolDataProvider,
    [addressesProvider],
    verify
  ) as Promise<ProtocolDataProvider>;

export const deployMintableERC20 = async (
  args: [string, string, string],
  verify?: boolean
): Promise<MintableERC20> =>
  withSaveAndVerify(
    new MintableERC20__factory(await getFirstSigner()),
    args[1],
    [...args],
    verify
  ) as Promise<MintableERC20>;

export const deployMintableERC721 = async (
  args: [string, string, string],
  verify?: boolean
): Promise<MintableERC721> =>
  withSaveAndVerify(
    new MintableERC721__factory(await getFirstSigner()),
    args[1],
    [...args],
    verify
  ) as Promise<MintableERC721>;

export const deployMintableDelegationERC20 = async (
  args: [string, string, string],
  verify?: boolean
): Promise<MintableDelegationERC20> =>
  withSaveAndVerify(
    new MintableDelegationERC20__factory(await getFirstSigner()),
    eContractid.MintableDelegationERC20,
    [...args],
    verify
  ) as Promise<MintableDelegationERC20>;

export const deployMockReserveAuctionStrategy = async (
  args: [string, string, string, string, string, string],
  verify?: boolean
) =>
  withSaveAndVerify(
    new MockReserveAuctionStrategy__factory(await getFirstSigner()),
    eContractid.MockReserveAuctionStrategy,
    [...args],
    verify
  ) as Promise<MockReserveAuctionStrategy>;

export const deployReserveAuctionStrategy = async (
  strategyName: string,
  args: [string, string, string, string, string, string],
  verify?: boolean
) =>
  withSaveAndVerify(
    new DefaultReserveAuctionStrategy__factory(await getFirstSigner()),
    strategyName,
    [...args],
    verify
  ) as Promise<DefaultReserveAuctionStrategy>;

export const deployReserveInterestRateStrategy = async (
  strategyName: string,
  args: [tEthereumAddress, string, string, string, string],
  verify?: boolean
) =>
  withSaveAndVerify(
    new DefaultReserveInterestRateStrategy__factory(await getFirstSigner()),
    strategyName,
    [...args],
    verify
  ) as Promise<DefaultReserveInterestRateStrategy>;

export const deployGenericVariableDebtToken = async (
  poolAddress: tEthereumAddress,
  verify?: boolean
) =>
  withSaveAndVerify(
    new VariableDebtToken__factory(await getFirstSigner()),
    eContractid.VariableDebtTokenImpl,
    [poolAddress],
    verify
  ) as Promise<VariableDebtToken>;

export const deployGenericPTokenImpl = async (
  poolAddress: tEthereumAddress,
  verify?: boolean
) =>
  withSaveAndVerify(
    new PToken__factory(await getFirstSigner()),
    eContractid.PTokenImpl,
    [poolAddress],
    verify
  ) as Promise<PToken>;

export const deployGenericNTokenImpl = async (
  poolAddress: tEthereumAddress,
  atomicPricing: boolean,
  delegationRegistry: tEthereumAddress,
  verify?: boolean
) => {
  const mintableERC721Logic =
    (await getContractAddressInDb(eContractid.MintableERC721Logic)) ||
    (await deployMintableERC721Logic(verify)).address;

  const libraries = {
    ["contracts/protocol/tokenization/libraries/MintableERC721Logic.sol:MintableERC721Logic"]:
      mintableERC721Logic,
  };
  return withSaveAndVerify(
    new NToken__factory(libraries, await getFirstSigner()),
    eContractid.NTokenImpl,
    [poolAddress, atomicPricing, delegationRegistry],
    verify,
    false,
    libraries
  ) as Promise<NToken>;
};

export const deployUniswapV3NTokenImpl = async (
  poolAddress: tEthereumAddress,
  delegationRegistry: tEthereumAddress,
  verify?: boolean
) => {
  const mintableERC721Logic =
    (await getContractAddressInDb(eContractid.MintableERC721Logic)) ||
    (await deployMintableERC721Logic(verify)).address;

  const libraries = {
    ["contracts/protocol/tokenization/libraries/MintableERC721Logic.sol:MintableERC721Logic"]:
      mintableERC721Logic,
  };
  return withSaveAndVerify(
    new NTokenUniswapV3__factory(libraries, await getFirstSigner()),
    eContractid.NTokenUniswapV3Impl,
    [poolAddress, delegationRegistry],
    verify,
    false,
    libraries
  ) as Promise<NTokenUniswapV3>;
};

export const deployGenericMoonbirdNTokenImpl = async (
  poolAddress: tEthereumAddress,
  delegationRegistry: tEthereumAddress,
  verify?: boolean
) => {
  const mintableERC721Logic =
    (await getContractAddressInDb(eContractid.MintableERC721Logic)) ||
    (await deployMintableERC721Logic(verify)).address;

  const libraries = {
    ["contracts/protocol/tokenization/libraries/MintableERC721Logic.sol:MintableERC721Logic"]:
      mintableERC721Logic,
  };
  return withSaveAndVerify(
    new NTokenMoonBirds__factory(libraries, await getFirstSigner()),
    eContractid.NTokenMoonBirdsImpl,
    [poolAddress, delegationRegistry],
    verify,
    false,
    libraries
  ) as Promise<NTokenMoonBirds>;
};

export const deployDelegationAwarePTokenImpl = async (
  poolAddress: tEthereumAddress,
  verify?: boolean
) =>
  withSaveAndVerify(
    new DelegationAwarePToken__factory(await getFirstSigner()),
    eContractid.DelegationAwarePTokenImpl,
    [poolAddress],
    verify
  ) as Promise<DelegationAwarePToken>;

export const deployAllERC20Tokens = async (verify?: boolean) => {
  const tokens: {
    [symbol: string]:
      | MockContract
      | MintableERC20
      | WETH9Mocked
      | StETHMocked
      | WstETHMocked
      | MockAToken
      | AutoCompoundApe;
  } = {};

  const paraSpaceConfig = getParaSpaceConfig();
  const reservesConfig = paraSpaceConfig.ReservesConfig;
  const tokensConfig = paraSpaceConfig.Tokens;

  for (const tokenSymbol of Object.keys(ERC20TokenContractId)) {
    const db = getDb();
    const contractAddress = db
      .get(`${tokenSymbol}.${DRE.network.name}`)
      .value()?.address;
    const reserveConfig = reservesConfig[tokenSymbol];
    if (!reserveConfig) {
      continue;
    }

    // if contract address is already in db, then skip to next tokenSymbol
    if (contractAddress) {
      console.log("contract address is already in db ", tokenSymbol);
      continue;
    } else if (tokensConfig[tokenSymbol]) {
      console.log("contract address is already in db ", tokenSymbol);
      await insertContractAddressInDb(
        tokenSymbol,
        tokensConfig[tokenSymbol],
        false
      );

      if (
        tokenSymbol === ERC20TokenContractId.sAPE &&
        paraSpaceConfig.YogaLabs.ApeCoinStaking
      ) {
        await insertContractAddressInDb(
          eContractid.ApeCoinStaking,
          paraSpaceConfig.YogaLabs.ApeCoinStaking,
          false
        );
      }
      if (
        tokenSymbol === ERC20TokenContractId.sAPE &&
        paraSpaceConfig.YogaLabs.BAKC
      ) {
        await insertContractAddressInDb(
          eContractid.BAKC,
          paraSpaceConfig.YogaLabs.BAKC,
          false
        );
      }
      continue;
    } else {
      console.log("deploying now ", tokenSymbol);
      if (tokenSymbol === ERC20TokenContractId.WETH) {
        tokens[tokenSymbol] = await deployWETH(verify);
        continue;
      }

      if (tokenSymbol === ERC20TokenContractId.stETH) {
        tokens[tokenSymbol] = await deployStETH(verify);
        continue;
      }

      if (tokenSymbol === ERC20TokenContractId.wstETH) {
        tokens[tokenSymbol] = await deployWStETH(
          tokens[ERC20TokenContractId.stETH].address,
          verify
        );
        continue;
      }

      if (
        tokenSymbol === ERC20TokenContractId.aWETH ||
        tokenSymbol === ERC20TokenContractId.awstETH
      ) {
        tokens[tokenSymbol] = await deployMockAToken(
          [tokenSymbol, tokenSymbol, reserveConfig.reserveDecimals],
          verify
        );
        continue;
      }

      if (tokenSymbol === ERC20TokenContractId.astETH) {
        tokens[tokenSymbol] = await deployMockAStETH(
          [tokenSymbol, tokenSymbol, reserveConfig.reserveDecimals],
          verify
        );
        continue;
      }

      if (tokenSymbol === ERC20TokenContractId.rETH) {
        tokens[tokenSymbol] = await deployMockRETH(
          [tokenSymbol, tokenSymbol, reserveConfig.reserveDecimals],
          verify
        );
        continue;
      }

      if (tokenSymbol === ERC20TokenContractId.cETH) {
        tokens[tokenSymbol] = await deployMockCToken(
          [tokenSymbol, tokenSymbol, ZERO_ADDRESS],
          verify
        );
        continue;
      }

      if (tokenSymbol === ERC20TokenContractId.cAPE) {
        //cAPE need to deploy later because it has a dependency for ApeCoinStaking address
        console.log("cAPE deploy later....");
        continue;
      }
      if (tokenSymbol === ERC20TokenContractId.yAPE) {
        //yAPE need to deploy later because it has a dependency for ApeCoinStaking address
        console.log("yAPE deploy later....");
        continue;
      }

      tokens[tokenSymbol] = await deployMintableERC20(
        [tokenSymbol, tokenSymbol, reserveConfig.reserveDecimals],
        verify
      );
    }
  }

  return tokens;
};

export const deployAllERC721Tokens = async (verify?: boolean) => {
  const tokens: {
    [symbol: string]:
      | MockContract
      | MintableERC721
      | WPunk
      | CryptoPunksMarket
      | Doodles
      | BoredApeYachtClub
      | MutantApeYachtClub
      | Azuki
      | CloneX
      | Land
      | Meebits
      | Moonbirds
      | Contract
      | StakefishNFTManager;
  } = {};
  const paraSpaceConfig = getParaSpaceConfig();
  const reservesConfig = paraSpaceConfig.ReservesConfig;
  const tokensConfig = paraSpaceConfig.Tokens;
  const deployer = await getFirstSigner();
  const deployerAddress = await deployer.getAddress();

  for (const tokenSymbol of Object.keys(ERC721TokenContractId)) {
    const db = getDb();
    const contractAddress = db
      .get(`${tokenSymbol}.${DRE.network.name}`)
      .value()?.address;
    const reserveConfig = reservesConfig[tokenSymbol];
    if (!reserveConfig) {
      continue;
    }

    // if contract address is already in db, then skip to next tokenSymbol
    if (contractAddress) {
      console.log("contract address is already in db ", tokenSymbol);
      continue;
    } else if (tokensConfig[tokenSymbol]) {
      console.log("contract address is already in db ", tokenSymbol);
      await insertContractAddressInDb(
        tokenSymbol,
        tokensConfig[tokenSymbol],
        false
      );
      if (
        tokenSymbol === ERC721TokenContractId.UniswapV3 &&
        paraSpaceConfig.Uniswap.V3Factory
      ) {
        await insertContractAddressInDb(
          eContractid.UniswapV3Factory,
          paraSpaceConfig.Uniswap.V3Factory,
          false
        );
      }
      if (
        tokenSymbol === ERC721TokenContractId.UniswapV3 &&
        paraSpaceConfig.Uniswap.V3Router
      ) {
        await insertContractAddressInDb(
          eContractid.UniswapV3SwapRouter,
          paraSpaceConfig.Uniswap.V3Router,
          false
        );
      }
      if (
        tokenSymbol === ERC721TokenContractId.WPUNKS &&
        paraSpaceConfig.Tokens.PUNKS
      ) {
        await insertContractAddressInDb(
          eContractid.PUNKS,
          paraSpaceConfig.Tokens.PUNKS,
          false
        );
      }
      if (
        tokenSymbol === ERC721TokenContractId.SFVLDR &&
        paraSpaceConfig.StakefishManager
      ) {
        await insertContractAddressInDb(
          eContractid.SFVLDR,
          paraSpaceConfig.StakefishManager,
          false
        );
      }
      continue;
    } else {
      console.log("deploying now ", tokenSymbol);

      // we are using hardhat, we want to use mock ERC721 contracts
      if (tokenSymbol === ERC721TokenContractId.WPUNKS) {
        const punks = await deployPunks([], verify);
        tokens[eContractid.PUNKS] = punks;
        tokens[tokenSymbol] = await deployWPunks([punks.address], verify);
        continue;
      }

      if (tokenSymbol === ERC721TokenContractId.BAYC) {
        tokens[tokenSymbol] = await deployBAYC(
          [tokenSymbol, tokenSymbol, "8000", "0"],
          verify
        );
        continue;
      }

      if (tokenSymbol === ERC721TokenContractId.MAYC) {
        tokens[tokenSymbol] = await deployMAYC(
          [tokenSymbol, tokenSymbol, ZERO_ADDRESS, ZERO_ADDRESS],
          verify
        );
        continue;
      }

      if (tokenSymbol === ERC721TokenContractId.DOODLE) {
        tokens[tokenSymbol] = await deployDoodle([], verify);
        continue;
      }

      if (tokenSymbol === ERC721TokenContractId.AZUKI) {
        tokens[tokenSymbol] = await deployAzuki([5, 10000, 8900, 200], verify);
        continue;
      }

      if (tokenSymbol === ERC721TokenContractId.CLONEX) {
        tokens[tokenSymbol] = await deployCloneX([], verify);
        continue;
      }

      if (tokenSymbol === ERC721TokenContractId.SEWER) {
        tokens[tokenSymbol] = await deploySewerPass(
          ["SEWER", "SEWER", deployerAddress],
          verify
        );
        continue;
      }

      if (tokenSymbol === ERC721TokenContractId.MEEBITS) {
        const punks = await getPunks();
        tokens[tokenSymbol] = await deployMeebits(
          [punks.address, ZERO_ADDRESS, paraSpaceConfig.ParaSpaceTeam],
          verify
        );
        continue;
      }

      if (tokenSymbol === ERC721TokenContractId.OTHR) {
        tokens[tokenSymbol] = await deployOTHR(
          [
            "OTHR",
            "OTHR",
            [ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS],
            [10, 100, 1000, 10000],
            [[paraSpaceConfig.ParaSpaceTeam, 100]],
            paraSpaceConfig.ParaSpaceTeam,
            paraSpaceConfig.ParaSpaceTeam,
            "0x63616e6469646174653100000000000000000000000000000000000000000000",
            5,
            paraSpaceConfig.ParaSpaceTeam,
          ],
          verify
        );
        continue;
      }

      if (tokenSymbol === ERC721TokenContractId.MOONBIRD) {
        tokens[tokenSymbol] = await deployMoonbirds(
          [
            "Moonbirds",
            "MOONBIRD",
            "0x0000000000000000000000000000000000000000",
            paraSpaceConfig.ParaSpaceTeam,
            paraSpaceConfig.ParaSpaceTeam,
          ],
          verify
        );
        await (tokens[tokenSymbol] as Moonbirds).setNestingOpen(
          true,
          GLOBAL_OVERRIDES
        );
        continue;
      }

      if (tokenSymbol === ERC721TokenContractId.UniswapV3) {
        const weth = await getWETH();
        const positionDescriptor =
          await deployNonfungibleTokenPositionDescriptor(
            [
              weth.address,
              // 'ETH' as a bytes32 string
              "0x4554480000000000000000000000000000000000000000000000000000000000",
            ],
            verify
          );
        const factory = await deployUniswapV3Factory([], verify);
        await deployUniswapSwapRouter([factory.address, weth.address], verify);
        const nonfungiblePositionManager =
          await deployNonfungiblePositionManager(
            [factory.address, weth.address, positionDescriptor.address],
            verify
          );
        tokens[tokenSymbol] = nonfungiblePositionManager;
        continue;
      }

      if (tokenSymbol === ERC721TokenContractId.SFVLDR) {
        const depositContract = await deployDepositContract(verify);
        const {paraSpaceAdminAddress} = await getParaSpaceAdmins();
        const validatorImpl = await deployStakefishValidator(
          depositContract.address,
          verify
        );

        const factory = await deployStakefishValidatorFactory(
          validatorImpl.address,
          paraSpaceAdminAddress,
          verify
        );

        const nftManager = await deployStakefishNFTManager(
          factory.address,
          verify
        );
        await waitForTx(await factory.setDeployer(nftManager.address, true));

        tokens[tokenSymbol] = nftManager;
        continue;
      }

      tokens[tokenSymbol] = await deployMintableERC721(
        [tokenSymbol, tokenSymbol, ""],
        verify
      );
    }
  }

  return tokens;
};

export const deployMoonbirds = async (
  args: [string, string, tEthereumAddress, tEthereumAddress, tEthereumAddress],
  verify?: boolean
) =>
  withSaveAndVerify(
    new Moonbirds__factory(await getFirstSigner()),
    eContractid.MOONBIRD,
    [...args],
    verify
  ) as Promise<Moonbirds>;

export const deployReservesSetupHelper = async (verify?: boolean) =>
  withSaveAndVerify(
    new ReservesSetupHelper__factory(await getFirstSigner()),
    eContractid.ReservesSetupHelper,
    [],
    verify
  ) as Promise<ReservesSetupHelper>;

export const deployInitializableImmutableAdminUpgradeabilityProxy = async (
  args: [tEthereumAddress],
  verify?: boolean
) =>
  withSaveAndVerify(
    new InitializableImmutableAdminUpgradeabilityProxy__factory(
      await getFirstSigner()
    ),
    eContractid.InitializableImmutableAdminUpgradeabilityProxy,
    [...args],
    verify
  ) as Promise<InitializableImmutableAdminUpgradeabilityProxy>;

export const deployWETH = async (verify?: boolean) =>
  withSaveAndVerify(
    new WETH9Mocked__factory(await getFirstSigner()),
    eContractid.WETH,
    [],
    verify
  ) as Promise<WETH9Mocked>;

export const deployUiPoolDataProvider = async (
  arg1: string,
  arg2: string,
  verify?: boolean
) =>
  withSaveAndVerify(
    new UiPoolDataProvider__factory(await getFirstSigner()),
    eContractid.UiPoolDataProvider,
    [arg1, arg2],
    verify
  ) as Promise<UiPoolDataProvider>;

export const deployUiIncentiveDataProvider = async (verify?: boolean) =>
  withSaveAndVerify(
    new UiIncentiveDataProvider__factory(await getFirstSigner()),
    eContractid.UiIncentiveDataProvider,
    [],
    verify
  ) as Promise<UiIncentiveDataProvider>;

export const deployWalletBalanceProvider = async (verify?: boolean) =>
  withSaveAndVerify(
    new WalletBalanceProvider__factory(await getFirstSigner()),
    eContractid.WalletBalanceProvider,
    [],
    verify
  ) as Promise<WalletBalanceProvider>;

export const deployWETHGateway = async (
  weth: string,
  pool: Address,
  verify?: boolean
) =>
  withSaveAndVerify(
    new WETHGateway__factory(await getFirstSigner()),
    eContractid.WETHGatewayImpl,
    [weth, pool],
    verify
  ) as Promise<WETHGateway>;

export const deployWETHGatewayProxy = async (
  admin: string,
  wethGateway: string,
  initData: string,
  verify?: boolean
) => {
  const wethGatewayProxy =
    new InitializableImmutableAdminUpgradeabilityProxy__factory(
      await getFirstSigner()
    );
  return withSaveAndVerify(
    wethGatewayProxy,
    eContractid.WETHGatewayProxy,
    [admin, wethGateway, initData],
    verify,
    true
  ) as Promise<InitializableImmutableAdminUpgradeabilityProxy>;
};

export const deployMeebits = async (
  args: [tEthereumAddress, tEthereumAddress, tEthereumAddress],
  verify?: boolean
) =>
  withSaveAndVerify(
    new Meebits__factory(await getFirstSigner()),
    eContractid.Meebits,
    [...args],
    verify
  ) as Promise<Meebits>;

export const deployAzuki = async (
  args: [number, number, number, number],
  verify?: boolean
) =>
  withSaveAndVerify(
    new Azuki__factory(await getFirstSigner()),
    eContractid.Azuki,
    [...args],
    verify
  ) as Promise<Azuki>;

export const deployOTHR = async (
  // eslint-disable-next-line
  args: [any, any, any, any, any, any, any, any, any, any],
  verify?: boolean
) =>
  withSaveAndVerify(
    new Land__factory(await getFirstSigner()),
    eContractid.OTHR,
    [...args],
    verify
  ) as Promise<Land>;

export const deployCloneX = async (args: [], verify?: boolean) =>
  withSaveAndVerify(
    new CloneX__factory(await getFirstSigner()),
    eContractid.CloneX,
    [...args],
    verify
  ) as Promise<CloneX>;

export const deploySewerPass = async (
  args: [string, string, string],
  verify?: boolean
) =>
  withSaveAndVerify(
    new BAYCSewerPass__factory(await getFirstSigner()),
    eContractid.SEWER,
    [...args],
    verify
  ) as Promise<BAYCSewerPass>;

export const deployDoodle = async (args: [], verify?: boolean) =>
  withSaveAndVerify(
    new Doodles__factory(await getFirstSigner()),
    eContractid.Doodles,
    [...args],
    verify
  ) as Promise<Doodles>;

export const deployMAYC = async (
  args: [string, string, string, string],
  verify?: boolean
) =>
  withSaveAndVerify(
    new MutantApeYachtClub__factory(await getFirstSigner()),
    eContractid.MutantApeYachtClub,
    [...args],
    verify
  ) as Promise<MutantApeYachtClub>;

export const deployBAYC = async (
  args: [string, string, string, string],
  verify?: boolean
) =>
  withSaveAndVerify(
    new BoredApeYachtClub__factory(await getFirstSigner()),
    eContractid.BoredApeYachtClub,
    [...args],
    verify
  ) as Promise<BoredApeYachtClub>;

export const deployERC721OracleWrapper = async (
  addressesProvider: string,
  oracleAddress: string,
  asset: string,
  symbol: string,
  verify?: boolean
) =>
  withSaveAndVerify(
    new ERC721OracleWrapper__factory(await getFirstSigner()),
    eContractid.Aggregator.concat(upperFirst(symbol)),
    [addressesProvider, oracleAddress, asset],
    verify
  ) as Promise<ERC721OracleWrapper>;

export const deployPunks = async (args: [], verify?: boolean) =>
  withSaveAndVerify(
    new CryptoPunksMarket__factory(await getFirstSigner()),
    eContractid.PUNKS,
    [...args],
    verify
  ) as Promise<CryptoPunksMarket>;

export const deployWPunks = async (
  args: [tEthereumAddress],
  verify?: boolean
) =>
  withSaveAndVerify(
    new WPunk__factory(await getFirstSigner()),
    eContractid.WPunk,
    [...args],
    verify
  ) as Promise<WPunk>;

export const deployPunkGateway = async (
  args: [
    tEthereumAddress,
    tEthereumAddress,
    // tEthereumAddress,
    tEthereumAddress
  ],
  verify?: boolean
) => {
  const punkImpl = new WPunkGateway__factory(await getFirstSigner());
  return withSaveAndVerify(
    punkImpl,
    eContractid.WPunkGatewayImpl,
    [...args],
    verify
  ) as Promise<WPunkGateway>;
};

export const deployPunkGatewayProxy = async (
  admin: string,
  punkGateway: string,
  initData: string,
  verify?: boolean
) => {
  const punkGatewayProxy =
    new InitializableImmutableAdminUpgradeabilityProxy__factory(
      await getFirstSigner()
    );
  return withSaveAndVerify(
    punkGatewayProxy,
    eContractid.WPunkGatewayProxy,
    [admin, punkGateway, initData],
    verify,
    true
  ) as Promise<InitializableImmutableAdminUpgradeabilityProxy>;
};

export const deploySeaportAdapter = async (
  provider: tEthereumAddress,
  verify?: boolean
) => {
  const seaportAdapter = new SeaportAdapter__factory(await getFirstSigner());

  return withSaveAndVerify(
    seaportAdapter,
    eContractid.SeaportAdapter,
    [provider],
    verify
  ) as Promise<SeaportAdapter>;
};

export const deployLooksRareAdapter = async (
  provider: tEthereumAddress,
  strategy: tEthereumAddress,
  verify?: boolean
) => {
  const looksRareAdapter = new LooksRareAdapter__factory(
    await getFirstSigner()
  );

  return withSaveAndVerify(
    looksRareAdapter,
    eContractid.LooksRareAdapter,
    [provider, strategy],
    verify
  ) as Promise<LooksRareAdapter>;
};

export const deployX2Y2Adapter = async (
  provider: tEthereumAddress,
  verify?: boolean
) => {
  const x2y2Adapter = new X2Y2Adapter__factory(await getFirstSigner());

  return withSaveAndVerify(
    x2y2Adapter,
    eContractid.X2Y2Adapter,
    [provider],
    verify
  ) as Promise<X2Y2Adapter>;
};

export const deployMarketplaceLogic = async (
  libraries: MarketplaceLogicLibraryAddresses,
  verify?: boolean
) => {
  const marketplaceLogic = new MarketplaceLogic__factory(
    libraries,
    await getFirstSigner()
  );

  return withSaveAndVerify(
    marketplaceLogic,
    eContractid.MarketplaceLogic,
    [],
    verify,
    false,
    libraries
  ) as Promise<MarketplaceLogic>;
};

export const deployConduitController = async (verify?: boolean) =>
  withSaveAndVerify(
    new ConduitController__factory(await getFirstSigner()),
    eContractid.ConduitController,
    [],
    verify
  ) as Promise<ConduitController>;

export const deployPausableZoneController = async (
  owner: tEthereumAddress,
  verify?: boolean
) =>
  withSaveAndVerify(
    new PausableZoneController__factory(await getFirstSigner()),
    eContractid.PausableZoneController,
    [owner],
    verify
  ) as Promise<PausableZoneController>;

export const deploySeaport = async (
  conduitController: string,
  verify?: boolean
) =>
  withSaveAndVerify(
    new Seaport__factory(await getFirstSigner()),
    eContractid.Seaport,
    [conduitController],
    verify
  ) as Promise<Seaport>;

export const deployCurrencyManager = async (verify?: boolean) =>
  withSaveAndVerify(
    new CurrencyManager__factory(await getFirstSigner()),
    eContractid.CurrencyManager,
    [],
    verify
  ) as Promise<CurrencyManager>;

export const deployExecutionManager = async (verify?: boolean) =>
  withSaveAndVerify(
    new ExecutionManager__factory(await getFirstSigner()),
    eContractid.ExecutionManager,
    [],
    verify
  ) as Promise<ExecutionManager>;

export const deployLooksRareExchange = async (
  currencyManager: string,
  executionManager: string,
  royaltyFeeManager: string,
  weth: string,
  protocolFeeRecipient: string,
  verify?: boolean
) =>
  withSaveAndVerify(
    new LooksRareExchange__factory(await getFirstSigner()),
    eContractid.LooksRareExchange,
    [
      currencyManager,
      executionManager,
      royaltyFeeManager,
      weth,
      protocolFeeRecipient,
    ],
    verify
  ) as Promise<LooksRareExchange>;

export const deployRoyaltyFeeManager = async (
  royaltyFeeRegistry: string,
  verify?: boolean
) =>
  withSaveAndVerify(
    new RoyaltyFeeManager__factory(await getFirstSigner()),
    eContractid.RoyaltyFeeManager,
    [royaltyFeeRegistry],
    verify
  ) as Promise<RoyaltyFeeManager>;

export const deployRoyaltyFeeRegistry = async (
  royaltyFeeLimit: string,
  verify?: boolean
) =>
  withSaveAndVerify(
    new RoyaltyFeeRegistry__factory(await getFirstSigner()),
    eContractid.RoyaltyFeeRegistry,
    [royaltyFeeLimit],
    verify
  ) as Promise<RoyaltyFeeRegistry>;

export const deployTransferSelectorNFT = async (
  transferManagerERC721: string,
  transferManagerERC1155: string,
  verify?: boolean
) =>
  withSaveAndVerify(
    new TransferSelectorNFT__factory(await getFirstSigner()),
    eContractid.TransferSelectorNFT,
    [transferManagerERC721, transferManagerERC1155],
    verify
  ) as Promise<TransferSelectorNFT>;

export const deployTransferManagerERC721 = async (
  looksRareExchange: string,
  verify?: boolean
) =>
  withSaveAndVerify(
    new TransferManagerERC721__factory(await getFirstSigner()),
    eContractid.TransferManagerERC721,
    [looksRareExchange],
    verify
  ) as Promise<TransferManagerERC721>;

export const deployTransferManagerERC1155 = async (
  looksRareExchange: string,
  verify?: boolean
) =>
  withSaveAndVerify(
    new TransferManagerERC1155__factory(await getFirstSigner()),
    eContractid.TransferManagerERC1155,
    [looksRareExchange],
    verify
  ) as Promise<TransferManagerERC1155>;

export const deployStrategyStandardSaleForFixedPrice = async (
  protocolFee: string,
  verify?: boolean
) =>
  withSaveAndVerify(
    new StrategyStandardSaleForFixedPrice__factory(await getFirstSigner()),
    eContractid.StrategyStandardSaleForFixedPrice,
    [protocolFee],
    verify
  ) as Promise<StrategyStandardSaleForFixedPrice>;

export const deployX2Y2R1 = async (verify?: boolean) =>
  withSaveAndVerify(
    new X2Y2R1__factory(await getFirstSigner()),
    eContractid.X2Y2R1,
    [],
    verify
  ) as Promise<X2Y2R1>;

export const deployERC721Delegate = async (verify?: boolean) =>
  withSaveAndVerify(
    new ERC721Delegate__factory(await getFirstSigner()),
    eContractid.ERC721Delegate,
    [],
    verify
  ) as Promise<ERC721Delegate>;

export const deployUniswapV3Factory = async (args: [], verify?: boolean) => {
  const uniswapV3Factory = new UniswapV3Factory__factory(
    await getFirstSigner()
  );
  return withSaveAndVerify(
    uniswapV3Factory,
    eContractid.UniswapV3Factory,
    [...args],
    verify
  ) as Promise<UniswapV3Factory>;
};

export const deployNonfungibleTokenPositionDescriptor = async (
  args: [string, string],
  verify?: boolean
) => {
  const nFTDescriptorFactory = (
    await DRE.ethers.getContractFactoryFromArtifact(nFTDescriptor)
  ).connect(await getFirstSigner());

  const nftDescriptorLibraryContract = await withSaveAndVerify(
    nFTDescriptorFactory,
    eContractid.NFTDescriptor,
    [],
    verify
  );
  const libraries = {
    NFTDescriptor: nftDescriptorLibraryContract.address,
  };
  const nonfungibleTokenPositionDescriptorFactory = (
    await DRE.ethers.getContractFactoryFromArtifact(
      nonfungibleTokenPositionDescriptor,
      {
        libraries,
      }
    )
  ).connect(await getFirstSigner());

  return withSaveAndVerify(
    nonfungibleTokenPositionDescriptorFactory,
    eContractid.NonfungibleTokenPositionDescriptor,
    [...args],
    verify,
    false,
    libraries
  );
};

export const deployUniswapV3OracleWrapper = async (
  factory: string,
  manager: string,
  addressProvider: string,
  verify?: boolean
) =>
  withSaveAndVerify(
    new UniswapV3OracleWrapper__factory(await getFirstSigner()),
    eContractid.Aggregator.concat(upperFirst(eContractid.UniswapV3)),
    [factory, manager, addressProvider],
    verify
  ) as Promise<UniswapV3OracleWrapper>;

export const deployUniswapV3TwapOracleWrapper = async (
  pool: string,
  baseCurrency: string,
  twapWindow: string,
  symbol: string,
  verify?: boolean
) =>
  withSaveAndVerify(
    new UniswapV3TwapOracleWrapper__factory(await getFirstSigner()),
    eContractid.Aggregator.concat(upperFirst(symbol)),
    [pool, baseCurrency, twapWindow],
    verify
  ) as Promise<UniswapV3TwapOracleWrapper>;

export const deployStakefishNFTOracleWrapper = async (
  baseCurrency: tEthereumAddress,
  baseCurrencyUnit: tEthereumAddress,
  verify?: boolean
) =>
  withSaveAndVerify(
    new StakefishNFTOracleWrapper__factory(await getFirstSigner()),
    eContractid.Aggregator.concat(upperFirst(eContractid.SFVLDR)),
    [baseCurrency, baseCurrencyUnit],
    verify
  ) as Promise<StakefishNFTOracleWrapper>;

export const deployNonfungiblePositionManager = async (
  args: [string, string, string],
  verify?: boolean
) => {
  const nonfungiblePositionManagerFactory = (
    await DRE.ethers.getContractFactoryFromArtifact(nonfungiblePositionManager)
  ).connect(await getFirstSigner());

  return withSaveAndVerify(
    nonfungiblePositionManagerFactory,
    eContractid.UniswapV3,
    [...args],
    verify
  );
};

export const deployUniswapSwapRouter = async (
  args: [string, string],
  verify?: boolean
) => {
  const swapRouter = (
    await DRE.ethers.getContractFactoryFromArtifact(uniSwapRouter)
  ).connect(await getFirstSigner());

  return withSaveAndVerify(
    swapRouter,
    eContractid.UniswapV3SwapRouter,
    [...args],
    verify
  );
};

export const deployStETH = async (verify?: boolean): Promise<StETHMocked> =>
  withSaveAndVerify(
    new StETHMocked__factory(await getFirstSigner()),
    eContractid.StETH,
    [],
    verify
  ) as Promise<StETHMocked>;

export const deployWStETH = async (
  stETHAddress: tEthereumAddress,
  verify?: boolean
): Promise<WstETHMocked> =>
  withSaveAndVerify(
    new WstETHMocked__factory(await getFirstSigner()),
    eContractid.WStETH,
    [stETHAddress],
    verify
  ) as Promise<WstETHMocked>;

export const deployMockAToken = async (
  args: [string, string, string],
  verify?: boolean
): Promise<MockAToken> =>
  withSaveAndVerify(
    new MockAToken__factory(await getFirstSigner()),
    args[1],
    [...args],
    verify
  ) as Promise<MockAToken>;

export const deployMockCToken = async (
  args: [string, string, string],
  verify?: boolean
): Promise<MockCToken> =>
  withSaveAndVerify(
    new MockCToken__factory(await getFirstSigner()),
    args[1],
    [...args],
    verify
  ) as Promise<MockCToken>;

export const deployMockAStETH = async (
  args: [string, string, string],
  verify?: boolean
): Promise<MockAStETH> =>
  withSaveAndVerify(
    new MockAStETH__factory(await getFirstSigner()),
    args[1],
    [...args],
    verify
  ) as Promise<MockAStETH>;

export const deployMockRETH = async (
  args: [string, string, string],
  verify?: boolean
): Promise<MockRETH> =>
  withSaveAndVerify(
    new MockRETH__factory(await getFirstSigner()),
    args[1],
    [...args],
    verify
  ) as Promise<MockRETH>;

export const deployPTokenAToken = async (
  poolAddress: tEthereumAddress,
  verify?: boolean
) =>
  withSaveAndVerify(
    new PTokenAToken__factory(await getFirstSigner()),
    eContractid.PTokenATokenImpl,
    [poolAddress],
    verify
  ) as Promise<PTokenAToken>;

export const deployPTokenStETH = async (
  poolAddress: tEthereumAddress,
  verify?: boolean
) =>
  withSaveAndVerify(
    new PTokenStETH__factory(await getFirstSigner()),
    eContractid.PTokenStETHImpl,
    [poolAddress],
    verify
  ) as Promise<PTokenStETH>;

export const deployPTokenAStETH = async (
  poolAddress: tEthereumAddress,
  verify?: boolean
) =>
  withSaveAndVerify(
    new PTokenAStETH__factory(await getFirstSigner()),
    eContractid.PTokenAStETHImpl,
    [poolAddress],
    verify
  ) as Promise<PTokenAStETH>;

export const deployPTokenSApe = async (
  poolAddress: tEthereumAddress,
  nBAYC: tEthereumAddress,
  nMAYC: tEthereumAddress,
  verify?: boolean
) =>
  withSaveAndVerify(
    new PTokenSApe__factory(await getFirstSigner()),
    eContractid.PTokenSApeImpl,
    [poolAddress, nBAYC, nMAYC],
    verify
  ) as Promise<PTokenSApe>;

export const deployUserFlashClaimRegistry = async (
  poolAddress: tEthereumAddress,
  receiverImpl: tEthereumAddress,
  verify?: boolean
) =>
  withSaveAndVerify(
    new UserFlashclaimRegistry__factory(await getFirstSigner()),
    eContractid.FlashClaimRegistry,
    [poolAddress, receiverImpl],
    verify
  ) as Promise<UserFlashclaimRegistry>;

export const deployUserFlashClaimRegistryProxy = async (
  admin: string,
  registryImpl: string,
  // eslint-disable-next-line
  initData: any,
  verify?: boolean
) => {
  const proxy = new InitializableImmutableAdminUpgradeabilityProxy__factory(
    await getFirstSigner()
  );
  return withSaveAndVerify(
    proxy,
    eContractid.UserFlashClaimRegistryProxy,
    [admin, registryImpl, initData],
    verify,
    true
  ) as Promise<InitializableImmutableAdminUpgradeabilityProxy>;
};

export const deployBAYCSewerPassClaim = async (
  bayc: string,
  mayc: string,
  bakc: string,
  sewerPass: string,
  verify?: boolean
) => {
  const deployer = await getFirstSigner();
  const deployerAddress = await deployer.getAddress();
  const baycSewerPassClaim = await withSaveAndVerify(
    new BAYCSewerPassClaim__factory(await getFirstSigner()),
    eContractid.BAYCSewerPassClaim,
    [bayc, mayc, bakc, sewerPass, deployerAddress],
    verify
  );

  const baycSewerPass = await getBAYCSewerPass(sewerPass);
  await baycSewerPass.setRegistryAddress(
    baycSewerPassClaim.address,
    GLOBAL_OVERRIDES
  );
  await baycSewerPass.flipMintIsActiveState(GLOBAL_OVERRIDES);
  await baycSewerPassClaim.flipClaimIsActiveState(GLOBAL_OVERRIDES);
  await baycSewerPass.toggleMinterContract(
    baycSewerPassClaim.address,
    GLOBAL_OVERRIDES
  );

  return baycSewerPassClaim;
};

export const deployAirdropFlashClaimReceiver = async (
  poolAddress: tEthereumAddress,
  verify?: boolean
) =>
  withSaveAndVerify(
    new AirdropFlashClaimReceiver__factory(await getFirstSigner()),
    eContractid.AirdropFlashClaimReceiver,
    [poolAddress],
    verify
  ) as Promise<AirdropFlashClaimReceiver>;

export const deployMockAirdropProject = async (
  underlyingAddress: tEthereumAddress,
  verify?: boolean
) =>
  withSaveAndVerify(
    new MockAirdropProject__factory(await getFirstSigner()),
    eContractid.MockAirdropProject,
    [underlyingAddress],
    verify
  ) as Promise<MockAirdropProject>;

export const deployMockMultiAssetAirdropProject = async (
  underlyingAddress1: tEthereumAddress,
  underlyingAddress2: tEthereumAddress,
  verify?: boolean
) =>
  withSaveAndVerify(
    new MockMultiAssetAirdropProject__factory(await getFirstSigner()),
    eContractid.MockMultiAssetAirdropProject,
    [underlyingAddress1, underlyingAddress2],
    verify
  ) as Promise<MockMultiAssetAirdropProject>;

export const deployApeCoinStaking = async (verify?: boolean) => {
  const allTokens = await getAllTokens();
  const args = [
    allTokens.APE.address,
    allTokens.BAYC.address,
    allTokens.MAYC.address,
    allTokens.BAKC.address,
  ];

  const apeCoinStaking = await withSaveAndVerify(
    new ApeCoinStaking__factory(await getFirstSigner()),
    eContractid.ApeCoinStaking,
    [...args],
    verify
  );
  const amount = await convertToCurrencyDecimals(
    allTokens.APE.address,
    "94694400"
  );

  await apeCoinStaking.addTimeRange(
    0,
    amount,
    "1666771200",
    "1761465600",
    parseEther("10000"),
    GLOBAL_OVERRIDES
  );
  await apeCoinStaking.addTimeRange(
    1,
    amount,
    "1666771200",
    "1761465600",
    parseEther("200000"),
    GLOBAL_OVERRIDES
  );
  await apeCoinStaking.addTimeRange(
    2,
    amount,
    "1666771200",
    "1761465600",
    parseEther("100000"),
    GLOBAL_OVERRIDES
  );
  await apeCoinStaking.addTimeRange(
    3,
    amount,
    "1666771200",
    "1761465600",
    parseEther("100000"),
    GLOBAL_OVERRIDES
  );
  return apeCoinStaking;
};

export const deployApeStakingLogic = async (verify?: boolean) => {
  return withSaveAndVerify(
    new ApeStakingLogic__factory(await getFirstSigner()),
    eContractid.ApeStakingLogic,
    [],
    verify
  ) as Promise<ApeStakingLogic>;
};

export const deployNTokenBAYCImpl = async (
  apeCoinStaking: tEthereumAddress,
  poolAddress: tEthereumAddress,
  delegationRegistry: tEthereumAddress,
  verify?: boolean
) => {
  const apeStakingLogic =
    (await getContractAddressInDb(eContractid.ApeStakingLogic)) ||
    (await deployApeStakingLogic(verify)).address;
  const mintableERC721Logic =
    (await getContractAddressInDb(eContractid.MintableERC721Logic)) ||
    (await deployMintableERC721Logic(verify)).address;

  const libraries = {
    ["contracts/protocol/tokenization/libraries/ApeStakingLogic.sol:ApeStakingLogic"]:
      apeStakingLogic,
    ["contracts/protocol/tokenization/libraries/MintableERC721Logic.sol:MintableERC721Logic"]:
      mintableERC721Logic,
  };

  return withSaveAndVerify(
    new NTokenBAYC__factory(libraries, await getFirstSigner()),
    eContractid.NTokenBAYCImpl,
    [poolAddress, apeCoinStaking, delegationRegistry],
    verify,
    false,
    libraries
  ) as Promise<NTokenBAYC>;
};

export const deployNTokenMAYCImpl = async (
  apeCoinStaking: tEthereumAddress,
  poolAddress: tEthereumAddress,
  delegationRegistry: tEthereumAddress,
  verify?: boolean
) => {
  const apeStakingLogic =
    (await getContractAddressInDb(eContractid.ApeStakingLogic)) ||
    (await deployApeStakingLogic(verify)).address;
  const mintableERC721Logic =
    (await getContractAddressInDb(eContractid.MintableERC721Logic)) ||
    (await deployMintableERC721Logic(verify)).address;

  const libraries = {
    ["contracts/protocol/tokenization/libraries/ApeStakingLogic.sol:ApeStakingLogic"]:
      apeStakingLogic,
    ["contracts/protocol/tokenization/libraries/MintableERC721Logic.sol:MintableERC721Logic"]:
      mintableERC721Logic,
  };
  return withSaveAndVerify(
    new NTokenMAYC__factory(libraries, await getFirstSigner()),
    eContractid.NTokenMAYCImpl,
    [poolAddress, apeCoinStaking, delegationRegistry],
    verify,
    false,
    libraries
  ) as Promise<NTokenMAYC>;
};

export const deployNTokenBAKCImpl = async (
  poolAddress: tEthereumAddress,
  apeCoinStaking: tEthereumAddress,
  nBAYC: tEthereumAddress,
  nMAYC: tEthereumAddress,
  delegationRegistry: tEthereumAddress,
  verify?: boolean
) => {
  const mintableERC721Logic =
    (await getContractAddressInDb(eContractid.MintableERC721Logic)) ||
    (await deployMintableERC721Logic(verify)).address;
  const libraries = {
    ["contracts/protocol/tokenization/libraries/MintableERC721Logic.sol:MintableERC721Logic"]:
      mintableERC721Logic,
  };
  return withSaveAndVerify(
    new NTokenBAKC__factory(libraries, await getFirstSigner()),
    eContractid.NTokenBAKCImpl,
    [poolAddress, apeCoinStaking, nBAYC, nMAYC, delegationRegistry],
    verify,
    false,
    libraries
  ) as Promise<NTokenBAKC>;
};

export const deployATokenDebtToken = async (
  poolAddress: tEthereumAddress,
  verify?: boolean
) =>
  withSaveAndVerify(
    new ATokenDebtToken__factory(await getFirstSigner()),
    eContractid.ATokenDebtToken,
    [poolAddress],
    verify
  ) as Promise<ATokenDebtToken>;

export const deployStETHDebtToken = async (
  poolAddress: tEthereumAddress,
  verify?: boolean
) =>
  withSaveAndVerify(
    new StETHDebtToken__factory(await getFirstSigner()),
    eContractid.StETHDebtToken,
    [poolAddress],
    verify
  ) as Promise<StETHDebtToken>;

export const deployAStETHDebtToken = async (
  poolAddress: tEthereumAddress,
  verify?: boolean
) =>
  withSaveAndVerify(
    new AStETHDebtToken__factory(await getFirstSigner()),
    eContractid.AStETHDebtToken,
    [poolAddress],
    verify
  ) as Promise<AStETHDebtToken>;

export const deployMintableERC721Logic = async (verify?: boolean) => {
  return withSaveAndVerify(
    new MintableERC721Logic__factory(await getFirstSigner()),
    eContractid.MintableERC721Logic,
    [],
    verify
  ) as Promise<MintableERC721Logic>;
};

export const deployMerkleVerifier = async (verify?: boolean) =>
  withSaveAndVerify(
    new MerkleVerifier__factory(await getFirstSigner()),
    eContractid.MerkleVerifier,
    [],
    verify
  ) as Promise<MerkleVerifier>;

export const deployExecutionDelegate = async (verify?: boolean) =>
  withSaveAndVerify(
    new ExecutionDelegate__factory(await getFirstSigner()),
    eContractid.ExecutionDelegate,
    [],
    verify
  ) as Promise<ExecutionDelegate>;

export const deployPolicyManager = async (verify?: boolean) =>
  withSaveAndVerify(
    new PolicyManager__factory(await getFirstSigner()),
    eContractid.PolicyManager,
    [],
    verify
  ) as Promise<PolicyManager>;

export const deployStandardPolicyERC721 = async (verify?: boolean) =>
  withSaveAndVerify(
    new StandardPolicyERC721__factory(await getFirstSigner()),
    eContractid.StandardPolicyERC721,
    [],
    verify
  ) as Promise<StandardPolicyERC721>;

export const deployBlurExchangeImpl = async (verify?: boolean) => {
  const merkleVerifier = await deployMerkleVerifier(verify);
  const blurExchangeLibraries = {
    ["contracts/dependencies/blur-exchange/MerkleVerifier.sol:MerkleVerifier"]:
      merkleVerifier.address,
  };
  const blurExchange = new BlurExchange__factory(
    blurExchangeLibraries,
    await getFirstSigner()
  );

  return withSaveAndVerify(
    blurExchange,
    eContractid.BlurExchangeImpl,
    [],
    verify,
    false,
    blurExchangeLibraries
  ) as Promise<BlurExchange>;
};

export const deployBlurExchangeProxy = async (
  admin: string,
  blurExchange: string,
  initData: string,
  verify?: boolean
) => {
  const blurExchangeProxy =
    new InitializableImmutableAdminUpgradeabilityProxy__factory(
      await getFirstSigner()
    );
  return withSaveAndVerify(
    blurExchangeProxy,
    eContractid.BlurExchangeProxy,
    [admin, blurExchange, initData],
    verify,
    true
  ) as Promise<InitializableImmutableAdminUpgradeabilityProxy>;
};

export const deployBlurAdapter = async (
  provider: tEthereumAddress,
  policy: tEthereumAddress,
  verify?: boolean
) => {
  return withSaveAndVerify(
    new BlurAdapter__factory(await getFirstSigner()),
    eContractid.BlurAdapter,
    [provider, policy],
    verify
  ) as Promise<BlurAdapter>;
};

export const deployTimeLockExecutor = async (
  args: string[],
  verify?: boolean
) => {
  return withSaveAndVerify(
    new ExecutorWithTimelock__factory(await getFirstSigner()),
    eContractid.TimeLockExecutor,
    [...args],
    verify
  ) as Promise<ExecutorWithTimelock>;
};

export const deployAutoCompoundApeImpl = async (verify?: boolean) => {
  const allTokens = await getAllTokens();
  const apeCoinStaking =
    (await getContractAddressInDb(eContractid.ApeCoinStaking)) ||
    (await deployApeCoinStaking(verify)).address;
  const aclManager = await getACLManager();
  const args = [allTokens.APE.address, apeCoinStaking, aclManager.address];

  return withSaveAndVerify(
    new AutoCompoundApe__factory(await getFirstSigner()),
    eContractid.cAPEImpl,
    [...args],
    verify
  ) as Promise<AutoCompoundApe>;
};

export const deployAutoCompoundApe = async (verify?: boolean) => {
  const cApeImplementation = await deployAutoCompoundApeImpl(verify);

  const deployer = await getFirstSigner();
  const deployerAddress = await deployer.getAddress();

  const initData =
    cApeImplementation.interface.encodeFunctionData("initialize");

  const proxyInstance = await withSaveAndVerify(
    new InitializableAdminUpgradeabilityProxy__factory(await getFirstSigner()),
    eContractid.cAPE,
    [],
    verify
  );

  await waitForTx(
    await (proxyInstance as InitializableAdminUpgradeabilityProxy)[
      "initialize(address,address,bytes)"
    ](cApeImplementation.address, deployerAddress, initData, GLOBAL_OVERRIDES)
  );

  return proxyInstance as AutoCompoundApe;
};

export const deployP2PPairStakingImpl = async (verify?: boolean) => {
  const allTokens = await getAllTokens();
  const protocolDataProvider = await getProtocolDataProvider();
  const nBAYC = (
    await protocolDataProvider.getReserveTokensAddresses(allTokens.BAYC.address)
  ).xTokenAddress;
  const nMAYC = (
    await protocolDataProvider.getReserveTokensAddresses(allTokens.MAYC.address)
  ).xTokenAddress;
  const nBAKC = (
    await protocolDataProvider.getReserveTokensAddresses(allTokens.BAKC.address)
  ).xTokenAddress;
  const apeCoinStaking =
    (await getContractAddressInDb(eContractid.ApeCoinStaking)) ||
    (await deployApeCoinStaking(verify)).address;
  const args = [
    allTokens.BAYC.address,
    allTokens.MAYC.address,
    allTokens.BAKC.address,
    nBAYC,
    nMAYC,
    nBAKC,
    allTokens.APE.address,
    allTokens.cAPE.address,
    apeCoinStaking,
  ];

  return withSaveAndVerify(
    new P2PPairStaking__factory(await getFirstSigner()),
    eContractid.P2PPairStakingImpl,
    [...args],
    verify
  ) as Promise<P2PPairStaking>;
};

export const deployP2PPairStaking = async (verify?: boolean) => {
  const p2pImplementation = await deployP2PPairStakingImpl(verify);

  const deployer = await getFirstSigner();
  const deployerAddress = await deployer.getAddress();

  const initData = p2pImplementation.interface.encodeFunctionData("initialize");

  const proxyInstance = await withSaveAndVerify(
    new InitializableAdminUpgradeabilityProxy__factory(await getFirstSigner()),
    eContractid.P2PPairStaking,
    [],
    verify
  );

  await waitForTx(
    await (proxyInstance as InitializableAdminUpgradeabilityProxy)[
      "initialize(address,address,bytes)"
    ](p2pImplementation.address, deployerAddress, initData, GLOBAL_OVERRIDES)
  );

  return proxyInstance as P2PPairStaking;
};

export const deployAutoYieldApeImpl = async (verify?: boolean) => {
  const allTokens = await getAllTokens();
  const apeCoinStaking =
    (await getContractAddressInDb(eContractid.ApeCoinStaking)) ||
    (await deployApeCoinStaking(verify)).address;
  const pool = await getPoolProxy();
  const swapRouter = await getUniswapV3SwapRouter();
  const args = [
    apeCoinStaking,
    allTokens.APE.address,
    allTokens.USDC.address,
    pool.address,
    swapRouter.address,
  ];

  return withSaveAndVerify(
    new AutoYieldApe__factory(await getFirstSigner()),
    eContractid.yAPEImpl,
    [...args],
    verify
  ) as Promise<AutoYieldApe>;
};

export const deployAutoYieldApe = async (verify?: boolean) => {
  const yApeImplementation = await deployAutoYieldApeImpl(verify);

  const deployer = await getFirstSigner();
  const deployerAddress = await deployer.getAddress();

  const initData =
    yApeImplementation.interface.encodeFunctionData("initialize");

  const proxyInstance = await withSaveAndVerify(
    new InitializableAdminUpgradeabilityProxy__factory(await getFirstSigner()),
    eContractid.yAPE,
    [],
    verify
  );

  await waitForTx(
    await (proxyInstance as InitializableAdminUpgradeabilityProxy)[
      "initialize(address,address,bytes)"
    ](yApeImplementation.address, deployerAddress, initData, GLOBAL_OVERRIDES)
  );

  return proxyInstance as AutoYieldApe;
};

export const deployHelperContractImpl = async (verify?: boolean) => {
  const allTokens = await getAllTokens();
  const protocolDataProvider = await getProtocolDataProvider();
  const pCApe = (
    await protocolDataProvider.getReserveTokensAddresses(allTokens.cAPE.address)
  ).xTokenAddress;
  const pool = await getPoolProxy();
  const args = [
    allTokens.APE.address,
    allTokens.cAPE.address,
    pCApe,
    pool.address,
  ];

  return withSaveAndVerify(
    new HelperContract__factory(await getFirstSigner()),
    eContractid.HelperContractImpl,
    [...args],
    verify
  ) as Promise<HelperContract>;
};

export const deployHelperContract = async (verify?: boolean) => {
  const helperImplementation = await deployHelperContractImpl(verify);

  const deployer = await getFirstSigner();
  const deployerAddress = await deployer.getAddress();

  const initData =
    helperImplementation.interface.encodeFunctionData("initialize");

  const proxyInstance = await withSaveAndVerify(
    new InitializableAdminUpgradeabilityProxy__factory(await getFirstSigner()),
    eContractid.HelperContract,
    [],
    verify
  );

  await waitForTx(
    await (proxyInstance as InitializableAdminUpgradeabilityProxy)[
      "initialize(address,address,bytes)"
    ](helperImplementation.address, deployerAddress, initData, GLOBAL_OVERRIDES)
  );

  return proxyInstance as HelperContract;
};

export const deployPTokenCApe = async (
  poolAddress: tEthereumAddress,
  verify?: boolean
) =>
  withSaveAndVerify(
    new PTokenCApe__factory(await getFirstSigner()),
    eContractid.PTokenCApeImpl,
    [poolAddress],
    verify
  ) as Promise<PTokenCApe>;

export const deployCApeDebtToken = async (
  poolAddress: tEthereumAddress,
  verify?: boolean
) =>
  withSaveAndVerify(
    new CApeDebtToken__factory(await getFirstSigner()),
    eContractid.CApeDebtToken,
    [poolAddress],
    verify
  ) as Promise<CApeDebtToken>;

export const deployPYieldToken = async (
  poolAddress: tEthereumAddress,
  verify?: boolean
) =>
  withSaveAndVerify(
    new PYieldToken__factory(await getFirstSigner()),
    eContractid.PYieldTokenImpl,
    [poolAddress],
    verify
  ) as Promise<PYieldToken>;

export const deployCLwstETHSynchronicityPriceAdapter = async (
  stETHAggregator: tEthereumAddress,
  stETH: tEthereumAddress,
  verify?: boolean
) =>
  withSaveAndVerify(
    new CLwstETHSynchronicityPriceAdapter__factory(await getFirstSigner()),
    eContractid.Aggregator.concat(upperFirst(eContractid.WStETH)),
    [stETHAggregator, stETH, 18],
    verify
  ) as Promise<CLwstETHSynchronicityPriceAdapter>;

export const deployExchangeRateSynchronicityPriceAdapter = async (
  asset: tEthereumAddress,
  symbol: string,
  verify?: boolean
) =>
  withSaveAndVerify(
    new CLExchangeRateSynchronicityPriceAdapter__factory(
      await getFirstSigner()
    ),
    eContractid.Aggregator.concat(upperFirst(symbol)),
    [asset],
    verify
  ) as Promise<CLExchangeRateSynchronicityPriceAdapter>;

export const deployCTokenSynchronicityPriceAdapter = async (
  asset: tEthereumAddress,
  symbol: string,
  verify?: boolean
) =>
  withSaveAndVerify(
    new CLCETHSynchronicityPriceAdapter__factory(await getFirstSigner()),
    eContractid.Aggregator.concat(upperFirst(symbol)),
    [asset],
    verify
  ) as Promise<CLCETHSynchronicityPriceAdapter>;

export const deployBaseCurrencySynchronicityPriceAdapter = async (
  baseCurrency: tEthereumAddress,
  baseCurrencyUnit: string,
  symbol: string,
  verify?: boolean
) =>
  withSaveAndVerify(
    new CLBaseCurrencySynchronicityPriceAdapter__factory(
      await getFirstSigner()
    ),
    eContractid.Aggregator.concat(upperFirst(symbol)),
    [baseCurrency, baseCurrencyUnit],
    verify
  ) as Promise<CLExchangeRateSynchronicityPriceAdapter>;

export const deployParaSpaceAirdrop = async (
  token: tEthereumAddress,
  deadline: string,
  verify?: boolean
) =>
  withSaveAndVerify(
    new ParaSpaceAirdrop__factory(await getFirstSigner()),
    eContractid.ParaSpaceAirdrop,
    [token, deadline],
    verify
  ) as Promise<ParaSpaceAirdrop>;

export const deployTimeLockImpl = async (
  provider: tEthereumAddress,
  verify?: boolean
) =>
  await withSaveAndVerify(
    new TimeLock__factory(await getFirstSigner()),
    eContractid.TimeLockImpl,
    [provider],
    verify
  );

export const deployTimeLockProxy = async (verify?: boolean) => {
  const proxyInstance = await withSaveAndVerify(
    new InitializableAdminUpgradeabilityProxy__factory(await getFirstSigner()),
    eContractid.TimeLockProxy,
    [],
    verify
  );

  return proxyInstance as InitializableAdminUpgradeabilityProxy;
};

export const deployTimeLockImplAndAssignItToProxy = async (
  provider: tEthereumAddress,
  verify?: boolean
) => {
  const proxyInstance = await getInitializableAdminUpgradeabilityProxy(
    (
      await getTimeLockProxy()
    ).address
  );

  const impl = await deployTimeLockImpl(provider, verify);

  const deployer = await getFirstSigner();
  const deployerAddress = await deployer.getAddress();

  const initData = impl.interface.encodeFunctionData("initialize");

  await waitForTx(
    await (proxyInstance as InitializableAdminUpgradeabilityProxy)[
      "initialize(address,address,bytes)"
    ](impl.address, deployerAddress, initData, GLOBAL_OVERRIDES)
  );
};

export const deployReserveTimeLockStrategy = async (
  name: string,
  pool: string,
  minThreshold: string,
  midThreshold: string,
  minWaitTime: string,
  midWaitTime: string,
  maxWaitTime: string,
  maxPoolPeriodRate: string,
  maxPoolPeriodWaitTime: string,
  period: string,
  verify?: boolean
) =>
  withSaveAndVerify(
    new DefaultTimeLockStrategy__factory(await getFirstSigner()),
    name,
    [
      pool,
      minThreshold,
      midThreshold,
      minWaitTime,
      midWaitTime,
      maxWaitTime,
      maxPoolPeriodRate,
      maxPoolPeriodWaitTime,
      period,
    ],
    verify
  ) as Promise<DefaultTimeLockStrategy>;

export const deployOtherdeedNTokenImpl = async (
  poolAddress: tEthereumAddress,
  warmWallet: tEthereumAddress,
  delegationRegistryAddress: tEthereumAddress,
  verify?: boolean
) => {
  const mintableERC721Logic =
    (await getContractAddressInDb(eContractid.MintableERC721Logic)) ||
    (await deployMintableERC721Logic(verify)).address;

  const libraries = {
    ["contracts/protocol/tokenization/libraries/MintableERC721Logic.sol:MintableERC721Logic"]:
      mintableERC721Logic,
  };
  return withSaveAndVerify(
    new NTokenOtherdeed__factory(libraries, await getFirstSigner()),
    eContractid.NTokenOtherdeedImpl,
    [poolAddress, warmWallet, delegationRegistryAddress],
    verify,
    false,
    libraries
  ) as Promise<NTokenOtherdeed>;
};

export const deployStakefishNTokenImpl = async (
  poolAddress: tEthereumAddress,
  delegationRegistryAddress: tEthereumAddress,
  verify?: boolean
) => {
  const mintableERC721Logic =
    (await getContractAddressInDb(eContractid.MintableERC721Logic)) ||
    (await deployMintableERC721Logic(verify)).address;

  const libraries = {
    ["contracts/protocol/tokenization/libraries/MintableERC721Logic.sol:MintableERC721Logic"]:
      mintableERC721Logic,
  };
  return withSaveAndVerify(
    new NTokenStakefish__factory(libraries, await getFirstSigner()),
    eContractid.NTokenStakefishImpl,
    [poolAddress, delegationRegistryAddress],
    verify,
    false,
    libraries
  ) as Promise<NTokenStakefish>;
};

export const deployHotWalletProxy = async (verify?: boolean) =>
  withSaveAndVerify(
    new HotWalletProxy__factory(await getFirstSigner()),
    eContractid.HotWalletProxy,
    [],
    verify
  ) as Promise<HotWalletProxy>;

export const deployDelegationRegistry = async (verify?: boolean) =>
  withSaveAndVerify(
    new DelegationRegistry__factory(await getFirstSigner()),
    eContractid.DelegationRegistry,
    [],
    verify
  ) as Promise<DelegationRegistry>;

export const deployStakefishValidatorFactory = async (
  genesisImplementation: tEthereumAddress,
  operator: tEthereumAddress,
  verify?: boolean
) =>
  withSaveAndVerify(
    new StakefishValidatorFactory__factory(await getFirstSigner()),
    eContractid.StakefishValidatorFactory,
    [genesisImplementation, operator],
    verify
  ) as Promise<StakefishValidatorFactory>;

export const deployStakefishNFTManager = async (
  factory: tEthereumAddress,
  verify?: boolean
) =>
  withSaveAndVerify(
    new StakefishNFTManager__factory(await getFirstSigner()),
    eContractid.SFVLDR,
    [factory],
    verify
  ) as Promise<StakefishNFTManager>;

export const deployDepositContract = async (verify?: boolean) =>
  withSaveAndVerify(
    new DepositContract__factory(await getFirstSigner()),
    eContractid.DepositContract,
    [],
    verify
  ) as Promise<DepositContract>;

export const deployStakefishValidator = async (
  depositContract: tEthereumAddress,
  verify?: boolean
) =>
  withSaveAndVerify(
    new StakefishValidatorV1__factory(await getFirstSigner()),
    eContractid.StakefishValidator,
    [depositContract],
    verify
  ) as Promise<StakefishValidatorV1>;

////////////////////////////////////////////////////////////////////////////////
//  MOCK
////////////////////////////////////////////////////////////////////////////////
export const deployGenericPToken = async (
  [
    poolAddress,
    underlyingAssetAddress,
    treasuryAddress,
    incentivesController,
    name,
    symbol,
  ]: [
    tEthereumAddress,
    tEthereumAddress,
    tEthereumAddress,
    tEthereumAddress,
    string,
    string
  ],
  verify?: boolean
) => {
  const instance = await withSaveAndVerify(
    new PToken__factory(await getFirstSigner()),
    eContractid.PTokenImpl,
    [poolAddress],
    verify
  );

  await instance.initialize(
    poolAddress,
    treasuryAddress,
    underlyingAssetAddress,
    incentivesController,
    "18",
    name,
    symbol,
    "0x10"
  );

  return instance;
};

export const deployDelegationAwarePToken = async (
  [
    poolAddress,
    underlyingAssetAddress,
    treasuryAddress,
    incentivesController,
    name,
    symbol,
  ]: [
    tEthereumAddress,
    tEthereumAddress,
    tEthereumAddress,
    tEthereumAddress,
    string,
    string
  ],
  verify?: boolean
) => {
  const instance = await withSaveAndVerify(
    new DelegationAwarePToken__factory(await getFirstSigner()),
    eContractid.DelegationAwarePTokenImpl,
    [poolAddress],
    verify
  );

  await instance.initialize(
    poolAddress,
    treasuryAddress,
    underlyingAssetAddress,
    incentivesController,
    "18",
    name,
    symbol,
    "0x10"
  );

  return instance;
};

export const deployMockVariableDebtToken = async (
  args: [
    tEthereumAddress,
    tEthereumAddress,
    tEthereumAddress,
    string,
    string,
    string
  ],
  verify?: boolean
) => {
  const instance = (await withSaveAndVerify(
    new MockVariableDebtToken__factory(await getFirstSigner()),
    eContractid.MockVariableDebtToken,
    [args[0]],
    verify
  )) as MockVariableDebtToken;

  await instance.initialize(
    args[0],
    args[1],
    args[2],
    "18",
    args[3],
    args[4],
    args[5],
    GLOBAL_OVERRIDES
  );

  return instance;
};

export const deployMockNToken = async (
  args: [
    tEthereumAddress,
    tEthereumAddress,
    tEthereumAddress,
    string,
    string,
    string
  ],
  verify?: boolean
) => {
  const mintableERC721Logic =
    (await getContractAddressInDb(eContractid.MintableERC721Logic)) ||
    (await deployMintableERC721Logic(verify)).address;

  const libraries = {
    ["contracts/protocol/tokenization/libraries/MintableERC721Logic.sol:MintableERC721Logic"]:
      mintableERC721Logic,
  };

  const instance = (await withSaveAndVerify(
    new MockNToken__factory(libraries, await getFirstSigner()),
    eContractid.MockNToken,
    [args[0], ZERO_ADDRESS, false],
    verify
  )) as MockNToken;

  await instance.initialize(
    args[0],
    args[1],
    args[2],
    args[3],
    args[4],
    args[5],
    GLOBAL_OVERRIDES
  );

  return instance;
};

export const deployMockPToken = async (
  args: [
    tEthereumAddress,
    tEthereumAddress,
    tEthereumAddress,
    tEthereumAddress,
    string,
    string,
    string
  ],
  verify?: boolean
) => {
  const instance = (await withSaveAndVerify(
    new MockPToken__factory(await getFirstSigner()),
    eContractid.MockPToken,
    [args[0]],
    verify
  )) as MockPToken;

  await instance.initialize(
    args[0],
    args[2],
    args[1],
    args[3],
    "18",
    args[4],
    args[5],
    args[6],
    GLOBAL_OVERRIDES
  );

  return instance;
};

export const deployMockIncentivesController = async (verify?: boolean) =>
  withSaveAndVerify(
    new MockIncentivesController__factory(await getFirstSigner()),
    eContractid.MockIncentivesController,
    [],
    verify
  ) as Promise<MockIncentivesController>;

export const deployMockReserveConfiguration = async (verify?: boolean) =>
  withSaveAndVerify(
    new MockReserveConfiguration__factory(await getFirstSigner()),
    eContractid.MockReserveConfiguration,
    [],
    verify
  ) as Promise<MockReserveConfiguration>;

export const deployMockInitializableImple = async (verify?: boolean) =>
  withSaveAndVerify(
    new MockInitializableImple__factory(await getFirstSigner()),
    eContractid.MockInitializableImple,
    [],
    verify
  ) as Promise<MockInitializableImple>;

export const deployMockInitializableImpleV2 = async (verify?: boolean) =>
  withSaveAndVerify(
    new MockInitializableImpleV2__factory(await getFirstSigner()),
    eContractid.MockInitializableImpleV2,
    [],
    verify
  ) as Promise<MockInitializableImpleV2>;

export const deployMockInitializableFromConstructorImple = async (
  args: [string],
  verify?: boolean
) =>
  withSaveAndVerify(
    new MockInitializableFromConstructorImple__factory(await getFirstSigner()),
    eContractid.MockInitializableFromConstructorImple,
    [...args],
    verify
  ) as Promise<MockInitializableFromConstructorImple>;

export const deployMockReentrantInitializableImple = async (verify?: boolean) =>
  withSaveAndVerify(
    new MockReentrantInitializableImple__factory(await getFirstSigner()),
    eContractid.MockReentrantInitializableImple,
    [],
    verify
  ) as Promise<MockReentrantInitializableImple>;

export const deployMockTokenFaucet = async (
  erc20configs,
  erc721configs,
  punkConfig,
  verify?: boolean
) =>
  withSaveAndVerify(
    new MockTokenFaucet__factory(await getFirstSigner()),
    eContractid.MockTokenFaucet,
    [erc20configs, erc721configs, punkConfig],
    verify
  );

export const deployMockedDelegateRegistry = async (verify?: boolean) =>
  withSaveAndVerify(
    new MockedDelegateRegistry__factory(await getFirstSigner()),
    eContractid.MockedDelegateRegistry,
    [],
    verify
  ) as Promise<MockedDelegateRegistry>;

export const deployMockFeePool = async (verify?: boolean) =>
  withSaveAndVerify(
    new MockFeePool__factory(await getFirstSigner()),
    eContractid.MockFeePool,
    [],
    verify
  ) as Promise<MockFeePool>;

export const deployMockBendDaoLendPool = async (weth, verify?: boolean) =>
  withSaveAndVerify(
    new MockLendPool__factory(await getFirstSigner()),
    eContractid.MockBendDaoLendPool,
    [weth],
    verify
  );
////////////////////////////////////////////////////////////////////////////////
//  PLS ONLY APPEND MOCK CONTRACTS HERE!
////////////////////////////////////////////////////////////////////////////////
