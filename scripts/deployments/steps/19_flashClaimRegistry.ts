import {
  deployUserFlashClaimRegistry,
  deployMockAirdropProject,
  deployMockMultiAssetAirdropProject,
  deployAirdropFlashClaimReceiver,
  deployUserFlashClaimRegistryProxy,
  deployBAYCSewerPassClaim,
} from "../../../helpers/contracts-deployments";
import {
  getAllTokens,
  getFirstSigner,
  getPoolAddressesProvider,
} from "../../../helpers/contracts-getters";
import {isLocalTestnet, isPublicTestnet} from "../../../helpers/misc-utils";
import {ERC721TokenContractId} from "../../../helpers/types";

export const step_19 = async (verify = false) => {
  const deployer = await getFirstSigner();
  const deployerAddress = await deployer.getAddress();
  const allTokens = await getAllTokens();

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

    const baycAddress = allTokens[ERC721TokenContractId.BAYC].address;
    if (!baycAddress) {
      return;
    }

    const maycAddress = allTokens[ERC721TokenContractId.MAYC].address;
    if (!maycAddress) {
      return;
    }

    await deployMockAirdropProject(baycAddress, verify);
    await deployMockMultiAssetAirdropProject(baycAddress, maycAddress, verify);

    const bakcAddress = allTokens[ERC721TokenContractId.BAKC].address;
    if (!bakcAddress) {
      return;
    }

    const sewerAddress = allTokens[ERC721TokenContractId.SEWER].address;
    if (!sewerAddress) {
      return;
    }

    await deployBAYCSewerPassClaim(
      baycAddress,
      maycAddress,
      bakcAddress,
      sewerAddress,
      verify
    );
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
