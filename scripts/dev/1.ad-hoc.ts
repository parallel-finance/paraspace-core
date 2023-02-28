import rawBRE from "hardhat";
import {
  deployMintableERC20,
  deployMockAStETH,
  deployMockAToken,
  deployMockRETH,
} from "../../helpers/contracts-deployments";

const adHoc = async (verify = false) => {
  console.time("ad-hoc");
  const awstETH = await deployMockAToken(["awstETH", "awstETH", "18"], verify);
  const astETH = await deployMockAStETH(["astETH", "astETH", "18"], verify);
  const reth = await deployMockRETH(["rETH", "rETH", "18"], verify);
  const cbeth = await deployMintableERC20(["cbETH", "cbETH", "18"], verify);
  console.timeEnd("ad-hoc");
};

async function main() {
  await rawBRE.run("set-DRE");
  await adHoc();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
