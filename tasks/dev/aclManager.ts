import {task} from "hardhat/config";
import {DRY_RUN, GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";

task("add-emergency-admin", "Add Emergency Admin")
  .addPositionalParam("address", "address")
  .setAction(async ({address}, DRE) => {
    await DRE.run("set-DRE");
    const {dryRunEncodedData} = await import("../../helpers/contracts-helpers");
    const {getACLManager} = await import("../../helpers/contracts-getters");
    const aclManager = await getACLManager();
    const encodedData = aclManager.interface.encodeFunctionData(
      "addEmergencyAdmin",
      [address]
    );
    if (DRY_RUN) {
      await dryRunEncodedData(aclManager.address, encodedData);
    } else {
      await waitForTx(
        await aclManager.addEmergencyAdmin(address, GLOBAL_OVERRIDES)
      );
    }
  });

task("add-pool-admin", "Add Pool Admin")
  .addPositionalParam("address", "address")
  .setAction(async ({address}, DRE) => {
    await DRE.run("set-DRE");
    const {dryRunEncodedData} = await import("../../helpers/contracts-helpers");
    const {getACLManager} = await import("../../helpers/contracts-getters");
    const aclManager = await getACLManager();
    const encodedData = aclManager.interface.encodeFunctionData(
      "addPoolAdmin",
      [address]
    );
    if (DRY_RUN) {
      await dryRunEncodedData(aclManager.address, encodedData);
    } else {
      await waitForTx(await aclManager.addPoolAdmin(address, GLOBAL_OVERRIDES));
    }
  });

task("remove-emergency-admin", "Remove Emergency Admin")
  .addPositionalParam("address", "address")
  .setAction(async ({address}, DRE) => {
    await DRE.run("set-DRE");
    const {dryRunEncodedData} = await import("../../helpers/contracts-helpers");
    const {getACLManager} = await import("../../helpers/contracts-getters");
    const aclManager = await getACLManager();
    const encodedData = aclManager.interface.encodeFunctionData(
      "removeEmergencyAdmin",
      [address]
    );
    if (DRY_RUN) {
      await dryRunEncodedData(aclManager.address, encodedData);
    } else {
      await waitForTx(
        await aclManager.removeEmergencyAdmin(address, GLOBAL_OVERRIDES)
      );
    }
  });

task("remove-pool-admin", "Remove Pool Admin")
  .addPositionalParam("address", "address")
  .setAction(async ({address}, DRE) => {
    await DRE.run("set-DRE");
    const {dryRunEncodedData} = await import("../../helpers/contracts-helpers");
    const {getACLManager} = await import("../../helpers/contracts-getters");
    const aclManager = await getACLManager();
    const encodedData = aclManager.interface.encodeFunctionData(
      "removePoolAdmin",
      [address]
    );
    if (DRY_RUN) {
      await dryRunEncodedData(aclManager.address, encodedData);
    } else {
      await waitForTx(
        await aclManager.removePoolAdmin(address, GLOBAL_OVERRIDES)
      );
    }
  });
