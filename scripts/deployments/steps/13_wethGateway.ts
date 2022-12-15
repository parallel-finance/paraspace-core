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
import {ERC20TokenContractId} from "../../../helpers/types";

export const step_13 = async (verify = false) => {
  const paraSpaceConfig = getParaSpaceConfig();
  try {
    if (!paraSpaceConfig.ReservesConfig[ERC20TokenContractId.WETH]) {
      return;
    }

    const allTokens = await getAllTokens();
    const addressesProvider = await getPoolAddressesProvider();
    const poolAddress = await addressesProvider.getPool();
    const poolProxy = await getPoolProxy(poolAddress);

    const wethGateway = await deployWETHGateway(
      allTokens.WETH.address,
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
