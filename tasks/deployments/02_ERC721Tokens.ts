import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../deploy/helpers/hardhat-constants";

task("deploy:erc721-tokens", "Deploy ERC721 tokens").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {step_02} = await import(
      "../../deploy/tasks/deployments/full-deployment/steps/02_ERC721Tokens"
    );
    await step_02(ETHERSCAN_VERIFICATION);
  }
);
