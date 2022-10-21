import {task} from "hardhat/config";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:mock-erc20-tokens", "Deploy mocked ERC20 tokens").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {step_01} = await import(
      "../../deploy/tasks/deployments/testnet/steps/01_mockERC20Tokens"
    );
    await step_01(verify);
  }
);
