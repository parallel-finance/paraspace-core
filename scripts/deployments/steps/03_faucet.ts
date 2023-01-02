import {getAllTokens, getPunks} from "../../../helpers/contracts-getters";
import {deployFaucet} from "../token_faucet";
import {
  DRE,
  getDb,
  isLocalTestnet,
  isPublicTestnet,
} from "../../../helpers/misc-utils";
import {eContractid} from "../../../helpers/types";

export const step_03 = async (verify = false) => {
  try {
    if (!isLocalTestnet() && !isPublicTestnet()) {
      return;
    }

    const mockTokens = await getAllTokens();
    const punks = await getPunks();
    const tokens = {
      // ERC20
      DAI: mockTokens.DAI.address,
      USDC: mockTokens.USDC.address,
      USDT: mockTokens.USDT.address,
      WBTC: mockTokens.WBTC.address,
      APE: mockTokens.APE.address,
      stETH: mockTokens.stETH.address,
      PUNK: mockTokens.PUNK.address,
      aWETH: mockTokens.aWETH.address,
      cWETH: mockTokens.cETH.address,
      // ERC721
      MAYC: mockTokens.MAYC.address,
      BAYC: mockTokens.BAYC.address,
      PUNKS: punks.address,
      DOODLE: mockTokens.DOODLE.address,
      MOONBIRD: mockTokens.MOONBIRD.address,
      MEEBITS: mockTokens.MEEBITS.address,
      AZUKI: mockTokens.AZUKI.address,
      OTHR: mockTokens.OTHR.address,
      CLONEX: mockTokens.CLONEX.address,
    };

    const bakc = await getDb()
      .get(`${eContractid.BAKC}.${DRE.network.name}`)
      .value();
    if (bakc) {
      Object.assign(tokens, {
        BAKC: bakc.address,
      });
    }

    await deployFaucet(tokens, verify);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
