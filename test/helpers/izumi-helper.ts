import {
  getIZUMISwapRouter,
  getIZUMIFactory,
} from "../../helpers/contracts-getters";
import {TickMath} from "@uniswap/v3-sdk";
import {BigNumber, BigNumberish} from "ethers";
import {expect} from "chai";
import {waitForTx} from "../../helpers/misc-utils";
import {MAX_UINT_AMOUNT} from "../../helpers/constants";
import {IZiSwapPool__factory} from "../../types";
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
    await positionManager.createPool(
      token0.address,
      token1.address,
      fee,
      TickMath.getTickAtSqrtRatio(initialSqrtPrice),
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
      miner: user.address,
      tokenX: token0.address,
      tokenY: token1.address,
      fee,
      pl: Math.ceil(tickLower / tickSpacing) * tickSpacing,
      pr: Math.floor(tickUpper / tickSpacing) * tickSpacing,
      xLim: token0Amount,
      yLim: token1Amount,
      amountXMin: 0,
      amountYMin: 0,
      deadline: 2659537628,
    },
    {
      gasLimit: 12_450_000,
    }
  );
  await waitForTx(minter);
};

export const approveSwapRouter = async ({token, user}) => {
  const swapRouter = await getIZUMISwapRouter();
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
  const swapRouter = await getIZUMISwapRouter();
  if (zeroForOne) {
    await waitForTx(
      await swapRouter.connect(trader.signer).swapX2Y(
        {
          tokenX: tokenIn.address,
          tokenY: tokenOut.address,
          fee: fee,
          boundaryPt: -800001,
          recipient: trader.address,
          amount: amountIn,
          maxPayed: 0,
          minAcquired: 0,
          deadline: 2659537628,
        },
        {
          gasLimit: 12_450_000,
        }
      )
    );
  } else {
    await waitForTx(
      await swapRouter.connect(trader.signer).swapY2X(
        {
          tokenX: tokenOut.address,
          tokenY: tokenIn.address,
          fee: fee,
          boundaryPt: 800001,
          recipient: trader.address,
          amount: amountIn,
          maxPayed: 0,
          minAcquired: 0,
          deadline: 2659537628,
        },
        {
          gasLimit: 12_450_000,
        }
      )
    );
  }
};

export const getIZUMIPool = async ({token0, token1, fee}) => {
  const factory = await getIZUMIFactory();
  const poolAddress = await factory.pool(token0.address, token1.address, fee);
  return IZiSwapPool__factory.connect(poolAddress, factory.provider);
};
