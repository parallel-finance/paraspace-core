import rawBRE from "hardhat";
import {
  deployAirdropFlashClaimReceiver,
  deployUserFlashClaimRegistryProxy,
} from "../../helpers/contracts-deployments";
import {
  getFirstSigner,
  getPoolAddressesProvider,
} from "../../helpers/contracts-getters";

const releaseFlashClaim = async (verify = false) => {
  console.time("release-flashclaim");
  const deployer = await getFirstSigner();
  const deployerAddress = await deployer.getAddress();

  const addressesProvider = await getPoolAddressesProvider();
  const poolAddress = await addressesProvider.getPool();
  const receiverImpl = await deployAirdropFlashClaimReceiver(
    poolAddress,
    verify
  );

  await deployUserFlashClaimRegistryProxy(
    deployerAddress,
    receiverImpl.address,
    verify
  );
  console.timeEnd("release-flashclaim");
};

async function main() {
  await rawBRE.run("set-DRE");
  await releaseFlashClaim();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
