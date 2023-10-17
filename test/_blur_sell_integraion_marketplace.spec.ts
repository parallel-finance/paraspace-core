import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {MAX_UINT_AMOUNT, WAD} from "../helpers/constants";
import {waitForTx} from "../helpers/misc-utils";
import {ProtocolErrors} from "../helpers/types";
import {testEnvFixture} from "./helpers/setup-env";
import {
  changePriceAndValidate,
  mintAndValidate,
  supplyAndValidate,
} from "./helpers/validated-steps";
import {parseEther, solidityKeccak256} from "ethers/lib/utils";
import {almostEqual} from "./helpers/uniswapv3-helper";
import {BigNumber} from "ethers";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";

describe("BLUR Sell Integration Tests", () => {
  let AcceptBaycBidsRequest;
  let AcceptMaycBidsRequest;

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

    await waitForTx(
      await pool
        .connect(poolAdmin.signer)
        .setAcceptBlurBidsKeeper(user2.address)
    );

    await waitForTx(
      await pool.connect(poolAdmin.signer).enableAcceptBlurBids()
    );

    await waitForTx(
      await pool
        .connect(poolAdmin.signer)
        .setAcceptBlurBidsOngoingRequestLimit(2)
    );

    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(mayc, "1", user1, true);
    await mintAndValidate(weth, parseEther("200").toString(), user2);

    await supplyAndValidate(weth, parseEther("100").toString(), user3, true);

    await waitForTx(
      await weth.connect(user2.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await bayc.connect(user2.signer).setApprovalForAll(pool.address, true)
    );
    await waitForTx(
      await mayc.connect(user2.signer).setApprovalForAll(pool.address, true)
    );

    AcceptBaycBidsRequest = {
      initiator: user1.address,
      paymentToken: weth.address,
      bidingPrice: parseEther("110"),
      marketPlaceFee: parseEther("1"),
      collection: bayc.address,
      tokenId: 0,
      bidOrderHash: solidityKeccak256(["uint256"], [0]),
    };
    AcceptMaycBidsRequest = {
      initiator: user1.address,
      paymentToken: weth.address,
      bidingPrice: parseEther("60"),
      marketPlaceFee: parseEther("1"),
      collection: mayc.address,
      tokenId: 0,
      bidOrderHash: solidityKeccak256(["uint256"], [0]),
    };

    return testEnv;
  };

  it("weth request can be initiated and fulfilled", async () => {
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

    await waitForTx(
      await pool.connect(poolAdmin.signer).setAcceptBlurBidsRequestFeeRate(1000)
    );

    expect(await bayc.balanceOf(user2.address)).to.be.eq(0);
    expect(await bayc.balanceOf(nBAYC.address)).to.be.eq(1);
    expect(await mayc.balanceOf(user2.address)).to.be.eq(0);
    expect(await mayc.balanceOf(nMAYC.address)).to.be.eq(1);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .initiateAcceptBlurBidsRequest(
          [AcceptBaycBidsRequest, AcceptMaycBidsRequest],
          {
            value: parseEther("17"),
          }
        )
    );

    expect(await bayc.balanceOf(user2.address)).to.be.eq(1);
    expect(await bayc.balanceOf(nBAYC.address)).to.be.eq(0);
    expect(await mayc.balanceOf(user2.address)).to.be.eq(1);
    expect(await mayc.balanceOf(nMAYC.address)).to.be.eq(0);

    expect(await pWETH.balanceOf(user1.address)).to.be.eq(0);

    await waitForTx(
      await pool
        .connect(user2.signer)
        .fulfillAcceptBlurBidsRequest(
          [AcceptBaycBidsRequest, AcceptMaycBidsRequest],
          {
            value: parseEther("168"),
          }
        )
    );

    almostEqual(await pWETH.balanceOf(user1.address), parseEther("168"));
  });

  it("weth request can be initiated and rejected", async () => {
    const {
      pool,
      users: [user1, user2],
      bayc,
      mayc,
      nBAYC,
      nMAYC,
      poolAdmin,
    } = await loadFixture(fixture);

    await waitForTx(
      await pool.connect(poolAdmin.signer).setAcceptBlurBidsRequestFeeRate(1000)
    );

    await waitForTx(
      await pool
        .connect(user1.signer)
        .initiateAcceptBlurBidsRequest(
          [AcceptBaycBidsRequest, AcceptMaycBidsRequest],
          {
            value: parseEther("17"),
          }
        )
    );

    expect(await bayc.balanceOf(user2.address)).to.be.eq(1);
    expect(await bayc.balanceOf(nBAYC.address)).to.be.eq(0);
    expect(await mayc.balanceOf(user2.address)).to.be.eq(1);
    expect(await mayc.balanceOf(nMAYC.address)).to.be.eq(0);

    await waitForTx(
      await pool
        .connect(user2.signer)
        .rejectAcceptBlurBidsRequest([
          AcceptBaycBidsRequest,
          AcceptMaycBidsRequest,
        ])
    );

    expect(await bayc.balanceOf(user2.address)).to.be.eq(0);
    expect(await bayc.balanceOf(nBAYC.address)).to.be.eq(1);
    expect(await mayc.balanceOf(user2.address)).to.be.eq(0);
    expect(await mayc.balanceOf(nMAYC.address)).to.be.eq(1);
  });

  it("invalid payment token request can not be initiated", async () => {
    const {
      pool,
      mayc,
      usdt,
      users: [user1],
    } = await loadFixture(fixture);

    const InvalidRequest = {
      initiator: user1.address,
      paymentToken: usdt.address,
      bidingPrice: parseEther("60"),
      marketPlaceFee: parseEther("1"),
      collection: mayc.address,
      tokenId: 0,
      bidOrderHash: solidityKeccak256(["uint256"], [0]),
    };

    await expect(
      pool.connect(user1.signer).initiateAcceptBlurBidsRequest([InvalidRequest])
    ).to.be.revertedWith(ProtocolErrors.INVALID_PAYMENT_TOKEN);
  });

  it("only pool admin can enable/disable accept blur bids", async () => {
    const {
      pool,
      users: [user1],
      poolAdmin,
    } = await loadFixture(fixture);
    await expect(
      pool.connect(user1.signer).enableAcceptBlurBids()
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_POOL_ADMIN);

    await waitForTx(
      await pool.connect(poolAdmin.signer).enableAcceptBlurBids()
    );

    await expect(
      pool.connect(user1.signer).disableAcceptBlurBids()
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_POOL_OR_EMERGENCY_ADMIN);

    await waitForTx(
      await pool.connect(poolAdmin.signer).disableAcceptBlurBids()
    );
  });

  it("only pool admin can update request limit", async () => {
    const {
      pool,
      users: [user1],
      poolAdmin,
    } = await loadFixture(fixture);
    await expect(
      pool.connect(user1.signer).setAcceptBlurBidsOngoingRequestLimit(5)
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_POOL_ADMIN);

    await waitForTx(
      await pool
        .connect(poolAdmin.signer)
        .setAcceptBlurBidsOngoingRequestLimit(5)
    );
  });

  it("only pool admin can update request fee rate", async () => {
    const {
      pool,
      users: [user1],
      poolAdmin,
    } = await loadFixture(fixture);
    await expect(
      pool.connect(user1.signer).setAcceptBlurBidsRequestFeeRate(100)
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_POOL_ADMIN);

    await waitForTx(
      await pool.connect(poolAdmin.signer).setAcceptBlurBidsRequestFeeRate(100)
    );
  });

  it("only pool admin can set blur exchange keeper", async () => {
    const {
      pool,
      users: [user1, user2],
      poolAdmin,
    } = await loadFixture(fixture);

    await expect(
      pool.connect(user1.signer).setAcceptBlurBidsKeeper(user2.address)
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_POOL_ADMIN);

    await waitForTx(
      await pool
        .connect(poolAdmin.signer)
        .setAcceptBlurBidsKeeper(user2.address)
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
        .initiateAcceptBlurBidsRequest([AcceptBaycBidsRequest])
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_INITIATOR);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .initiateAcceptBlurBidsRequest([AcceptBaycBidsRequest])
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
        .initiateAcceptBlurBidsRequest([AcceptBaycBidsRequest])
    );

    await expect(
      pool
        .connect(user3.signer)
        .fulfillAcceptBlurBidsRequest([AcceptBaycBidsRequest])
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
        .initiateAcceptBlurBidsRequest([AcceptBaycBidsRequest])
    );

    await expect(
      pool
        .connect(user3.signer)
        .rejectAcceptBlurBidsRequest([AcceptBaycBidsRequest])
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
        .initiateAcceptBlurBidsRequest([AcceptBaycBidsRequest])
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
        .initiateAcceptBlurBidsRequest([AcceptBaycBidsRequest])
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

  it("biding price * ls must > floor price * ls when initiate request", async () => {
    const {
      pool,
      weth,
      bayc,
      users: [user1],
    } = await loadFixture(fixture);

    const invalidRequest = {
      initiator: user1.address,
      paymentToken: weth.address,
      bidingPrice: parseEther("50"),
      marketPlaceFee: parseEther("1"),
      collection: bayc.address,
      tokenId: 0,
      bidOrderHash: solidityKeccak256(["uint256"], [0]),
    };

    await expect(
      pool.connect(user1.signer).initiateAcceptBlurBidsRequest([invalidRequest])
    ).to.be.revertedWith(ProtocolErrors.INVALID_REQUEST_PRICE);
  });

  it("biding price * ls must > trait boosted price * ls when initiate request", async () => {
    const {
      pool,
      weth,
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
      paymentToken: weth.address,
      bidingPrice: parseEther("110"),
      marketPlaceFee: parseEther("1"),
      collection: bayc.address,
      tokenId: 0,
      bidOrderHash: solidityKeccak256(["uint256"], [0]),
    };

    await expect(
      pool.connect(user1.signer).initiateAcceptBlurBidsRequest([invalidRequest])
    ).to.be.revertedWith(ProtocolErrors.INVALID_REQUEST_PRICE);
  });

  it("ongoing request count must <= limit", async () => {
    const {
      pool,
      users: [user1],
      poolAdmin,
    } = await loadFixture(fixture);

    await waitForTx(
      await pool
        .connect(poolAdmin.signer)
        .setAcceptBlurBidsOngoingRequestLimit(1)
    );

    await waitForTx(
      await pool
        .connect(user1.signer)
        .initiateAcceptBlurBidsRequest([AcceptBaycBidsRequest])
    );

    await expect(
      pool
        .connect(user1.signer)
        .initiateAcceptBlurBidsRequest([AcceptMaycBidsRequest])
    ).to.be.revertedWith(ProtocolErrors.ONGOING_REQUEST_AMOUNT_EXCEEDED);
  });

  it("eth request reverted when transaction value is not equal with cash value", async () => {
    const {
      pool,
      users: [user1],
    } = await loadFixture(fixture);

    await expect(
      pool
        .connect(user1.signer)
        .initiateAcceptBlurBidsRequest([AcceptBaycBidsRequest], {
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
        .initiateAcceptBlurBidsRequest([AcceptBaycBidsRequest])
    );
    await expect(
      pool
        .connect(user1.signer)
        .initiateAcceptBlurBidsRequest([AcceptBaycBidsRequest])
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
        .fulfillAcceptBlurBidsRequest([AcceptBaycBidsRequest])
    ).to.be.revertedWith(ProtocolErrors.INVALID_REQUEST_STATUS);
  });

  it("only initiated status request can be rejected", async () => {
    const {
      pool,
      users: [, user2],
    } = await loadFixture(fixture);

    await expect(
      pool
        .connect(user2.signer)
        .rejectAcceptBlurBidsRequest([AcceptBaycBidsRequest])
    ).to.be.revertedWith(ProtocolErrors.INVALID_REQUEST_STATUS);
  });

  it("initiate request failed when accept blur bids request disabled", async () => {
    const {
      pool,
      users: [user1],
      poolAdmin,
    } = await loadFixture(fixture);

    await waitForTx(
      await pool.connect(poolAdmin.signer).disableAcceptBlurBids()
    );

    await expect(
      pool
        .connect(user1.signer)
        .initiateAcceptBlurBidsRequest([AcceptBaycBidsRequest])
    ).to.be.revertedWith(ProtocolErrors.REQUEST_DISABLED);
  });

  it("should supply for new owner when fulfill request if the nToken is liquidated", async () => {
    const {
      pool,
      bayc,
      nBAYC,
      weth,
      pWETH,
      users: [user1, user2, user3],
    } = await loadFixture(fixture);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .borrow(weth.address, parseEther("50"), 0, user1.address)
    );

    await waitForTx(
      await pool
        .connect(user1.signer)
        .initiateAcceptBlurBidsRequest([AcceptBaycBidsRequest])
    );

    await changePriceAndValidate(bayc, "10");

    // start auction
    await waitForTx(
      await pool
        .connect(user3.signer)
        .startAuction(user1.address, bayc.address, 0)
    );

    expect(await nBAYC.balanceOf(user1.address)).to.be.eq(1);
    expect(await nBAYC.balanceOf(user3.address)).to.be.eq(0);

    await waitForTx(
      await pool
        .connect(user3.signer)
        .liquidateERC721(
          bayc.address,
          user1.address,
          0,
          await convertToCurrencyDecimals(weth.address, "100"),
          true,
          {gasLimit: 5000000, value: parseEther("100")}
        )
    );

    expect(await nBAYC.balanceOf(user1.address)).to.be.eq(0);
    expect(await nBAYC.balanceOf(user3.address)).to.be.eq(1);
    const beforePWethBalance = await pWETH.balanceOf(user3.address);

    await waitForTx(
      await pool
        .connect(user2.signer)
        .fulfillAcceptBlurBidsRequest([AcceptBaycBidsRequest], {
          value: parseEther("109"),
        })
    );

    expect(await nBAYC.balanceOf(user1.address)).to.be.eq(0);
    expect(await nBAYC.balanceOf(user3.address)).to.be.eq(0);
    const afterPWethBalance = await pWETH.balanceOf(user3.address);
    almostEqual(afterPWethBalance.sub(beforePWethBalance), parseEther("109"));
  });

  it("fulfill requests failed if ntokens have different owner", async () => {
    const {
      pool,
      bayc,
      weth,
      users: [user1, user2, user3],
    } = await loadFixture(fixture);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .borrow(weth.address, parseEther("50"), 0, user1.address)
    );

    await waitForTx(
      await pool
        .connect(user1.signer)
        .initiateAcceptBlurBidsRequest([
          AcceptBaycBidsRequest,
          AcceptMaycBidsRequest,
        ])
    );

    await changePriceAndValidate(bayc, "10");

    // start auction
    await waitForTx(
      await pool
        .connect(user3.signer)
        .startAuction(user1.address, bayc.address, 0)
    );

    await waitForTx(
      await pool
        .connect(user3.signer)
        .liquidateERC721(
          bayc.address,
          user1.address,
          0,
          await convertToCurrencyDecimals(weth.address, "100"),
          true,
          {gasLimit: 5000000, value: parseEther("100")}
        )
    );

    await expect(
      pool
        .connect(user2.signer)
        .fulfillAcceptBlurBidsRequest([
          AcceptBaycBidsRequest,
          AcceptMaycBidsRequest,
        ])
    ).to.be.revertedWith(ProtocolErrors.NOT_SAME_NTOKEN_OWNER);
  });

  it("initiate request failed when accept blur bids request disabled", async () => {
    const {
      pool,
      weth,
      bayc,
      users: [, , user3],
    } = await loadFixture(fixture);

    const InvalidAcceptBaycBidsRequest = {
      initiator: user3.address,
      paymentToken: weth.address,
      bidingPrice: parseEther("110"),
      marketPlaceFee: parseEther("1"),
      collection: bayc.address,
      tokenId: 0,
      bidOrderHash: solidityKeccak256(["uint256"], [0]),
    };

    await expect(
      pool
        .connect(user3.signer)
        .initiateAcceptBlurBidsRequest([InvalidAcceptBaycBidsRequest])
    ).to.be.revertedWith(ProtocolErrors.NOT_THE_OWNER);
  });

  it("fulfill requests failed if transaction value is wrong", async () => {
    const {
      pool,
      users: [user1, user2],
    } = await loadFixture(fixture);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .initiateAcceptBlurBidsRequest([
          AcceptBaycBidsRequest,
          AcceptMaycBidsRequest,
        ])
    );

    await expect(
      pool
        .connect(user2.signer)
        .fulfillAcceptBlurBidsRequest(
          [AcceptBaycBidsRequest, AcceptMaycBidsRequest],
          {
            value: parseEther("100"),
          }
        )
    ).to.be.revertedWith(ProtocolErrors.INVALID_ETH_VALUE);
  });
});
