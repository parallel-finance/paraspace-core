import {expect} from "chai";
import {BigNumber} from "ethers";
import {parseEther} from "ethers/lib/utils";
import {MAX_UINT_AMOUNT} from "../deploy/helpers/constants";
import {getMockAggregator} from "../deploy/helpers/contracts-getters";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {advanceBlock, waitForTx} from "../deploy/helpers/misc-utils";
import {RateMode} from "../deploy/helpers/types";
import {makeSuite} from "./helpers/make-suite";
import {liquidateAndValidate} from "./helpers/validated-steps";

makeSuite("Liquidation Auction", (testEnv) => {
  let borrowerDaiDeposit;
  let liquidatorDaiDeposit;

  before("Initialize Depositors", async () => {
    const {dai} = testEnv;
    borrowerDaiDeposit = await convertToCurrencyDecimals(dai.address, "5000");
    liquidatorDaiDeposit = await convertToCurrencyDecimals(
      dai.address,
      "100000"
    );

    // assure asset prices for correct health factor calculations
    const baycAgg = await getMockAggregator(undefined, "BAYC");
    await baycAgg.updateLatestAnswer("100000000000000000000");
    const daiAgg = await getMockAggregator(undefined, "DAI");
    await daiAgg.updateLatestAnswer("908578801039414");
  });

  it("Borrower deposits 3 BAYC and 5k DAI", async () => {
    const {
      bayc,
      nBAYC,
      users: [borrower],
      pool,
      dai,
    } = testEnv;

    for (let i = 0; i < 3; i++) {
      await waitForTx(
        await bayc.connect(borrower.signer)["mint(address)"](borrower.address)
      );
    }

    await waitForTx(
      await bayc.connect(borrower.signer).setApprovalForAll(pool.address, true)
    );

    // supplies 2 NFTs, one used as collateral
    await pool.connect(borrower.signer).supplyERC721(
      bayc.address,
      [
        {tokenId: 0, useAsCollateral: true},
        {tokenId: 1, useAsCollateral: false},
        {tokenId: 2, useAsCollateral: false},
      ],
      borrower.address,
      "0"
    );

    const nBaycBalance = await nBAYC.balanceOf(borrower.address);
    expect(nBaycBalance).to.be.equal(3);

    await waitForTx(
      await dai
        .connect(borrower.signer)
        ["mint(uint256)"](await convertToCurrencyDecimals(dai.address, "40000"))
    );

    // approve protocol to access depositor wallet
    await waitForTx(
      await dai.connect(borrower.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    // User 1 - Deposit dai
    await waitForTx(
      await pool
        .connect(borrower.signer)
        .supply(dai.address, borrowerDaiDeposit, borrower.address, "0")
    );
  });

  it("Liquidator deposits 100k DAI and 10 wETH", async () => {
    const {
      weth,
      users: [, liquidator],
      pool,
      dai,
    } = testEnv;

    await waitForTx(
      await weth
        .connect(liquidator.signer)
        ["mint(uint256)"](await convertToCurrencyDecimals(weth.address, "1000"))
    );

    await waitForTx(
      await weth
        .connect(liquidator.signer)
        .approve(pool.address, MAX_UINT_AMOUNT)
    );

    await waitForTx(
      await pool
        .connect(liquidator.signer)
        .supply(
          weth.address,
          await convertToCurrencyDecimals(weth.address, "10"),
          liquidator.address,
          "0"
        )
    );

    await waitForTx(
      await dai
        .connect(liquidator.signer)
        ["mint(uint256)"](
          await convertToCurrencyDecimals(dai.address, "200000")
        )
    );

    // approve protocol to access depositor wallet
    await waitForTx(
      await dai
        .connect(liquidator.signer)
        .approve(pool.address, MAX_UINT_AMOUNT)
    );

    // Liquidator - Deposit dai
    await waitForTx(
      await pool
        .connect(liquidator.signer)
        .supply(dai.address, liquidatorDaiDeposit, liquidator.address, "0")
    );
  });

  it("Borrower borrows 15k DAI", async () => {
    const {
      users: [borrower],
      pool,
      dai,
    } = testEnv;

    // Borrower
    //
    // collaterals:
    // BAYC#0 = 0.3 * 100 ~= 30 ETH
    // DAI#5k = 0.75 * 5000 * 0.000908578801039414 ~= 3.4071705038978024 ETH

    //
    // borrows:
    // 15k DAI = 15000 * 0.000908578801039414 ~= 13.62868201559121 ETH
    //
    // HF = (0.7 * 100 + 0.8 * 5000 * 0.000908578801039414) / (13.62868201559121) = 5.4028933333333341722
    // ERC721HF = (0.7 * 100) / (13.62868201559121 - 5000 * 0.000908578801039414) = 7.7043400000000012583

    // Liquidator
    //
    // collaterals:
    // DAI#100k
    // WETH#10
    //
    // wallet:
    // DAI#100k
    // WETH#990

    // User 1 - Borrow dai
    const borrowAmount = await convertToCurrencyDecimals(dai.address, "15000");

    await waitForTx(
      await pool
        .connect(borrower.signer)
        .borrow(
          dai.address,
          borrowAmount,
          RateMode.Variable,
          "0",
          borrower.address
        )
    );
  });

  it("Liquidator tries to liquidate a healthy position (should be reverted)", async () => {
    const {
      users: [borrower, liquidator],
      pool,
      dai,
    } = testEnv;

    // drop BAYC price to near liquidation limit (HF ~ 1.0 - 1.1)
    const agg = await getMockAggregator(undefined, "BAYC");
    await agg.updateLatestAnswer(parseEther("15").toString());

    // collaterals:
    // BAYC#0 = 0.3 * 15 ~= 4.5 ETH
    // DAI#5k = 0.75 * 5000 * 0.000908578801039414 ~= 3.4071705038978025 ETH

    //
    // borrows:
    // 15k DAI = 15000 * 0.000908578801039414 ~= 13.62868201559121 ETH
    //
    // HF = (0.7 * 15 + 0.8 * 5000 * 0.000908578801039414) / (13.62868201559121) = 1.0371006666666667925
    // ERC721HF = (0.7 * 15) / (13.62868201559121 - 5000 * 0.000908578801039414) = 1.1556510000000001887

    expect(
      pool
        .connect(liquidator.signer)
        .liquidationCall(
          dai.address,
          dai.address,
          borrower.address,
          parseEther("1000").toString(),
          false
        )
    ).to.be.reverted;
  });

  it("BAYC price drops enough so that borrower becomes eligible for liquidation", async () => {
    const agg = await getMockAggregator(undefined, "BAYC");
    await agg.updateLatestAnswer(parseEther("12").toString());

    // collaterals:
    // BAYC#0 = 0.3 * 12 ~= 3.5999999999999996 ETH
    // DAI#5k = 0.75 * 5000 * 0.000908578801039414 ~= 3.4071705038978024 ETH

    //
    // borrows:
    // 15k DAI = 15000 * 0.000908578801039414 ~= 13.62868201559121 ETH
    //
    // HF = (0.7 * 12 + 0.8 * 5000 * 0.000908578801039414) / (13.62868201559121) = 0.88301386666666676733
    // ERC721HF = (0.7 * 12) / (13.62868201559121 - 5000 * 0.000908578801039414) = 0.92452080000000015099
  });

  it("Liquidator attempts to liquidate ERC-721 without auction enabled (should be reverted)", async () => {
    const {
      deployer,
      configurator,
      users: [borrower, liquidator],
      pool,
      bayc,
      dai,
    } = testEnv;

    // collateralDiscountedPrice: 12 / 0.000908578801039414 / 1.05 = 12578.514285714287769 DAI

    // disable auction first to test original liquidation
    await waitForTx(
      await configurator
        .connect(deployer.signer)
        .configureReserveAsAuctionCollateral(
          bayc.address,
          false,
          "1500000000000000000"
        )
    );

    // Liquidator
    //
    // collaterals:
    // DAI#100k
    // WETH#10
    //
    // wallet:
    // DAI#100k
    // WETH#990
    //
    // liquidationAmount: 12000000000000000000
    // collateralDiscountedPrice: 12578514285714287768609
    expect(
      pool
        .connect(liquidator.signer)
        .liquidationERC721(
          bayc.address,
          dai.address,
          borrower.address,
          0,
          parseEther("12").toString(),
          false
        )
    ).to.be.reverted;
  });

  it("Liquidator partially liquidates ERC-20 - receives asset", async () => {
    const {
      users: [borrower, liquidator],
    } = testEnv;

    await liquidateAndValidate(
      "DAI",
      "DAI",
      "1000",
      liquidator,
      borrower,
      false
    );

    // Borrower
    //
    // collaterals:
    // BAYC#0 = 0.3 * 12 ~= 3.5999999999999996 ETH
    // DAI#5k = 0.75 * (5000 - 1050) * 0.000908578801039414 ~= 2.691664698079263975 ETH
    //
    // borrows:
    // DAI = (15000 - 1000) * 0.000908578801039414 ~= 12.720103214551796 ETH
    //
    // HF = (0.7 * 12 + 0.8 * (5000 - 1050) * 0.000908578801039414) / (12.720103214551796 ) ~= 0.88608628571428582214
    // ERC721HF = (0.7 * 12) / (12.720103214551796 - (5000 - 1050) * 0.000908578801039414) ~= 0.91992119402985089651

    // Liquidator
    //
    // collaterals:
    // DAI#100k
    // WETH#10
    //
    // wallet:
    // DAI#99000
    // WETH#990
  });

  it("Liquidator insists on liquidating the ERC-721 (should be reverted)", async () => {
    const {
      users: [borrower, liquidator],
      pool,
      bayc,
      dai,
    } = testEnv;

    // collateralDiscountedPrice: 12 / 0.000908578801039414 / 1.05 = 12578.514285714287769 DAI

    expect(
      pool
        .connect(liquidator.signer)
        .liquidationERC721(
          bayc.address,
          dai.address,
          borrower.address,
          0,
          parseEther("12").toString(),
          false
        )
    ).to.be.reverted;
  });

  it("Liquidator fully liquidates ERC-20 - receives pToken", async () => {
    const {
      users: [borrower, liquidator],
    } = testEnv;

    await liquidateAndValidate(
      "DAI",
      "DAI",
      "40000",
      liquidator,
      borrower,
      true
    );

    // Borrower
    //
    // collaterals:
    // BAYC#0 = 0.3 * 12 ~= 3.5999999999999996 ETH

    //
    // borrows:
    // DAI = (15000 - 1000 - (5000 - 1050) / 1.05) * 0.000908578801039414 ~= 9.3021162963559052379 ETH
    //
    // HF = (0.7 * 12) / (9.3021162963559052379) ~= 0.90302031627906991494
    // ERC721HF = (0.7 * 12) / (9.3021162963559052379) ~= 0.90302031627906991494

    // Liquidator
    //
    // collaterals:
    // DAI#100k
    // WETH#10
    //
    // wallet:
    // DAI#95238.09523809524
    // WETH#990
  });

  it("Not the best day for BAYC, price drops even more, and borrower's NFT becomes eligible for liquidation", async () => {
    const agg = await getMockAggregator(undefined, "BAYC");
    await agg.updateLatestAnswer(parseEther("8").toString());
  });

  it("Liquidator starts auction on BAYC#0", async () => {
    const {
      deployer,
      configurator,
      users: [borrower, liquidator],
      pool,
      bayc,
      nBAYC,
    } = testEnv;

    expect(
      pool
        .connect(liquidator.signer)
        .startAuction(borrower.address, bayc.address, 0)
    ).to.be.reverted;

    // re-enable auction first to test auction liquidation
    await waitForTx(
      await configurator
        .connect(deployer.signer)
        .configureReserveAsAuctionCollateral(
          bayc.address,
          true,
          "1500000000000000000"
        )
    );

    await waitForTx(
      await pool
        .connect(liquidator.signer)
        .startAuction(borrower.address, bayc.address, 0)
    );

    const {
      startTime,
      asset,
      tokenId,
      currentPriceMultiplier,
      maxPriceMultiplier,
    } = await pool.getAuctionData(nBAYC.address, 0);
    expect(startTime).to.be.gt(0);
    expect(asset).to.be.eq(bayc.address);
    expect(tokenId).to.be.eq(0);
    expect(currentPriceMultiplier).to.be.eq(maxPriceMultiplier);
  });

  it("BAYC#0 auction started", async () => {
    const {
      users: [borrower],
      nBAYC,
      poolDataProvider,
    } = testEnv;

    const {startTime} = await nBAYC.getAuctionData(0);
    const auctionedBalance = await nBAYC.auctionedBalanceOf(borrower.address);
    const isAuctioned = await nBAYC.isAuctioned(0);
    expect(startTime).to.be.gt(0);
    expect(auctionedBalance).to.be.eq(1);
    expect(isAuctioned).to.be.true;

    const [[auctionData]] = await poolDataProvider.getNTokenData(
      borrower.address,
      [nBAYC.address],
      [[0, 1, 2]]
    );
    expect(auctionData.isAuctioned).to.be.true;
  });

  it("Liquidator tries to start auction on BAYC#0 again (should be reverted)", async () => {
    const {
      users: [borrower, liquidator],
      pool,
      bayc,
    } = testEnv;

    expect(
      pool
        .connect(liquidator.signer)
        .startAuction(borrower.address, bayc.address, 0)
    ).to.be.reverted;
  });

  it("Borrower tries to end auction to avoid being liquidated (should be reverted)", async () => {
    const {
      users: [borrower],
      pool,
      bayc,
    } = testEnv;

    expect(
      pool
        .connect(borrower.signer)
        .endAuction(borrower.address, bayc.address, 0)
    ).to.be.reverted;
  });

  it("Before liquidation BAYC price increased sharply", async () => {
    const agg = await getMockAggregator(undefined, "BAYC");
    await agg.updateLatestAnswer(parseEther("60").toString());

    // Borrower
    //
    // collaterals:
    // BAYC#0 = 0.3 * 60 ~= 18 ETH
    //
    // borrows:
    // DAI = (15000 - 1000 - (5000 - 1050) / 1.05) * 0.000908578801039414 ~= 9.3021162963559052379 ETH
    //
    // HF = (0.7 * 60) / (9.3021162963559052379) ~= 4.5151015813953495747
    // ERC721HF = uint256.max
  });

  it("Liquidator liquidates the ERC-721 (should be reverted because of recoveryHealthFactor)", async () => {
    const {
      users: [borrower, liquidator],
      pool,
      bayc,
      weth,
    } = testEnv;

    expect(
      pool
        .connect(liquidator.signer)
        .liquidationERC721(
          bayc.address,
          weth.address,
          borrower.address,
          0,
          parseEther("36").toString(),
          false,
          {gasLimit: 5000000}
        )
    ).to.be.reverted;
  });

  it("BAYC price drops sharply back to 8ETH", async () => {
    const agg = await getMockAggregator(undefined, "BAYC");
    await agg.updateLatestAnswer(parseEther("8").toString());
  });

  it("Liquidator liquidates the ERC-721 - gets NFT", async () => {
    const {
      users: [borrower, liquidator],
      pool,
      nBAYC,
    } = testEnv;

    // Borrower
    //
    // collaterals:
    // BAYC#0 = 0.3 * 8 ~= 2.7 ETH
    //
    // borrows:
    // DAI = (15000 - 1000 - (5000 - 1050) / 1.05) * 0.000908578801039414 ~= 9.3021162963559052379 ETH
    //
    // HF = (0.7 * 8) / (9.3021162963559052379) ~= 0.60201354418604660996
    // ERC721HF = (0.7 * 8) / (9.3021162963559052379) ~= 0.60201354418604660996

    // collateralDiscountedPrice: 8 * 1.5 / 1 / 1 = 12 WETH
    const {startTime, tickLength} = await pool.getAuctionData(nBAYC.address, 0);
    // prices drops to ~1.5 floor price
    await advanceBlock(
      startTime.add(tickLength.mul(BigNumber.from(30))).toNumber()
    );
    await liquidateAndValidate(
      "BAYC",
      "WETH",
      "12",
      liquidator,
      borrower,
      false,
      0
    );
  });

  it("BAYC#0 auction ended automatically after liquidation", async () => {
    const {
      users: [borrower],
      nBAYC,
    } = testEnv;

    const {startTime} = await nBAYC.getAuctionData(0);
    const auctionedBalance = await nBAYC.auctionedBalanceOf(borrower.address);
    const isAuctioned = await nBAYC.isAuctioned(0);
    expect(startTime).to.be.eq(0);
    expect(auctionedBalance).to.be.eq(0);
    expect(isAuctioned).to.be.false;
  });

  it("Borrower tries to withdraw the deposited BAYC after liquidation (should fail)", async () => {
    const {
      bayc,
      users: [borrower],
      pool,
    } = testEnv;

    expect(
      pool
        .connect(borrower.signer)
        .withdrawERC721(bayc.address, [0], borrower.address)
    ).to.be.reverted;
  });

  it("Liquidator tries to liquidate same NFT again (should fail)", async () => {
    const {
      bayc,
      users: [borrower, liquidator],
      pool,
      dai,
    } = testEnv;

    // Borrower
    //
    // collaterals:
    // WETH: 0.825 * 12 ~= 9.899999999999999 ETH
    //
    // borrows:
    // DAI = (15000 - 1000 - (5000 - 1050) / 1.05) * 0.000908578801039414 ~= 9.3021162963559052379 ETH
    //
    // HF = (0.85 * 12) / (9.3021162963559052379) ~= 1.0965246697674420396
    // ERC721HF = (0.85 * 12) / (9.3021162963559052379) ~= 1.0965246697674420396

    expect(
      pool
        .connect(liquidator.signer)
        .liquidationERC721(
          bayc.address,
          dai.address,
          borrower.address,
          1,
          parseEther("10000").toString(),
          true
        )
    ).to.be.reverted;
  });

  it("Murphys law, after being liquidated BAYC price now recovers", async () => {
    const agg = await getMockAggregator(undefined, "BAYC");
    await agg.updateLatestAnswer(parseEther("120").toString());
  });

  it("Borrower places the 2 NFTs left in collateral and borrows 60k DAI", async () => {
    const {
      bayc,
      users: [borrower],
      pool,
      dai,
    } = testEnv;
    await waitForTx(
      await pool
        .connect(borrower.signer)
        .setUserUseERC721AsCollateral(bayc.address, [1], true)
    );

    await waitForTx(
      await pool
        .connect(borrower.signer)
        .setUserUseERC721AsCollateral(bayc.address, [2], true)
    );

    const borrowAmount = await convertToCurrencyDecimals(dai.address, "60000");

    await waitForTx(
      await pool
        .connect(borrower.signer)
        .borrow(
          dai.address,
          borrowAmount,
          RateMode.Variable,
          "0",
          borrower.address
        )
    );
  });

  it("NFT price drops again", async () => {
    const agg = await getMockAggregator(undefined, "BAYC");
    await agg.updateLatestAnswer(parseEther("10").toString());
  });

  it("Liquidator liquidates ERC-721 (pays debt partially) - gets nToken", async () => {
    const {
      pool,
      bayc,
      nBAYC,
      users: [borrower, liquidator],
    } = testEnv;

    // Borrower
    //
    // collaterals:
    // WETH: 0.825 * 12 ~= 9.899999999999999 ETH
    // BAYC#1: 0.3 * 10 ~= 3 ETH
    // BAYC#2: 0.3 * 10 ~= 3 ETH
    //
    // borrows:
    // DAI = (15000 - 1000 - (5000 - 1050) / 1.05 + 60000) * 0.000908578801039414 ~= 63.816844358720745238 ETH
    //
    // HF = (0.85 * 12 + 0.7 * 10 + 0.7 * 10) / (63.816844358720745238) ~= 0.37921022644067802803
    // ERC721HF = (0.7 * 10 + 0.7 * 10) / (63.816844358720745238 - 12) ~= 0.27018241217238092994

    await waitForTx(
      await pool
        .connect(liquidator.signer)
        .startAuction(borrower.address, bayc.address, 1)
    );

    const {startTime, tickLength} = await pool.getAuctionData(nBAYC.address, 1);
    // price drops to 1 * floor price
    await advanceBlock(
      startTime.add(tickLength.mul(BigNumber.from(40))).toNumber()
    );

    // collateralDiscountedPrice: 10 * 1 / 1 / 0.000908578801039414 = 11006.200000000001798 DAI
    await liquidateAndValidate(
      "BAYC",
      "DAI",
      "80000",
      liquidator,
      borrower,
      true,
      1
    );
  });

  it("NFT price rises enough to cover full debt", async () => {
    const agg = await getMockAggregator(undefined, "BAYC");
    await agg.updateLatestAnswer(parseEther("55").toString());

    // Borrower
    //
    // collaterals:
    // WETH: 0.825 * 12 ~= 9.9 ETH
    // BAYC#2: 0.3 * 55 ~= 16.5 ETH
    //
    // borrows:
    // DAI = (15000 - 1000 - (5000 - 1050) / 1.05 + 60000 - 11006.200000000001798) * 0.000908578801039414 ~= 53.816844358720745237 ETH
    //
    // HF = (0.85 * 12 + 0.7 * 55) / (53.816844358720745237) ~= 0.90492113724442881242
    // ERC721HF = (0.7 * 55) / (53.816844358720745237 - 12) ~= 0.92068161982124722783
  });

  it("Liquidator liquidates the remaining ERC-721 (pays full debt) - gets NFT", async () => {
    const {
      pool,
      bayc,
      nBAYC,
      users: [borrower, liquidator],
    } = testEnv;

    await waitForTx(
      await pool
        .connect(liquidator.signer)
        .startAuction(borrower.address, bayc.address, 2)
    );

    const {startTime, tickLength} = await pool.getAuctionData(nBAYC.address, 2);
    // price drops to 1 * floor price
    await advanceBlock(
      startTime.add(tickLength.mul(BigNumber.from(40))).toNumber()
    );

    // collateralDiscountedPrice: 55 * 1 / 1 / 0.000908578801039414 = 60534.100000000009886 DAI
    await liquidateAndValidate(
      "BAYC",
      "DAI",
      "70000",
      liquidator,
      borrower,
      false,
      2
    );
  });
});
