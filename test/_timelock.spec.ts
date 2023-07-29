import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {deployReserveTimeLockStrategy} from "../helpers/contracts-deployments";
import {MAX_UINT_AMOUNT, ONE_ADDRESS} from "../helpers/constants";
import {
  getAutoCompoundApe,
  getParaApeStaking,
  getPoolConfiguratorProxy,
  getPTokenSApe,
  getTimeLockProxy,
} from "../helpers/contracts-getters";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";
import {advanceTimeAndBlock, waitForTx} from "../helpers/misc-utils";
import {eContractid} from "../helpers/types";
import {testEnvFixture} from "./helpers/setup-env";
import {mintAndValidate, supplyAndValidate} from "./helpers/validated-steps";
import {parseEther} from "ethers/lib/utils";
import {almostEqual} from "./helpers/uniswapv3-helper";
import {AutoCompoundApe, ParaApeStaking, PTokenSApe} from "../types";

describe("TimeLock functionality tests", () => {
  const minTime = 5;
  const midTime = 300;
  const maxTime = 3600;
  let timeLockProxy;
  let cApe: AutoCompoundApe;
  let paraApeStaking: ParaApeStaking;
  let pSApeCoin: PTokenSApe;
  const sApeAddress = ONE_ADDRESS;

  const fixture = async () => {
    const testEnv = await loadFixture(testEnvFixture);
    const {
      dai,
      ape,
      usdc,
      pool,
      mayc,
      weth,
      wPunk,
      users: [user1, user2, , , , user6],
      poolAdmin,
      protocolDataProvider,
    } = testEnv;

    // User 1 - Deposit dai
    await supplyAndValidate(dai, "20000000", user1, true);
    // User 2 - Deposit usdc
    await supplyAndValidate(usdc, "200000", user2, true);

    await supplyAndValidate(mayc, "10", user1, true);

    await supplyAndValidate(weth, "1", user1, true);

    cApe = await getAutoCompoundApe();
    const MINIMUM_LIQUIDITY = await cApe.MINIMUM_LIQUIDITY();
    paraApeStaking = await getParaApeStaking();
    const {xTokenAddress: pSApeCoinAddress} =
      await protocolDataProvider.getReserveTokensAddresses(sApeAddress);
    pSApeCoin = await getPTokenSApe(pSApeCoinAddress);

    // user6 deposit MINIMUM_LIQUIDITY to make test case easy
    await mintAndValidate(ape, "1", user6);
    await waitForTx(
      await ape.connect(user6.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await cApe.connect(user6.signer).deposit(user6.address, MINIMUM_LIQUIDITY)
    );

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
        .setReserveTimeLockStrategyAddress(ape.address, defaultStrategy.address)
    );
    await waitForTx(
      await poolConfigurator
        .connect(poolAdmin.signer)
        .setReserveTimeLockStrategyAddress(
          cApe.address,
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
          wPunk.address,
          defaultStrategyNFT.address
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

  it("claimPunk work as expected", async () => {
    const {
      pool,
      users: [user1],
      punks,
      wPunk,
      wPunkGateway,
    } = await loadFixture(fixture);

    const balanceBefore = await punks.balanceOf(user1.address);

    for (let index = 0; index < 3; index++) {
      await waitForTx(
        await punks.connect(user1.signer)["getPunk(uint256)"](index)
      );
      await waitForTx(
        await punks
          .connect(user1.signer)
          .offerPunkForSaleToAddress(index, 0, wPunkGateway.address)
      );
    }

    await wPunkGateway.connect(user1.signer).supplyPunk(
      [
        {tokenId: 0, useAsCollateral: true},
        {tokenId: 1, useAsCollateral: true},
        {tokenId: 2, useAsCollateral: true},
      ],
      user1.address,
      "0"
    );

    for (let index = 0; index < 3; index++) {
      await waitForTx(
        await pool
          .connect(user1.signer)
          .withdrawERC721(wPunk.address, [index], user1.address, {
            gasLimit: 5000000,
          })
      );
    }

    await advanceTimeAndBlock(4000);
    await waitForTx(
      await timeLockProxy
        .connect(user1.signer)
        .claimPunk(Array.from(Array(3).keys()))
    );
    const balanceAfter = await punks.balanceOf(user1.address);

    await expect(balanceAfter).to.be.eq(balanceBefore.add(3));
  });

  it("sApe work as expected0", async () => {
    const {
      users: [user1],
      ape,
      bayc,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await mintAndValidate(ape, "200000", user1);

    await waitForTx(
      await ape
        .connect(user1.signer)
        .approve(paraApeStaking.address, MAX_UINT_AMOUNT)
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).depositApeCoinPool({
        onBehalf: user1.address,
        cashToken: ape.address,
        cashAmount: parseEther("200000"),
        isBAYC: true,
        tokenIds: [0],
      })
    );
    expect(await pSApeCoin.balanceOf(user1.address)).to.be.equal(
      parseEther("200000")
    );
    await waitForTx(
      await paraApeStaking.connect(user1.signer).withdrawApeCoinPool({
        cashToken: ape.address,
        cashAmount: parseEther("200000"),
        isBAYC: true,
        tokenIds: [0],
      })
    );
    expect(await ape.balanceOf(user1.address)).to.be.equal("0");
    expect(await ape.balanceOf(timeLockProxy.address)).to.be.equal(
      parseEther("200000")
    );
    await advanceTimeAndBlock(13 * 3600);
    await waitForTx(await timeLockProxy.connect(user1.signer).claim(["0"]));
    expect(await ape.balanceOf(timeLockProxy.address)).to.be.equal("0");
    expect(await ape.balanceOf(user1.address)).to.be.equal(
      parseEther("200000")
    );
  });

  it("sApe work as expected1", async () => {
    const {
      users: [user1],
      ape,
      bayc,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await mintAndValidate(ape, "200000", user1);

    await waitForTx(
      await ape
        .connect(user1.signer)
        .approve(paraApeStaking.address, MAX_UINT_AMOUNT)
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).depositApeCoinPool({
        onBehalf: user1.address,
        cashToken: ape.address,
        cashAmount: parseEther("200000"),
        isBAYC: true,
        tokenIds: [0],
      })
    );

    expect(await pSApeCoin.balanceOf(user1.address)).to.be.equal(
      parseEther("200000")
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).withdrawApeCoinPool({
        cashToken: ape.address,
        cashAmount: "0",
        isBAYC: true,
        tokenIds: [0],
      })
    );

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .withdrawFreeSApe(user1.address, parseEther("200000"))
    );

    expect(await cApe.balanceOf(user1.address)).to.be.equal("0");
    expect(await cApe.balanceOf(timeLockProxy.address)).to.be.closeTo(
      parseEther("200000"),
      parseEther("1")
    );

    await advanceTimeAndBlock(13 * 3600);
    await waitForTx(await timeLockProxy.connect(user1.signer).claim(["0"]));

    expect(await cApe.balanceOf(user1.address)).to.be.closeTo(
      parseEther("200000"),
      parseEther("1")
    );
  });
});
