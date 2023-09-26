import {expect} from "chai";
import {waitForTx} from "../helpers/misc-utils";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";
import {
  createNewPool,
  mintNewPosition,
  fund,
  approveTo,
} from "./helpers/uniswapv3-helper";
import {encodeSqrtRatioX96, TickMath} from "@uniswap/v3-sdk";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {parseEther} from "ethers/lib/utils";
import {supplyAndValidate} from "./helpers/validated-steps";
import {VariableDebtToken} from "../types";
import {
  getIZUMIPositionManager,
  getNTokenIZUMI,
  getVariableDebtToken,
} from "../helpers/contracts-getters";
import {createIzumiNewPool, mintIzumiNewPosition} from "./helpers/izumi-helper";

describe("Pool LP Operation", () => {
  let variableDebtDai: VariableDebtToken;
  let variableDebtWeth: VariableDebtToken;

  const uniFixture = async () => {
    const testEnv = await loadFixture(testEnvFixture);

    const {
      users: [user1],
      dai,
      weth,
      nftPositionManager,
      nUniswapV3,
      pool,
      protocolDataProvider,
    } = testEnv;

    const {variableDebtTokenAddress: variableDebtDaiAddress} =
      await protocolDataProvider.getReserveTokensAddresses(dai.address);
    const {variableDebtTokenAddress: variableDebtWethAddress} =
      await protocolDataProvider.getReserveTokensAddresses(weth.address);
    variableDebtDai = await getVariableDebtToken(variableDebtDaiAddress);
    variableDebtWeth = await getVariableDebtToken(variableDebtWethAddress);

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

    return testEnv;
  };

  const izumiFixture = async () => {
    const testEnv = await loadFixture(testEnvFixture);

    const {
      users: [user1],
      dai,
      weth,
      pool,
      protocolDataProvider,
    } = testEnv;

    const {variableDebtTokenAddress: variableDebtDaiAddress} =
      await protocolDataProvider.getReserveTokensAddresses(dai.address);
    const {variableDebtTokenAddress: variableDebtWethAddress} =
      await protocolDataProvider.getReserveTokensAddresses(weth.address);
    variableDebtDai = await getVariableDebtToken(variableDebtDaiAddress);
    variableDebtWeth = await getVariableDebtToken(variableDebtWethAddress);

    const izumiPositionManager = await getIZUMIPositionManager();
    const nIzumiAddress = await pool.getReserveXToken(
      izumiPositionManager.address
    );
    const nTokenIzumi = await getNTokenIZUMI(nIzumiAddress);

    const userDaiAmount = await convertToCurrencyDecimals(dai.address, "10000");
    const userWethAmount = await convertToCurrencyDecimals(weth.address, "10");
    await fund({token: dai, user: user1, amount: userDaiAmount});
    await fund({token: weth, user: user1, amount: userWethAmount});
    const nft = izumiPositionManager.connect(user1.signer);
    await approveTo({
      target: izumiPositionManager.address,
      token: dai,
      user: user1,
    });
    await approveTo({
      target: izumiPositionManager.address,
      token: weth,
      user: user1,
    });
    const fee = 2000;
    const tickSpacing = fee / 50;
    const initialPrice = encodeSqrtRatioX96(1, 1000);
    const lowerPrice = encodeSqrtRatioX96(1, 10000);
    const upperPrice = encodeSqrtRatioX96(1, 100);
    await createIzumiNewPool({
      positionManager: nft,
      token0: dai,
      token1: weth,
      fee: fee,
      initialSqrtPrice: initialPrice,
    });
    await mintIzumiNewPosition({
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
    expect(await izumiPositionManager.balanceOf(user1.address)).to.eq(1);

    await nft.setApprovalForAll(pool.address, true);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .supplyERC721(
          izumiPositionManager.address,
          [{tokenId: 0, useAsCollateral: true}],
          user1.address,
          0,
          {
            gasLimit: 12_450_000,
          }
        )
    );

    expect(await nTokenIzumi.balanceOf(user1.address)).to.eq(1);

    return {...testEnv, izumiPositionManager, nTokenIzumi};
  };

  it("uni: borrow and mint new position [ @skip-on-coverage ]", async () => {
    const testEnv = await loadFixture(uniFixture);
    const {
      users: [user1, supplier],
      dai,
      weth,
      nftPositionManager,
      pool,
    } = testEnv;

    await supplyAndValidate(dai, "1000000", supplier, true);
    await supplyAndValidate(weth, "1000", supplier, true);

    const fee = 3000;
    const tickSpacing = fee / 50;
    const lowerPrice = encodeSqrtRatioX96(1, 20000);
    const upperPrice = encodeSqrtRatioX96(1, 50);
    let tickLower = TickMath.getTickAtSqrtRatio(lowerPrice);
    let tickUpper = TickMath.getTickAtSqrtRatio(upperPrice);
    (tickLower = Math.ceil(tickLower / tickSpacing) * tickSpacing),
      (tickUpper = Math.floor(tickUpper / tickSpacing) * tickSpacing),
      await waitForTx(
        await pool.connect(user1.signer).adjustLpPosition(
          {
            asset: nftPositionManager.address,
            token0: dai.address,
            token1: weth.address,
            token0CashAmount: 0,
            token1CashAmount: 0,
            token0BorrowAmount: parseEther("1000"),
            token1BorrowAmount: parseEther("1"),
          },
          {
            decreaseLiquidity: false,
            tokenId: 1,
            liquidityDecrease: 0,
            amount0Min: 0,
            amount1Min: 1,
            burnNFT: true,
          },
          {
            mintNewToken: true,
            fee: 3000,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: parseEther("1000"),
            amount1Desired: parseEther("1"),
            amount0Min: 0,
            amount1Min: 0,
          }
        )
      );

    const daiDebt = await variableDebtDai.balanceOf(user1.address);
    const wethDebt = await variableDebtWeth.balanceOf(user1.address);
    expect(daiDebt).to.be.closeTo(parseEther("1000"), parseEther("1"));
    expect(wethDebt).to.be.closeTo(parseEther("1"), parseEther("0.01"));
  });

  it("uni: adjust existing position: refund borrow [ @skip-on-coverage ]", async () => {
    const testEnv = await loadFixture(uniFixture);
    const {
      users: [user1, supplier],
      dai,
      weth,
      nftPositionManager,
      pool,
    } = testEnv;

    await fund({token: dai, user: user1, amount: parseEther("10000")});
    await fund({token: weth, user: user1, amount: parseEther("10")});
    await approveTo({
      target: pool.address,
      token: dai,
      user: user1,
    });
    await approveTo({
      target: pool.address,
      token: weth,
      user: user1,
    });
    await supplyAndValidate(dai, "1000000", supplier, true);
    await supplyAndValidate(weth, "1000", supplier, true);

    const beforeLiquidity = (await nftPositionManager.positions(1)).liquidity;

    const fee = 3000;
    const tickSpacing = fee / 50;
    const lowerPrice = encodeSqrtRatioX96(1, 20000);
    const upperPrice = encodeSqrtRatioX96(1, 50);
    let tickLower = TickMath.getTickAtSqrtRatio(lowerPrice);
    let tickUpper = TickMath.getTickAtSqrtRatio(upperPrice);
    (tickLower = Math.ceil(tickLower / tickSpacing) * tickSpacing),
      (tickUpper = Math.floor(tickUpper / tickSpacing) * tickSpacing),
      await waitForTx(
        await pool.connect(user1.signer).adjustLpPosition(
          {
            asset: nftPositionManager.address,
            token0: dai.address,
            token1: weth.address,
            token0CashAmount: parseEther("10000"),
            token1CashAmount: parseEther("10"),
            token0BorrowAmount: parseEther("10000"),
            token1BorrowAmount: parseEther("10"),
          },
          {
            decreaseLiquidity: true,
            tokenId: 1,
            liquidityDecrease: beforeLiquidity,
            amount0Min: 0,
            amount1Min: 1,
            burnNFT: true,
          },
          {
            mintNewToken: true,
            fee: 3000,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: parseEther("25000"),
            amount1Desired: parseEther("25"),
            amount0Min: 0,
            amount1Min: 0,
          }
        )
      );

    const daiDebt = await variableDebtDai.balanceOf(user1.address);
    const wethDebt = await variableDebtWeth.balanceOf(user1.address);
    expect(daiDebt).to.be.closeTo(parseEther("5000"), parseEther("10"));
    expect(wethDebt).to.be.closeTo(parseEther("5"), parseEther("0.1"));
  });

  it("uni: adjust existing position: refund cash [ @skip-on-coverage ]", async () => {
    const testEnv = await loadFixture(uniFixture);
    const {
      users: [user1, supplier],
      dai,
      weth,
      nftPositionManager,
      pool,
    } = testEnv;

    await fund({token: dai, user: user1, amount: parseEther("20000")});
    await fund({token: weth, user: user1, amount: parseEther("20")});
    await approveTo({
      target: pool.address,
      token: dai,
      user: user1,
    });
    await approveTo({
      target: pool.address,
      token: weth,
      user: user1,
    });
    await supplyAndValidate(dai, "1000000", supplier, true);
    await supplyAndValidate(weth, "1000", supplier, true);

    const beforeLiquidity = (await nftPositionManager.positions(1)).liquidity;

    const fee = 3000;
    const tickSpacing = fee / 50;
    const lowerPrice = encodeSqrtRatioX96(1, 20000);
    const upperPrice = encodeSqrtRatioX96(1, 50);
    let tickLower = TickMath.getTickAtSqrtRatio(lowerPrice);
    let tickUpper = TickMath.getTickAtSqrtRatio(upperPrice);
    (tickLower = Math.ceil(tickLower / tickSpacing) * tickSpacing),
      (tickUpper = Math.floor(tickUpper / tickSpacing) * tickSpacing),
      await waitForTx(
        await pool.connect(user1.signer).adjustLpPosition(
          {
            asset: nftPositionManager.address,
            token0: dai.address,
            token1: weth.address,
            token0CashAmount: parseEther("20000"),
            token1CashAmount: parseEther("20"),
            token0BorrowAmount: 0,
            token1BorrowAmount: 0,
          },
          {
            decreaseLiquidity: true,
            tokenId: 1,
            liquidityDecrease: beforeLiquidity,
            amount0Min: 0,
            amount1Min: 1,
            burnNFT: true,
          },
          {
            mintNewToken: true,
            fee: 3000,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: parseEther("25000"),
            amount1Desired: parseEther("25"),
            amount0Min: 0,
            amount1Min: 0,
          }
        )
      );

    const daiBalance = await dai.balanceOf(user1.address);
    const ethBalance = await weth.balanceOf(user1.address);
    expect(daiBalance).to.be.closeTo(parseEther("5000"), parseEther("10"));
    expect(ethBalance).to.be.closeTo(parseEther("5"), parseEther("0.1"));
  });

  it("uni: adjust existing position: refund liquidity [ @skip-on-coverage ]", async () => {
    const testEnv = await loadFixture(uniFixture);
    const {
      users: [user1, supplier],
      dai,
      pDai,
      weth,
      pWETH,
      nftPositionManager,
      pool,
    } = testEnv;

    await supplyAndValidate(dai, "1000000", supplier, true);
    await supplyAndValidate(weth, "1000", supplier, true);

    const beforeLiquidity = (await nftPositionManager.positions(1)).liquidity;

    const fee = 3000;
    const tickSpacing = fee / 50;
    const lowerPrice = encodeSqrtRatioX96(1, 20000);
    const upperPrice = encodeSqrtRatioX96(1, 50);
    let tickLower = TickMath.getTickAtSqrtRatio(lowerPrice);
    let tickUpper = TickMath.getTickAtSqrtRatio(upperPrice);
    (tickLower = Math.ceil(tickLower / tickSpacing) * tickSpacing),
      (tickUpper = Math.floor(tickUpper / tickSpacing) * tickSpacing),
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
            liquidityDecrease: beforeLiquidity,
            amount0Min: 0,
            amount1Min: 1,
            burnNFT: true,
          },
          {
            mintNewToken: true,
            fee: 3000,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: parseEther("5000"),
            amount1Desired: parseEther("5"),
            amount0Min: 0,
            amount1Min: 0,
          }
        )
      );

    const pDaiBalance = await pDai.balanceOf(user1.address);
    const pEthBalance = await pWETH.balanceOf(user1.address);
    expect(pDaiBalance).to.be.closeTo(parseEther("5000"), parseEther("10"));
    expect(pEthBalance).to.be.closeTo(parseEther("5"), parseEther("0.1"));
  });

  it("uni: adjust existing position: refund all [ @skip-on-coverage ]", async () => {
    const testEnv = await loadFixture(uniFixture);
    const {
      users: [user1, supplier],
      dai,
      pDai,
      weth,
      pWETH,
      nftPositionManager,
      pool,
    } = testEnv;

    await fund({token: dai, user: user1, amount: parseEther("10000")});
    await fund({token: weth, user: user1, amount: parseEther("10")});
    await approveTo({
      target: pool.address,
      token: dai,
      user: user1,
    });
    await approveTo({
      target: pool.address,
      token: weth,
      user: user1,
    });
    await supplyAndValidate(dai, "1000000", supplier, true);
    await supplyAndValidate(weth, "1000", supplier, true);

    const beforeLiquidity = (await nftPositionManager.positions(1)).liquidity;

    const fee = 3000;
    const tickSpacing = fee / 50;
    const lowerPrice = encodeSqrtRatioX96(1, 20000);
    const upperPrice = encodeSqrtRatioX96(1, 50);
    let tickLower = TickMath.getTickAtSqrtRatio(lowerPrice);
    let tickUpper = TickMath.getTickAtSqrtRatio(upperPrice);
    (tickLower = Math.ceil(tickLower / tickSpacing) * tickSpacing),
      (tickUpper = Math.floor(tickUpper / tickSpacing) * tickSpacing),
      await waitForTx(
        await pool.connect(user1.signer).adjustLpPosition(
          {
            asset: nftPositionManager.address,
            token0: dai.address,
            token1: weth.address,
            token0CashAmount: parseEther("10000"),
            token1CashAmount: parseEther("10"),
            token0BorrowAmount: parseEther("10000"),
            token1BorrowAmount: parseEther("10"),
          },
          {
            decreaseLiquidity: true,
            tokenId: 1,
            liquidityDecrease: beforeLiquidity,
            amount0Min: 0,
            amount1Min: 1,
            burnNFT: true,
          },
          {
            mintNewToken: true,
            fee: 3000,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: parseEther("5000"),
            amount1Desired: parseEther("5"),
            amount0Min: 0,
            amount1Min: 0,
          }
        )
      );

    const daiDebt = await variableDebtDai.balanceOf(user1.address);
    const wethDebt = await variableDebtWeth.balanceOf(user1.address);
    expect(daiDebt).to.be.eq("0");
    expect(wethDebt).to.be.eq("0");
    const daiBalance = await dai.balanceOf(user1.address);
    const ethBalance = await weth.balanceOf(user1.address);
    expect(daiBalance).to.be.closeTo(parseEther("10000"), parseEther("10"));
    expect(ethBalance).to.be.closeTo(parseEther("10"), parseEther("1"));
    const pDaiBalance = await pDai.balanceOf(user1.address);
    const pEthBalance = await pWETH.balanceOf(user1.address);
    expect(pDaiBalance).to.be.closeTo(parseEther("5000"), parseEther("10"));
    expect(pEthBalance).to.be.closeTo(parseEther("5"), parseEther("0.1"));
  });

  it("izumi: borrow and mint new position [ @skip-on-coverage ]", async () => {
    const testEnv = await loadFixture(izumiFixture);
    const {
      users: [user1, supplier],
      dai,
      weth,
      izumiPositionManager,
      pool,
    } = testEnv;

    await supplyAndValidate(dai, "1000000", supplier, true);
    await supplyAndValidate(weth, "1000", supplier, true);

    const fee = 2000;
    const tickSpacing = fee / 50;
    const lowerPrice = encodeSqrtRatioX96(1, 20000);
    const upperPrice = encodeSqrtRatioX96(1, 50);
    let tickLower = TickMath.getTickAtSqrtRatio(lowerPrice);
    let tickUpper = TickMath.getTickAtSqrtRatio(upperPrice);
    (tickLower = Math.ceil(tickLower / tickSpacing) * tickSpacing),
      (tickUpper = Math.floor(tickUpper / tickSpacing) * tickSpacing),
      await waitForTx(
        await pool.connect(user1.signer).adjustLpPosition(
          {
            asset: izumiPositionManager.address,
            token0: dai.address,
            token1: weth.address,
            token0CashAmount: 0,
            token1CashAmount: 0,
            token0BorrowAmount: parseEther("1000"),
            token1BorrowAmount: parseEther("1"),
          },
          {
            decreaseLiquidity: false,
            tokenId: 0,
            liquidityDecrease: 0,
            amount0Min: 0,
            amount1Min: 1,
            burnNFT: true,
          },
          {
            mintNewToken: true,
            fee: 2000,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: parseEther("1000"),
            amount1Desired: parseEther("1"),
            amount0Min: 0,
            amount1Min: 0,
          }
        )
      );

    const daiDebt = await variableDebtDai.balanceOf(user1.address);
    const wethDebt = await variableDebtWeth.balanceOf(user1.address);
    expect(daiDebt).to.be.closeTo(parseEther("1000"), parseEther("1"));
    expect(wethDebt).to.be.closeTo(parseEther("1"), parseEther("0.01"));
  });

  it("izumi: adjust existing position: refund borrow [ @skip-on-coverage ]", async () => {
    const testEnv = await loadFixture(izumiFixture);
    const {
      users: [user1, supplier],
      dai,
      weth,
      izumiPositionManager,
      pool,
    } = testEnv;

    await fund({token: dai, user: user1, amount: parseEther("10000")});
    await fund({token: weth, user: user1, amount: parseEther("10")});
    await approveTo({
      target: pool.address,
      token: dai,
      user: user1,
    });
    await approveTo({
      target: pool.address,
      token: weth,
      user: user1,
    });
    await supplyAndValidate(dai, "1000000", supplier, true);
    await supplyAndValidate(weth, "1000", supplier, true);

    const beforeLiquidity = (await izumiPositionManager.liquidities(0))
      .liquidity;

    const fee = 2000;
    const tickSpacing = fee / 50;
    const lowerPrice = encodeSqrtRatioX96(1, 20000);
    const upperPrice = encodeSqrtRatioX96(1, 50);
    let tickLower = TickMath.getTickAtSqrtRatio(lowerPrice);
    let tickUpper = TickMath.getTickAtSqrtRatio(upperPrice);
    (tickLower = Math.ceil(tickLower / tickSpacing) * tickSpacing),
      (tickUpper = Math.floor(tickUpper / tickSpacing) * tickSpacing),
      await waitForTx(
        await pool.connect(user1.signer).adjustLpPosition(
          {
            asset: izumiPositionManager.address,
            token0: dai.address,
            token1: weth.address,
            token0CashAmount: parseEther("10000"),
            token1CashAmount: parseEther("10"),
            token0BorrowAmount: parseEther("10000"),
            token1BorrowAmount: parseEther("10"),
          },
          {
            decreaseLiquidity: true,
            tokenId: 0,
            liquidityDecrease: beforeLiquidity,
            amount0Min: 0,
            amount1Min: 1,
            burnNFT: true,
          },
          {
            mintNewToken: true,
            fee: 2000,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: parseEther("25000"),
            amount1Desired: parseEther("25"),
            amount0Min: 0,
            amount1Min: 0,
          }
        )
      );

    const daiDebt = await variableDebtDai.balanceOf(user1.address);
    const wethDebt = await variableDebtWeth.balanceOf(user1.address);
    expect(daiDebt).to.be.closeTo(parseEther("5000"), parseEther("15"));
    expect(wethDebt).to.be.closeTo(parseEther("5"), parseEther("0.1"));
  });

  it("izumi: adjust existing position: refund cash [ @skip-on-coverage ]", async () => {
    const testEnv = await loadFixture(izumiFixture);
    const {
      users: [user1, supplier],
      dai,
      weth,
      izumiPositionManager,
      pool,
    } = testEnv;

    await fund({token: dai, user: user1, amount: parseEther("20000")});
    await fund({token: weth, user: user1, amount: parseEther("20")});
    await approveTo({
      target: pool.address,
      token: dai,
      user: user1,
    });
    await approveTo({
      target: pool.address,
      token: weth,
      user: user1,
    });
    await supplyAndValidate(dai, "1000000", supplier, true);
    await supplyAndValidate(weth, "1000", supplier, true);

    const beforeLiquidity = (await izumiPositionManager.liquidities(0))
      .liquidity;

    const fee = 2000;
    const tickSpacing = fee / 50;
    const lowerPrice = encodeSqrtRatioX96(1, 20000);
    const upperPrice = encodeSqrtRatioX96(1, 50);
    let tickLower = TickMath.getTickAtSqrtRatio(lowerPrice);
    let tickUpper = TickMath.getTickAtSqrtRatio(upperPrice);
    (tickLower = Math.ceil(tickLower / tickSpacing) * tickSpacing),
      (tickUpper = Math.floor(tickUpper / tickSpacing) * tickSpacing),
      await waitForTx(
        await pool.connect(user1.signer).adjustLpPosition(
          {
            asset: izumiPositionManager.address,
            token0: dai.address,
            token1: weth.address,
            token0CashAmount: parseEther("20000"),
            token1CashAmount: parseEther("20"),
            token0BorrowAmount: 0,
            token1BorrowAmount: 0,
          },
          {
            decreaseLiquidity: true,
            tokenId: 0,
            liquidityDecrease: beforeLiquidity,
            amount0Min: 0,
            amount1Min: 1,
            burnNFT: true,
          },
          {
            mintNewToken: true,
            fee: 2000,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: parseEther("25000"),
            amount1Desired: parseEther("25"),
            amount0Min: 0,
            amount1Min: 0,
          }
        )
      );

    const daiBalance = await dai.balanceOf(user1.address);
    const ethBalance = await weth.balanceOf(user1.address);
    expect(daiBalance).to.be.closeTo(parseEther("5000"), parseEther("15"));
    expect(ethBalance).to.be.closeTo(parseEther("5"), parseEther("0.1"));
  });

  it("izumi: adjust existing position: refund liquidity [ @skip-on-coverage ]", async () => {
    const testEnv = await loadFixture(izumiFixture);
    const {
      users: [user1, supplier],
      dai,
      pDai,
      weth,
      pWETH,
      izumiPositionManager,
      pool,
    } = testEnv;

    await supplyAndValidate(dai, "1000000", supplier, true);
    await supplyAndValidate(weth, "1000", supplier, true);

    const beforeLiquidity = (await izumiPositionManager.liquidities(0))
      .liquidity;

    const fee = 2000;
    const tickSpacing = fee / 50;
    const lowerPrice = encodeSqrtRatioX96(1, 20000);
    const upperPrice = encodeSqrtRatioX96(1, 50);
    let tickLower = TickMath.getTickAtSqrtRatio(lowerPrice);
    let tickUpper = TickMath.getTickAtSqrtRatio(upperPrice);
    (tickLower = Math.ceil(tickLower / tickSpacing) * tickSpacing),
      (tickUpper = Math.floor(tickUpper / tickSpacing) * tickSpacing),
      await waitForTx(
        await pool.connect(user1.signer).adjustLpPosition(
          {
            asset: izumiPositionManager.address,
            token0: dai.address,
            token1: weth.address,
            token0CashAmount: 0,
            token1CashAmount: 0,
            token0BorrowAmount: 0,
            token1BorrowAmount: 0,
          },
          {
            decreaseLiquidity: true,
            tokenId: 0,
            liquidityDecrease: beforeLiquidity,
            amount0Min: 0,
            amount1Min: 1,
            burnNFT: true,
          },
          {
            mintNewToken: true,
            fee: 2000,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: parseEther("5000"),
            amount1Desired: parseEther("5"),
            amount0Min: 0,
            amount1Min: 0,
          }
        )
      );

    const pDaiBalance = await pDai.balanceOf(user1.address);
    const pEthBalance = await pWETH.balanceOf(user1.address);
    expect(pDaiBalance).to.be.closeTo(parseEther("5000"), parseEther("15"));
    expect(pEthBalance).to.be.closeTo(parseEther("5"), parseEther("0.1"));
  });

  it("izumi: adjust existing position: refund all [ @skip-on-coverage ]", async () => {
    const testEnv = await loadFixture(izumiFixture);
    const {
      users: [user1, supplier],
      dai,
      pDai,
      weth,
      pWETH,
      izumiPositionManager,
      pool,
    } = testEnv;

    await fund({token: dai, user: user1, amount: parseEther("10000")});
    await fund({token: weth, user: user1, amount: parseEther("10")});
    await approveTo({
      target: pool.address,
      token: dai,
      user: user1,
    });
    await approveTo({
      target: pool.address,
      token: weth,
      user: user1,
    });
    await supplyAndValidate(dai, "1000000", supplier, true);
    await supplyAndValidate(weth, "1000", supplier, true);

    const beforeLiquidity = (await izumiPositionManager.liquidities(0))
      .liquidity;

    const fee = 2000;
    const tickSpacing = fee / 50;
    const lowerPrice = encodeSqrtRatioX96(1, 20000);
    const upperPrice = encodeSqrtRatioX96(1, 50);
    let tickLower = TickMath.getTickAtSqrtRatio(lowerPrice);
    let tickUpper = TickMath.getTickAtSqrtRatio(upperPrice);
    (tickLower = Math.ceil(tickLower / tickSpacing) * tickSpacing),
      (tickUpper = Math.floor(tickUpper / tickSpacing) * tickSpacing),
      await waitForTx(
        await pool.connect(user1.signer).adjustLpPosition(
          {
            asset: izumiPositionManager.address,
            token0: dai.address,
            token1: weth.address,
            token0CashAmount: parseEther("10000"),
            token1CashAmount: parseEther("10"),
            token0BorrowAmount: parseEther("10000"),
            token1BorrowAmount: parseEther("10"),
          },
          {
            decreaseLiquidity: true,
            tokenId: 0,
            liquidityDecrease: beforeLiquidity,
            amount0Min: 0,
            amount1Min: 1,
            burnNFT: true,
          },
          {
            mintNewToken: true,
            fee: 2000,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: parseEther("5000"),
            amount1Desired: parseEther("5"),
            amount0Min: 0,
            amount1Min: 0,
          }
        )
      );

    const daiDebt = await variableDebtDai.balanceOf(user1.address);
    const wethDebt = await variableDebtWeth.balanceOf(user1.address);
    expect(daiDebt).to.be.eq("0");
    expect(wethDebt).to.be.eq("0");
    const daiBalance = await dai.balanceOf(user1.address);
    const ethBalance = await weth.balanceOf(user1.address);
    expect(daiBalance).to.be.closeTo(parseEther("10000"), parseEther("10"));
    expect(ethBalance).to.be.closeTo(parseEther("10"), parseEther("1"));
    const pDaiBalance = await pDai.balanceOf(user1.address);
    const pEthBalance = await pWETH.balanceOf(user1.address);
    expect(pDaiBalance).to.be.closeTo(parseEther("5000"), parseEther("15"));
    expect(pEthBalance).to.be.closeTo(parseEther("5"), parseEther("0.1"));
  });
});
