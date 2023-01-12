import {ZERO_ADDRESS} from "../../../helpers/constants";
import {
  deployWETHGateway,
  deployWETHGatewayProxy,
} from "../../../helpers/contracts-deployments";
import {
  getAllTokens,
  getPoolProxy,
  getPoolAddressesProvider,
} from "../../../helpers/contracts-getters";
import {getParaSpaceConfig} from "../../../helpers/misc-utils";

export const step_13 = async (verify = false) => {
  const paraSpaceConfig = getParaSpaceConfig();
  try {
    if (!paraSpaceConfig.ReservesConfig[paraSpaceConfig.WrappedNativeTokenId]) {
      return;
    }

    const allTokens = await getAllTokens();
    const addressesProvider = await getPoolAddressesProvider();
    const poolAddress = await addressesProvider.getPool();
    const poolProxy = await getPoolProxy(poolAddress);

    const wethGateway = await deployWETHGateway(
      allTokens[paraSpaceConfig.WrappedNativeTokenId].address,
      poolProxy.address,
      verify
    );

    const wethGatewayEncodedInitialize =
      wethGateway.interface.encodeFunctionData("initialize");

    await deployWETHGatewayProxy(
      ZERO_ADDRESS, // disable upgradeability
      wethGateway.address,
      wethGatewayEncodedInitialize,
      verify
    );
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
