import {task} from "hardhat/config";

task("verify-contracts", "Verify deployed contracts on etherscan").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {verifyContracts} = await import("../../deploy/helpers/misc-utils");
    await verifyContracts();
  }
);
