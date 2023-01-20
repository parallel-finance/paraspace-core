import rawBRE from "hardhat";
import {
  getFirstSigner,
  getUserFlashClaimRegistry,
} from "../../helpers/contracts-getters";
import {GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {BAYCSewerPassClaim__factory, BAYCSewerPass__factory} from "../../types";

const adHoc = async () => {
  console.time("ad-hoc");
  const deployer = await getFirstSigner();
  const deployerAddress = await deployer.getAddress();
  await getUserFlashClaimRegistry();

  const passFactory = new BAYCSewerPass__factory(deployer);

  const passContract = await passFactory.deploy(
    "SewerPass",
    "SewerPass",
    deployerAddress,
    GLOBAL_OVERRIDES
  );

  const passClaimFactory = new BAYCSewerPassClaim__factory(deployer);

  const passClaimContract = await passClaimFactory.deploy(
    "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D",
    "0x60E4d786628Fea6478F785A6d7e704777c86a7c6",
    "0xba30e5f9bb24caa003e9f2f0497ad287fdf95623",
    passContract.address,
    deployerAddress,
    GLOBAL_OVERRIDES
  );
  await passContract
    .connect(deployer)
    .setRegistryAddress(passClaimContract.address, GLOBAL_OVERRIDES);
  await passContract.connect(deployer).flipMintIsActiveState(GLOBAL_OVERRIDES);
  await passClaimContract
    .connect(deployer)
    .flipClaimIsActiveState(GLOBAL_OVERRIDES);
  await passContract
    .connect(deployer)
    .toggleMinterContract(passClaimContract.address, GLOBAL_OVERRIDES);

  console.timeEnd("ad-hoc");
};

async function main() {
  await rawBRE.run("set-DRE");
  await adHoc();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
