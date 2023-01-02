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
  getWETH,
  getVariableDebtToken,
  getParaSpaceOracle,
  getACLManager,
  getMintableERC721,
  getWPunk,
  getPunks,
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
  getNTokenBAYC,
  getNTokenMAYC,
  getApeCoinStaking,
  getBlurExchangeProxy,
  getExecutionDelegate,
  getSeaportAdapter,
  getLooksRareAdapter,
  getX2Y2Adapter,
  getBlurAdapter,
  getNTokenBAKC,
} from "../../helpers/contracts-getters";
import {
  eContractid,
  ERC20TokenContractId,
  ERC721TokenContractId,
  NTokenContractId,
  PTokenContractId,
  tEthereumAddress,
} from "../../helpers/types";
import {
  ApeCoinStaking,
  ATokenDebtToken,
  BlurAdapter,
  BlurExchange,
  Conduit,
  ERC721Delegate,
  ExecutionDelegate,
  IPool,
  LooksRareAdapter,
  NFTFloorOracle,
  NTokenBAKC,
  NTokenBAYC,
  NTokenMAYC,
  NTokenMoonBirds,
  NTokenUniswapV3,
  PausableZone,
  PausableZoneController,
  SeaportAdapter,
  StETHDebtToken,
  UiPoolDataProvider,
  X2Y2Adapter,
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
import {getEthersSigners} from "../../helpers/contracts-helpers";
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
  Moonbirds,
  UniswapV3Factory,
  INonfungiblePositionManager,
  StETHMocked,
  MockAToken,
  PTokenAToken,
  PTokenStETH,
} from "../../types";
import {MintableERC721} from "../../types";
import {Signer} from "ethers";
import {getParaSpaceConfig} from "../../helpers/misc-utils";

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
  variableDebtStETH: StETHDebtToken;
  variableDebtAWeth: ATokenDebtToken;
  variableDebtWeth: VariableDebtToken;
  pUsdc: PToken;
  usdc: MintableERC20;
  usdt: MintableERC20;
  nBAYC: NTokenBAYC;
  bayc: MintableERC721;
  addressesProvider: PoolAddressesProvider;
  registry: PoolAddressesProviderRegistry;
  aclManager: ACLManager;
  punks: CryptoPunksMarket;
  wPunk: WPunk;
  nWPunk: NToken;
  wBTC: MintableERC20;
  stETH: StETHMocked;
  pstETH: PTokenStETH;
  ape: MintableERC20;
  nMAYC: NTokenMAYC;
  mayc: MintableERC721;
  nDOODLE: NToken;
  doodles: MintableERC721;
  bakc: MintableERC721;
  nBAKC: NTokenBAKC;
  mockTokenFaucet: MockTokenFaucet;
  wPunkGateway: WPunkGateway;
  wETHGateway: WETHGateway;
  conduitController: ConduitController;
  pausableZoneController: PausableZoneController;
  conduitKey: string;
  conduit: Conduit;
  pausableZone: PausableZone;
  seaport: Seaport;
  seaportAdapter: SeaportAdapter;
  looksRareExchange: LooksRareExchange;
  looksRareAdapter: LooksRareAdapter;
  strategyStandardSaleForFixedPrice: StrategyStandardSaleForFixedPrice;
  transferManagerERC721: TransferManagerERC721;
  x2y2r1: X2Y2R1;
  x2y2Adapter: X2Y2Adapter;
  erc721Delegate: ERC721Delegate;
  moonbirds: Moonbirds;
  nMOONBIRD: NTokenMoonBirds;
  uniswapV3Factory: UniswapV3Factory;
  nftPositionManager: INonfungiblePositionManager;
  nUniswapV3: NTokenUniswapV3;
  nftFloorOracle: NFTFloorOracle;
  apeCoinStaking: ApeCoinStaking;
  executionDelegate: ExecutionDelegate;
  blurExchange: BlurExchange;
  blurAdapter: BlurAdapter;
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
    variableDebtWeth: {} as VariableDebtToken,
    pUsdc: {} as PToken,
    usdc: {} as MintableERC20,
    usdt: {} as MintableERC20,
    nBAYC: {} as NTokenBAYC,
    nMOONBIRD: {} as NTokenMoonBirds,
    nBAKC: {} as NTokenBAKC,
    bayc: {} as MintableERC721,
    addressesProvider: {} as PoolAddressesProvider,
    registry: {} as PoolAddressesProviderRegistry,
    aclManager: {} as ACLManager,
    punks: {} as CryptoPunksMarket,
    wPunk: {} as WPunk,
    nWPunk: {} as NToken,
    wBTC: {} as MintableERC20,
    stETH: {} as StETHMocked,
    pstETH: {} as PTokenStETH,
    ape: {} as MintableERC20,
    mayc: {} as MintableERC721,
    doodles: {} as MintableERC721,
    bakc: {} as MintableERC721,
    mockTokenFaucet: {} as MockTokenFaucet,
    wPunkGateway: {} as WPunkGateway,
    wETHGateway: {} as WETHGateway,
    conduitController: {} as ConduitController,
    pausableZoneController: {} as PausableZoneController,
    conduitKey: {} as string,
    conduit: {} as Conduit,
    pausableZone: {} as PausableZone,
    seaport: {} as Seaport,
    seaportAdapter: {} as SeaportAdapter,
    looksRareExchange: {} as LooksRareExchange,
    looksRareAdapter: {} as LooksRareAdapter,
    strategyStandardSaleForFixedPrice: {} as StrategyStandardSaleForFixedPrice,
    transferManagerERC721: {} as TransferManagerERC721,
    x2y2r1: {} as X2Y2R1,
    x2y2Adapter: {} as X2Y2Adapter,
    erc721Delegate: {} as ERC721Delegate,
    moonbirds: {} as Moonbirds,
    nftFloorOracle: {} as NFTFloorOracle,
    executionDelegate: {} as ExecutionDelegate,
    blurExchange: {} as BlurExchange,
    blurAdapter: {} as BlurAdapter,
  } as TestEnv;
  const paraSpaceConfig = getParaSpaceConfig();
  const signers = await Promise.all(
    (
      await getEthersSigners()
    ).map(async (signer) => ({
      signer,
      address: await signer.getAddress(),
    }))
  );
  const [deployer, ...restSigners] = signers;
  testEnv.users = restSigners;
  testEnv.deployer = deployer;
  testEnv.poolAdmin = signers[paraSpaceConfig.ParaSpaceAdminIndex];
  testEnv.assetListingAdmin = signers[paraSpaceConfig.ParaSpaceAdminIndex];
  testEnv.emergencyAdmin = signers[paraSpaceConfig.EmergencyAdminIndex];
  testEnv.riskAdmin = signers[paraSpaceConfig.RiskAdminIndex];
  testEnv.gatewayAdmin = signers[paraSpaceConfig.GatewayAdminIndex];

  testEnv.pool = await getPoolProxy();
  testEnv.configurator = (await getPoolConfiguratorProxy()).connect(
    testEnv.poolAdmin.signer
  );
  testEnv.poolDataProvider = await getUiPoolDataProvider();

  testEnv.addressesProvider = (await getPoolAddressesProvider()).connect(
    testEnv.poolAdmin.signer
  );

  testEnv.registry = (await getPoolAddressesProviderRegistry()).connect(
    testEnv.poolAdmin.signer
  );
  testEnv.aclManager = (await getACLManager()).connect(
    testEnv.poolAdmin.signer
  );

  testEnv.oracle = await getPriceOracle();
  testEnv.paraspaceOracle = (await getParaSpaceOracle()).connect(
    testEnv.poolAdmin.signer
  );

  testEnv.protocolDataProvider = await getProtocolDataProvider();

  testEnv.mockTokenFaucet = await getMockTokenFaucet();

  testEnv.conduitController = await getConduitController();
  testEnv.conduit = await getConduit();
  testEnv.conduitKey = await getConduitKey();
  testEnv.pausableZoneController = await getPausableZoneController();
  testEnv.pausableZone = await getPausableZone();
  testEnv.seaport = await getSeaport();
  testEnv.seaportAdapter = await getSeaportAdapter();

  testEnv.looksRareExchange = await getLooksRareExchange();
  testEnv.looksRareAdapter = await getLooksRareAdapter();
  testEnv.strategyStandardSaleForFixedPrice =
    await getStrategyStandardSaleForFixedPrice();
  testEnv.transferManagerERC721 = await getTransferManagerERC721();

  testEnv.x2y2r1 = await getX2Y2R1();
  testEnv.x2y2Adapter = await getX2Y2Adapter();
  testEnv.erc721Delegate = await getERC721Delegate();

  testEnv.apeCoinStaking = await getApeCoinStaking();

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

  const nDOODLEAddress = allTokens.find(
    (xToken) => xToken.symbol === NTokenContractId.nDOODLE
  )?.tokenAddress;

  const nBAKCAddress = allTokens.find(
    (xToken) => xToken.symbol === NTokenContractId.nBAKC
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

  const {variableDebtTokenAddress: variableDebtWethAddress} =
    await testEnv.protocolDataProvider.getReserveTokensAddresses(
      wethAddress || ""
    );

  const aWETHAddress = reservesTokens.find(
    (token) => token.symbol === ERC20TokenContractId.aWETH
  )?.tokenAddress;
  const {variableDebtTokenAddress: variableDebtAWethAddress} =
    await testEnv.protocolDataProvider.getReserveTokensAddresses(
      aWETHAddress || ""
    );
  const baycAddress = reservesTokens.find(
    (token) => token.symbol === ERC721TokenContractId.BAYC
  )?.tokenAddress;
  const punksAddress = reservesTokens.find(
    (token) => token.symbol === eContractid.PUNKS
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

  const {variableDebtTokenAddress: variableDebtStETHAddress} =
    await testEnv.protocolDataProvider.getReserveTokensAddresses(
      stETHAddress || ""
    );

  const apeAddress = reservesTokens.find(
    (token) => token.symbol === ERC20TokenContractId.APE
  )?.tokenAddress;
  const maycAddress = reservesTokens.find(
    (token) => token.symbol === ERC721TokenContractId.MAYC
  )?.tokenAddress;
  const doodlesAddress = reservesTokens.find(
    (token) => token.symbol === ERC721TokenContractId.DOODLE
  )?.tokenAddress;
  const bakcAddress = reservesTokens.find(
    (token) => token.symbol === ERC721TokenContractId.BAKC
  )?.tokenAddress;
  const moonbirdsAddress = reservesTokens.find(
    (token) => token.symbol === ERC721TokenContractId.MOONBIRD
  )?.tokenAddress;

  if (!pDaiAddress || !pWEthAddress || !nBAYCAddress) {
    console.error("no pDAI|pWETH|nBAYC address");
    process.exit(1);
  }
  if (!daiAddress || !usdcAddress || !wethAddress || !baycAddress) {
    console.error("no DAI|USDC|WETH|BAYC address");
    process.exit(1);
  }

  testEnv.pDai = await getPToken(pDaiAddress);
  testEnv.variableDebtDai = await getVariableDebtToken(variableDebtDaiAddress);
  testEnv.variableDebtWeth = await getVariableDebtToken(
    variableDebtWethAddress
  );
  testEnv.pUsdc = await getPToken(pUsdcAddress);
  testEnv.pWETH = await getPToken(pWEthAddress);
  testEnv.paWETH = await getPTokenAToken(paWEthAddress);
  testEnv.pstETH = await getPTokenStETH(pstEthAddress);
  testEnv.variableDebtStETH = await getVariableDebtToken(
    variableDebtStETHAddress
  );
  testEnv.variableDebtAWeth = await getVariableDebtToken(
    variableDebtAWethAddress
  );

  testEnv.nBAYC = await getNTokenBAYC(nBAYCAddress);
  testEnv.nMAYC = await getNTokenMAYC(nMAYCAddress);
  testEnv.nDOODLE = await getNToken(nDOODLEAddress);
  testEnv.nBAKC = await getNTokenBAKC(nBAKCAddress);

  testEnv.nMOONBIRD = await getNTokenMoonBirds(nMOONBIRDAddress);

  testEnv.dai = await getMintableERC20(daiAddress);
  testEnv.usdc = await getMintableERC20(usdcAddress);
  testEnv.usdt = await getMintableERC20(usdtAddress);

  testEnv.weth = await getWETH(wethAddress);

  testEnv.bayc = await getMintableERC721(baycAddress);

  testEnv.nWPunk = await getNToken(nWPunkAddress);
  testEnv.punks = await getPunks(punksAddress);
  testEnv.wPunk = await getWPunk(wpunkAddress);
  testEnv.wPunkGateway = await getWPunkGatewayProxy();
  testEnv.wETHGateway = await getWETHGatewayProxy();

  testEnv.wBTC = await getMintableERC20(wBTCAddress);
  testEnv.stETH = await getStETH(stETHAddress);
  testEnv.aWETH = await getMockAToken(aWETHAddress);
  testEnv.ape = await getMintableERC20(apeAddress);
  testEnv.mayc = await getMintableERC721(maycAddress);
  testEnv.doodles = await getMintableERC721(doodlesAddress);
  testEnv.bakc = await getMintableERC721(bakcAddress);
  testEnv.moonbirds = await getMoonBirds(moonbirdsAddress);
  testEnv.uniswapV3Factory = await getUniswapV3Factory();
  testEnv.nftPositionManager = await getNonfungiblePositionManager();
  testEnv.nUniswapV3 = (await getNTokenUniswapV3(nUniwapV3Address)).connect(
    testEnv.poolAdmin.signer
  );
  testEnv.nftFloorOracle = (await getNFTFloorOracle()).connect(
    testEnv.poolAdmin.signer
  );
  testEnv.executionDelegate = await getExecutionDelegate();
  testEnv.blurExchange = await getBlurExchangeProxy();
  testEnv.blurAdapter = await getBlurAdapter();

  return testEnv;
}
