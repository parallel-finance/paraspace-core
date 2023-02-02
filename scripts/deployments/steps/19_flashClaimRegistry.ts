import {
  deployUserFlashClaimRegistry,
  deployMockAirdropProject,
  deployMockMultiAssetAirdropProject,
  deployAirdropFlashClaimReceiver,
  deployUserFlashClaimRegistryProxy,
} from "../../../helpers/contracts-deployments";
import {
  getFirstSigner,
  getPoolAddressesProvider,
  getProtocolDataProvider,
} from "../../../helpers/contracts-getters";
import {isLocalTestnet, isPublicTestnet} from "../../../helpers/misc-utils";
import {ERC721TokenContractId} from "../../../helpers/types";

export const step_19 = async (verify = false) => {
  const deployer = await getFirstSigner();
  const deployerAddress = await deployer.getAddress();

  try {
    const addressesProvider = await getPoolAddressesProvider();
    const poolAddress = await addressesProvider.getPool();
    const receiverImpl = await deployAirdropFlashClaimReceiver(
      poolAddress,
      verify
    );

    const registry = await deployUserFlashClaimRegistry(
      poolAddress,
      receiverImpl.address,
      verify
    );

    await deployUserFlashClaimRegistryProxy(
      deployerAddress,
      registry.address,
      []
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
