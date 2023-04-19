import {ZERO_ADDRESS} from "../helpers/constants";
import {
  eEthereumNetwork,
  ERC20TokenContractId,
  IParaSpaceConfiguration,
} from "../helpers/types";
import {MocksConfig} from "./mocks";
import {
  ArbitrumOneOracleConfig,
  MainnetOracleConfig,
  MoonbeamOracleConfig,
  TestnetOracleConfig,
} from "./oracle";
import {
  strategyDAI,
  strategyUSDC,
  strategyUSDT,
  strategyWETH,
  strategyBAYC,
  strategyWPunks,
  strategyAPE,
  strategyWBTC,
  strategySTETH,
  strategyMAYC,
  strategyDoodles,
  strategyAWETH,
  strategyCETH,
  strategyPUNK,
  strategyMoonbird,
  strategyAzuki,
  strategyOthr,
  strategyUniswapV3,
  strategyClonex,
  strategyMeebits,
  strategySAPE,
  strategyCAPE,
  strategyYAPE,
  strategyXCDOT,
  strategyWGLMR,
  strategyBAKC,
  strategyWSTETH,
  strategySEWER,
  strategyPudgyPenguins,
  strategyBLUR,
  strategyCBETH,
  strategyASTETH,
  strategyAWSTETH,
  strategyRETH,
  strategyBENDETH,
  strategyFRAX,
  strategyStakefishValidator,
  strategyBEANZ,
  strategyDEGODS,
  strategyEXP,
  strategyVSL,
  strategyKODA,
  strategyBLOCKS,
} from "./reservesConfigs";

export const CommonConfig: Pick<
  IParaSpaceConfiguration,
  | "WrappedNativeTokenId"
  | "MarketId"
  | "PTokenNamePrefix"
  | "VariableDebtTokenNamePrefix"
  | "SymbolPrefix"
  | "ProviderId"
  | "AuctionRecoveryHealthFactor"
  | "ParaSpaceAdmin"
  | "EmergencyAdmins"
  | "RiskAdmin"
  | "GatewayAdmin"
  | "ParaSpaceAdminIndex"
  | "EmergencyAdminIndex"
  | "RiskAdminIndex"
  | "GatewayAdminIndex"
  | "Mocks"
  | "Oracle"
  | "HotWallet"
  | "StakefishManager"
> = {
  WrappedNativeTokenId: ERC20TokenContractId.WETH,
  MarketId: "ParaSpaceMM",
  PTokenNamePrefix: "ParaSpace Derivative Token",
  VariableDebtTokenNamePrefix: "ParaSpace Variable Debt Token",
  SymbolPrefix: "",
  ProviderId: 1,
  AuctionRecoveryHealthFactor: "1500000000000000000",
  // ACL CONFIGURATION
  ParaSpaceAdmin: undefined,
  EmergencyAdmins: [],
  RiskAdmin: undefined,
  GatewayAdmin: undefined,
  ParaSpaceAdminIndex: 4, // ACL Admin, Pool Admin, Asset Listing Admin
  EmergencyAdminIndex: 3, // Emergency Admin, >1 is a must to make tests pass
  RiskAdminIndex: 2, // Risk Admin, >1 is a must to make tests pass
  GatewayAdminIndex: 1, // Gateway Admin, for polkadot evm only 5 accounts initialized
  // MOCKS
  Mocks: MocksConfig,
  // Oracle
  Oracle: TestnetOracleConfig,
  HotWallet: undefined,
  StakefishManager: undefined,
};

export const HardhatParaSpaceConfig: IParaSpaceConfiguration = {
  // BASIC INFO
  ...CommonConfig,
  ParaSpaceTeam: "0xc783df8a850f42e7F7e57013759C285caa701eB6",
  Treasury: "0xc783df8a850f42e7F7e57013759C285caa701eB6",
  IncentivesController: ZERO_ADDRESS,
  Tokens: {
    sAPE: "0x0000000000000000000000000000000000000001",
  },
  YogaLabs: {},
  Uniswap: {},
  Marketplace: {},
  Chainlink: {},
  BendDAO: {},
  // RESERVE ASSETS - CONFIG, ASSETS, BORROW RATES,
  ReservesConfig: {
    DAI: strategyDAI,
    USDC: strategyUSDC,
    USDT: strategyUSDT,
    FRAX: strategyFRAX,
    WETH: strategyWETH,
    APE: strategyAPE,
    WBTC: strategyWBTC,
    stETH: strategySTETH,
    wstETH: strategyWSTETH,
    aWETH: strategyAWETH,
    cETH: strategyCETH,
    PUNK: strategyPUNK,
    BLUR: strategyBLUR,
    DOODLE: strategyDoodles,
    BAYC: strategyBAYC,
    MAYC: strategyMAYC,
    WPUNKS: strategyWPunks,
    MOONBIRD: strategyMoonbird,
    MEEBITS: strategyMeebits,
    AZUKI: strategyAzuki,
    OTHR: strategyOthr,
    CLONEX: strategyClonex,
    UniswapV3: strategyUniswapV3,
    sAPE: strategySAPE,
    cAPE: strategyCAPE,
    yAPE: strategyYAPE,
    BAKC: strategyBAKC,
    SEWER: strategySEWER,
    PPG: strategyPudgyPenguins,
    SFVLDR: strategyStakefishValidator,
  },
  DelegationRegistry: ZERO_ADDRESS,
};

export const MoonbeamParaSpaceConfig: IParaSpaceConfiguration = {
  // BASIC INFO
  ...CommonConfig,
  WrappedNativeTokenId: ERC20TokenContractId.WGLMR,
  ParaSpaceTeam: "0x018281853eCC543Aa251732e8FDaa7323247eBeB",
  Treasury: "0x018281853eCC543Aa251732e8FDaa7323247eBeB",
  IncentivesController: ZERO_ADDRESS,
  ParaSpaceAdmin: "0x018281853eCC543Aa251732e8FDaa7323247eBeB",
  EmergencyAdmins: ["0x018281853eCC543Aa251732e8FDaa7323247eBeB"],
  RiskAdmin: "0x018281853eCC543Aa251732e8FDaa7323247eBeB",
  GatewayAdmin: "0x018281853eCC543Aa251732e8FDaa7323247eBeB",
  Tokens: {
    WGLMR: "0xAcc15dC74880C9944775448304B263D191c6077F",
    xcDOT: "0xFfFFfFff1FcaCBd218EDc0EbA20Fc2308C778080",
    USDC: "0x818ec0A7Fe18Ff94269904fCED6AE3DaE6d6dC0b",
  },
  YogaLabs: {},
  Uniswap: {},
  Marketplace: {},
  BendDAO: {},
  Chainlink: {
    WGLMR: "0x4497B606be93e773bbA5eaCFCb2ac5E2214220Eb",
    xcDOT: "0x1466b4bD0C4B6B8e1164991909961e0EE6a66d8c",
    USDC: "0xA122591F60115D63421f66F752EF9f6e0bc73abC",
  },
  // RESERVE ASSETS - CONFIG, ASSETS, BORROW RATES,
  ReservesConfig: {
    xcDOT: strategyXCDOT,
    WGLMR: strategyWGLMR,
    USDC: strategyUSDC,
  },
  Oracle: MoonbeamOracleConfig,
  DelegationRegistry: ZERO_ADDRESS,
};

export const GoerliParaSpaceConfig: IParaSpaceConfiguration = {
  // BASIC INFO
  ...CommonConfig,
  ParaSpaceTeam: "0x018281853eCC543Aa251732e8FDaa7323247eBeB",
  Treasury: "0x018281853eCC543Aa251732e8FDaa7323247eBeB",
  IncentivesController: ZERO_ADDRESS,
  ParaSpaceAdmin: "0x018281853eCC543Aa251732e8FDaa7323247eBeB",
  EmergencyAdmins: ["0x018281853eCC543Aa251732e8FDaa7323247eBeB"],
  RiskAdmin: "0x018281853eCC543Aa251732e8FDaa7323247eBeB",
  GatewayAdmin: "0x018281853eCC543Aa251732e8FDaa7323247eBeB",
  Tokens: {
    APE: "0x328507DC29C95c170B56a1b3A758eB7a9E73455c",
    BAYC: "0xF40299b626ef6E197F5d9DE9315076CAB788B6Ef",
    MAYC: "0x3f228cBceC3aD130c45D21664f2C7f5b23130d23",
    sAPE: "0x0000000000000000000000000000000000000001",
    WETH: "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6",
    aWETH: "0x7649e0d153752c556b8b23DB1f1D3d42993E83a5",
    bendETH: "0x57FEbd640424C85b72b4361fE557a781C8d2a509",
    UniswapV3: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
    PPG: "0xf140558cA4d4e10f63661504D4F3f74FADDDe3E8",
    SEWER: "0x3aa026cd539fa1f6ae58ae238a10e2f1cf831454",
    SFVLDR: "0x5b41ffb9c448c02ff3d0401b0374b67efcb73c7e",
  },
  YogaLabs: {
    ApeCoinStaking: "0xeF37717B1807a253c6D140Aca0141404D23c26D4",
    BAKC: "0xd60d682764Ee04e54707Bee7B564DC65b31884D0",
  },
  Uniswap: {
    V2Factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
    V2Router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    V3Factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    V3Router: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    V3NFTPositionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  },
  Marketplace: {
    Seaport: "0x00000000006c3852cbEf3e08E8dF289169EdE581",
  },
  BendDAO: {
    LendingPool: "0x84a47EaEca69f8B521C21739224251c8c4566Bbc",
    LendingPoolLoan: "0x7F64c32a3c13Bd245a7141a607A7E60DA585BA86",
  },
  Chainlink: {
    WETH: "0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e",
    BAYC: "0xB677bfBc9B09a3469695f40477d05bc9BcB15F50",
    MAYC: "0xCbDcc8788019226d09FcCEb4C727C48A062D8124",
    CLONEX: "0xE42f272EdF974e9c70a6d38dCb47CAB2A28CED3F",
    WPUNKS: "0x5c13b249846540F81c093Bc342b5d963a7518145",
    DOODLE: "0xEDA76D1C345AcA04c6910f5824EC337C8a8F36d2",
    AZUKI: "0x9F6d70CDf08d893f0063742b51d3E9D1e18b7f74",
  },
  // RESERVE ASSETS - CONFIG, ASSETS, BORROW RATES,
  ReservesConfig: {
    DAI: strategyDAI,
    USDC: strategyUSDC,
    USDT: strategyUSDT,
    FRAX: strategyFRAX,
    WETH: strategyWETH,
    APE: strategyAPE,
    WBTC: strategyWBTC,
    stETH: strategySTETH,
    wstETH: strategyWSTETH,
    aWETH: strategyAWETH,
    bendETH: strategyBENDETH,
    cbETH: strategyCBETH,
    rETH: strategyRETH,
    astETH: strategyASTETH,
    awstETH: strategyAWSTETH,
    cETH: strategyCETH,
    PUNK: strategyPUNK,
    BLUR: strategyBLUR,
    DOODLE: strategyDoodles,
    BAYC: strategyBAYC,
    MAYC: strategyMAYC,
    WPUNKS: strategyWPunks,
    MOONBIRD: strategyMoonbird,
    MEEBITS: strategyMeebits,
    AZUKI: strategyAzuki,
    OTHR: strategyOthr,
    CLONEX: strategyClonex,
    UniswapV3: strategyUniswapV3,
    sAPE: strategySAPE,
    cAPE: strategyCAPE,
    yAPE: strategyYAPE,
    BAKC: strategyBAKC,
    SEWER: strategySEWER,
    PPG: strategyPudgyPenguins,
    SFVLDR: strategyStakefishValidator,
    BEANZ: strategyBEANZ,
    DEGODS: strategyDEGODS,
    EXP: strategyEXP,
    VSL: strategyVSL,
    KODA: strategyKODA,
    BLOCKS: strategyBLOCKS,
  },
  StakefishManager: "0x5b41ffb9c448c02ff3d0401b0374b67efcb73c7e",
  DelegationRegistry: "0x00000000000076A84feF008CDAbe6409d2FE638B",
};

export const ArbitrumOneParaSpaceConfig: IParaSpaceConfiguration = {
  // BASIC INFO
  ...CommonConfig,
  ParaSpaceAdmin: "0x17816E9A858b161c3E37016D139cf618056CaCD4",
  IncentivesController: ZERO_ADDRESS,
  EmergencyAdmins: [
    "0x17816E9A858b161c3E37016D139cf618056CaCD4",
    "0x69FAD68De47D5666Ad668C7D682dDb8FD6322949",
    "0xD65Fee206a4ea89eBBcF4694E745C597AB6F8325",
    "0x755C1bd877788739dD002B98B093c4852AbfA6c4",
    "0x3A6c796edffc057d789F7d4ffAd438B1D48f3075",
    "0x2f2d07d60ea7330DD2314f4413CCbB2dC25276EF",
    "0x001e2bcC5c1BfC3131d33Ba074B12c2F1237FB04",
    "0xe965198731CDdB2f06e91DD0CDff74b71e4b3714",
    "0x4AC3fD073786a971e1B8dE5a526959c9B3B2B407",
  ],
  RiskAdmin: "0x17816E9A858b161c3E37016D139cf618056CaCD4",
  GatewayAdmin: "0x17816E9A858b161c3E37016D139cf618056CaCD4",
  ParaSpaceTeam: "0x17816E9A858b161c3E37016D139cf618056CaCD4",
  Treasury: "0x17816E9A858b161c3E37016D139cf618056CaCD4",
  Tokens: {
    WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    wstETH: "0x5979D7b546E38E414F7E9822514be443A4800529",
    USDC: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
    DAI: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
    USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    FRAX: "0x17FC002b466eEc40DaE837Fc4bE5c67993ddBd6F",
    WBTC: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f",
    UniswapV3: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  },
  YogaLabs: {},
  Uniswap: {
    V3Factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    V3Router: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    V3NFTPositionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  },
  Marketplace: {},
  BendDAO: {},
  Chainlink: {
    WETH: "0x639fe6ab55c921f74e7fac1ee960c0b6293ba612",
    DAI: "0xc5c8e77b397e531b8ec06bfb0048328b30e9ecfb",
    USDC: "0x50834f3163758fcc1df9973b6e91f0f0f0434ad3",
    USDT: "0x3f3f5df88dc9f13eac63df89ec16ef6e7e25dde7",
    FRAX: "0x0809e3d38d1b4214958faf06d8b1b1a2b73f2ab8",
    WBTC: "0xd0c7101eacbb49f3decccc166d238410d6d46d57",
    ARB: "0x912CE59144191C1204E64559FE8253a0e49E6548",
    GMX: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a",
  },
  ReservesConfig: {
    DAI: strategyDAI,
    USDC: strategyUSDC,
    USDT: strategyUSDT,
    FRAX: strategyFRAX,
    WETH: strategyWETH,
    wstETH: strategyWSTETH,
    WBTC: strategyWBTC,
    UniswapV3: strategyUniswapV3,
  },
  Mocks: undefined,
  Oracle: ArbitrumOneOracleConfig,
  HotWallet: ZERO_ADDRESS,
  DelegationRegistry: ZERO_ADDRESS,
};

export const MainnetParaSpaceConfig: IParaSpaceConfiguration = {
  // BASIC INFO
  ...CommonConfig,
  ParaSpaceAdmin: "0xe965198731CDdB2f06e91DD0CDff74b71e4b3714",
  IncentivesController: ZERO_ADDRESS,
  EmergencyAdmins: [
    "0x17816E9A858b161c3E37016D139cf618056CaCD4",
    "0x69FAD68De47D5666Ad668C7D682dDb8FD6322949",
    "0xD65Fee206a4ea89eBBcF4694E745C597AB6F8325",
    "0x755C1bd877788739dD002B98B093c4852AbfA6c4",
    "0x3A6c796edffc057d789F7d4ffAd438B1D48f3075",
    "0x2f2d07d60ea7330DD2314f4413CCbB2dC25276EF",
    "0x001e2bcC5c1BfC3131d33Ba074B12c2F1237FB04",
    "0xe965198731CDdB2f06e91DD0CDff74b71e4b3714",
    "0x4AC3fD073786a971e1B8dE5a526959c9B3B2B407",
  ],
  RiskAdmin: "0xe965198731CDdB2f06e91DD0CDff74b71e4b3714",
  GatewayAdmin: "0xe965198731CDdB2f06e91DD0CDff74b71e4b3714",
  ParaSpaceTeam: "0xe965198731CDdB2f06e91DD0CDff74b71e4b3714",
  Treasury: "0xe965198731CDdB2f06e91DD0CDff74b71e4b3714",
  Tokens: {
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    stETH: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
    wstETH: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
    astETH: "0x1982b2f5814301d4e9a8b0201555376e62f82428",
    awstETH: "0x0B925eD163218f6662a35e0f0371Ac234f9E9371",
    bendETH: "0xeD1840223484483C0cb050E6fC344d1eBF0778a9",
    cbETH: "0xbe9895146f7af43049ca1c1ae358b0541ea49704",
    rETH: "0xae78736cd615f374d3085123a210448e74fc6393",
    aWETH: "0x030bA81f1c18d280636F32af80b9AAd02Cf0854e",
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    FRAX: "0x853d955acef822db058eb8505911ed77f175b99e",
    WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    APE: "0x4d224452801ACEd8B2F0aebE155379bb5D594381",
    BLUR: "0x5283D291DBCF85356A21bA090E6db59121208b44",
    BAYC: "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D",
    MAYC: "0x60E4d786628Fea6478F785A6d7e704777c86a7c6",
    PUNKS: "0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB",
    WPUNKS: "0xb7F7F6C52F2e2fdb1963Eab30438024864c313F6",
    DOODLE: "0x8a90CAb2b38dba80c64b7734e58Ee1dB38B8992e",
    MOONBIRD: "0x23581767a106ae21c074b2276d25e5c3e136a68b",
    MEEBITS: "0x7bd29408f11d2bfc23c34f18275bbf23bb716bc7",
    AZUKI: "0xed5af388653567af2f388e6224dc7c4b3241c544",
    OTHR: "0x34d85c9cdeb23fa97cb08333b511ac86e1c4e258",
    CLONEX: "0x49cf6f5d44e70224e2e23fdcdd2c053f30ada28b",
    sAPE: "0x0000000000000000000000000000000000000001",
    UniswapV3: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
    cETH: "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5",
    SEWER: "0x764AeebcF425d56800eF2c84F2578689415a2DAa",
    PPG: "0xbd3531da5cf5857e7cfaa92426877b022e612cf8",
    SFVLDR: "0xffff2d93c83d4c613ed68ca887f057651135e089",
    BEANZ: "0x306b1ea3ecdf94ab739f1910bbda052ed4a9f949",
    DEGODS: "0x8821bee2ba0df28761afff119d66390d594cd280",
    EXP: "0x790b2cf29ed4f310bf7641f013c65d4560d28371",
    VSL: "0x5b1085136a811e55b2bb2ca1ea456ba82126a376",
    KODA: "0xe012baf811cf9c05c408e879c399960d1f305903",
    BLOCKS: "0x059EDD72Cd353dF5106D2B9cC5ab83a52287aC3a",
  },
  YogaLabs: {
    ApeCoinStaking: "0x5954aB967Bc958940b7EB73ee84797Dc8a2AFbb9",
  },
  Uniswap: {
    V2Factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
    V2Router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    V3Factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    V3Router: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    V3NFTPositionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  },
  Marketplace: {
    Seaport: "0x00000000006c3852cbEf3e08E8dF289169EdE581",
  },
  BendDAO: {
    LendingPool: "0x70b97a0da65c15dfb0ffa02aee6fa36e507c2762",
    LendingPoolLoan: "0x5f6ac80CdB9E87f3Cfa6a90E5140B9a16A361d5C",
  },
  Chainlink: {
    WETH: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    stETH: "0x86392dC19c0b719886221c78AB11eb8Cf5c52812",
    astETH: "0x86392dC19c0b719886221c78AB11eb8Cf5c52812",
    wstETH: "0x1d05d899c3AC6CfA35D50c063325ccA39727c7c8",
    awstETH: "0x1d05d899c3AC6CfA35D50c063325ccA39727c7c8",
    cbETH: "0xf017fcb346a1885194689ba23eff2fe6fa5c483b",
    DAI: "0x773616E4d11A78F511299002da57A0a94577F1f4",
    USDC: "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4",
    USDT: "0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46",
    FRAX: "0x14d04fff8d21bd62987a5ce9ce543d2f1edf5d3e",
    WBTC: "0xdeb288F737066589598e9214E782fa5A8eD689e8",
    APE: "0xc7de7f4d4C9c991fF62a07D18b3E31e349833A18",
    sAPE: "0xc7de7f4d4C9c991fF62a07D18b3E31e349833A18",
    cAPE: "0xc7de7f4d4C9c991fF62a07D18b3E31e349833A18",
    yAPE: "0xc7de7f4d4C9c991fF62a07D18b3E31e349833A18",
    AZUKI: "0xA8B9A447C73191744D5B79BcE864F343455E1150",
    BAYC: "0x352f2Bc3039429fC2fe62004a1575aE74001CfcE",
    CLONEX: "0x021264d59DAbD26E7506Ee7278407891Bb8CDCCc",
    WPUNKS: "0x01B6710B01cF3dd8Ae64243097d91aFb03728Fdd",
    DOODLE: "0x027828052840a43Cc2D0187BcfA6e3D6AcE60336",
    MAYC: "0x1823C89715Fe3fB96A24d11c917aCA918894A090",
  },
  ReservesConfig: {
    DAI: strategyDAI,
    USDC: strategyUSDC,
    USDT: strategyUSDT,
    FRAX: strategyFRAX,
    WETH: strategyWETH,
    aWETH: strategyAWETH,
    bendETH: strategyBENDETH,
    stETH: strategySTETH,
    wstETH: strategyWSTETH,
    cbETH: strategyCBETH,
    rETH: strategyRETH,
    cETH: strategyCETH,
    astETH: strategyASTETH,
    awstETH: strategyAWSTETH,
    APE: strategyAPE,
    WBTC: strategyWBTC,
    BLUR: strategyBLUR,
    DOODLE: strategyDoodles,
    BAYC: strategyBAYC,
    MAYC: strategyMAYC,
    WPUNKS: strategyWPunks,
    MOONBIRD: strategyMoonbird,
    MEEBITS: strategyMeebits,
    AZUKI: strategyAzuki,
    OTHR: strategyOthr,
    CLONEX: strategyClonex,
    sAPE: strategySAPE,
    cAPE: strategyCAPE,
    yAPE: strategyYAPE,
    UniswapV3: strategyUniswapV3,
    BAKC: strategyBAKC,
    SEWER: strategySEWER,
    PPG: strategyPudgyPenguins,
    SFVLDR: strategyStakefishValidator,
    BEANZ: strategyBEANZ,
    DEGODS: strategyDEGODS,
    EXP: strategyEXP,
    VSL: strategyVSL,
    KODA: strategyKODA,
    BLOCKS: strategyBLOCKS,
  },
  Mocks: undefined,
  Oracle: MainnetOracleConfig,
  HotWallet: "0xC3AA9bc72Bd623168860a1e5c6a4530d3D80456c",
  StakefishManager: "0xffff2d93c83d4c613ed68ca887f057651135e089",
  DelegationRegistry: "0x00000000000076A84feF008CDAbe6409d2FE638B",
};

export const ParaSpaceConfigs: Partial<
  Record<eEthereumNetwork, IParaSpaceConfiguration>
> = {
  [eEthereumNetwork.hardhat]: HardhatParaSpaceConfig,
  [eEthereumNetwork.anvil]: HardhatParaSpaceConfig,
  [eEthereumNetwork.localhost]: HardhatParaSpaceConfig,
  [eEthereumNetwork.moonbeam]: MoonbeamParaSpaceConfig,
  [eEthereumNetwork.goerli]: GoerliParaSpaceConfig,
  [eEthereumNetwork.mainnet]: MainnetParaSpaceConfig,
  [eEthereumNetwork.arbitrumOne]: ArbitrumOneParaSpaceConfig,
};
