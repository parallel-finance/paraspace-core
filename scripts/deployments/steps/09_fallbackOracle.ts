import {ZERO_ADDRESS} from "../../../helpers/constants";
import {deployPriceOracle} from "../../../helpers/contracts-deployments";
import {
  getAllERC20Tokens,
  getAllERC721Tokens,
  getPunks,
} from "../../../helpers/contracts-getters";
import {insertContractAddressInDb} from "../../../helpers/contracts-helpers";
import {GLOBAL_OVERRIDES} from "../../../helpers/hardhat-constants";
import {
  getParaSpaceConfig,
  isLocalTestnet,
  isMainnet,
  isPublicTestnet,
} from "../../../helpers/misc-utils";
import {waitForTx} from "../../../helpers/misc-utils";
import {setInitialAssetPricesInOracle} from "../../../helpers/oracles-helpers";
import {eContractid} from "../../../helpers/types";

export const step_09 = async (verify = false) => {
  try {
    const erc20Tokens = await getAllERC20Tokens();
    const erc721Tokens = await getAllERC721Tokens();
    const paraSpaceConfig = getParaSpaceConfig();

    if (isMainnet()) {
      insertContractAddressInDb(eContractid.PriceOracle, ZERO_ADDRESS, false);
    }

    if (isLocalTestnet() || isPublicTestnet()) {
      const punks = await getPunks();
      const fallbackOracle = await deployPriceOracle(verify);
      await waitForTx(
        await fallbackOracle.setEthUsdPrice(
          paraSpaceConfig.Mocks!.USDPriceInWEI,
          GLOBAL_OVERRIDES
        )
      );
      await setInitialAssetPricesInOracle(
        paraSpaceConfig.Mocks!.AllAssetsInitialPrices,
        {
          // ERC20
          WETH: erc20Tokens.WETH.address,
          aWETH: erc20Tokens.aWETH.address,
          cETH: erc20Tokens.cETH.address,
          DAI: erc20Tokens.DAI.address,
          USDC: erc20Tokens.USDC.address,
          USDT: erc20Tokens.USDT.address,
          stETH: erc20Tokens.stETH.address,
          APE: erc20Tokens.APE.address,
          sAPE: erc20Tokens.sAPE.address,
          cAPE: erc20Tokens.cAPE.address,
          PUNK: erc20Tokens.PUNK.address,
          WBTC: erc20Tokens.WBTC.address,
          // ERC721
          BAYC: erc721Tokens.BAYC.address,
          WPUNKS: erc721Tokens.WPUNKS.address,
          PUNKS: punks.address,
          MAYC: erc721Tokens.MAYC.address,
          DOODLE: erc721Tokens.DOODLE.address,
          MOONBIRD: erc721Tokens.MOONBIRD.address,
          MEEBITS: erc721Tokens.MEEBITS.address,
          AZUKI: erc721Tokens.AZUKI.address,
          OTHR: erc721Tokens.OTHR.address,
          CLONEX: erc721Tokens.CLONEX.address,
        },
        fallbackOracle
      );
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
