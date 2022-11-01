import {task} from "hardhat/config";

const verifyJobs = parseInt(process.env.ETHERSCAN_VERIFICATION_JOBS ?? "1")

task("verify-contracts", "Verify deployed contracts on etherscan").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {verifyContracts} = await import("../../deploy/helpers/misc-utils");
    await verifyContracts(verifyJobs);
  }
);
