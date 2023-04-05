import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../helpers/hardhat-constants";

task("deploy:renounce-ownership", "Renounce deployer ownership")
  .addPositionalParam("newAdmin", "New Admin Address")
  .setAction(async ({newAdmin}, DRE) => {
    await DRE.run("set-DRE");
    const {step_24: step_24} = await import(
      "../../scripts/deployments/steps/24_renounceOwnership"
    );
    await step_24(ETHERSCAN_VERIFICATION, {
      paraSpaceAdminAddress: newAdmin,
      emergencyAdminAddresses: [newAdmin],
      gatewayAdminAddress: newAdmin,
      riskAdminAddress: newAdmin,
    });
  });
