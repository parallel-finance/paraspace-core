import {pick} from "lodash";
import {ZERO_ADDRESS} from "../../../helpers/constants";
import {deployPriceOracle} from "../../../helpers/contracts-deployments";
import {getAllTokens} from "../../../helpers/contracts-getters";
import {
  getContractAddresses,
  insertContractAddressInDb,
} from "../../../helpers/contracts-helpers";
import {GLOBAL_OVERRIDES} from "../../../helpers/hardhat-constants";
import {
  getParaSpaceConfig,
  isLocalTestnet,
  isMainnet,
  isMoonbeam,
  isPublicTestnet,
} from "../../../helpers/misc-utils";
import {waitForTx} from "../../../helpers/misc-utils";
import {setInitialAssetPricesInOracle} from "../../../helpers/oracles-helpers";
import {eContractid} from "../../../helpers/types";

export const step_09 = async (verify = false) => {
  try {
    const allTokens = await getAllTokens();
    const paraSpaceConfig = getParaSpaceConfig();

    if (isMainnet() || isMoonbeam()) {
      insertContractAddressInDb(eContractid.PriceOracle, ZERO_ADDRESS, false);
    }

    if (isLocalTestnet() || isPublicTestnet()) {
      const fallbackOracle = await deployPriceOracle(verify);
      await waitForTx(
        await fallbackOracle.setEthUsdPrice(
          paraSpaceConfig.Mocks!.USDPriceInWEI,
          GLOBAL_OVERRIDES
        )
      );
      const allTokenAddresses = getContractAddresses(allTokens);
      await setInitialAssetPricesInOracle(
        pick(
          paraSpaceConfig.Mocks!.AllAssetsInitialPrices,
          Object.keys(allTokenAddresses)
        ),
        allTokenAddresses,
        fallbackOracle
      );
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
