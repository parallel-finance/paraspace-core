import {expect} from "chai";
import {BigNumber} from "ethers";
import {TestEnv} from "./helpers/make-suite";
import {advanceBlock, waitForTx} from "../deploy/helpers/misc-utils";
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
} from "./helpers/uniswapv3-helper";
import {encodeSqrtRatioX96} from "@uniswap/v3-sdk";
import {getUniswapV3OracleWrapper} from "../deploy/helpers/contracts-getters";
import {ProtocolErrors} from "../deploy/helpers/types";
import {DRE} from "../deploy/helpers/misc-utils";
import {
  liquidateAndValidate,
  switchCollateralAndValidate,
  withdrawAndValidate,
} from "./helpers/validated-steps";
import {snapshot} from "./helpers/snapshot-manager";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";

describe("Uniswap V3", () => {
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

      const encodedData0 = nftPositionManager.interface.encodeFunctionData(
        "increaseLiquidity",
        [
          {
            tokenId: 1,
            amount0Desired: userDaiAmount,
            amount1Desired: userWethAmount,
            amount0Min: 0,
            amount1Min: 0,
            deadline: 2659537628,
          },
        ]
      );

      const Multicall = await DRE.ethers.getContractAt(
        "IMulticall",
        nftPositionManager.address
      );
      await waitForTx(
        await Multicall.connect(user1.signer).multicall([encodedData0], {
          gasLimit: 12_450_000,
        })
      );

      const afterLiquidity = (await nftPositionManager.positions(1)).liquidity;

      almostEqual(afterLiquidity, beforeLiquidity.mul(2));
    });

    it("increaseLiquidity with ETH by nftPositionManager [ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        dai,
        weth,
        nftPositionManager,
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

      const encodedData0 = nftPositionManager.interface.encodeFunctionData(
        "increaseLiquidity",
        [
          {
            tokenId: 1,
            amount0Desired: userDaiAmount,
            amount1Desired: userWethAmount,
            amount0Min: 0,
            amount1Min: 0,
            deadline: 2659537628,
          },
        ]
      );
      const encodedData1 =
        nftPositionManager.interface.encodeFunctionData("refundETH");

      const Multicall = await DRE.ethers.getContractAt(
        "IMulticall",
        nftPositionManager.address
      );

      await waitForTx(
        await Multicall.connect(user1.signer).multicall(
          [encodedData0, encodedData1],
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
        weth,
        nftPositionManager,
        pool,
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

      await waitForTx(
        await pool
          .connect(user1.signer)
          .decreaseUniswapV3Liquidity(
            nftPositionManager.address,
            1,
            beforeLiquidity.div(3),
            0,
            0,
            false,
            {
              gasLimit: 12_450_000,
            }
          )
      );

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
        pool,
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

      await waitForTx(
        await pool
          .connect(user1.signer)
          .decreaseUniswapV3Liquidity(
            nftPositionManager.address,
            1,
            beforeLiquidity.div(2),
            0,
            0,
            true,
            {
              gasLimit: 12_450_000,
            }
          )
      );

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
      const beforeEthBalance = await weth.balanceOf(user1.address);
      const beforeLiquidity = (await nftPositionManager.positions(1)).liquidity;

      await waitForTx(
        await pool
          .connect(user1.signer)
          .decreaseUniswapV3Liquidity(
            nftPositionManager.address,
            1,
            0,
            0,
            0,
            false,
            {
              gasLimit: 12_450_000,
            }
          )
      );

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

  describe("Uniswap V3 NFT supply, withdraw, setCollateral, liquidation and transfer test", () => {
    let testEnv: TestEnv;
    before(async () => {
      testEnv = await loadFixture(testEnvFixture);

      const {
        users: [user1],
        dai,
        weth,
        nftPositionManager,
        pool,
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

      await nft.setApprovalForAll(pool.address, true);
    });

    it("supply Uniswap V3 failed if underlying erc20 was inactive[ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        weth,
        nftPositionManager,
        pool,
        configurator,
      } = testEnv;

      await waitForTx(await configurator.setReserveActive(weth.address, false));
      await expect(
        pool
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
      ).to.be.revertedWith(ProtocolErrors.RESERVE_INACTIVE);
    });

    it("supply Uniswap V3 success if underlying erc20 was active[ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        weth,
        nftPositionManager,
        pool,
        configurator,
        nUniswapV3,
      } = testEnv;

      await waitForTx(await configurator.setReserveActive(weth.address, true));
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

    it("supply Uniswap V3 failed if underlying erc20 was paused[ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        weth,
        nftPositionManager,
        pool,
        configurator,
      } = testEnv;

      await waitForTx(
        await pool
          .connect(user1.signer)
          .withdrawERC721(nftPositionManager.address, [1], user1.address, {
            gasLimit: 12_450_000,
          })
      );

      await waitForTx(await configurator.setReservePause(weth.address, true));
      await expect(
        pool
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
      ).to.be.revertedWith(ProtocolErrors.RESERVE_PAUSED);
    });

    it("supply Uniswap V3 success if underlying erc20 was not paused[ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        weth,
        nftPositionManager,
        pool,
        configurator,
        nUniswapV3,
      } = testEnv;

      await waitForTx(await configurator.setReservePause(weth.address, false));
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

    it("supply Uniswap V3 failed if underlying erc20 was frozen[ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        weth,
        nftPositionManager,
        pool,
        configurator,
      } = testEnv;

      await waitForTx(
        await pool
          .connect(user1.signer)
          .withdrawERC721(nftPositionManager.address, [1], user1.address, {
            gasLimit: 12_450_000,
          })
      );

      await waitForTx(await configurator.setReserveFreeze(weth.address, true));
      await expect(
        pool
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
      ).to.be.revertedWith(ProtocolErrors.RESERVE_FROZEN);
    });

    it("supply Uniswap V3 success if underlying erc20 was not frozen[ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        weth,
        nftPositionManager,
        pool,
        configurator,
        nUniswapV3,
      } = testEnv;

      await waitForTx(await configurator.setReserveFreeze(weth.address, false));
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

    it("withdraw Uniswap V3 failed if underlying erc20 was not active[ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        weth,
        nftPositionManager,
        pool,
        configurator,
      } = testEnv;

      await waitForTx(await configurator.setReserveActive(weth.address, false));
      await expect(
        pool
          .connect(user1.signer)
          .withdrawERC721(nftPositionManager.address, [1], user1.address, {
            gasLimit: 12_450_000,
          })
      ).to.be.revertedWith(ProtocolErrors.RESERVE_INACTIVE);
    });

    it("withdraw Uniswap V3 success if underlying erc20 was active[ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        weth,
        nftPositionManager,
        pool,
        configurator,
      } = testEnv;

      await waitForTx(await configurator.setReserveActive(weth.address, true));
      await waitForTx(
        await pool
          .connect(user1.signer)
          .withdrawERC721(nftPositionManager.address, [1], user1.address, {
            gasLimit: 12_450_000,
          })
      );
      expect(await nftPositionManager.balanceOf(user1.address)).to.eq(1);
    });

    it("withdraw Uniswap V3 failed if underlying erc20 was paused[ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        weth,
        nftPositionManager,
        pool,
        configurator,
      } = testEnv;

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
      await waitForTx(await configurator.setReservePause(weth.address, true));
      await expect(
        pool
          .connect(user1.signer)
          .withdrawERC721(nftPositionManager.address, [1], user1.address, {
            gasLimit: 12_450_000,
          })
      ).to.be.revertedWith(ProtocolErrors.RESERVE_PAUSED);
    });

    it("withdraw Uniswap V3 success if underlying erc20 was not paused[ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        weth,
        nftPositionManager,
        pool,
        configurator,
      } = testEnv;

      await waitForTx(await configurator.setReservePause(weth.address, false));
      await waitForTx(
        await pool
          .connect(user1.signer)
          .withdrawERC721(nftPositionManager.address, [1], user1.address, {
            gasLimit: 12_450_000,
          })
      );
      expect(await nftPositionManager.balanceOf(user1.address)).to.eq(1);
    });

    it("setAsCollateral failed if underlying erc20 was not active[ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        weth,
        nftPositionManager,
        pool,
        configurator,
      } = testEnv;

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
      await waitForTx(await configurator.setReserveActive(weth.address, false));
      await expect(
        pool
          .connect(user1.signer)
          .setUserUseERC721AsCollateral(
            nftPositionManager.address,
            [1],
            false,
            {
              gasLimit: 12_450_000,
            }
          )
      ).to.be.revertedWith(ProtocolErrors.RESERVE_INACTIVE);
    });

    it("setAsCollateral success if underlying erc20 was active[ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        weth,
        nftPositionManager,
        nUniswapV3,
        pool,
        configurator,
      } = testEnv;

      await waitForTx(await configurator.setReserveActive(weth.address, true));
      await waitForTx(
        await pool
          .connect(user1.signer)
          .setUserUseERC721AsCollateral(
            nftPositionManager.address,
            [1],
            false,
            {
              gasLimit: 12_450_000,
            }
          )
      );
      expect(await nUniswapV3.collateralizedBalanceOf(user1.address)).to.eq(0);
    });

    it("setAsCollateral failed if underlying erc20 was paused[ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        weth,
        nftPositionManager,
        pool,
        configurator,
      } = testEnv;

      await waitForTx(await configurator.setReservePause(weth.address, true));
      await expect(
        pool
          .connect(user1.signer)
          .setUserUseERC721AsCollateral(nftPositionManager.address, [1], true, {
            gasLimit: 12_450_000,
          })
      ).to.be.revertedWith(ProtocolErrors.RESERVE_PAUSED);
    });

    it("setAsCollateral success if underlying erc20 was not paused[ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        weth,
        nftPositionManager,
        nUniswapV3,
        pool,
        configurator,
      } = testEnv;

      await waitForTx(await configurator.setReservePause(weth.address, false));
      await waitForTx(
        await pool
          .connect(user1.signer)
          .setUserUseERC721AsCollateral(nftPositionManager.address, [1], true, {
            gasLimit: 12_450_000,
          })
      );
      expect(await nUniswapV3.collateralizedBalanceOf(user1.address)).to.eq(1);
    });

    it("decreaseUniswapV3Liquidity failed if underlying erc20 was not active [ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        configurator,
        weth,
        pool,
        nftPositionManager,
      } = testEnv;

      await waitForTx(await configurator.setReserveActive(weth.address, false));

      const beforeLiquidity = (await nftPositionManager.positions(1)).liquidity;

      await expect(
        pool
          .connect(user1.signer)
          .decreaseUniswapV3Liquidity(
            nftPositionManager.address,
            1,
            beforeLiquidity.div(2),
            0,
            0,
            false,
            {
              gasLimit: 12_450_000,
            }
          )
      ).to.be.revertedWith(ProtocolErrors.RESERVE_INACTIVE);
    });

    it("decreaseUniswapV3Liquidity success if underlying erc20 was active [ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        weth,
        pool,
        configurator,
        nftPositionManager,
      } = testEnv;

      await waitForTx(await configurator.setReserveActive(weth.address, true));

      const preLiquidationSnapshot = await snapshot.take();

      const beforeLiquidity = (await nftPositionManager.positions(1)).liquidity;

      await waitForTx(
        await pool
          .connect(user1.signer)
          .decreaseUniswapV3Liquidity(
            nftPositionManager.address,
            1,
            beforeLiquidity.div(2),
            0,
            0,
            false,
            {
              gasLimit: 12_450_000,
            }
          )
      );

      await snapshot.revert(preLiquidationSnapshot);
    });

    it("decreaseUniswapV3Liquidity failed if underlying erc20 was paused [ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        configurator,
        weth,
        pool,
        nftPositionManager,
      } = testEnv;

      await waitForTx(await configurator.setReservePause(weth.address, true));

      const beforeLiquidity = (await nftPositionManager.positions(1)).liquidity;

      await expect(
        pool
          .connect(user1.signer)
          .decreaseUniswapV3Liquidity(
            nftPositionManager.address,
            1,
            beforeLiquidity.div(2),
            0,
            0,
            false,
            {
              gasLimit: 12_450_000,
            }
          )
      ).to.be.revertedWith(ProtocolErrors.RESERVE_PAUSED);
    });

    it("decreaseUniswapV3Liquidity success if underlying erc20 was not paused [ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        weth,
        pool,
        nftPositionManager,
        configurator,
      } = testEnv;

      await waitForTx(await configurator.setReservePause(weth.address, false));

      const preLiquidationSnapshot = await snapshot.take();

      const beforeLiquidity = (await nftPositionManager.positions(1)).liquidity;

      await waitForTx(
        await pool
          .connect(user1.signer)
          .decreaseUniswapV3Liquidity(
            nftPositionManager.address,
            1,
            beforeLiquidity.div(2),
            0,
            0,
            false,
            {
              gasLimit: 12_450_000,
            }
          )
      );

      await snapshot.revert(preLiquidationSnapshot);
    });

    it("decreaseUniswapV3Liquidity failed if not owner [ @skip-on-coverage ]", async () => {
      const {users, pool, nftPositionManager} = testEnv;

      const beforeLiquidity = (await nftPositionManager.positions(1)).liquidity;

      await expect(
        pool
          .connect(users[1].signer)
          .decreaseUniswapV3Liquidity(
            nftPositionManager.address,
            1,
            beforeLiquidity.div(2),
            0,
            0,
            false,
            {
              gasLimit: 12_450_000,
            }
          )
      ).to.be.revertedWith(ProtocolErrors.NOT_THE_OWNER);
    });

    it("transfer failed if underlying erc20 was paused [ @skip-on-coverage ]", async () => {
      const {
        users: [user1, user2],
        configurator,
        weth,
        nUniswapV3,
      } = testEnv;

      await waitForTx(await configurator.setReservePause(weth.address, true));

      await expect(
        nUniswapV3
          .connect(user1.signer)
          .transferFrom(user1.address, user2.address, 1, {
            gasLimit: 12_450_000,
          })
      ).to.be.revertedWith(ProtocolErrors.RESERVE_PAUSED);
    });

    it("transfer success if underlying erc20 was not paused [ @skip-on-coverage ]", async () => {
      const {
        users: [user1, user2],
        weth,
        nUniswapV3,
        configurator,
      } = testEnv;
      await waitForTx(await configurator.setReservePause(weth.address, false));

      const preLiquidationSnapshot = await snapshot.take();

      await waitForTx(
        await nUniswapV3
          .connect(user1.signer)
          .transferFrom(user1.address, user2.address, 1, {
            gasLimit: 12_450_000,
          })
      );

      expect(await nUniswapV3.balanceOf(user1.address)).to.eq(0);
      expect(await nUniswapV3.balanceOf(user2.address)).to.eq(1);

      await snapshot.revert(preLiquidationSnapshot);
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
        "6"
      );

      const uniV3Oracle = await getUniswapV3OracleWrapper();
      const tokenPrice = await uniV3Oracle.getTokenPrice(1);
      almostEqual(tokenPrice, nftValue);

      const userAccountData = await pool.getUserAccountData(user1.address);
      expect(userAccountData.ltv).to.eq(3000);
      almostEqual(userAccountData.availableBorrowsBase, borrowableValue);

      await waitForTx(
        await pool
          .connect(user1.signer)
          .borrow(
            weth.address,
            userAccountData.availableBorrowsBase.sub(1),
            "0",
            user1.address
          )
      );
    });

    it("decreaseUniswapV3Liquidity failed if hf < 1 [ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        pool,
        nftPositionManager,
      } = testEnv;
      // get current liquidity
      const beforeLiquidity = (await nftPositionManager.positions(1)).liquidity;

      await expect(
        pool
          .connect(user1.signer)
          .decreaseUniswapV3Liquidity(
            nftPositionManager.address,
            1,
            beforeLiquidity.mul(3).div(4),
            0,
            0,
            false,
            {
              gasLimit: 12_450_000,
            }
          )
      ).to.be.revertedWith(
        ProtocolErrors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
      );
    });

    it("transfer failed if hf < 1 [ @skip-on-coverage ]", async () => {
      const {
        users: [user1, user2],
        nUniswapV3,
      } = testEnv;

      await expect(
        nUniswapV3
          .connect(user1.signer)
          .transferFrom(user1.address, user2.address, 1, {
            gasLimit: 12_450_000,
          })
      ).to.be.revertedWith(
        ProtocolErrors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
      );
    });

    it("UniswapV3 asset can be auctioned [ @skip-on-coverage ]", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        oracle,
        dai,
        weth,
        nftPositionManager,
        nUniswapV3,
      } = testEnv;
      await oracle.setAssetPrice(dai.address, "100000000000000"); //weth = 10000 dai

      const ethAmount = await convertToCurrencyDecimals(weth.address, "20");
      await fund({token: weth, user: liquidator, amount: ethAmount});
      await approveTo({
        target: pool.address,
        token: weth,
        user: liquidator,
      });

      const user1Balance = await nUniswapV3.balanceOf(borrower.address);
      const liquidatorBalance = await nUniswapV3.balanceOf(liquidator.address);
      expect(user1Balance).to.eq(1);
      expect(liquidatorBalance).to.eq(0);

      // try to start auction
      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .startAuction(borrower.address, nftPositionManager.address, 1)
      );

      expect(await nUniswapV3.isAuctioned(1)).to.be.true;
    });

    it("liquidation failed if underlying erc20 was not active [ @skip-on-coverage ]", async () => {
      const {
        users: [user1, liquidator],
        configurator,
        weth,
        dai,
        pool,
        nftPositionManager,
      } = testEnv;

      await waitForTx(await configurator.setReserveActive(dai.address, false));

      const liquidationValue = await convertToCurrencyDecimals(
        weth.address,
        "20"
      );

      await expect(
        pool
          .connect(liquidator.signer)
          .liquidationERC721(
            nftPositionManager.address,
            user1.address,
            1,
            liquidationValue,
            true,
            {
              gasLimit: 12_450_000,
            }
          )
      ).to.be.revertedWith(ProtocolErrors.RESERVE_INACTIVE);
    });

    it("liquidation success if underlying erc20 was active [ @skip-on-coverage ]", async () => {
      const {
        users: [user1, liquidator],
        weth,
        dai,
        pool,
        configurator,
        nftPositionManager,
      } = testEnv;

      await waitForTx(await configurator.setReserveActive(dai.address, true));

      const preLiquidationSnapshot = await snapshot.take();

      const liquidationValue = await convertToCurrencyDecimals(
        weth.address,
        "20"
      );

      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .liquidationERC721(
            nftPositionManager.address,
            user1.address,
            1,
            liquidationValue,
            true,
            {
              gasLimit: 12_450_000,
            }
          )
      );

      await snapshot.revert(preLiquidationSnapshot);
    });

    it("liquidation failed if underlying erc20 was paused [ @skip-on-coverage ]", async () => {
      const {
        users: [user1, liquidator],
        configurator,
        weth,
        pool,
        nftPositionManager,
      } = testEnv;

      await waitForTx(await configurator.setReservePause(weth.address, true));

      const liquidationValue = await convertToCurrencyDecimals(
        weth.address,
        "20"
      );

      await expect(
        pool
          .connect(liquidator.signer)
          .liquidationERC721(
            nftPositionManager.address,
            user1.address,
            1,
            liquidationValue,
            true,
            {
              gasLimit: 12_450_000,
            }
          )
      ).to.be.revertedWith(ProtocolErrors.RESERVE_PAUSED);
    });

    it("liquidation success if underlying erc20 was not paused [ @skip-on-coverage ]", async () => {
      const {
        users: [user1, liquidator],
        weth,
        pool,
        nftPositionManager,
        configurator,
      } = testEnv;

      await waitForTx(await configurator.setReservePause(weth.address, false));

      const preLiquidationSnapshot = await snapshot.take();

      const liquidationValue = await convertToCurrencyDecimals(
        weth.address,
        "20"
      );

      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .liquidationERC721(
            nftPositionManager.address,
            user1.address,
            1,
            liquidationValue,
            true,
            {
              gasLimit: 12_450_000,
            }
          )
      );

      await snapshot.revert(preLiquidationSnapshot);
    });

    it("univ3 nft can be liquidated - receive UniswapV3 [ @skip-on-coverage ]", async () => {
      const {
        users: [borrower, liquidator],
        nftPositionManager,
        nUniswapV3,
        pool,
        weth,
      } = testEnv;
      const preLiquidationSnapshot = await snapshot.take();

      const {startTime, tickLength} = await pool.getAuctionData(
        nUniswapV3.address,
        1
      );

      // prices drops to ~1 floor price
      await advanceBlock(
        startTime.add(tickLength.mul(BigNumber.from(40))).toNumber()
      );

      await liquidateAndValidate(
        nftPositionManager,
        weth,
        "5",
        liquidator,
        borrower,
        false,
        1
      );

      const user1Balance = await nftPositionManager.balanceOf(borrower.address);
      const liquidatorBalance = await nftPositionManager.balanceOf(
        liquidator.address
      );
      expect(user1Balance).to.eq(0);
      expect(liquidatorBalance).to.eq(1);

      await snapshot.revert(preLiquidationSnapshot);
    });

    it("univ3 nft can be liquidated - receive nToken [ @skip-on-coverage ]", async () => {
      const {
        users: [borrower, liquidator],
        weth,
        pool,
        nftPositionManager,
        nUniswapV3,
      } = testEnv;

      const {startTime, tickLength} = await pool.getAuctionData(
        nUniswapV3.address,
        1
      );

      // prices drops to ~1 floor price
      await advanceBlock(
        startTime.add(tickLength.mul(BigNumber.from(40))).toNumber()
      );

      const ethAmount = await convertToCurrencyDecimals(weth.address, "6");
      await fund({token: weth, user: liquidator, amount: ethAmount});
      await approveTo({
        target: pool.address,
        token: weth,
        user: liquidator,
      });

      let user1Balance = await nUniswapV3.balanceOf(borrower.address);
      let liquidatorBalance = await nUniswapV3.balanceOf(liquidator.address);
      expect(user1Balance).to.eq(1);
      expect(liquidatorBalance).to.eq(0);

      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .liquidationERC721(
            nftPositionManager.address,
            borrower.address,
            1,
            ethAmount,
            true
          )
      );

      user1Balance = await nUniswapV3.balanceOf(borrower.address);
      liquidatorBalance = await nUniswapV3.balanceOf(liquidator.address);
      expect(user1Balance).to.eq(0);
      expect(liquidatorBalance).to.eq(1);
    });

    it("liquidator can remove nUniswapV3 from collateral [ @skip-on-coverage ]", async () => {
      const {
        users: [, liquidator],
        nftPositionManager,
      } = testEnv;

      await switchCollateralAndValidate(
        liquidator,
        nftPositionManager,
        false,
        1
      );
    });

    it("liquidator can withdraw the nUniswapV3 [ @skip-on-coverage ]", async () => {
      const {
        users: [, liquidator],
        nUniswapV3,
        nftPositionManager,
      } = testEnv;
      const liquidatorBalance = await nUniswapV3.balanceOf(liquidator.address); // 1

      await withdrawAndValidate(
        nftPositionManager,
        liquidatorBalance.toString(),
        liquidator,
        1
      );
    });
  });

  describe("Uniswap V3 LTV Validation", () => {
    let testEnv: TestEnv;
    before(async () => {
      testEnv = await loadFixture(testEnvFixture);
    });

    it("User creates new Uniswap V3 pool and mints NFT [ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        dai,
        weth,
        nftPositionManager,
        pool,
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

      await waitForTx(await nft.setApprovalForAll(pool.address, true));

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
    });

    it("check ltv strategy [ @skip-on-coverage ]", async () => {
      const {
        dai,
        weth,
        nftPositionManager,
        pool,
        configurator,
        protocolDataProvider,
      } = testEnv;

      const daiConfig = await protocolDataProvider.getReserveConfigurationData(
        dai.address
      );
      expect(daiConfig.ltv).to.be.equal(7500);
      expect(daiConfig.liquidationThreshold).to.be.equal(8000);

      const wethConfig = await protocolDataProvider.getReserveConfigurationData(
        weth.address
      );
      expect(wethConfig.ltv).to.be.equal(8250);
      expect(wethConfig.liquidationThreshold).to.be.equal(8500);

      const uniCollectionConfig =
        await protocolDataProvider.getReserveConfigurationData(
          nftPositionManager.address
        );
      expect(uniCollectionConfig.ltv).to.be.equal(3000);
      expect(uniCollectionConfig.liquidationThreshold).to.be.equal(7000);

      let uniTokenConfig = await pool.getAssetLtvAndLT(
        nftPositionManager.address,
        1
      );
      expect(uniTokenConfig.ltv).to.be.equal(uniCollectionConfig.ltv);
      expect(uniTokenConfig.lt).to.be.equal(
        uniCollectionConfig.liquidationThreshold
      );

      // Set DAI LTV = 0
      await waitForTx(
        await configurator.configureReserveAsCollateral(
          dai.address,
          0,
          8000,
          10500
        )
      );

      uniTokenConfig = await pool.getAssetLtvAndLT(
        nftPositionManager.address,
        1
      );
      expect(uniTokenConfig.ltv).to.be.equal(0);
    });

    it("user supply weth and borrow dai [ @skip-on-coverage ]", async () => {
      const {
        users: [user1, user2],
        dai,
        weth,
        pool,
      } = testEnv;

      const daiSupplyAmount = await convertToCurrencyDecimals(
        dai.address,
        "100"
      );
      const daiBorrowAmount = await convertToCurrencyDecimals(dai.address, "1");
      const wethSupplyAmount = await convertToCurrencyDecimals(
        weth.address,
        "10"
      );
      await fund({token: dai, user: user2, amount: daiSupplyAmount});
      await fund({token: weth, user: user1, amount: wethSupplyAmount});
      await approveTo({
        target: pool.address,
        token: dai,
        user: user2,
      });
      await approveTo({
        target: pool.address,
        token: weth,
        user: user1,
      });

      await waitForTx(
        await pool
          .connect(user2.signer)
          .supply(dai.address, daiSupplyAmount, user2.address, 0)
      );
      await waitForTx(
        await pool
          .connect(user1.signer)
          .supply(weth.address, wethSupplyAmount, user1.address, 0)
      );

      await waitForTx(
        await pool
          .connect(user1.signer)
          .borrow(dai.address, daiBorrowAmount, 0, user1.address)
      );
    });

    it("user can only withdraw uniswapv3 [ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        weth,
        nftPositionManager,
        pool,
      } = testEnv;
      const {LTV_VALIDATION_FAILED} = ProtocolErrors;

      const wethWithdrawAmount = await convertToCurrencyDecimals(
        weth.address,
        "10"
      );
      await expect(
        pool
          .connect(user1.signer)
          .withdraw(weth.address, wethWithdrawAmount, user1.address)
      ).to.be.revertedWith(LTV_VALIDATION_FAILED);

      await waitForTx(
        await pool
          .connect(user1.signer)
          .withdrawERC721(nftPositionManager.address, [1], user1.address)
      );
    });
  });
});
