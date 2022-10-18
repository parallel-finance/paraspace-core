import {task} from "hardhat/config";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:mock-erc721-tokens", "Deploy mocked ERC721 tokens").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {step_02} = await import(
      "../../deploy/tasks/deployments/testnet/steps/02_mockERC721Tokens"
    );
    await step_02(verify);
  }
);
