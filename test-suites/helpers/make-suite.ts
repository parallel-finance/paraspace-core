import {
  getPoolProxy,
  getPoolAddressesProvider,
  getProtocolDataProvider,
  getPToken,
  getNToken,
  getMintableERC20,
  getPoolConfiguratorProxy,
  getPriceOracle,
  getPoolAddressesProviderRegistry,
  getWETHMocked,
  getVariableDebtToken,
  getParaSpaceOracle,
  getACLManager,
  getMintableERC721,
  getWPunk,
  getCryptoPunksMarket,
  getMockTokenFaucet,
  getConduitController,
  getPausableZoneController,
  getPausableZone,
  getSeaport,
  getLooksRareExchange,
  getStrategyStandardSaleForFixedPrice,
  getTransferManagerERC721,
  getConduit,
  getConduitKey,
  getX2Y2R1,
  getERC721Delegate,
  getMoonBirds,
  getNTokenMoonBirds,
  getUniswapV3Factory,
  getNonfungiblePositionManager,
  getNTokenUniswapV3,
  getUiPoolDataProvider,
  getNFTFloorOracle,
  getStETH,
  getMockAToken,
  getPTokenAToken,
  getPTokenStETH,
  getWPunkGatewayProxy,
  getWETHGatewayProxy,
} from "../../deploy/helpers/contracts-getters";
import {
  eContractid,
  ERC20TokenContractId,
  ERC721TokenContractId,
  NTokenContractId,
  PTokenContractId,
  tEthereumAddress,
} from "../../deploy/helpers/types";
import {
  Conduit,
  ERC721Delegate,
  IPool,
  NFTFloorOracle,
  NTokenMoonBirds,
  NTokenUniswapV3,
  PausableZone,
  PausableZoneController,
  UiPoolDataProvider,
  X2Y2R1,
} from "../../types";
import {ProtocolDataProvider} from "../../types";
import {MintableERC20} from "../../types";
import {PToken} from "../../types";
import {NToken} from "../../types";
import {PoolConfigurator} from "../../types";

import chai from "chai";
import bignumberChai from "chai-bignumber";
import {PriceOracle} from "../../types";
import {PoolAddressesProvider} from "../../types";
import {PoolAddressesProviderRegistry} from "../../types";
import {getEthersSigners} from "../../deploy/helpers/contracts-helpers";
import {WETH9Mocked} from "../../types";
import {solidity} from "ethereum-waffle";
import {
  ParaSpaceOracle,
  ACLManager,
  VariableDebtToken,
  WPunk,
  CryptoPunksMarket,
  WPunkGateway,
  WETHGateway,
  MockTokenFaucet,
  ConduitController,
  Seaport,
  LooksRareExchange,
  StrategyStandardSaleForFixedPrice,
  TransferManagerERC721,
  // X2Y2R1,
  // ERC721Delegate,
  // Moonbirds,
  Moonbirds,
  UniswapV3Factory,
  INonfungiblePositionManager,
  StETH,
  MockAToken,
  PTokenAToken,
  PTokenStETH,
} from "../../types";
import {MintableERC721} from "../../types";
import {Signer} from "ethers";
import ParaSpaceConfig from "../../deploy/market-config";

chai.use(bignumberChai());
chai.use(solidity);

export interface SignerWithAddress {
  signer: Signer;
  address: tEthereumAddress;
}
export interface TestEnv {
  deployer: SignerWithAddress;
  poolAdmin: SignerWithAddress;
  assetListingAdmin: SignerWithAddress;
  emergencyAdmin: SignerWithAddress;
  riskAdmin: SignerWithAddress;
  gatewayAdmin: SignerWithAddress;
  users: SignerWithAddress[];
  pool: IPool;
  configurator: PoolConfigurator;
  poolDataProvider: UiPoolDataProvider;
  oracle: PriceOracle;
  paraspaceOracle: ParaSpaceOracle;
  protocolDataProvider: ProtocolDataProvider;
  weth: WETH9Mocked;
  pWETH: PToken;
  aWETH: MockAToken;
  paWETH: PTokenAToken;
  dai: MintableERC20;
  pDai: PToken;
  variableDebtDai: VariableDebtToken;
  pUsdc: PToken;
  usdc: MintableERC20;
  usdt: MintableERC20;
  nBAYC: NToken;
  bayc: MintableERC721;
  addressesProvider: PoolAddressesProvider;
  registry: PoolAddressesProviderRegistry;
  aclManager: ACLManager;
  cryptoPunksMarket: CryptoPunksMarket;
  wPunk: WPunk;
  nWPunk: NToken;
  wBTC: MintableERC20;
  stETH: StETH;
  pstETH: PTokenStETH;
  ape: MintableERC20;
  nMAYC: NToken;
  mayc: MintableERC721;
  nDOODLES: NToken;
  doodles: MintableERC721;
  mockTokenFaucet: MockTokenFaucet;
  wPunkGateway: WPunkGateway;
  wETHGateway: WETHGateway;
  conduitController: ConduitController;
  pausableZoneController: PausableZoneController;
  conduitKey: string;
  conduit: Conduit;
  pausableZone: PausableZone;
  seaport: Seaport;
  looksRareExchange: LooksRareExchange;
  strategyStandardSaleForFixedPrice: StrategyStandardSaleForFixedPrice;
  transferManagerERC721: TransferManagerERC721;
  x2y2r1: X2Y2R1;
  erc721Delegate: ERC721Delegate;
  moonbirds: Moonbirds;
  nMOONBIRD: NTokenMoonBirds;
  uniswapV3Factory: UniswapV3Factory;
  nftPositionManager: INonfungiblePositionManager;
  nUniswapV3: NTokenUniswapV3;
  nftFloorOracle: NFTFloorOracle;
}

export async function initializeMakeSuite() {
  const testEnv: TestEnv = {
    deployer: {} as SignerWithAddress,
    poolAdmin: {} as SignerWithAddress,
    assetListingAdmin: {} as SignerWithAddress,
    emergencyAdmin: {} as SignerWithAddress,
    riskAdmin: {} as SignerWithAddress,
    gatewayAdmin: {} as SignerWithAddress,
    users: [] as SignerWithAddress[],
    pool: {} as IPool,
    configurator: {} as PoolConfigurator,
    poolDataProvider: {} as UiPoolDataProvider,
    protocolDataProvider: {} as ProtocolDataProvider,
    oracle: {} as PriceOracle,
    paraspaceOracle: {} as ParaSpaceOracle,
    weth: {} as WETH9Mocked,
    pWETH: {} as PToken,
    aWETH: {} as MockAToken,
    paWETH: {} as PTokenAToken,
    dai: {} as MintableERC20,
    pDai: {} as PToken,
    variableDebtDai: {} as VariableDebtToken,
    pUsdc: {} as PToken,
    usdc: {} as MintableERC20,
    usdt: {} as MintableERC20,
    nBAYC: {} as NToken,
    nMOONBIRD: {} as NTokenMoonBirds,
    bayc: {} as MintableERC721,
    addressesProvider: {} as PoolAddressesProvider,
    registry: {} as PoolAddressesProviderRegistry,
    aclManager: {} as ACLManager,
    cryptoPunksMarket: {} as CryptoPunksMarket,
    wPunk: {} as WPunk,
    nWPunk: {} as NToken,
    wBTC: {} as MintableERC20,
    stETH: {} as StETH,
    pstETH: {} as PTokenStETH,
    ape: {} as MintableERC20,
    mayc: {} as MintableERC721,
    doodles: {} as MintableERC721,
    mockTokenFaucet: {} as MockTokenFaucet,
    wPunkGateway: {} as WPunkGateway,
    wETHGateway: {} as WETHGateway,
    conduitController: {} as ConduitController,
    pausableZoneController: {} as PausableZoneController,
    conduitKey: {} as string,
    conduit: {} as Conduit,
    pausableZone: {} as PausableZone,
    seaport: {} as Seaport,
    looksRareExchange: {} as LooksRareExchange,
    strategyStandardSaleForFixedPrice: {} as StrategyStandardSaleForFixedPrice,
    transferManagerERC721: {} as TransferManagerERC721,
    x2y2r1: {} as X2Y2R1,
    erc721Delegate: {} as ERC721Delegate,
    moonbirds: {} as Moonbirds,
    nftFloorOracle: {} as NFTFloorOracle,
  } as TestEnv;
  const [_deployer, ...restSigners] = await getEthersSigners();
  const deployer: SignerWithAddress = {
    address: await _deployer.getAddress(),
    signer: _deployer,
  };

  for (const signer of restSigners) {
    testEnv.users.push({
      signer,
      address: await signer.getAddress(),
    });
  }
  testEnv.deployer = deployer;
  testEnv.poolAdmin = deployer;
  testEnv.assetListingAdmin = deployer;
  testEnv.emergencyAdmin =
    testEnv.users[ParaSpaceConfig.EmergencyAdminIndex - 1]; // -1 is because we removed deployer from testEnv.users
  testEnv.riskAdmin = testEnv.users[ParaSpaceConfig.RiskAdminIndex - 1]; // -1 is because we removed deployer from testEnv.users
  testEnv.gatewayAdmin = testEnv.users[ParaSpaceConfig.GatewayAdminIndex - 1]; // -1 is because we removed deployer from testEnv.users

  testEnv.pool = await getPoolProxy();
  testEnv.configurator = await getPoolConfiguratorProxy();
  testEnv.poolDataProvider = await getUiPoolDataProvider();

  testEnv.addressesProvider = await getPoolAddressesProvider();

  testEnv.registry = await getPoolAddressesProviderRegistry();
  testEnv.aclManager = await getACLManager();

  testEnv.oracle = await getPriceOracle();
  testEnv.paraspaceOracle = await getParaSpaceOracle();

  testEnv.protocolDataProvider = await getProtocolDataProvider();

  testEnv.mockTokenFaucet = await getMockTokenFaucet();

  testEnv.conduitController = await getConduitController();
  testEnv.conduit = await getConduit();
  testEnv.conduitKey = await getConduitKey();
  testEnv.pausableZoneController = await getPausableZoneController();
  testEnv.pausableZone = await getPausableZone();
  testEnv.seaport = await getSeaport();

  testEnv.looksRareExchange = await getLooksRareExchange();
  testEnv.strategyStandardSaleForFixedPrice =
    await getStrategyStandardSaleForFixedPrice();
  testEnv.transferManagerERC721 = await getTransferManagerERC721();

  testEnv.x2y2r1 = await getX2Y2R1();
  testEnv.erc721Delegate = await getERC721Delegate();

  const allTokens = await testEnv.protocolDataProvider.getAllXTokens();

  const pDaiAddress = allTokens.find(
    (xToken) => xToken.symbol === PTokenContractId.pDAI
  )?.tokenAddress;
  const pUsdcAddress = allTokens.find(
    (xToken) => xToken.symbol === PTokenContractId.pUSDC
  )?.tokenAddress;

  const pWEthAddress = allTokens.find(
    (xToken) => xToken.symbol === PTokenContractId.pWETH
  )?.tokenAddress;

  const paWEthAddress = allTokens.find(
    (xToken) => xToken.symbol === PTokenContractId.paWETH
  )?.tokenAddress;

  const pstEthAddress = allTokens.find(
    (xToken) => xToken.symbol === PTokenContractId.pstETH
  )?.tokenAddress;

  const nBAYCAddress = allTokens.find(
    (xToken) => xToken.symbol === NTokenContractId.nBAYC
  )?.tokenAddress;

  const nMAYCAddress = allTokens.find(
    (xToken) => xToken.symbol === NTokenContractId.nMAYC
  )?.tokenAddress;

  const nDOODLESAddress = allTokens.find(
    (xToken) => xToken.symbol === NTokenContractId.nDOODLES
  )?.tokenAddress;

  const nWPunkAddress = allTokens.find(
    (xToken) => xToken.symbol === NTokenContractId.nWPUNKS
  )?.tokenAddress;

  const nMOONBIRDAddress = allTokens.find(
    (xToken) => xToken.symbol === NTokenContractId.nMOONBIRD
  )?.tokenAddress;

  const nUniwapV3Address = allTokens.find(
    (xToken) => xToken.symbol === NTokenContractId.nUniswapV3
  )?.tokenAddress;

  const reservesTokens =
    await testEnv.protocolDataProvider.getAllReservesTokens();

  const daiAddress = reservesTokens.find(
    (token) => token.symbol === ERC20TokenContractId.DAI
  )?.tokenAddress;

  const {variableDebtTokenAddress: variableDebtDaiAddress} =
    await testEnv.protocolDataProvider.getReserveTokensAddresses(
      daiAddress || ""
    );

  const usdcAddress = reservesTokens.find(
    (token) => token.symbol === ERC20TokenContractId.USDC
  )?.tokenAddress;
  const usdtAddress = reservesTokens.find(
    (token) => token.symbol === ERC20TokenContractId.USDT
  )?.tokenAddress;
  const wethAddress = reservesTokens.find(
    (token) => token.symbol === ERC20TokenContractId.WETH
  )?.tokenAddress;

  const aWETHAddress = reservesTokens.find(
    (token) => token.symbol === ERC20TokenContractId.aWETH
  )?.tokenAddress;
  const baycAddress = reservesTokens.find(
    (token) => token.symbol === ERC721TokenContractId.BAYC
  )?.tokenAddress;
  const punkAddress = reservesTokens.find(
    (token) => token.symbol === eContractid.CryptoPunksMarket
  )?.tokenAddress;

  const wpunkAddress = reservesTokens.find(
    (token) => token.symbol === ERC721TokenContractId.WPUNKS
  )?.tokenAddress;
  const wBTCAddress = reservesTokens.find(
    (token) => token.symbol === ERC20TokenContractId.WBTC
  )?.tokenAddress;
  const stETHAddress = reservesTokens.find(
    (token) => token.symbol === ERC20TokenContractId.stETH
  )?.tokenAddress;
  const apeAddress = reservesTokens.find(
    (token) => token.symbol === ERC20TokenContractId.APE
  )?.tokenAddress;
  const maycAddress = reservesTokens.find(
    (token) => token.symbol === ERC721TokenContractId.MAYC
  )?.tokenAddress;
  const doodlesAddress = reservesTokens.find(
    (token) => token.symbol === ERC721TokenContractId.DOODLE
  )?.tokenAddress;
  const moonbirdsAddress = reservesTokens.find(
    (token) => token.symbol === ERC721TokenContractId.MOONBIRD
  )?.tokenAddress;

  if (!pDaiAddress || !pWEthAddress || !nBAYCAddress) {
    process.exit(1);
  }
  if (!daiAddress || !usdcAddress || !wethAddress || !baycAddress) {
    process.exit(1);
  }

  testEnv.pDai = await getPToken(pDaiAddress);
  testEnv.variableDebtDai = await getVariableDebtToken(variableDebtDaiAddress);
  testEnv.pUsdc = await getPToken(pUsdcAddress);
  testEnv.pWETH = await getPToken(pWEthAddress);
  testEnv.paWETH = await getPTokenAToken(paWEthAddress);
  testEnv.pstETH = await getPTokenStETH(pstEthAddress);

  testEnv.nBAYC = await getNToken(nBAYCAddress);
  testEnv.nMAYC = await getNToken(nMAYCAddress);
  testEnv.nDOODLES = await getNToken(nDOODLESAddress);

  testEnv.nMOONBIRD = await getNTokenMoonBirds(nMOONBIRDAddress);

  testEnv.dai = await getMintableERC20(daiAddress);
  testEnv.usdc = await getMintableERC20(usdcAddress);
  testEnv.usdt = await getMintableERC20(usdtAddress);

  testEnv.weth = await getWETHMocked(wethAddress);

  testEnv.bayc = await getMintableERC721(baycAddress);

  testEnv.nWPunk = await getNToken(nWPunkAddress);
  testEnv.cryptoPunksMarket = await getCryptoPunksMarket(punkAddress);
  testEnv.wPunk = await getWPunk(wpunkAddress);
  testEnv.wPunkGateway = await getWPunkGatewayProxy();
  testEnv.wETHGateway = await getWETHGatewayProxy();

  testEnv.wBTC = await getMintableERC20(wBTCAddress);
  testEnv.stETH = await getStETH(stETHAddress);
  testEnv.aWETH = await getMockAToken(aWETHAddress);
  testEnv.ape = await getMintableERC20(apeAddress);
  testEnv.mayc = await getMintableERC721(maycAddress);
  testEnv.doodles = await getMintableERC721(doodlesAddress);
  testEnv.moonbirds = await getMoonBirds(moonbirdsAddress);
  testEnv.uniswapV3Factory = await getUniswapV3Factory();
  testEnv.nftPositionManager = await getNonfungiblePositionManager();
  testEnv.nUniswapV3 = await getNTokenUniswapV3(nUniwapV3Address);
  testEnv.nftFloorOracle = await getNFTFloorOracle();
  return testEnv;
}
