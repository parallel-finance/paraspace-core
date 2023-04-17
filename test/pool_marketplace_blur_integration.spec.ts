import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {MAX_UINT_AMOUNT} from "../helpers/constants";
import {
  getProtocolDataProvider,
  getVariableDebtToken,
} from "../helpers/contracts-getters";
import {waitForTx} from "../helpers/misc-utils";
import {ProtocolErrors} from "../helpers/types";
import {testEnvFixture} from "./helpers/setup-env";
import {mintAndValidate, supplyAndValidate} from "./helpers/validated-steps";
import {parseEther} from "ethers/lib/utils";
import {almostEqual} from "./helpers/uniswapv3-helper";
import {zeroAddress} from "ethereumjs-util";

describe("BLUR integration tests", () => {
  let ETHExchangeRequest;
  let WETHExchangeRequest;
  let wethDebtToken;

  const fixture = async () => {
    const testEnv = await loadFixture(testEnvFixture);
    const {
      weth,
      bayc,
      pool,
      users: [user1, user2, user3],
      poolAdmin,
    } = testEnv;

    await waitForTx(
      await pool.connect(poolAdmin.signer).enableBlurExchange(true)
    );

    await waitForTx(
      await pool.connect(poolAdmin.signer).setBlurExchangeKeeper(user2.address)
    );

    await mintAndValidate(weth, parseEther("100").toString(), user1);
    await mintAndValidate(bayc, "1", user2);
    await supplyAndValidate(weth, parseEther("100").toString(), user3, true);
    //deposit for weth or weth contract don't have eth value, withdraw will fail
    await waitForTx(
      await weth.connect(user3.signer).deposit({value: parseEther("200")})
    );

    await waitForTx(
      await weth.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await weth.connect(user2.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await bayc.connect(user2.signer).setApprovalForAll(pool.address, true)
    );

    const protocolDataProvider = await getProtocolDataProvider();
    const debtTokenAddress = (
      await protocolDataProvider.getReserveTokensAddresses(weth.address)
    ).variableDebtTokenAddress;
    wethDebtToken = await getVariableDebtToken(debtTokenAddress);

    WETHExchangeRequest = {
      initiator: user1.address,
      paymentToken: weth.address,
      cashAmount: parseEther("50"),
      borrowAmount: parseEther("40"),
      collection: bayc.address,
      tokenId: 0,
    };
    ETHExchangeRequest = {
      initiator: user1.address,
      paymentToken: zeroAddress(),
      cashAmount: parseEther("50"),
      borrowAmount: parseEther("40"),
      collection: bayc.address,
      tokenId: 0,
    };

    return testEnv;
  };

  it("eth request can be initiated by eth and fulfilled", async () => {
    const {
      pool,
      users: [user1, user2],
      weth,
      bayc,
      nBAYC,
    } = await loadFixture(fixture);

    const beforeInitiateBalance = await user1.signer.getBalance();
    const beforeInitiateWETHBalance = await weth.balanceOf(user1.address);
    expect(await wethDebtToken.balanceOf(user1.address)).to.be.eq(0);
    const keeperBeforeInitiateBalance = await user2.signer.getBalance();

    await waitForTx(
      await pool
        .connect(user1.signer)
        .initiateBlurExchangeRequest(ETHExchangeRequest, {
          value: parseEther("50"),
        })
    );

    const afterInitiateBalance = await user1.signer.getBalance();
    const afterInitiateWETHBalance = await weth.balanceOf(user1.address);
    almostEqual(
      beforeInitiateBalance.sub(afterInitiateBalance),
      parseEther("50")
    );
    expect(afterInitiateWETHBalance).to.be.eq(beforeInitiateWETHBalance);
    const keeperAfterInitiateBalance = await user2.signer.getBalance();
    almostEqual(
      keeperAfterInitiateBalance.sub(keeperBeforeInitiateBalance),
      parseEther("90")
    );
    almostEqual(await wethDebtToken.balanceOf(user1.address), parseEther("40"));

    expect(await bayc.balanceOf(user2.address)).to.be.eq(1);
    expect(await bayc.balanceOf(nBAYC.address)).to.be.eq(0);

    await waitForTx(
      await pool
        .connect(user2.signer)
        .fulfillBlurExchangeRequest(ETHExchangeRequest)
    );

    expect(await bayc.balanceOf(user2.address)).to.be.eq(0);
    expect(await bayc.balanceOf(nBAYC.address)).to.be.eq(1);
    const afterFulfillBalance = await user1.signer.getBalance();
    expect(afterFulfillBalance.sub(afterInitiateBalance)).to.be.eq(0);
    almostEqual(await wethDebtToken.balanceOf(user1.address), parseEther("40"));
  });

  it("eth request can be initiated by weth and fulfilled", async () => {
    const {
      pool,
      users: [user1, user2],
      weth,
      bayc,
      nBAYC,
    } = await loadFixture(fixture);

    const beforeInitiateBalance = await user1.signer.getBalance();
    const beforeInitiateWETHBalance = await weth.balanceOf(user1.address);
    expect(await wethDebtToken.balanceOf(user1.address)).to.be.eq(0);
    const keeperBeforeInitiateBalance = await user2.signer.getBalance();

    await waitForTx(
      await pool
        .connect(user1.signer)
        .initiateBlurExchangeRequest(ETHExchangeRequest)
    );

    const afterInitiateBalance = await user1.signer.getBalance();
    const afterInitiateWETHBalance = await weth.balanceOf(user1.address);
    almostEqual(afterInitiateBalance, beforeInitiateBalance);
    almostEqual(
      beforeInitiateWETHBalance.sub(afterInitiateWETHBalance),
      parseEther("50")
    );
    const keeperAfterInitiateBalance = await user2.signer.getBalance();
    almostEqual(
      keeperAfterInitiateBalance.sub(keeperBeforeInitiateBalance),
      parseEther("90")
    );
    almostEqual(await wethDebtToken.balanceOf(user1.address), parseEther("40"));

    expect(await bayc.balanceOf(user2.address)).to.be.eq(1);
    expect(await bayc.balanceOf(nBAYC.address)).to.be.eq(0);

    await waitForTx(
      await pool
        .connect(user2.signer)
        .fulfillBlurExchangeRequest(ETHExchangeRequest)
    );

    expect(await bayc.balanceOf(user2.address)).to.be.eq(0);
    expect(await bayc.balanceOf(nBAYC.address)).to.be.eq(1);
    const afterFulfillBalance = await user1.signer.getBalance();
    expect(afterFulfillBalance.sub(afterInitiateBalance)).to.be.eq(0);
    almostEqual(await wethDebtToken.balanceOf(user1.address), parseEther("40"));
  });

  it("eth request can be rejected", async () => {
    const {
      pool,
      users: [user1, user2],
      pWETH,
      bayc,
      nBAYC,
    } = await loadFixture(fixture);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .initiateBlurExchangeRequest(ETHExchangeRequest, {
          value: parseEther("50"),
        })
    );

    expect(await bayc.balanceOf(user2.address)).to.be.eq(1);
    expect(await bayc.balanceOf(nBAYC.address)).to.be.eq(0);
    expect(await pWETH.balanceOf(user1.address)).to.be.eq(0);
    almostEqual(await wethDebtToken.balanceOf(user1.address), parseEther("40"));

    await waitForTx(
      await pool
        .connect(user2.signer)
        .rejectBlurExchangeRequest(ETHExchangeRequest, {
          value: parseEther("90"),
        })
    );

    expect(await bayc.balanceOf(user2.address)).to.be.eq(1);
    expect(await bayc.balanceOf(nBAYC.address)).to.be.eq(0);
    expect(await wethDebtToken.balanceOf(user1.address)).to.be.eq(0);
    almostEqual(await pWETH.balanceOf(user1.address), parseEther("50"));
  });

  it("weth request can be initiated by weth and fulfilled", async () => {
    const {
      pool,
      users: [user1, user2],
      weth,
      bayc,
      nBAYC,
      pWETH,
    } = await loadFixture(fixture);

    const beforeInitiateBalance = await user1.signer.getBalance();
    const beforeInitiateWETHBalance = await weth.balanceOf(user1.address);
    expect(await wethDebtToken.balanceOf(user1.address)).to.be.eq(0);
    const keeperBeforeInitiateWETHBalance = await weth.balanceOf(user2.address);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .initiateBlurExchangeRequest(WETHExchangeRequest)
    );

    const afterInitiateBalance = await user1.signer.getBalance();
    const afterInitiateWETHBalance = await weth.balanceOf(user1.address);
    almostEqual(afterInitiateBalance, beforeInitiateBalance);
    almostEqual(
      beforeInitiateWETHBalance.sub(afterInitiateWETHBalance),
      parseEther("50")
    );
    const keeperAfterInitiateWETHBalance = await weth.balanceOf(user2.address);
    almostEqual(
      keeperAfterInitiateWETHBalance.sub(keeperBeforeInitiateWETHBalance),
      parseEther("90")
    );
    expect(await pWETH.balanceOf(user1.address)).to.be.eq(0);
    almostEqual(await wethDebtToken.balanceOf(user1.address), parseEther("40"));

    expect(await bayc.balanceOf(user2.address)).to.be.eq(1);
    expect(await bayc.balanceOf(nBAYC.address)).to.be.eq(0);

    await waitForTx(
      await pool
        .connect(user2.signer)
        .fulfillBlurExchangeRequest(WETHExchangeRequest)
    );

    expect(await bayc.balanceOf(user2.address)).to.be.eq(0);
    expect(await bayc.balanceOf(nBAYC.address)).to.be.eq(1);
    expect(await pWETH.balanceOf(user1.address)).to.be.eq(0);
    almostEqual(await wethDebtToken.balanceOf(user1.address), parseEther("40"));
  });

  it("weth request can be initiated by eth and fulfilled", async () => {
    const {
      pool,
      users: [user1, user2],
      weth,
      bayc,
      nBAYC,
      pWETH,
    } = await loadFixture(fixture);

    const beforeInitiateBalance = await user1.signer.getBalance();
    const beforeInitiateWETHBalance = await weth.balanceOf(user1.address);
    expect(await wethDebtToken.balanceOf(user1.address)).to.be.eq(0);
    const keeperBeforeInitiateWETHBalance = await weth.balanceOf(user2.address);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .initiateBlurExchangeRequest(WETHExchangeRequest, {
          value: parseEther("50"),
        })
    );

    const afterInitiateBalance = await user1.signer.getBalance();
    const afterInitiateWETHBalance = await weth.balanceOf(user1.address);
    almostEqual(
      beforeInitiateBalance.sub(afterInitiateBalance),
      parseEther("50")
    );
    almostEqual(beforeInitiateWETHBalance, afterInitiateWETHBalance);
    const keeperAfterInitiateWETHBalance = await weth.balanceOf(user2.address);
    almostEqual(
      keeperAfterInitiateWETHBalance.sub(keeperBeforeInitiateWETHBalance),
      parseEther("90")
    );
    expect(await pWETH.balanceOf(user1.address)).to.be.eq(0);
    almostEqual(await wethDebtToken.balanceOf(user1.address), parseEther("40"));

    expect(await bayc.balanceOf(user2.address)).to.be.eq(1);
    expect(await bayc.balanceOf(nBAYC.address)).to.be.eq(0);

    await waitForTx(
      await pool
        .connect(user2.signer)
        .fulfillBlurExchangeRequest(WETHExchangeRequest)
    );

    expect(await bayc.balanceOf(user2.address)).to.be.eq(0);
    expect(await bayc.balanceOf(nBAYC.address)).to.be.eq(1);
    expect(await pWETH.balanceOf(user1.address)).to.be.eq(0);
    almostEqual(await wethDebtToken.balanceOf(user1.address), parseEther("40"));
  });

  it("weth request can be rejected", async () => {
    const {
      pool,
      users: [user1, user2],
      pWETH,
      bayc,
      nBAYC,
    } = await loadFixture(fixture);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .initiateBlurExchangeRequest(WETHExchangeRequest)
    );

    expect(await bayc.balanceOf(user2.address)).to.be.eq(1);
    expect(await bayc.balanceOf(nBAYC.address)).to.be.eq(0);
    expect(await pWETH.balanceOf(user1.address)).to.be.eq(0);
    almostEqual(await wethDebtToken.balanceOf(user1.address), parseEther("40"));

    await waitForTx(
      await pool
        .connect(user2.signer)
        .rejectBlurExchangeRequest(WETHExchangeRequest)
    );

    expect(await bayc.balanceOf(user2.address)).to.be.eq(1);
    expect(await bayc.balanceOf(nBAYC.address)).to.be.eq(0);
    expect(await wethDebtToken.balanceOf(user1.address)).to.be.eq(0);
    almostEqual(await pWETH.balanceOf(user1.address), parseEther("50"));
  });

  it("only pool admin can enable blur exchange", async () => {
    const {
      pool,
      users: [user1],
      poolAdmin,
    } = await loadFixture(fixture);
    await expect(
      pool.connect(user1.signer).enableBlurExchange(false)
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_POOL_ADMIN);

    await waitForTx(
      await pool.connect(poolAdmin.signer).enableBlurExchange(false)
    );
  });

  it("only pool admin can set blur exchange keeper", async () => {
    const {
      pool,
      users: [user1, user2],
      poolAdmin,
    } = await loadFixture(fixture);

    await expect(
      pool.connect(user1.signer).setBlurExchangeKeeper(user2.address)
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_POOL_ADMIN);

    await waitForTx(
      await pool.connect(poolAdmin.signer).setBlurExchangeKeeper(user2.address)
    );
  });

  it("only request initiator can initiate the request", async () => {
    const {
      pool,
      weth,
      users: [user1, user2],
    } = await loadFixture(fixture);

    await expect(
      pool
        .connect(user2.signer)
        .initiateBlurExchangeRequest(WETHExchangeRequest)
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_INITIATOR);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .initiateBlurExchangeRequest(WETHExchangeRequest)
    );
    expect(await weth.balanceOf(user2.address)).to.be.eq(parseEther("90"));
  });

  it("only keeper can fulfill the request", async () => {
    const {
      pool,
      users: [user1, , user3],
    } = await loadFixture(fixture);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .initiateBlurExchangeRequest(WETHExchangeRequest)
    );

    await expect(
      pool.connect(user3.signer).fulfillBlurExchangeRequest(WETHExchangeRequest)
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_KEEPER);
  });

  it("only keeper can reject the request", async () => {
    const {
      pool,
      users: [user1, , user3],
    } = await loadFixture(fixture);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .initiateBlurExchangeRequest(WETHExchangeRequest)
    );

    await expect(
      pool.connect(user3.signer).rejectBlurExchangeRequest(WETHExchangeRequest)
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_KEEPER);
  });

  it("user can't transfer nToken before request is fulfilled", async () => {
    const {
      pool,
      nBAYC,
      users: [user1, user2],
    } = await loadFixture(fixture);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .initiateBlurExchangeRequest(WETHExchangeRequest)
    );

    await expect(
      nBAYC.connect(user1.signer).transferFrom(user1.address, user2.address, 0)
    ).to.be.revertedWith(ProtocolErrors.NTOKEN_NOT_OWNS_UNDERLYING);
  });

  it("listing price must > floor price * ls when initiate request", async () => {
    const {
      pool,
      weth,
      bayc,
      users: [user1],
    } = await loadFixture(fixture);

    const invalidRequest = {
      initiator: user1.address,
      paymentToken: weth.address,
      cashAmount: parseEther("40"),
      borrowAmount: parseEther("40"),
      collection: bayc.address,
      tokenId: 0,
    };

    await expect(
      pool.connect(user1.signer).initiateBlurExchangeRequest(invalidRequest)
    ).to.be.revertedWith(ProtocolErrors.INVALID_LISTING_PRICE);
  });

  it("eth request reverted when transaction value is not equal with cash value", async () => {
    const {
      pool,
      users: [user1],
    } = await loadFixture(fixture);

    await expect(
      pool
        .connect(user1.signer)
        .initiateBlurExchangeRequest(ETHExchangeRequest, {
          value: parseEther("100"),
        })
    ).to.be.revertedWith(ProtocolErrors.INVALID_ETH_VALUE);
  });

  it("only default status request can be initiated", async () => {
    const {
      pool,
      users: [user1],
    } = await loadFixture(fixture);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .initiateBlurExchangeRequest(WETHExchangeRequest)
    );
    await expect(
      pool
        .connect(user1.signer)
        .initiateBlurExchangeRequest(WETHExchangeRequest)
    ).to.be.revertedWith(ProtocolErrors.INVALID_REQUEST_STATUS);
  });

  it("only initiated status request can be fulfilled", async () => {
    const {
      pool,
      users: [, user2],
    } = await loadFixture(fixture);

    await expect(
      pool.connect(user2.signer).fulfillBlurExchangeRequest(WETHExchangeRequest)
    ).to.be.revertedWith(ProtocolErrors.INVALID_REQUEST_STATUS);
  });

  it("only initiated status request can be rejected", async () => {
    const {
      pool,
      users: [, user2],
    } = await loadFixture(fixture);

    await expect(
      pool.connect(user2.signer).rejectBlurExchangeRequest(WETHExchangeRequest)
    ).to.be.revertedWith(ProtocolErrors.INVALID_REQUEST_STATUS);
  });
});
