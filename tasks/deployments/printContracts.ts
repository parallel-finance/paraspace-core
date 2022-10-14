import {task} from "hardhat/config";
import {printContracts} from "../../deploy/helpers/misc-utils";

task("print-contracts", "Print deployed contracts")
  .setAction(async (_, DRE) => {
    await DRE.run("set-DRE")
    printContracts();
  })
