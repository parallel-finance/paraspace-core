import {deployACLManager} from "../../../helpers/contracts-deployments";
import {getParaSpaceAdmins} from "../../../helpers/contracts-helpers";
import {waitForTx} from "../../../helpers/misc-utils";
import {
  getFirstSigner,
  getPoolAddressesProvider,
} from "../../../helpers/contracts-getters";
import {GLOBAL_OVERRIDES} from "../../../helpers/hardhat-constants";

export const step_05 = async (verify = false) => {
  const {paraSpaceAdminAddress, emergencyAdminAddresses, riskAdminAddress} =
    await getParaSpaceAdmins();
  const addressesProvider = await getPoolAddressesProvider();
  const deployer = await getFirstSigner();
  const deployerAddress = await deployer.getAddress();

  try {
    const aclManager = await deployACLManager(
      addressesProvider.address,
      verify
    );
    await waitForTx(
      await addressesProvider.setACLManager(
        aclManager.address,
        GLOBAL_OVERRIDES
      )
    );

    await waitForTx(
      await aclManager.addPoolAdmin(deployerAddress, GLOBAL_OVERRIDES)
    );
    await waitForTx(
      await aclManager.addAssetListingAdmin(
        paraSpaceAdminAddress,
        GLOBAL_OVERRIDES
      )
    );
    for (const emergencyAdminAddress of emergencyAdminAddresses) {
      await waitForTx(
        await aclManager.addEmergencyAdmin(
          emergencyAdminAddress,
          GLOBAL_OVERRIDES
        )
      );
    }
    await waitForTx(
      await aclManager.addRiskAdmin(riskAdminAddress, GLOBAL_OVERRIDES)
    );
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
