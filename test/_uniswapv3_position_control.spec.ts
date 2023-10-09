import {expect} from "chai";
import {TestEnv} from "./helpers/make-suite";
import {waitForTx} from "../helpers/misc-utils";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";
import {
  almostEqual,
  createNewPool,
  mintNewPosition,
  approveSwapRouter,
  swapToken,
  fund,
  approveTo,
} from "./helpers/uniswapv3-helper";
import {encodeSqrtRatioX96} from "@uniswap/v3-sdk";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";

describe("Uniswap V3 NFT position control", () => {
  let testEnv: TestEnv;

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);

    const {
      users: [user1],
      dai,
      weth,
      nftPositionManager,
      nUniswapV3,
      pool,
    } = testEnv;

    const userDaiAmount = await convertToCurrencyDecimals(dai.address, "10000");
    const userWethAmount = await convertToCurrencyDecimals(weth.address, "10");
    await fund({token: dai, user: user1, amount: userDaiAmount});
    await fund({token: weth, user: user1, amount: userWethAmount});
    const nft = nftPositionManager.connect(user1.signer);
    await approveTo({
      target: nftPositionManager.address,
      token: dai,
      user: user1,
    });
    await approveTo({
      target: nftPositionManager.address,
      token: weth,
      user: user1,
    });
    const fee = 3000;
    const tickSpacing = fee / 50;
    const initialPrice = encodeSqrtRatioX96(1, 1000);
    const lowerPrice = encodeSqrtRatioX96(1, 10000);
    const upperPrice = encodeSqrtRatioX96(1, 100);
    await createNewPool({
      positionManager: nft,
      token0: dai,
      token1: weth,
      fee: fee,
      initialSqrtPrice: initialPrice.toString(),
    });
    await mintNewPosition({
      nft: nft,
      token0: dai,
      token1: weth,
      fee: fee,
      user: user1,
      tickSpacing: tickSpacing,
      lowerPrice,
      upperPrice,
      token0Amount: userDaiAmount,
      token1Amount: userWethAmount,
    });
    expect(await nftPositionManager.balanceOf(user1.address)).to.eq(1);

    await nft.setApprovalForAll(pool.address, true);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .supplyERC721(
          nftPositionManager.address,
          [{tokenId: 1, useAsCollateral: true}],
          user1.address,
          0,
          {
            gasLimit: 12_450_000,
          }
        )
    );

    expect(await nUniswapV3.balanceOf(user1.address)).to.eq(1);
  });

  it("increaseLiquidity by nUniswapV3 [ @skip-on-coverage ]", async () => {
    const {
      users: [user1],
      dai,
      weth,
      nftPositionManager,
      nUniswapV3,
      pool,
    } = testEnv;

    const userDaiAmount = await convertToCurrencyDecimals(dai.address, "20000");
    const userWethAmount = await convertToCurrencyDecimals(weth.address, "10");
    await fund({token: dai, user: user1, amount: userDaiAmount});
    await fund({token: weth, user: user1, amount: userWethAmount});
    await approveTo({target: nUniswapV3.address, token: dai, user: user1});
    await approveTo({target: nUniswapV3.address, token: weth, user: user1});

    const beforeLiquidity = (await nftPositionManager.positions(1)).liquidity;

    await waitForTx(
      await pool
        .connect(user1.signer)
        .increaseLiquidity(
          nftPositionManager.address,
          1,
          userDaiAmount,
          userWethAmount,
          0,
          0,
          2659537628
        )
    );

    const afterLiquidity = (await nftPositionManager.positions(1)).liquidity;

    almostEqual(afterLiquidity, beforeLiquidity.mul(2));
    //test refund. fund userDaiAmount , should left userDaiAmount.
    almostEqual(await dai.balanceOf(user1.address), userDaiAmount.div(2));
  });

  it("increaseLiquidity with ETH by nUniswapV3 [ @skip-on-coverage ]", async () => {
    const {
      users: [user1],
      pool,
      dai,
      weth,
      nftPositionManager,
      nUniswapV3,
    } = testEnv;

    const userDaiAmount = await convertToCurrencyDecimals(dai.address, "10000");
    const userWethAmount = await convertToCurrencyDecimals(weth.address, "20");
    await fund({token: dai, user: user1, amount: userDaiAmount});
    await approveTo({target: nUniswapV3.address, token: dai, user: user1});

    const beforeLiquidity = (await nftPositionManager.positions(1)).liquidity;
    const beforeBalance = await user1.signer.getBalance();

    await waitForTx(
      await pool
        .connect(user1.signer)
        .increaseLiquidity(
          nftPositionManager.address,
          1,
          userDaiAmount,
          userWethAmount,
          0,
          0,
          2659537628,
          {
            gasLimit: 12_450_000,
            value: userWethAmount,
          }
        )
    );

    const afterLiquidity = (await nftPositionManager.positions(1)).liquidity;
    const afterBalance = await user1.signer.getBalance();

    almostEqual(afterLiquidity, beforeLiquidity.div(2).mul(3));
    // user sent 20, so the remaining 10 are refunded back to the user
    almostEqual(beforeBalance.sub(afterBalance), userWethAmount.div(2));
  });

  it("decreaseLiquidity by NTokenUniswapV3 [ @skip-on-coverage ]", async () => {
    const {
      users: [user1],
      dai,
      pDai,
      weth,
      pWETH,
      nftPositionManager,
      pool,
      protocolDataProvider,
    } = testEnv;

    const userDaiAmount = await convertToCurrencyDecimals(dai.address, "10000");
    const userWethAmount = await convertToCurrencyDecimals(weth.address, "10");

    const beforeDaiBalance = await dai.balanceOf(user1.address);
    const beforeEthBalance = await weth.balanceOf(user1.address);
    const beforeLiquidity = (await nftPositionManager.positions(1)).liquidity;

    let userReserveData = await protocolDataProvider.getUserReserveData(
      dai.address,
      user1.address
    );
    expect(userReserveData.usageAsCollateralEnabled).to.be.false;
    userReserveData = await protocolDataProvider.getUserReserveData(
      weth.address,
      user1.address
    );
    expect(userReserveData.usageAsCollateralEnabled).to.be.false;

    await waitForTx(
      await pool.connect(user1.signer).adjustLpPosition(
        {
          asset: nftPositionManager.address,
          token0: dai.address,
          token1: weth.address,
          token0CashAmount: 0,
          token1CashAmount: 0,
          token0BorrowAmount: 0,
          token1BorrowAmount: 0,
        },
        {
          decreaseLiquidity: true,
          tokenId: 1,
          liquidityDecrease: beforeLiquidity.div(3),
          amount0Min: 0,
          amount1Min: 0,
          burnNFT: false,
        },
        {
          mintNewToken: false,
          fee: 2000,
          tickLower: 0,
          tickUpper: 0,
          amount0Desired: 0,
          amount1Desired: 0,
          amount0Min: 0,
          amount1Min: 0,
          deadline: 0,
        }
      )
    );

    const afterDaiBalance = (await dai.balanceOf(user1.address)).add(
      await pDai.balanceOf(user1.address)
    );
    const afterEthBalance = (await weth.balanceOf(user1.address)).add(
      await pWETH.balanceOf(user1.address)
    );
    const afterLiquidity = (await nftPositionManager.positions(1)).liquidity;

    almostEqual(afterDaiBalance.sub(beforeDaiBalance), userDaiAmount);
    almostEqual(afterEthBalance.sub(beforeEthBalance), userWethAmount);
    almostEqual(afterLiquidity, beforeLiquidity.div(3).mul(2));

    userReserveData = await protocolDataProvider.getUserReserveData(
      dai.address,
      user1.address
    );

    expect(userReserveData.usageAsCollateralEnabled).to.be.true;
    userReserveData = await protocolDataProvider.getUserReserveData(
      weth.address,
      user1.address
    );
    expect(userReserveData.usageAsCollateralEnabled).to.be.true;
  });

  it("collect fee by decreaseLiquidity by NTokenUniswapV3 [ @skip-on-coverage ]", async () => {
    const {
      users: [user1, trader],
      dai,
      pDai,
      weth,
      nftPositionManager,
      pool,
    } = testEnv;

    const traderDaiAmount = await convertToCurrencyDecimals(
      dai.address,
      "1000"
    );
    await fund({token: dai, user: trader, amount: traderDaiAmount});
    await approveSwapRouter({token: dai, user: trader});

    const fee = 3000;
    await swapToken({
      tokenIn: dai,
      tokenOut: weth,
      fee,
      amountIn: traderDaiAmount,
      trader,
      zeroForOne: true,
    });

    const beforeDaiBalance = await dai.balanceOf(user1.address);
    const beforepDaiBalance = await pDai.balanceOf(user1.address);
    const beforeEthBalance = await weth.balanceOf(user1.address);
    const beforeLiquidity = (await nftPositionManager.positions(1)).liquidity;

    await waitForTx(
      await pool.connect(user1.signer).adjustLpPosition(
        {
          asset: nftPositionManager.address,
          token0: dai.address,
          token1: weth.address,
          token0CashAmount: 0,
          token1CashAmount: 0,
          token0BorrowAmount: 0,
          token1BorrowAmount: 0,
        },
        {
          decreaseLiquidity: true,
          tokenId: 1,
          liquidityDecrease: 0,
          amount0Min: 0,
          amount1Min: 0,
          burnNFT: false,
        },
        {
          mintNewToken: false,
          fee: 2000,
          tickLower: 0,
          tickUpper: 0,
          amount0Desired: 0,
          amount1Desired: 0,
          amount0Min: 0,
          amount1Min: 0,
          deadline: 0,
        }
      )
    );

    const afterDaiBalance = await dai.balanceOf(user1.address);
    const afterpDaiBalance = await pDai.balanceOf(user1.address);
    const afterEthBalance = await weth.balanceOf(user1.address);
    const afterLiquidity = (await nftPositionManager.positions(1)).liquidity;

    expect(afterEthBalance).to.eq(beforeEthBalance);
    expect(afterDaiBalance).to.eq(beforeDaiBalance);
    expect(afterLiquidity).to.eq(beforeLiquidity);
    almostEqual(
      afterpDaiBalance.sub(beforepDaiBalance),
      await convertToCurrencyDecimals(dai.address, "3")
    );
  });
});
