import {
  deployStakefishNFTManager,
  deployStakefishValidatorFactory,
  deployDepositContract,
  deployStakefishValidator,
} from "../../../helpers/contracts-deployments";
import {getParaSpaceAdmins} from "../../../helpers/contracts-helpers";

export const step_23 = async (verify = false) => {
  try {
    const depositContract = await deployDepositContract(verify);
    const {paraSpaceAdminAddress} = await getParaSpaceAdmins();
    const validatorImpl = await deployStakefishValidator(
      depositContract.address,
      verify
    );

    const factory = await deployStakefishValidatorFactory(
      validatorImpl.address,
      paraSpaceAdminAddress,
      verify
    );

    await deployStakefishNFTManager(factory.address, verify);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
