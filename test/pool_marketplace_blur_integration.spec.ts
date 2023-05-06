import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {MAX_UINT_AMOUNT, WAD} from "../helpers/constants";
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
import {BigNumber} from "ethers";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";

describe("BLUR integration tests", () => {
  let ETHExchangeRequest;
  let WETHExchangeRequest;
  let wethDebtToken;

  const fixture = async () => {
    const testEnv = await loadFixture(testEnvFixture);
    const {
      weth,
      bayc,
      mayc,
      pool,
      users: [user1, user2, user3],
      poolAdmin,
    } = testEnv;

    await waitForTx(await pool.connect(poolAdmin.signer).enableBlurExchange());

    await waitForTx(
      await pool.connect(poolAdmin.signer).setBlurOngoingRequestLimit(2)
    );

    await waitForTx(
      await pool.connect(poolAdmin.signer).setBlurExchangeKeeper(user2.address)
    );

    await mintAndValidate(weth, parseEther("100").toString(), user1);
    await mintAndValidate(bayc, "1", user2);
    await mintAndValidate(mayc, "1", user2);
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
    await waitForTx(
      await mayc.connect(user2.signer).setApprovalForAll(pool.address, true)
    );

    const protocolDataProvider = await getProtocolDataProvider();
    const debtTokenAddress = (
      await protocolDataProvider.getReserveTokensAddresses(weth.address)
    ).variableDebtTokenAddress;
    wethDebtToken = await getVariableDebtToken(debtTokenAddress);

    WETHExchangeRequest = {
      initiator: user1.address,
      paymentToken: weth.address,
      listingPrice: parseEther("90"),
      borrowAmount: parseEther("40"),
      collection: bayc.address,
      tokenId: 0,
    };
    ETHExchangeRequest = {
      initiator: user1.address,
      paymentToken: zeroAddress(),
      listingPrice: parseEther("90"),
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
      mayc,
      nBAYC,
      nMAYC,
      poolAdmin,
    } = await loadFixture(fixture);

    const ETHExchangeRequest1 = {
      initiator: user1.address,
      paymentToken: zeroAddress(),
      listingPrice: parseEther("50"),
      borrowAmount: parseEther("15"),
      collection: mayc.address,
      tokenId: 0,
    };

    await waitForTx(
      await pool.connect(poolAdmin.signer).setBlurExchangeRequestFeeRate(1000)
    );

    const beforeInitiateBalance = await user1.signer.getBalance();
    const beforeInitiateWETHBalance = await weth.balanceOf(user1.address);
    expect(await wethDebtToken.balanceOf(user1.address)).to.be.eq(0);
    const keeperBeforeInitiateBalance = await user2.signer.getBalance();

    await waitForTx(
      await pool
        .connect(user1.signer)
        .initiateBlurExchangeRequest(
          [ETHExchangeRequest, ETHExchangeRequest1],
          {
            value: parseEther("99"),
          }
        )
    );

    const afterInitiateBalance = await user1.signer.getBalance();
    const afterInitiateWETHBalance = await weth.balanceOf(user1.address);
    almostEqual(
      beforeInitiateBalance.sub(afterInitiateBalance),
      parseEther("99")
    );
    expect(afterInitiateWETHBalance).to.be.eq(beforeInitiateWETHBalance);
    const keeperAfterInitiateBalance = await user2.signer.getBalance();
    almostEqual(
      keeperAfterInitiateBalance.sub(keeperBeforeInitiateBalance),
      parseEther("154")
    );
    almostEqual(await wethDebtToken.balanceOf(user1.address), parseEther("55"));

    expect(await bayc.balanceOf(user2.address)).to.be.eq(1);
    expect(await bayc.balanceOf(nBAYC.address)).to.be.eq(0);
    expect(await mayc.balanceOf(user2.address)).to.be.eq(1);
    expect(await mayc.balanceOf(nMAYC.address)).to.be.eq(0);

    await waitForTx(
      await pool
        .connect(user2.signer)
        .fulfillBlurExchangeRequest([ETHExchangeRequest, ETHExchangeRequest1])
    );

    expect(await bayc.balanceOf(user2.address)).to.be.eq(0);
    expect(await bayc.balanceOf(nBAYC.address)).to.be.eq(1);
    expect(await mayc.balanceOf(user2.address)).to.be.eq(0);
    expect(await mayc.balanceOf(nMAYC.address)).to.be.eq(1);
    const afterFulfillBalance = await user1.signer.getBalance();
    expect(afterFulfillBalance.sub(afterInitiateBalance)).to.be.eq(0);
    almostEqual(await wethDebtToken.balanceOf(user1.address), parseEther("55"));
  });

  it("eth request can be rejected", async () => {
    const {
      pool,
      users: [user1, user2],
      pWETH,
      bayc,
      mayc,
      nBAYC,
      nMAYC,
      poolAdmin,
    } = await loadFixture(fixture);

    const ETHExchangeRequest1 = {
      initiator: user1.address,
      paymentToken: zeroAddress(),
      listingPrice: parseEther("50"),
      borrowAmount: parseEther("15"),
      collection: mayc.address,
      tokenId: 0,
    };

    await waitForTx(
      await pool.connect(poolAdmin.signer).setBlurExchangeRequestFeeRate(1000)
    );

    await waitForTx(
      await pool
        .connect(user1.signer)
        .initiateBlurExchangeRequest(
          [ETHExchangeRequest, ETHExchangeRequest1],
          {
            value: parseEther("99"),
          }
        )
    );

    expect(await bayc.balanceOf(user2.address)).to.be.eq(1);
    expect(await bayc.balanceOf(nBAYC.address)).to.be.eq(0);
    expect(await mayc.balanceOf(user2.address)).to.be.eq(1);
    expect(await mayc.balanceOf(nMAYC.address)).to.be.eq(0);
    expect(await pWETH.balanceOf(user1.address)).to.be.eq(0);
    almostEqual(await wethDebtToken.balanceOf(user1.address), parseEther("55"));
    expect(await nBAYC.balanceOf(user1.address)).to.be.eq(1);
    expect(await nMAYC.balanceOf(user1.address)).to.be.eq(1);

    await waitForTx(
      await pool
        .connect(user2.signer)
        .rejectBlurExchangeRequest([ETHExchangeRequest, ETHExchangeRequest1], {
          value: parseEther("140"),
        })
    );

    expect(await bayc.balanceOf(user2.address)).to.be.eq(1);
    expect(await bayc.balanceOf(nBAYC.address)).to.be.eq(0);
    expect(await wethDebtToken.balanceOf(user1.address)).to.be.eq(0);
    almostEqual(await pWETH.balanceOf(user1.address), parseEther("85"));
    expect(await nBAYC.balanceOf(user1.address)).to.be.eq(0);
    expect(await nMAYC.balanceOf(user1.address)).to.be.eq(0);
  });

  it("eth request can not be initiated by weth", async () => {
    const {
      pool,
      users: [user1],
    } = await loadFixture(fixture);
    await expect(
      pool
        .connect(user1.signer)
        .initiateBlurExchangeRequest([ETHExchangeRequest])
    ).to.be.revertedWith(ProtocolErrors.INVALID_ETH_VALUE);
  });

  it("weth request can not be initiated", async () => {
    const {
      pool,
      users: [user1],
    } = await loadFixture(fixture);

    await expect(
      pool
        .connect(user1.signer)
        .initiateBlurExchangeRequest([WETHExchangeRequest], {
          value: parseEther("50"),
        })
    ).to.be.revertedWith(ProtocolErrors.INVALID_PAYMENT_TOKEN);
  });

  it("only pool admin can enable/disable blur exchange", async () => {
    const {
      pool,
      users: [user1],
      poolAdmin,
    } = await loadFixture(fixture);
    await expect(
      pool.connect(user1.signer).enableBlurExchange()
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_POOL_ADMIN);

    await waitForTx(await pool.connect(poolAdmin.signer).enableBlurExchange());

    await expect(
      pool.connect(user1.signer).disableBlurExchange()
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_POOL_OR_EMERGENCY_ADMIN);

    await waitForTx(await pool.connect(poolAdmin.signer).disableBlurExchange());
  });

  it("only pool admin can update request limit", async () => {
    const {
      pool,
      users: [user1],
      poolAdmin,
    } = await loadFixture(fixture);
    await expect(
      pool.connect(user1.signer).setBlurOngoingRequestLimit(5)
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_POOL_ADMIN);

    await waitForTx(
      await pool.connect(poolAdmin.signer).setBlurOngoingRequestLimit(5)
    );
  });

  it("only pool admin can update request fee rate", async () => {
    const {
      pool,
      users: [user1],
      poolAdmin,
    } = await loadFixture(fixture);
    await expect(
      pool.connect(user1.signer).setBlurExchangeRequestFeeRate(100)
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_POOL_ADMIN);

    await waitForTx(
      await pool.connect(poolAdmin.signer).setBlurExchangeRequestFeeRate(100)
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
      users: [user1, user2],
    } = await loadFixture(fixture);

    await expect(
      pool
        .connect(user2.signer)
        .initiateBlurExchangeRequest([ETHExchangeRequest], {
          value: parseEther("50"),
        })
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_INITIATOR);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .initiateBlurExchangeRequest([ETHExchangeRequest], {
          value: parseEther("50"),
        })
    );
  });

  it("only keeper can fulfill the request", async () => {
    const {
      pool,
      users: [user1, , user3],
    } = await loadFixture(fixture);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .initiateBlurExchangeRequest([ETHExchangeRequest], {
          value: parseEther("50"),
        })
    );

    await expect(
      pool
        .connect(user3.signer)
        .fulfillBlurExchangeRequest([ETHExchangeRequest])
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
        .initiateBlurExchangeRequest([ETHExchangeRequest], {
          value: parseEther("50"),
        })
    );

    await expect(
      pool.connect(user3.signer).rejectBlurExchangeRequest([ETHExchangeRequest])
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
        .initiateBlurExchangeRequest([ETHExchangeRequest], {
          value: parseEther("50"),
        })
    );

    await expect(
      nBAYC.connect(user1.signer).transferFrom(user1.address, user2.address, 0)
    ).to.be.revertedWith(ProtocolErrors.NTOKEN_NOT_OWNS_UNDERLYING);
  });

  it("user can't borrowApeAndStake before request is fulfilled", async () => {
    const {
      pool,
      users: [user1, user2],
      bayc,
      bakc,
      ape,
    } = await loadFixture(fixture);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .initiateBlurExchangeRequest([ETHExchangeRequest], {
          value: parseEther("50"),
        })
    );

    await supplyAndValidate(ape, "200000", user2, true);

    const amount = await convertToCurrencyDecimals(ape.address, "10000");
    await expect(
      pool.connect(user1.signer).borrowApeAndStake(
        {
          nftAsset: bayc.address,
          borrowAsset: ape.address,
          borrowAmount: amount,
          cashAmount: 0,
        },
        [{tokenId: 0, amount: amount}],
        []
      )
    ).to.be.revertedWith(ProtocolErrors.NTOKEN_NOT_OWNS_UNDERLYING);

    await waitForTx(await bakc["mint(uint256,address)"]("2", user1.address));
    await waitForTx(
      await bakc.connect(user1.signer).setApprovalForAll(pool.address, true)
    );
    await expect(
      pool.connect(user1.signer).borrowApeAndStake(
        {
          nftAsset: bayc.address,
          borrowAsset: ape.address,
          borrowAmount: amount,
          cashAmount: 0,
        },
        [],
        [{mainTokenId: 0, bakcTokenId: 0, amount: amount}]
      )
    ).to.be.revertedWith(ProtocolErrors.NTOKEN_NOT_OWNS_UNDERLYING);
  });

  it("listing price must > floor price * ls when initiate request", async () => {
    const {
      pool,
      bayc,
      users: [user1],
    } = await loadFixture(fixture);

    const invalidRequest = {
      initiator: user1.address,
      paymentToken: zeroAddress(),
      listingPrice: parseEther("80"),
      borrowAmount: parseEther("40"),
      collection: bayc.address,
      tokenId: 0,
    };

    await expect(
      pool.connect(user1.signer).initiateBlurExchangeRequest([invalidRequest], {
        value: parseEther("40"),
      })
    ).to.be.revertedWith(ProtocolErrors.INVALID_LISTING_PRICE);
  });

  it("listing price must > trait boosted price * ls when initiate request", async () => {
    const {
      pool,
      bayc,
      nBAYC,
      poolAdmin,
      users: [user1],
    } = await loadFixture(fixture);

    await waitForTx(
      await nBAYC
        .connect(poolAdmin.signer)
        .setTraitsMultipliers(["0"], [BigNumber.from(WAD).mul(2)])
    );

    const invalidRequest = {
      initiator: user1.address,
      paymentToken: zeroAddress(),
      listingPrice: parseEther("100"),
      borrowAmount: parseEther("40"),
      collection: bayc.address,
      tokenId: 0,
    };

    await expect(
      pool.connect(user1.signer).initiateBlurExchangeRequest([invalidRequest], {
        value: parseEther("60"),
      })
    ).to.be.revertedWith(ProtocolErrors.INVALID_LISTING_PRICE);
  });

  it("ongoing request count must <= limit", async () => {
    const {
      pool,
      users: [user1],
      poolAdmin,
    } = await loadFixture(fixture);

    await waitForTx(
      await pool.connect(poolAdmin.signer).setBlurOngoingRequestLimit(1)
    );

    await waitForTx(
      await pool
        .connect(user1.signer)
        .initiateBlurExchangeRequest([ETHExchangeRequest], {
          value: parseEther("50"),
        })
    );

    ETHExchangeRequest.tokenId = 1;

    await expect(
      pool
        .connect(user1.signer)
        .initiateBlurExchangeRequest([ETHExchangeRequest], {
          value: parseEther("50"),
        })
    ).to.be.revertedWith(ProtocolErrors.ONGOING_REQUEST_AMOUNT_EXCEEDED);

    ETHExchangeRequest.tokenId = 0;
  });

  it("eth request reverted when transaction value is not equal with cash value", async () => {
    const {
      pool,
      users: [user1],
    } = await loadFixture(fixture);

    await expect(
      pool
        .connect(user1.signer)
        .initiateBlurExchangeRequest([ETHExchangeRequest], {
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
        .initiateBlurExchangeRequest([ETHExchangeRequest], {
          value: parseEther("50"),
        })
    );
    await expect(
      pool
        .connect(user1.signer)
        .initiateBlurExchangeRequest([ETHExchangeRequest], {
          value: parseEther("50"),
        })
    ).to.be.revertedWith(ProtocolErrors.INVALID_REQUEST_STATUS);
  });

  it("only initiated status request can be fulfilled", async () => {
    const {
      pool,
      users: [, user2],
    } = await loadFixture(fixture);

    await expect(
      pool
        .connect(user2.signer)
        .fulfillBlurExchangeRequest([ETHExchangeRequest])
    ).to.be.revertedWith(ProtocolErrors.INVALID_REQUEST_STATUS);
  });

  it("only initiated status request can be rejected", async () => {
    const {
      pool,
      users: [, user2],
    } = await loadFixture(fixture);

    await expect(
      pool.connect(user2.signer).rejectBlurExchangeRequest([ETHExchangeRequest])
    ).to.be.revertedWith(ProtocolErrors.INVALID_REQUEST_STATUS);
  });

  it("initiate request failed when blur exchange request disabled", async () => {
    const {
      pool,
      users: [user1],
      poolAdmin,
    } = await loadFixture(fixture);

    await waitForTx(await pool.connect(poolAdmin.signer).disableBlurExchange());

    await expect(
      pool
        .connect(user1.signer)
        .initiateBlurExchangeRequest([ETHExchangeRequest], {
          value: parseEther("50"),
        })
    ).to.be.revertedWith(ProtocolErrors.BLUR_EXCHANGE_REQUEST_DISABLED);
  });

  it("initiate request failed when asset liquidation threshold is 0", async () => {
    const {
      pool,
      users: [user1],
      poolAdmin,
      bayc,
      configurator,
    } = await loadFixture(fixture);

    await waitForTx(
      await configurator
        .connect(poolAdmin.signer)
        .configureReserveAsCollateral(bayc.address, 0, 0, 0)
    );

    await expect(
      pool
        .connect(user1.signer)
        .initiateBlurExchangeRequest([ETHExchangeRequest], {
          value: parseEther("50"),
        })
    ).to.be.revertedWith(ProtocolErrors.INVALID_ASSET);
  });
});
