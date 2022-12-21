import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../helpers/hardhat-constants";

task("deploy:erc721-tokens", "Deploy ERC721 tokens").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {step_02} = await import(
      "../../scripts/deployments/steps/02_ERC721Tokens"
    );
    await step_02(ETHERSCAN_VERIFICATION);
  }
);
