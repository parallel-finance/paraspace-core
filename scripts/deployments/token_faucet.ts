import {deployMockTokenFaucet} from "../../helpers/contracts-deployments";
import {getParaSpaceConfig} from "../../helpers/misc-utils";

export const deployFaucet = async (mockTokens, verify?: boolean) => {
  const tokenFaucetMintValue = getParaSpaceConfig().Mocks!.TokenFaucetMintValue;
  const erc20configs = [
    {
      name: "DAI",
      addr: mockTokens.DAI,
      mintValue: tokenFaucetMintValue.DAI,
    },
    {
      name: "APE",
      addr: mockTokens.APE,
      mintValue: tokenFaucetMintValue.APE,
    },
    {
      name: "USDC",
      addr: mockTokens.USDC,
      mintValue: tokenFaucetMintValue.USDC,
    },
    {
      name: "USDT",
      addr: mockTokens.USDT,
      mintValue: tokenFaucetMintValue.USDT,
    },
    {
      name: "WBTC",
      addr: mockTokens.WBTC,
      mintValue: tokenFaucetMintValue.WBTC,
    },
    {
      name: "STETH",
      addr: mockTokens.stETH,
      mintValue: tokenFaucetMintValue.stETH,
    },
    {
      name: "aWETH",
      addr: mockTokens.aWETH,
      mintValue: tokenFaucetMintValue.aWETH,
    },
    {
      name: "cWETH",
      addr: mockTokens.cWETH,
      mintValue: tokenFaucetMintValue.cWETH,
    },
    {
      name: "PUNK",
      addr: mockTokens.PUNK,
      mintValue: tokenFaucetMintValue.PUNK,
    },
  ];

  const erc721configs = [
    {
      name: "BAYC",
      addr: mockTokens.BAYC,
      mintValue: tokenFaucetMintValue.BAYC,
    },
    {
      name: "MAYC",
      addr: mockTokens.MAYC,
      mintValue: tokenFaucetMintValue.MAYC,
    },
    {
      name: "DOODLES",
      addr: mockTokens.DOODLE,
      mintValue: tokenFaucetMintValue.DOODLE,
    },
    {
      name: "MOONBIRD",
      addr: mockTokens.MOONBIRD,
      mintValue: tokenFaucetMintValue.MOONBIRD,
    },
    {
      name: "MEEBITS",
      addr: mockTokens.MEEBITS,
      mintValue: tokenFaucetMintValue.MEEBITS,
    },
    {
      name: "AZUKI",
      addr: mockTokens.AZUKI,
      mintValue: tokenFaucetMintValue.AZUKI,
    },
    {
      name: "OTHR",
      addr: mockTokens.OTHR,
      mintValue: tokenFaucetMintValue.OTHR,
    },
    {
      name: "CLONEX",
      addr: mockTokens.CLONEX,
      mintValue: tokenFaucetMintValue.CLONEX,
    },
  ];

  if (mockTokens.BAKC) {
    erc721configs.push({
      name: "BAKC",
      addr: mockTokens.BAKC,
      mintValue: tokenFaucetMintValue.BAKC,
    });
  }

  const punkConfig = {
    name: "PUNKS",
    addr: mockTokens.PUNKS,
    mintValue: tokenFaucetMintValue.PUNKS,
  };

  const faucet = await deployMockTokenFaucet(
    erc20configs,
    erc721configs,
    punkConfig,
    verify
  );

  console.log(`faucet`, faucet.address);
};
