import {task} from "hardhat/config";
import {verifyContracts} from "../../deploy/helpers/misc-utils";

task("verify-contracts", "Verify deployed contracts on etherscan")
  .setAction(async (_, DRE) => {
    await DRE.run("set-DRE")
    verifyContracts();
  })
