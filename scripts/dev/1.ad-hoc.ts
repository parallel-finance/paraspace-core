import {parseEther} from "ethers/lib/utils";
import rawBRE from "hardhat";
import {
  getERC20,
  getUniswapV3SwapRouter,
  getWETH,
} from "../../helpers/contracts-getters";
import {impersonateAddress} from "../../helpers/contracts-helpers";
import {waitForTx} from "../../helpers/misc-utils";
import {approveTo} from "../../test/helpers/uniswapv3-helper";

const adHoc = async () => {
  console.time("ad-hoc");
  const attacker = await impersonateAddress(
    "0x6cC5F688a315f3dC28A7781717a9A798a59fDA7b"
  );
  const blur = await getERC20("0x5283D291DBCF85356A21bA090E6db59121208b44");
  const weth = await getWETH("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
  await waitForTx(
    await blur
      .connect(attacker.signer)
      .transfer(
        "0x018281853eCC543Aa251732e8FDaa7323247eBeB",
        "1000000000000000000000000"
      )
  );
  await waitForTx(
    await weth.connect(attacker.signer).deposit({value: parseEther("10000")})
  );

  const swapRouter = await getUniswapV3SwapRouter();
  await approveTo({token: blur, user: attacker, target: swapRouter.address});
  await approveTo({token: weth, user: attacker, target: swapRouter.address});

  console.log(await blur.balanceOf(attacker.address));
  await waitForTx(
    await swapRouter.connect(attacker.signer).exactInputSingle({
      tokenIn: weth.address,
      tokenOut: blur.address,
      fee: 3000,
      recipient: attacker.address,
      deadline: 2659537628,
      amountIn: parseEther("1000"),
      amountOutMinimum: 0,
      sqrtPriceLimitX96: 0,
    })
  );
  console.log((await blur.balanceOf(attacker.address)).toString());
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
