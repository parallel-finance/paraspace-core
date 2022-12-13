import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../helpers/hardhat-constants";

task("deploy:address-provider", "Deploy addresses provider").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {step_04} = await import(
      "../../scripts/deployments/steps/04_addressProvider"
    );
    await step_04(ETHERSCAN_VERIFICATION);
  }
);
