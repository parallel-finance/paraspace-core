import {
  getUniswapV3SwapRouter,
  getUniswapV3Factory,
} from "../../helpers/contracts-getters";
import {TickMath} from "@uniswap/v3-sdk";
import {BigNumber, BigNumberish} from "ethers";
import {expect} from "chai";
import {waitForTx} from "../../helpers/misc-utils";
import {MAX_UINT_AMOUNT} from "../../helpers/constants";
import {IUniswapV3Pool__factory} from "../../types";
import {VERBOSE} from "../../helpers/hardhat-constants";

export function almostEqual(value0: BigNumberish, value1: BigNumberish) {
  const maxDiff = BigNumber.from(value0.toString()).div("1000").abs();
  const abs = BigNumber.from(value0.toString()).sub(value1.toString()).abs();
  if (!abs.lte(maxDiff) && VERBOSE) {
    console.log("---------value0=" + value0 + ", --------value1=" + value1);
  }
  expect(abs.lte(maxDiff)).to.be.equal(true);
}

export const fund = async ({token, user, amount}) => {
  await waitForTx(await token.connect(user.signer)["mint(uint256)"](amount));
};

// Give user dai and weth
export const approveTo = async ({token, target, user}) => {
  await waitForTx(
    await token.connect(user.signer).approve(target, MAX_UINT_AMOUNT)
  );
};

export const createNewPool = async ({
  positionManager,
  token0,
  token1,
  fee,
  initialSqrtPrice,
}) => {
  await waitForTx(
    await positionManager.createAndInitializePoolIfNecessary(
      token0.address,
      token1.address,
      fee,
      initialSqrtPrice,
      {
        gasLimit: 12_450_000,
      }
    )
  );
};

export const mintNewPosition = async ({
  nft,
  token0,
  token1,
  fee,
  user,
  tickSpacing,
  lowerPrice,
  upperPrice,
  token0Amount,
  token1Amount,
}) => {
  const tickLower = TickMath.getTickAtSqrtRatio(lowerPrice);
  const tickUpper = TickMath.getTickAtSqrtRatio(upperPrice);
  const minter = await nft.mint(
    {
      token0: token0.address,
      token1: token1.address,
      fee,
      tickLower: Math.ceil(tickLower / tickSpacing) * tickSpacing,
      tickUpper: Math.floor(tickUpper / tickSpacing) * tickSpacing,
      amount0Desired: token0Amount,
      amount1Desired: token1Amount,
      amount0Min: 0,
      amount1Min: 0,
      recipient: user.address,
      deadline: 2659537628,
    },
    {
      gasLimit: 12_450_000,
    }
  );
  await waitForTx(minter);
};

export const approveSwapRouter = async ({token, user}) => {
  const swapRouter = await getUniswapV3SwapRouter();
  await waitForTx(
    await token
      .connect(user.signer)
      .approve(swapRouter.address, MAX_UINT_AMOUNT)
  );
};

export const swapToken = async ({
  tokenIn,
  tokenOut,
  fee,
  amountIn,
  trader,
  zeroForOne,
}) => {
  const swapRouter = await getUniswapV3SwapRouter();
  await waitForTx(
    await swapRouter.connect(trader.signer).exactInputSingle(
      {
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        fee: fee,
        recipient: trader.address,
        deadline: 2659537628,
        amountIn: amountIn,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: zeroForOne
          ? BigNumber.from("4295128739").add(1)
          : BigNumber.from(
              "1461446703485210103287273052203988822378723970342"
            ).sub(1),
      },
      {
        gasLimit: 12_450_000,
      }
    )
  );
};

export const getV3Pool = async ({token0, token1, fee}) => {
  const factory = await getUniswapV3Factory();
  const poolAddress = await factory.getPool(
    token0.address,
    token1.address,
    fee
  );
  return IUniswapV3Pool__factory.connect(poolAddress, factory.provider);
};
