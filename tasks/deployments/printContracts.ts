import {task} from "hardhat/config";

task("print-contracts", "Print deployed contracts").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {printContracts} = await import("../../helpers/misc-utils");
    printContracts();
  }
);
