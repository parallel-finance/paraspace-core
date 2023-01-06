import {parseEther} from "ethers/lib/utils";
import "../helpers/types";
import {IMocksConfig} from "../helpers/types";

export const MOCK_CHAINLINK_AGGREGATORS_PRICES = {
  // ERC20
  DAI: parseEther("0.000908578801039414").toString(),
  USDC: parseEther("0.000915952223931999").toString(),
  USDT: parseEther("0.000915952223931999").toString(),
  WETH: parseEther("1").toString(),
  WBTC: parseEther("18.356369399062118").toString(),
  stETH: parseEther("1").toString(),
  APE: parseEther("0.0036906841286").toString(),
  sAPE: parseEther("0.0036906841286").toString(),
  cAPE: parseEther("0.0036906841286").toString(),
  aWETH: parseEther("1").toString(),
  cETH: parseEther("1").toString(),
  PUNK: parseEther("140").toString(),
  xcDOT: parseEther("0.0038333333333").toString(),
  WGLMR: parseEther("0.00027291666666").toString(),
  // ERC721
  BAYC: parseEther("101").toString(),
  WPUNKS: parseEther("140").toString(),
  PUNKS: parseEther("140").toString(),
  MAYC: parseEther("51").toString(),
  DOODLE: parseEther("75").toString(),
  MOONBIRD: parseEther("0.02").toString(),
  MEEBITS: parseEther("22").toString(),
  AZUKI: parseEther("21").toString(),
  OTHR: parseEther("25").toString(),
  CLONEX: parseEther("27").toString(),
  BAKC: parseEther("6").toString(),
};

export const MOCK_TOKEN_MINT_VALUE = {
  // ERC20
  DAI: 10000,
  USDC: 10000,
  USDT: 10000,
  WBTC: 10,
  stETH: 10,
  APE: 12992,
  aWETH: 10,
  cWETH: 10,
  PUNK: 1000,
  xcDOT: 1000,
  // ERC721
  BAYC: 1,
  PUNKS: 1,
  MAYC: 1,
  DOODLE: 1,
  MOONBIRD: 1,
  MEEBITS: 1,
  AZUKI: 1,
  OTHR: 1,
  CLONEX: 1,
  BAKC: 1,
};

export const MocksConfig: IMocksConfig = {
  USDPriceInWEI: "5848466240000000",
  AllAssetsInitialPrices: MOCK_CHAINLINK_AGGREGATORS_PRICES,
  TokenFaucetMintValue: MOCK_TOKEN_MINT_VALUE,
};
