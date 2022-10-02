import {expect} from "chai";
import {BigNumber} from "ethers";
import {parseEther} from "ethers/lib/utils";
import {MAX_UINT_AMOUNT} from "../deploy/helpers/constants";
import {getMockAggregator} from "../deploy/helpers/contracts-getters";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {setBlocktime, waitForTx} from "../deploy/helpers/misc-utils";
import {RateMode} from "../deploy/helpers/types";
import {makeSuite} from "./helpers/make-suite";
import {liquidateAndValidate} from "./helpers/validated-steps";

makeSuite("Liquidation", (testEnv) => {
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
    await baycAgg.updateLatestAnswer("101000000000000000000");
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
  });

  it("Liquidator attempts to liquidate ERC-721 first (should be reverted)", async () => {
    const {
      users: [borrower, liquidator],
      pool,
      bayc,
      dai,
    } = testEnv;
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
  });

  it("Liquidator insists on liquidating the ERC-721 (should be reverted)", async () => {
    const {
      users: [borrower, liquidator],
      pool,
      bayc,
      dai,
    } = testEnv;
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
  });

  it("Not the best day for BAYC, price drops even more, and borrower's NFT becomes eligible for liquidation", async () => {
    const agg = await getMockAggregator(undefined, "BAYC");
    await agg.updateLatestAnswer(parseEther("8").toString());
  });

  it("Liquidator liquidates the ERC-721 - gets NFT", async () => {
    const {
      users: [borrower, liquidator],
      pool,
      bayc,
      nBAYC,
    } = testEnv;

    await waitForTx(
      await pool
        .connect(liquidator.signer)
        .startAuction(borrower.address, bayc.address, 0)
    );

    const {startTime, tickLength} = await pool.getAuctionData(nBAYC.address, 0);
    // price drops to 1 * floor price
    await setBlocktime(
      startTime.add(tickLength.mul(BigNumber.from(40))).toNumber()
    );

    await liquidateAndValidate(
      "BAYC",
      "WETH",
      "1000",
      liquidator,
      borrower,
      false
    );

    expect(await (await nBAYC.getAuctionData(0)).startTime).to.be.eq(0);
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
        .setUserUseERC721AsCollateral(bayc.address, [1, 2], true)
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
      deployer,
      configurator,
      // pool,
      bayc,
      // nBAYC,
      users: [borrower, liquidator],
    } = testEnv;

    await waitForTx(
      await configurator
        .connect(deployer.signer)
        .configureReserveAsAuctionCollateral(
          bayc.address,
          false,
          "1500000000000000000"
        )
    );

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
    await agg.updateLatestAnswer(parseEther("65").toString());
  });

  it("Liquidator liquidates the remaining ERC-721 (pays full debt) - gets NFT", async () => {
    const {
      deployer,
      configurator,
      bayc,
      users: [borrower, liquidator],
    } = testEnv;

    await waitForTx(
      await configurator
        .connect(deployer.signer)
        .configureReserveAsAuctionCollateral(
          bayc.address,
          false,
          "1500000000000000000"
        )
    );

    await liquidateAndValidate(
      "BAYC",
      "DAI",
      "80000",
      liquidator,
      borrower,
      false,
      2
    );
  });
});
