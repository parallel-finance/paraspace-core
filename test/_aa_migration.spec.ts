import {testEnvFixture} from "./helpers/setup-env";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {getVariableDebtToken} from "../helpers/contracts-getters";
import {expect} from "chai";
import {
  convertToCurrencyDecimals,
  isBorrowing,
  isUsingAsCollateral,
} from "../helpers/contracts-helpers";
import {
  approveTo,
  createNewPool,
  fund,
  mintNewPosition,
} from "./helpers/uniswapv3-helper";
import {encodeSqrtRatioX96} from "@uniswap/v3-sdk";
import {waitForTx} from "../helpers/misc-utils";
import {supplyAndValidate} from "./helpers/validated-steps";
import {parseEther} from "ethers/lib/utils";
import {BigNumber} from "ethers";

describe("Account Abstraction Migration", () => {
  let variableDebt;
  let daiData;
  let wethData;
  let uniswapData;

  const fixture = async () => {
    const testEnv = await loadFixture(testEnvFixture);

    const {
      users: [user1, user2],
      dai,
      pDai,
      weth,
      pWETH,
      nftPositionManager,
      pool,
      nUniswapV3,
      protocolDataProvider,
    } = testEnv;

    daiData = await pool.getReserveData(dai.address);
    wethData = await pool.getReserveData(weth.address);
    uniswapData = await pool.getReserveData(nftPositionManager.address);

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

    const daiAmount = parseEther("10000");
    const wethAmount = parseEther("100");
    const borrowDaiAmount = parseEther("5000");
    await supplyAndValidate(dai, "10000", user2, true);
    await supplyAndValidate(weth, "100", user1, true);
    await waitForTx(
      await pool
        .connect(user1.signer)
        .borrow(dai.address, borrowDaiAmount, 0, user1.address)
    );
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

    expect(await pDai.balanceOf(user2.address)).to.be.closeTo(
      daiAmount,
      parseEther("1")
    );
    expect(await pWETH.balanceOf(user1.address)).to.be.closeTo(
      wethAmount,
      parseEther("0.01")
    );
    expect(await nUniswapV3.balanceOf(user1.address)).to.eq(1);

    const {variableDebtTokenAddress: variableDebtTokenAddress} =
      await protocolDataProvider.getReserveTokensAddresses(dai.address);
    variableDebt = await getVariableDebtToken(variableDebtTokenAddress);
    expect(await variableDebt.balanceOf(user1.address)).to.be.closeTo(
      borrowDaiAmount,
      parseEther("1")
    );

    return testEnv;
  };

  it("position batch migration one by one", async () => {
    const testEnv = await loadFixture(fixture);
    const {
      users: [user1, user2],
      pool,
      dai,
      pDai,
      weth,
      pWETH,
      nUniswapV3,
      nftPositionManager,
    } = testEnv;

    const daiAmount = parseEther("10000");
    const wethAmount = parseEther("100");
    const borrowDaiAmount = parseEther("5000");

    let txReceipt = await waitForTx(
      await pool.connect(user2.signer).batchPositionMoveToAA([user1.address], [1])
    );
    let logLength = txReceipt.logs.length;
    let aaAccount = "0x" + txReceipt.logs[logLength - 1].data.substring(26);

    expect(await pWETH.balanceOf(aaAccount)).to.be.closeTo(
      wethAmount,
      parseEther("0.01")
    );
    expect(await nUniswapV3.balanceOf(aaAccount)).to.eq(1);
    expect(await variableDebt.balanceOf(aaAccount)).to.be.closeTo(
      borrowDaiAmount,
      parseEther("1")
    );

    txReceipt = await waitForTx(
      await pool.connect(user2.signer).batchPositionMoveToAA([user2.address], [2])
    );
    logLength = txReceipt.logs.length;
    aaAccount = "0x" + txReceipt.logs[logLength - 1].data.substring(26);

    expect(await pDai.balanceOf(aaAccount)).to.be.closeTo(
      daiAmount,
      parseEther("1")
    );

    expect(await dai.balanceOf(pDai.address)).to.be.closeTo(
      borrowDaiAmount,
      parseEther("1")
    );
    expect(await weth.balanceOf(pWETH.address)).to.be.closeTo(
      wethAmount,
      parseEther("0.01")
    );
    expect(await nftPositionManager.balanceOf(nUniswapV3.address)).to.be.eq(1);
  });

  it("position batch migration0", async () => {
    const testEnv = await loadFixture(fixture);
    const {
      users: [user1, user2],
      pool,
      pDai,
      dai,
      weth,
      pWETH,
      nftPositionManager,
      nUniswapV3,
    } = testEnv;

    const daiAmount = parseEther("10000");
    const wethAmount = parseEther("100");
    const borrowDaiAmount = parseEther("5000");

    const txReceipt = await waitForTx(
      await pool
        .connect(user2.signer)
        .batchPositionMoveToAA([user1.address, user2.address], [1, 2])
    );
    const logLength = txReceipt.logs.length;
    const aaAccount = "0x" + txReceipt.logs[logLength - 1].data.substring(26);

    expect(await pDai.balanceOf(aaAccount)).to.be.closeTo(
      daiAmount,
      parseEther("1")
    );

    expect(await dai.balanceOf(pDai.address)).to.be.closeTo(
      borrowDaiAmount,
      parseEther("1")
    );
    expect(await weth.balanceOf(pWETH.address)).to.be.closeTo(
      wethAmount,
      parseEther("0.01")
    );
    expect(await nftPositionManager.balanceOf(nUniswapV3.address)).to.be.eq(1);

    const userConfig = BigNumber.from(
      (await pool.getUserConfiguration(aaAccount)).data
    );
    expect(isUsingAsCollateral(userConfig, daiData.id)).to.be.true;
  });

  it("position batch migration1", async () => {
    const testEnv = await loadFixture(fixture);
    const {
      users: [user1, user2],
      pool,
      pWETH,
      nUniswapV3,
      dai,
      pDai,
      weth,
      nftPositionManager,
    } = testEnv;

    const wethAmount = parseEther("100");
    const borrowDaiAmount = parseEther("5000");

    const txReceipt = await waitForTx(
      await pool
        .connect(user2.signer)
        .batchPositionMoveToAA([user2.address, user1.address], [2, 1])
    );
    const logLength = txReceipt.logs.length;
    const aaAccount = "0x" + txReceipt.logs[logLength - 1].data.substring(26);

    expect(await pWETH.balanceOf(aaAccount)).to.be.closeTo(
      wethAmount,
      parseEther("0.01")
    );
    expect(await nUniswapV3.balanceOf(aaAccount)).to.eq(1);
    expect(await variableDebt.balanceOf(aaAccount)).to.be.closeTo(
      borrowDaiAmount,
      parseEther("1")
    );

    expect(await dai.balanceOf(pDai.address)).to.be.closeTo(
      borrowDaiAmount,
      parseEther("1")
    );
    expect(await weth.balanceOf(pWETH.address)).to.be.closeTo(
      wethAmount,
      parseEther("0.01")
    );
    expect(await nftPositionManager.balanceOf(nUniswapV3.address)).to.be.eq(1);

    const userConfig = BigNumber.from(
      (await pool.getUserConfiguration(aaAccount)).data
    );
    expect(isUsingAsCollateral(userConfig, wethData.id)).to.be.true;
    expect(isUsingAsCollateral(userConfig, uniswapData.id)).to.be.true;
    expect(isBorrowing(userConfig, daiData.id)).to.be.true;
  });

  it("user position migration", async () => {
    const testEnv = await loadFixture(fixture);
    const {
      users: [user1, user2],
      pool,
      dai,
      pDai,
      weth,
      pWETH,
      nUniswapV3,
      nftPositionManager,
    } = testEnv;

    const daiAmount = parseEther("10000");
    const wethAmount = parseEther("100");
    const borrowDaiAmount = parseEther("5000");

    let txReceipt = await waitForTx(
        await pool.connect(user1.signer).positionMoveToAA(1)
    );
    let logLength = txReceipt.logs.length;
    let aaAccount = "0x" + txReceipt.logs[logLength - 1].data.substring(26);

    expect(await pWETH.balanceOf(aaAccount)).to.be.closeTo(
        wethAmount,
        parseEther("0.01")
    );
    expect(await nUniswapV3.balanceOf(aaAccount)).to.eq(1);
    expect(await variableDebt.balanceOf(aaAccount)).to.be.closeTo(
        borrowDaiAmount,
        parseEther("1")
    );

    txReceipt = await waitForTx(
        await pool.connect(user2.signer).positionMoveToAA(2)
    );
    logLength = txReceipt.logs.length;
    aaAccount = "0x" + txReceipt.logs[logLength - 1].data.substring(26);

    expect(await pDai.balanceOf(aaAccount)).to.be.closeTo(
        daiAmount,
        parseEther("1")
    );

    expect(await dai.balanceOf(pDai.address)).to.be.closeTo(
        borrowDaiAmount,
        parseEther("1")
    );
    expect(await weth.balanceOf(pWETH.address)).to.be.closeTo(
        wethAmount,
        parseEther("0.01")
    );
    expect(await nftPositionManager.balanceOf(nUniswapV3.address)).to.be.eq(1);
  });
});
