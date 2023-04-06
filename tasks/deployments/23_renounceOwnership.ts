import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../helpers/hardhat-constants";

task("deploy:renounce-ownership", "Renounce deployer ownership")
  .addPositionalParam("newAdmin", "New Admin Address")
  .setAction(async ({newAdmin}, DRE) => {
    await DRE.run("set-DRE");
    const {step_23: step_23} = await import(
      "../../scripts/deployments/steps/23_renounceOwnership"
    );
    await step_23(ETHERSCAN_VERIFICATION, {
      paraSpaceAdminAddress: newAdmin,
      emergencyAdminAddresses: [newAdmin],
      gatewayAdminAddress: newAdmin,
      riskAdminAddress: newAdmin,
    });
  });
