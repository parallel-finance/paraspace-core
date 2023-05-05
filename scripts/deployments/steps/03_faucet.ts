import {deployFaucet} from "../token_faucet";
import {isLocalTestnet, isPublicTestnet} from "../../../helpers/misc-utils";
import {
  eContractid,
  ERC20TokenContractId,
  ERC721TokenContractId,
} from "../../../helpers/types";
import {getContractAddressInDb} from "../../../helpers/contracts-helpers";

export const step_03 = async (verify = false) => {
  try {
    if (!isLocalTestnet() && !isPublicTestnet()) {
      return;
    }

    const tokens = Object.entries({
      // ERC20
      DAI: await getContractAddressInDb(ERC20TokenContractId.DAI),
      USDC: await getContractAddressInDb(ERC20TokenContractId.USDC),
      USDT: await getContractAddressInDb(ERC20TokenContractId.USDT),
      WBTC: await getContractAddressInDb(ERC20TokenContractId.WBTC),
      APE: await getContractAddressInDb(ERC20TokenContractId.APE),
      stETH: await getContractAddressInDb(ERC20TokenContractId.stETH),
      PUNK: await getContractAddressInDb(ERC20TokenContractId.PUNK),
      aWETH: await getContractAddressInDb(ERC20TokenContractId.aWETH),
      cWETH: await getContractAddressInDb(ERC20TokenContractId.cETH),
      // ERC721
      MAYC: await getContractAddressInDb(ERC721TokenContractId.MAYC),
      BAYC: await getContractAddressInDb(ERC721TokenContractId.BAYC),
      PUNKS: await getContractAddressInDb(eContractid.PUNKS),
      DOODLE: await getContractAddressInDb(ERC721TokenContractId.DOODLE),
      MOONBIRD: await getContractAddressInDb(ERC721TokenContractId.MOONBIRD),
      MEEBITS: await getContractAddressInDb(ERC721TokenContractId.MEEBITS),
      AZUKI: await getContractAddressInDb(ERC721TokenContractId.AZUKI),
      OTHR: await getContractAddressInDb(ERC721TokenContractId.OTHR),
      CLONEX: await getContractAddressInDb(ERC721TokenContractId.CLONEX),
      BAKC: await getContractAddressInDb(ERC721TokenContractId.BAKC),
    }).reduce((ite, [k, v]) => {
      if (v) ite[k] = v;
      return ite;
    }, {});

    await deployFaucet(tokens, verify);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
