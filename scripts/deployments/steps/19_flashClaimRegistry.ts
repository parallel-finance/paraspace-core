import {
  deployUserFlashClaimRegistry,
  deployMockAirdropProject,
  deployMockMultiAssetAirdropProject,
  deployAirdropFlashClaimReceiver,
} from "../../../helpers/contracts-deployments";
import {
  getPoolAddressesProvider,
  getProtocolDataProvider,
} from "../../../helpers/contracts-getters";
import {isLocalTestnet, isPublicTestnet} from "../../../helpers/misc-utils";
import {ERC721TokenContractId} from "../../../helpers/types";

export const step_19 = async (verify = false) => {
  try {
    const addressesProvider = await getPoolAddressesProvider();
    const poolAddress = await addressesProvider.getPool();
    const receiverImpl = await deployAirdropFlashClaimReceiver(
      poolAddress,
      verify
    );

    await deployUserFlashClaimRegistry(
      poolAddress,
      receiverImpl.address,
      verify
    );

    if (!isLocalTestnet() && !isPublicTestnet()) {
      return;
    }

    const dataProvider = await getProtocolDataProvider();
    const reservesTokens = await dataProvider.getAllReservesTokens();
    const baycAddress = reservesTokens.find(
      (token) => token.symbol === ERC721TokenContractId.BAYC
    )?.tokenAddress;
    if (!baycAddress) {
      return;
    }

    const maycAddress = reservesTokens.find(
      (token) => token.symbol === ERC721TokenContractId.MAYC
    )?.tokenAddress;
    if (!maycAddress) {
      return;
    }

    await deployMockAirdropProject(baycAddress, verify);
    await deployMockMultiAssetAirdropProject(baycAddress, maycAddress, verify);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
