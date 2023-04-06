import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {deployReserveTimeLockStrategy} from "../helpers/contracts-deployments";
import {MAX_UINT_AMOUNT} from "../helpers/constants";
import {
  getPoolConfiguratorProxy,
  getTimeLockProxy,
} from "../helpers/contracts-getters";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";
import {advanceTimeAndBlock, waitForTx} from "../helpers/misc-utils";
import {eContractid} from "../helpers/types";
import {testEnvFixture} from "./helpers/setup-env";
import {supplyAndValidate} from "./helpers/validated-steps";
import {parseEther} from "ethers/lib/utils";
import {
  almostEqual,
  approveTo,
  createNewPool,
  fund,
  mintNewPosition,
} from "./helpers/uniswapv3-helper";
import {encodeSqrtRatioX96} from "@uniswap/v3-sdk";

describe("TimeLock functionality tests", () => {
  const minTime = 5;
  const midTime = 300;
  const maxTime = 3600;
  let timeLockProxy;

  const fixture = async () => {
    const testEnv = await loadFixture(testEnvFixture);
    const {
      dai,
      usdc,
      pool,
      mayc,
      weth,
      nftPositionManager,
      users: [user1, user2],
      poolAdmin,
    } = testEnv;

    // User 1 - Deposit dai
    await supplyAndValidate(dai, "20000000", user1, true);
    // User 2 - Deposit usdc
    await supplyAndValidate(usdc, "200000", user2, true);

    await supplyAndValidate(mayc, "10", user1, true);

    await supplyAndValidate(weth, "1", user1, true);

    //uniswap V3
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
    const initialPrice = encodeSqrtRatioX96(1, 1000);
    await createNewPool({
      positionManager: nft,
      token0: dai,
      token1: weth,
      fee: fee,
      initialSqrtPrice: initialPrice.toString(),
    });

    const minThreshold = await convertToCurrencyDecimals(usdc.address, "1000");
    const midThreshold = await convertToCurrencyDecimals(usdc.address, "2000");
    const minThresholdNFT = 2;
    const midThresholdNFT = 5;

    const defaultStrategy = await deployReserveTimeLockStrategy(
      eContractid.DefaultTimeLockStrategy + "ERC20",
      pool.address,
      minThreshold.toString(),
      midThreshold.toString(),
      minTime.toString(),
      midTime.toString(),
      maxTime.toString(),
      midThreshold.mul(10).toString(),
      (12 * 3600).toString(),
      (24 * 3600).toString()
    );

    const defaultStrategyNFT = await deployReserveTimeLockStrategy(
      eContractid.DefaultTimeLockStrategy + "ERC721",
      pool.address,
      minThresholdNFT.toString(),
      midThresholdNFT.toString(),
      minTime.toString(),
      midTime.toString(),
      maxTime.toString(),
      midThreshold.mul(10).toString(),
      (12 * 3600).toString(),
      (24 * 3600).toString()
    );

    const UniswapV3Strategy = await deployReserveTimeLockStrategy(
      eContractid.DefaultTimeLockStrategy + "UniV3",
      pool.address,
      parseEther("1").toString(),
      parseEther("10").toString(),
      minTime.toString(),
      midTime.toString(),
      maxTime.toString(),
      parseEther("100").toString(),
      (12 * 3600).toString(),
      (24 * 3600).toString()
    );

    const poolConfigurator = await getPoolConfiguratorProxy();
    await waitForTx(
      await poolConfigurator
        .connect(poolAdmin.signer)
        .setReserveTimeLockStrategyAddress(
          usdc.address,
          defaultStrategy.address
        )
    );
    await waitForTx(
      await poolConfigurator
        .connect(poolAdmin.signer)
        .setReserveTimeLockStrategyAddress(
          weth.address,
          defaultStrategy.address
        )
    );
    await waitForTx(
      await poolConfigurator
        .connect(poolAdmin.signer)
        .setReserveTimeLockStrategyAddress(
          mayc.address,
          defaultStrategyNFT.address
        )
    );
    await waitForTx(
      await poolConfigurator
        .connect(poolAdmin.signer)
        .setReserveTimeLockStrategyAddress(dai.address, defaultStrategy.address)
    );
    await waitForTx(
      await poolConfigurator
        .connect(poolAdmin.signer)
        .setReserveTimeLockStrategyAddress(
          nftPositionManager.address,
          UniswapV3Strategy.address
        )
    );

    return testEnv;
  };

  before(async () => {
    await loadFixture(testEnvFixture);

    timeLockProxy = await getTimeLockProxy();
  });

  it("borrowed amount below minThreshold should be time locked for 1 block only", async () => {
    const {
      pool,
      users: [user1],
      usdc,
    } = await loadFixture(fixture);

    const amount = await convertToCurrencyDecimals(usdc.address, "100");
    //FIXME(alan): may we have a error code for this.

    await waitForTx(
      await pool
        .connect(user1.signer)
        .borrow(usdc.address, amount, "0", user1.address, {
          gasLimit: 5000000,
        })
    );

    await expect(await usdc.balanceOf(pool.TIME_LOCK())).to.be.eq(amount);

    const balanceBefore = await usdc.balanceOf(user1.address);

    await advanceTimeAndBlock(10);

    await waitForTx(await timeLockProxy.connect(user1.signer).claim(["0"]));

    const balanceAfter = await usdc.balanceOf(user1.address);

    await expect(balanceAfter).to.be.eq(balanceBefore.add(amount));
  });

  it("borrowed amount below above min and below mid thresholds should be time locked for 300 seconds", async () => {
    const {
      pool,
      users: [user1],
      usdc,
    } = await loadFixture(fixture);

    const amount = await convertToCurrencyDecimals(usdc.address, "1200");
    //FIXME(alan): may we have a error code for this.

    await waitForTx(
      await pool
        .connect(user1.signer)
        .borrow(usdc.address, amount, "0", user1.address, {
          gasLimit: 5000000,
        })
    );

    await expect(await usdc.balanceOf(pool.TIME_LOCK())).to.be.eq(amount);

    const balanceBefore = await usdc.balanceOf(user1.address);

    await advanceTimeAndBlock(10);

    await expect(timeLockProxy.connect(user1.signer).claim(["0"])).to.be
      .reverted;

    await advanceTimeAndBlock(300);

    await waitForTx(await timeLockProxy.connect(user1.signer).claim(["0"]));
    const balanceAfter = await usdc.balanceOf(user1.address);

    await expect(balanceAfter).to.be.eq(balanceBefore.add(amount));
  });

  it("borrowed amount below above max thresholds should be time locked for 3600 seconds", async () => {
    const {
      pool,
      users: [user1],
      usdc,
    } = await loadFixture(fixture);

    const amount = await convertToCurrencyDecimals(usdc.address, "2200");
    //FIXME(alan): may we have a error code for this.

    await waitForTx(
      await pool
        .connect(user1.signer)
        .borrow(usdc.address, amount, "0", user1.address, {
          gasLimit: 5000000,
        })
    );

    await expect(await usdc.balanceOf(pool.TIME_LOCK())).to.be.eq(amount);

    const balanceBefore = await usdc.balanceOf(user1.address);

    await advanceTimeAndBlock(300);

    await expect(timeLockProxy.connect(user1.signer).claim(["0"])).to.be
      .reverted;

    await advanceTimeAndBlock(3400);

    await waitForTx(await timeLockProxy.connect(user1.signer).claim(["0"]));
    const balanceAfter = await usdc.balanceOf(user1.address);

    await expect(balanceAfter).to.be.eq(balanceBefore.add(amount));
  });

  it("withdraw ERC20 amount below minThreshold should be time locked for 1 block only", async () => {
    const {
      pool,
      users: [user1],
      dai,
      usdc,
    } = await loadFixture(fixture);
    const amount = await convertToCurrencyDecimals(usdc.address, "100"); // used usdc intentionally since the mock strategy uses usdc decimals

    const balanceBefore = await dai.balanceOf(user1.address);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .withdraw(dai.address, amount, user1.address, {
          gasLimit: 5000000,
        })
    );

    await advanceTimeAndBlock(10);
    await waitForTx(await timeLockProxy.connect(user1.signer).claim(["0"]));
    const balanceAfter = await dai.balanceOf(user1.address);

    await expect(balanceAfter).to.be.eq(balanceBefore.add(amount));
  });

  it("withdraw ERC20 amount above minThreshold should be time locked for 300 seconds", async () => {
    const {
      pool,
      users: [user1],
      dai,
      usdc,
    } = await loadFixture(fixture);
    const amount = await convertToCurrencyDecimals(usdc.address, "1200"); // used usdc intentionally since the mock strategy uses usdc decimals

    const balanceBefore = await dai.balanceOf(user1.address);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .withdraw(dai.address, amount, user1.address, {
          gasLimit: 5000000,
        })
    );

    await advanceTimeAndBlock(10);
    await expect(timeLockProxy.connect(user1.signer).claim(["0"])).to.be
      .reverted;

    await advanceTimeAndBlock(300);
    await waitForTx(await timeLockProxy.connect(user1.signer).claim(["0"]));

    const balanceAfter = await dai.balanceOf(user1.address);
    await expect(balanceAfter).to.be.eq(balanceBefore.add(amount));
  });

  it("withdraw ERC20 multiple times and batch claim at once", async () => {
    const {
      pool,
      users: [user1],
      dai,
      usdc,
    } = await loadFixture(fixture);
    const amount = await convertToCurrencyDecimals(usdc.address, "10"); // used usdc intentionally since the mock strategy uses usdc decimals

    const balanceBefore = await dai.balanceOf(user1.address);

    for (let index = 0; index < 10; index++) {
      await waitForTx(
        await pool
          .connect(user1.signer)
          .withdraw(dai.address, amount, user1.address, {
            gasLimit: 5000000,
          })
      );
    }

    await advanceTimeAndBlock(10);
    await waitForTx(
      await timeLockProxy
        .connect(user1.signer)
        .claim(Array.from(Array(10).keys()))
    );

    const balanceAfter = await dai.balanceOf(user1.address);
    await expect(balanceAfter).to.be.eq(balanceBefore.add(amount.mul(10)));
  });

  it("withdraw ERC20 using max(uint) should work as expected", async () => {
    const {
      pool,
      users: [user1],
      dai,
      pDai,
    } = await loadFixture(fixture);
    const amount = await convertToCurrencyDecimals(dai.address, "100"); // used usdc intentionally since the mock strategy uses usdc decimals

    const pDaiBalance = await pDai.balanceOf(user1.address);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .withdraw(dai.address, MAX_UINT_AMOUNT, user1.address, {
          gasLimit: 5000000,
        })
    );

    await advanceTimeAndBlock(36 * 3600);
    await waitForTx(await timeLockProxy.connect(user1.signer).claim(["0"]));

    const balanceAfter = await dai.balanceOf(user1.address);
    await expect(balanceAfter).to.be.closeTo(pDaiBalance, amount);
  });

  it("withdraw erc721 tokens below minThreshold should be time locked for 1 block only", async () => {
    const {
      pool,
      users: [user1],
      mayc,
    } = await loadFixture(fixture);

    const balanceBefore = await mayc.balanceOf(user1.address);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .withdrawERC721(mayc.address, ["0"], user1.address, {
          gasLimit: 5000000,
        })
    );

    await advanceTimeAndBlock(10);
    await waitForTx(await timeLockProxy.connect(user1.signer).claim(["0"]));
    const balanceAfter = await mayc.balanceOf(user1.address);

    await expect(balanceAfter).to.be.eq(balanceBefore.add(1));
  });

  it("withdraw erc721 tokens above midThreshold should be time locked for 3600 seconds", async () => {
    const {
      pool,
      users: [user1],
      mayc,
    } = await loadFixture(fixture);

    const balanceBefore = await mayc.balanceOf(user1.address);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .withdrawERC721(
          mayc.address,
          Array.from(Array(7).keys()),
          user1.address,
          {
            gasLimit: 5000000,
          }
        )
    );

    await advanceTimeAndBlock(10);
    await expect(timeLockProxy.connect(user1.signer).claim(["0"])).to.be
      .reverted;

    await advanceTimeAndBlock(4000);
    await waitForTx(await timeLockProxy.connect(user1.signer).claim(["0"]));
    const balanceAfter = await mayc.balanceOf(user1.address);

    await expect(balanceAfter).to.be.eq(balanceBefore.add(7));
  });

  it("withdraw multiple ERC721 and batch claim at once", async () => {
    const {
      pool,
      users: [user1],
      mayc,
    } = await loadFixture(fixture);

    const balanceBefore = await mayc.balanceOf(user1.address);

    for (let index = 0; index < 10; index++) {
      await waitForTx(
        await pool
          .connect(user1.signer)
          .withdrawERC721(mayc.address, [index], user1.address, {
            gasLimit: 5000000,
          })
      );
    }

    await advanceTimeAndBlock(4000);
    await waitForTx(
      await timeLockProxy
        .connect(user1.signer)
        .claim(Array.from(Array(10).keys()))
    );
    const balanceAfter = await mayc.balanceOf(user1.address);

    await expect(balanceAfter).to.be.eq(balanceBefore.add(10));
  });

  it("withdraw UniswapV3 tokens below minThreshold should be time locked for 1 block only", async () => {
    const {
      pool,
      users: [user1],
      dai,
      weth,
      nftPositionManager,
    } = await loadFixture(fixture);

    const userDaiAmount = parseEther("1");
    const userWethAmount = parseEther("0.1");
    await fund({token: dai, user: user1, amount: userDaiAmount});
    await fund({token: weth, user: user1, amount: userWethAmount});

    const tickSpacing = 3000 / 50;
    const lowerPrice = encodeSqrtRatioX96(1, 10000);
    const upperPrice = encodeSqrtRatioX96(1, 100);
    const nft = nftPositionManager.connect(user1.signer);
    await mintNewPosition({
      nft: nft,
      token0: dai,
      token1: weth,
      fee: 3000,
      user: user1,
      tickSpacing: tickSpacing,
      lowerPrice,
      upperPrice,
      token0Amount: userDaiAmount,
      token1Amount: userWethAmount,
    });
    expect(await nftPositionManager.balanceOf(user1.address)).to.eq(1);

    await nft.setApprovalForAll(pool.address, true);

    let uniswapV3Balance = await nftPositionManager.balanceOf(user1.address);
    expect(uniswapV3Balance).to.be.eq(1);

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

    await waitForTx(
      await pool
        .connect(user1.signer)
        .withdrawERC721(nftPositionManager.address, [1], user1.address, {
          gasLimit: 5000000,
        })
    );

    await advanceTimeAndBlock(10);
    await waitForTx(await timeLockProxy.connect(user1.signer).claim(["0"]));
    uniswapV3Balance = await nftPositionManager.balanceOf(user1.address);
    expect(uniswapV3Balance).to.be.eq(1);
  });

  it("withdraw UniswapV3 tokens above midThreshold should be time locked for 3600 seconds", async () => {
    const {
      pool,
      users: [user1],
      dai,
      weth,
      nftPositionManager,
    } = await loadFixture(fixture);

    const userDaiAmount = parseEther("10000");
    const userWethAmount = parseEther("10");
    await fund({token: dai, user: user1, amount: userDaiAmount});
    await fund({token: weth, user: user1, amount: userWethAmount});

    const tickSpacing = 3000 / 50;
    const lowerPrice = encodeSqrtRatioX96(1, 10000);
    const upperPrice = encodeSqrtRatioX96(1, 100);
    const nft = nftPositionManager.connect(user1.signer);
    await mintNewPosition({
      nft: nft,
      token0: dai,
      token1: weth,
      fee: 3000,
      user: user1,
      tickSpacing: tickSpacing,
      lowerPrice,
      upperPrice,
      token0Amount: userDaiAmount,
      token1Amount: userWethAmount,
    });
    expect(await nftPositionManager.balanceOf(user1.address)).to.eq(1);

    await nft.setApprovalForAll(pool.address, true);

    let uniswapV3Balance = await nftPositionManager.balanceOf(user1.address);
    expect(uniswapV3Balance).to.be.eq(1);

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

    await waitForTx(
      await pool
        .connect(user1.signer)
        .withdrawERC721(nftPositionManager.address, [1], user1.address, {
          gasLimit: 5000000,
        })
    );

    await advanceTimeAndBlock(10);
    await expect(timeLockProxy.connect(user1.signer).claim(["0"])).to.be
      .reverted;

    await advanceTimeAndBlock(4000);
    await waitForTx(await timeLockProxy.connect(user1.signer).claim(["0"]));
    uniswapV3Balance = await nftPositionManager.balanceOf(user1.address);
    expect(uniswapV3Balance).to.be.eq(1);
  });

  it("claimETH work as expected", async () => {
    const {
      pool,
      users: [user1],
      deployer,
      weth,
    } = await loadFixture(fixture);
    await waitForTx(
      await weth.connect(deployer.signer).deposit({
        value: parseEther("10"),
      })
    );
    const balanceBefore = await user1.signer.getBalance();

    await waitForTx(
      await pool
        .connect(user1.signer)
        .withdraw(weth.address, parseEther("1"), user1.address, {
          gasLimit: 5000000,
        })
    );

    await advanceTimeAndBlock(36 * 3600);
    await waitForTx(await timeLockProxy.connect(user1.signer).claimETH(["0"]));
    const balanceAfter = await user1.signer.getBalance();
    const balanceDiff = balanceAfter.sub(balanceBefore);
    almostEqual(balanceDiff, parseEther("1"));
  });
});
