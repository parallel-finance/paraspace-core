import {expect} from "chai";
import {makeSuite, revertHead, setSnapshot} from "./helpers/make-suite";
import {waitForTx} from "../deploy/helpers/misc-utils";
import {ZERO_ADDRESS} from "../deploy/helpers/constants";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {
  almostEqual,
  createNewPool,
  mintNewPosition,
  approveSwapRouter,
  swapToken,
  fund,
  approveTo,
} from "../deploy/helpers/uniswapv3-helper";
import {encodeSqrtRatioX96} from "@uniswap/v3-sdk";
import {
  getUniswapV3Gateway,
  getUniswapV3OracleWrapper,
} from "../deploy/helpers/contracts-getters";
import {RateMode} from "../deploy/helpers/types";

makeSuite("Uniswap V3", (testEnv) => {
  describe("Uniswap V3 NFT position control", () => {
    before(async () => {
      await setSnapshot();
    });
    after(async () => {
      await revertHead();
    });

    it("User creates new Uniswap V3 pool and mints NFT [ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        dai,
        weth,
        nftPositionManager,
        nUniswapV3,
      } = testEnv;

      const userDaiAmount = await convertToCurrencyDecimals(
        dai.address,
        "10000"
      );
      const userWethAmount = await convertToCurrencyDecimals(
        weth.address,
        "10"
      );
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

      const uniswapV3Gateway = (await getUniswapV3Gateway()).connect(
        user1.signer
      );
      await nft.setApprovalForAll(uniswapV3Gateway.address, true);

      await uniswapV3Gateway.supplyUniswapV3(
        ZERO_ADDRESS,
        [{tokenId: 1, useAsCollateral: true}],
        user1.address,
        {
          gasLimit: 12_450_000,
        }
      );

      expect(await nUniswapV3.balanceOf(user1.address)).to.eq(1);
    });

    it("increaseLiquidity by nftPositionManager [ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        dai,
        weth,
        nftPositionManager,
        nUniswapV3,
      } = testEnv;

      const userDaiAmount = await convertToCurrencyDecimals(
        dai.address,
        "10000"
      );
      const userWethAmount = await convertToCurrencyDecimals(
        weth.address,
        "10"
      );
      await fund({token: dai, user: user1, amount: userDaiAmount});
      await fund({token: weth, user: user1, amount: userWethAmount});
      await approveTo({target: nUniswapV3.address, token: dai, user: user1});
      await approveTo({target: nUniswapV3.address, token: weth, user: user1});

      const beforeLiquidity = (await nftPositionManager.positions(1)).liquidity;

      await nftPositionManager.connect(user1.signer).increaseLiquidity(
        {
          tokenId: 1,
          amount0Desired: userDaiAmount,
          amount1Desired: userWethAmount,
          amount0Min: 0,
          amount1Min: 0,
          deadline: 2659537628,
        },
        {
          gasLimit: 12_450_000,
        }
      );

      const afterLiquidity = (await nftPositionManager.positions(1)).liquidity;

      expect(afterLiquidity).to.gt(beforeLiquidity);
    });

    it("increaseLiquidity with ETH by nftPositionManager [ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        dai,
        weth,
        nftPositionManager,
        nUniswapV3,
      } = testEnv;

      const userDaiAmount = await convertToCurrencyDecimals(
        dai.address,
        "10000"
      );
      const userWethAmount = await convertToCurrencyDecimals(
        weth.address,
        "20"
      );
      await fund({token: dai, user: user1, amount: userDaiAmount});

      const beforeLiquidity = (await nftPositionManager.positions(1)).liquidity;
      const beforeBalance = await user1.signer.getBalance();

      await nftPositionManager.connect(user1.signer).increaseLiquidity(
        {
          tokenId: 1,
          amount0Desired: userDaiAmount,
          amount1Desired: userWethAmount,
          amount0Min: 0,
          amount1Min: 0,
          deadline: 2659537628,
        },
        {
          gasLimit: 12_450_000,
          value: userWethAmount,
        }
      );
      await nftPositionManager.connect(user1.signer).refundETH();

      const afterLiquidity = (await nftPositionManager.positions(1)).liquidity;
      const afterBalance = await user1.signer.getBalance();

      expect(afterLiquidity).to.gt(beforeLiquidity);
      //got refund
      almostEqual(beforeBalance.sub(afterBalance), userWethAmount.div(2));
    });

    it("decreaseLiquidity by NTokenUniswapV3 [ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        dai,
        weth,
        nftPositionManager,
        nUniswapV3,
      } = testEnv;

      const userDaiAmount = await convertToCurrencyDecimals(
        dai.address,
        "10000"
      );
      const userWethAmount = await convertToCurrencyDecimals(
        weth.address,
        "10"
      );

      const beforeDaiBalance = await dai.balanceOf(user1.address);
      const beforeEthBalance = await weth.balanceOf(user1.address);
      const beforeLiquidity = (await nftPositionManager.positions(1)).liquidity;

      await nUniswapV3
        .connect(user1.signer)
        .decreaseUniswapV3Liquidity(1, beforeLiquidity.div(3), 0, 0, false, {
          gasLimit: 12_450_000,
        });

      const afterDaiBalance = await dai.balanceOf(user1.address);
      const afterEthBalance = await weth.balanceOf(user1.address);
      const afterLiquidity = (await nftPositionManager.positions(1)).liquidity;

      almostEqual(afterDaiBalance.sub(beforeDaiBalance), userDaiAmount);
      almostEqual(afterEthBalance.sub(beforeEthBalance), userWethAmount);
      almostEqual(afterLiquidity, beforeLiquidity.div(3).mul(2));
    });

    it("decreaseLiquidity with ETH by NTokenUniswapV3 [ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        dai,
        weth,
        nftPositionManager,
        nUniswapV3,
      } = testEnv;

      const userDaiAmount = await convertToCurrencyDecimals(
        dai.address,
        "10000"
      );
      const userWethAmount = await convertToCurrencyDecimals(
        weth.address,
        "10"
      );

      const beforeDaiBalance = await dai.balanceOf(user1.address);
      const beforeBalance = await user1.signer.getBalance();
      const beforeLiquidity = (await nftPositionManager.positions(1)).liquidity;

      await nUniswapV3
        .connect(user1.signer)
        .decreaseUniswapV3Liquidity(1, beforeLiquidity.div(2), 0, 0, true, {
          gasLimit: 12_450_000,
        });

      const afterDaiBalance = await dai.balanceOf(user1.address);
      const afterBalance = await user1.signer.getBalance();
      const afterLiquidity = (await nftPositionManager.positions(1)).liquidity;

      almostEqual(afterDaiBalance.sub(beforeDaiBalance), userDaiAmount);
      almostEqual(afterBalance.sub(beforeBalance), userWethAmount);
      almostEqual(afterLiquidity, beforeLiquidity.div(2));
    });

    it("collect fee by decreaseLiquidity by NTokenUniswapV3 [ @skip-on-coverage ]", async () => {
      const {
        users: [user1, trader],
        dai,
        weth,
        nftPositionManager,
        nUniswapV3,
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
      const beforeEthBalance = await weth.balanceOf(user1.address);
      const beforeLiquidity = (await nftPositionManager.positions(1)).liquidity;

      await nUniswapV3
        .connect(user1.signer)
        .decreaseUniswapV3Liquidity(1, 0, 0, 0, false, {
          gasLimit: 12_450_000,
        });

      const afterDaiBalance = await dai.balanceOf(user1.address);
      const afterEthBalance = await weth.balanceOf(user1.address);
      const afterLiquidity = (await nftPositionManager.positions(1)).liquidity;

      expect(afterEthBalance).to.eq(beforeEthBalance);
      expect(afterLiquidity).to.eq(beforeLiquidity);
      almostEqual(
        afterDaiBalance.sub(beforeDaiBalance),
        await convertToCurrencyDecimals(dai.address, "3")
      );
    });
  });

  describe("Uniswap V3 NFT borrow and liquidation logic", () => {
    before(async () => {
      await setSnapshot();
    });
    after(async () => {
      await revertHead();
    });

    it("User creates new Uniswap V3 pool and mints NFT [ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        dai,
        weth,
        nftPositionManager,
        nUniswapV3,
      } = testEnv;

      const userDaiAmount = await convertToCurrencyDecimals(
        dai.address,
        "10000"
      );
      const userWethAmount = await convertToCurrencyDecimals(
        weth.address,
        "10"
      );
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

      const uniswapV3Gateway = (await getUniswapV3Gateway()).connect(
        user1.signer
      );
      await nft.setApprovalForAll(uniswapV3Gateway.address, true);

      await uniswapV3Gateway.supplyUniswapV3(
        ZERO_ADDRESS,
        [{tokenId: 1, useAsCollateral: true}],
        user1.address,
        {
          gasLimit: 12_450_000,
        }
      );

      expect(await nUniswapV3.balanceOf(user1.address)).to.eq(1);
    });

    it("borrow asset by using univ3 as collateral [ @skip-on-coverage ]", async () => {
      const {
        users: [user1, depositor],
        weth,
        dai,
        pool,
        paraspaceOracle,
        oracle,
      } = testEnv;

      const ethAmount = await convertToCurrencyDecimals(weth.address, "30");
      await fund({token: weth, user: depositor, amount: ethAmount});
      await approveTo({
        target: pool.address,
        token: weth,
        user: depositor,
      });
      await waitForTx(
        await pool
          .connect(depositor.signer)
          .supply(weth.address, ethAmount, depositor.address, "0")
      );

      await waitForTx(
        await paraspaceOracle.setAssetSources([dai.address], [ZERO_ADDRESS])
      );
      await oracle.setAssetPrice(dai.address, "1000000000000000"); //weth = 1000 dai

      const nftValue = await convertToCurrencyDecimals(weth.address, "20");
      const borrowableValue = await convertToCurrencyDecimals(
        weth.address,
        "15"
      );

      const uniV3Oracle = await getUniswapV3OracleWrapper();
      const tokenPrice = await uniV3Oracle.getTokenPrice(1);
      almostEqual(tokenPrice, nftValue);

      const userAccountData = await pool.getUserAccountData(user1.address);
      expect(userAccountData.ltv).to.eq(7500);
      almostEqual(userAccountData.availableBorrowsBase, borrowableValue);

      await waitForTx(
        await pool
          .connect(user1.signer)
          .borrow(
            weth.address,
            userAccountData.availableBorrowsBase.sub(1),
            RateMode.Variable,
            "0",
            user1.address
          )
      );
    });

    it("univ3 nft can be liquidated [ @skip-on-coverage ]", async () => {
      const {
        users: [user1, liquidator],
        dai,
        weth,
        pool,
        oracle,
        nftPositionManager,
        nUniswapV3,
      } = testEnv;

      await oracle.setAssetPrice(dai.address, "100000000000000"); //weth = 10000 dai

      const ethAmount = await convertToCurrencyDecimals(weth.address, "6");
      await fund({token: weth, user: liquidator, amount: ethAmount});
      await approveTo({
        target: pool.address,
        token: weth,
        user: liquidator,
      });

      let user1Balance = await nUniswapV3.balanceOf(user1.address);
      let liquidatorBalance = await nUniswapV3.balanceOf(liquidator.address);
      expect(user1Balance).to.eq(1);
      expect(liquidatorBalance).to.eq(0);

      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .liquidationERC721(
            nftPositionManager.address,
            weth.address,
            user1.address,
            1,
            ethAmount,
            true
          )
      );

      user1Balance = await nUniswapV3.balanceOf(user1.address);
      liquidatorBalance = await nUniswapV3.balanceOf(liquidator.address);
      expect(user1Balance).to.eq(0);
      expect(liquidatorBalance).to.eq(1);
    });
  });
});
