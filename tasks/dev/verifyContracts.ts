import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION_JOBS} from "../../helpers/hardhat-constants";

task("verify-contracts", "Verify deployed contracts on etherscan").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {verifyContracts} = await import("../../helpers/misc-utils");
    await verifyContracts(ETHERSCAN_VERIFICATION_JOBS);
  }
);
