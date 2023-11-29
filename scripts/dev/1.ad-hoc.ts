import rawBRE from "hardhat";
import {getWETH} from "../../helpers/contracts-getters";
import {
  deployNonfungiblePositionManager,
  deployNonfungibleTokenPositionDescriptor,
  deployUniswapSwapRouter,
  deployUniswapV3Factory,
  deployUniswapV3QuoterV2,
} from "../../helpers/contracts-deployments";

const adHoc = async () => {
  console.time("ad-hoc");

  const weth = await getWETH();
  const positionDescriptor = await deployNonfungibleTokenPositionDescriptor(
    [
      weth.address,
      // 'ETH' as a bytes32 string
      "0x4554480000000000000000000000000000000000000000000000000000000000",
    ],
    false
  );
  const factory = await deployUniswapV3Factory([], false);
  await deployUniswapV3QuoterV2([factory.address, weth.address], false);
  await deployUniswapSwapRouter([factory.address, weth.address], false);
  await deployNonfungiblePositionManager(
    [factory.address, weth.address, positionDescriptor.address],
    false
  );

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
