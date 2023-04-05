// import {
//   deployStakefishNFTManager,
//   deployStakefishValidatorFactory,
//   deployDepositContract,
//   deployStakefishValidator,
// } from "../../../helpers/contracts-deployments";
// import {getParaSpaceAdmins} from "../../../helpers/contracts-helpers";
import {isLocalTestnet} from "../../../helpers/misc-utils";

export const step_23 = async () => {
  try {
    if (!isLocalTestnet()) {
      return;
    }

    // const depositContract = await deployDepositContract(verify);
    // const {paraSpaceAdminAddress} = await getParaSpaceAdmins();
    // const validatorImpl = await deployStakefishValidator(
    //   depositContract.address,
    //   verify
    // );
    //
    // const factory = await deployStakefishValidatorFactory(
    //   validatorImpl.address,
    //   paraSpaceAdminAddress,
    //   verify
    // );
    //
    // const nftManager = await deployStakefishNFTManager(factory.address, verify);
    // await waitForTx(await factory.setDeployer(nftManager.address, true));
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
