import {deployPunksAdapter} from "../../../helpers/contracts-deployments";
import {
  getPoolAddressesProvider,
  getPunks,
  getWPunk,
} from "../../../helpers/contracts-getters";
import {PUNKS_ID, ZERO_ADDRESS} from "../../../helpers/constants";
import {
  getParaSpaceConfig,
  isLocalTestnet,
  isPublicTestnet,
  waitForTx,
} from "../../../helpers/misc-utils";
import {GLOBAL_OVERRIDES} from "../../../helpers/hardhat-constants";
import {ERC721TokenContractId} from "../../../helpers/types";

export const step_19 = async (verify = false) => {
  try {
    if (!isLocalTestnet() && !isPublicTestnet()) {
      return;
    }

    const paraSpaceConfig = getParaSpaceConfig();

    if (!paraSpaceConfig.ReservesConfig[ERC721TokenContractId.WPUNKS]) {
      return;
    }

    const addressesProvider = await getPoolAddressesProvider();
    const punks = await getPunks();
    const wpunks = await getWPunk();

    const punksAdapter = await deployPunksAdapter(
      [addressesProvider.address, punks.address, wpunks.address],
      verify
    );

    await waitForTx(
      await addressesProvider.setMarketplace(
        PUNKS_ID,
        punks.address,
        punksAdapter.address,
        ZERO_ADDRESS,
        false,
        GLOBAL_OVERRIDES
      )
    );
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
