import {
  deployUserFlashClaimRegistry,
  deployMockAirdropProject,
  deployP2PPairStaking,
} from "../../../helpers/contracts-deployments";
import {
  getPoolAddressesProvider,
  getProtocolDataProvider,
} from "../../../helpers/contracts-getters";
import {isLocalTestnet, isPublicTestnet} from "../../../helpers/misc-utils";
import {ERC721TokenContractId} from "../../../helpers/types";

export const step_19 = async (verify = false) => {
  try {
    // deploy FlashClaimRegistry
    const addressesProvider = await getPoolAddressesProvider();
    const poolAddress = await addressesProvider.getPool();
    await deployUserFlashClaimRegistry(poolAddress, verify);

    if (!isLocalTestnet() && !isPublicTestnet()) {
      return;
    }

    const dataProvider = await getProtocolDataProvider();
    const reservesTokens = await dataProvider.getAllReservesTokens();
    const baycAddress = reservesTokens.find(
      (token) => token.symbol === ERC721TokenContractId.BAYC
    )?.tokenAddress;
    if (baycAddress) {
      await deployMockAirdropProject(baycAddress, verify);
    }

    // deploy P2PPairStaking
    await deployP2PPairStaking();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
