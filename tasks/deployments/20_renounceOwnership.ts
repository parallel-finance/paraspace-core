import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../helpers/hardhat-constants";

task("deploy:renounce-ownership", "Renounce deployer ownership")
  .addPositionalParam("newAdmin", "New Admin Address")
  .setAction(async ({newAdmin}, DRE) => {
    await DRE.run("set-DRE");
    const {step_20} = await import(
      "../../scripts/deployments/steps/20_renounceOwnership"
    );
    await step_20(ETHERSCAN_VERIFICATION, {
      paraSpaceAdminAddress: newAdmin,
      gatewayAdminAddress: newAdmin,
      riskAdminAddress: newAdmin,
    });
  });
