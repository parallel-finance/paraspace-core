import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {BigNumber} from "ethers";
import {ZERO_ADDRESS} from "../helpers/constants";
import {getAggregator, getParaSpaceOracle} from "../helpers/contracts-getters";
import {advanceTimeAndBlock, DRE, waitForTx} from "../helpers/misc-utils";
import {ProtocolErrors} from "../helpers/types";
import {testEnvFixture} from "./helpers/setup-env";
import {getUserData} from "./helpers/utils/helpers";
import {
  borrowAndValidate,
  changePriceAndValidate,
  liquidateAndValidate,
  liquidateAndValidateReverted,
  supplyAndValidate,
  switchCollateralAndValidate,
} from "./helpers/validated-steps";
import {parseEther} from "ethers/lib/utils";

describe("ERC-721 Liquidation", () => {
  const fixture = async () => {
    const testEnv = await loadFixture(testEnvFixture);
    const {
      users: [borrower, liquidator],
      bayc,
      dai,
      weth,
      configurator,
    } = testEnv;

    // assure asset prices for correct health factor calculations
    await changePriceAndValidate(bayc, "101");

    const daiAgg = await getAggregator(undefined, "DAI");
    await daiAgg.updateLatestAnswer("908578801039414");

    // Borrower deposits BAYC
    await supplyAndValidate(bayc, "1", borrower, true);

    // Liquidator deposits 100k DAI and 100 wETH
    await supplyAndValidate(weth, "100", liquidator, true, "1000");
    await supplyAndValidate(dai, "100000", liquidator, true, "200000");

    // disable auction to test original liquidation
    await waitForTx(
      await configurator.setReserveAuctionStrategyAddress(
        bayc.address,
        ZERO_ADDRESS
      )
    );

    return testEnv;
  };

  it("TC-erc721-liquidation-01 Liquidator tries to liquidate a healthy position (HF & ERC721_HF ~ 1.0 - 1.1) (revert expected)", async () => {
    const {
      users: [borrower, liquidator],
      dai,
      bayc,
      weth,
    } = await loadFixture(fixture);
    // borrow 10k DAI
    await borrowAndValidate(dai, "10000", borrower);

    // drop BAYC price to near liquidation limit (HF ~ 1.0 - 1.1)
    await changePriceAndValidate(bayc, "13"); // HF = 1.00156

    await liquidateAndValidateReverted(
      bayc,
      weth,
      "100",
      liquidator,
      borrower,
      false,
      ProtocolErrors.ERC721_HEALTH_FACTOR_NOT_BELOW_THRESHOLD
    );
  });

  it("TC-erc721-liquidation-02 Liquidator attempts to liquidate ERC-721 when HF < 1, ERC721 HF  > 1 (should be reverted)", async () => {
    const {
      users: [borrower, liquidator],
      dai,
      bayc,
      weth,
    } = await loadFixture(fixture);
    // supply 10k DAI
    await supplyAndValidate(dai, "10000", borrower, true);
    // borrow 19k DAI
    await borrowAndValidate(dai, "19000", borrower);

    // drop BAYC price to near liquidation limit (HF ~ 1.0 - 1.1)
    await changePriceAndValidate(bayc, "13");
    // HF: 0.948142276914844611
    // ERC-721 HF: 1.056927044691003946

    await liquidateAndValidateReverted(
      bayc,
      weth,
      "100",
      liquidator,
      borrower,
      false,
      ProtocolErrors.ERC721_HEALTH_FACTOR_NOT_BELOW_THRESHOLD
    );
  });

  it("TC-erc721-liquidation-03 Liquidator liquidates NFT - with full debt in non-wETH currency", async () => {
    const {
      users: [borrower, liquidator],
      dai,
      bayc,
      weth,
    } = await loadFixture(fixture);
    // borrow 10k DAI
    await borrowAndValidate(dai, "10000", borrower);

    // drop BAYC price to liquidation range
    await changePriceAndValidate(bayc, "10");

    // liquidate the NFT
    await liquidateAndValidate(
      bayc,
      weth,
      "50000",
      liquidator,
      borrower,
      false
    );
  });

  it("TC-erc721-liquidation-04 Liquidator liquidates NFT - with full global debt in WETH", async () => {
    const {
      users: [borrower, liquidator],
      bayc,
      weth,
    } = await loadFixture(fixture);
    // borrow 10 WETH
    await borrowAndValidate(weth, "10", borrower);

    // drop BAYC price to liquidation range
    await changePriceAndValidate(bayc, "10");

    // liquidate the NFT
    await liquidateAndValidate(
      bayc,
      weth,
      "50000",
      liquidator,
      borrower,
      false
    );
  });

  it("TC-erc721-liquidation-05 Liquidator liquidates NFT - with partial debt in WETH", async () => {
    const {
      users: [borrower, liquidator],
      dai,
      bayc,
      weth,
    } = await loadFixture(fixture);
    // borrow 5 WETH
    await borrowAndValidate(weth, "5", borrower);
    // borrow 5k DAI
    await borrowAndValidate(dai, "5000", borrower);

    // drop BAYC price to liquidation range
    await changePriceAndValidate(bayc, "10");

    // liquidate the NFT
    await liquidateAndValidate(
      bayc,
      weth,
      "50000",
      liquidator,
      borrower,
      false
    );
  });

  it("TC-erc721-liquidation-06 Liquidator liquidates NFT - gets nToken", async () => {
    const {
      users: [borrower, liquidator],
      dai,
      bayc,
      weth,
    } = await loadFixture(fixture);
    // borrow 10k DAI
    await borrowAndValidate(dai, "10000", borrower);

    // drop BAYC price to liquidation range
    const baycPrice = "10";
    await changePriceAndValidate(bayc, baycPrice);

    // try to liquidate with DAI
    await liquidateAndValidate(bayc, weth, "50000", liquidator, borrower, true);
  });

  it("TC-erc721-liquidation-08 Liquidator liquidates ERC-721 - with a protocol fee of 10%", async () => {
    const {
      configurator,
      weth,
      users: [borrower, liquidator],
      dai,
      pWETH,
      protocolDataProvider,
      bayc,
    } = await loadFixture(fixture);

    const baycLiquidationProtocolFeeInput = 1000;
    // set BAYC liquidation fee
    await configurator.setLiquidationProtocolFee(
      bayc.address,
      baycLiquidationProtocolFeeInput
    );

    // borrow 10k DAI
    await borrowAndValidate(dai, "10000", borrower);

    // drop BAYC price to liquidation range
    const baycPrice = "10";
    await changePriceAndValidate(bayc, baycPrice);

    const treasuryAddress = await pWETH.RESERVE_TREASURY_ADDRESS();
    const treasuryDataBefore = await protocolDataProvider.getUserReserveData(
      weth.address,
      treasuryAddress
    );
    const treasuryBalanceBefore = treasuryDataBefore.currentXTokenBalance;

    await liquidateAndValidate(bayc, weth, "5000", liquidator, borrower, false);

    const treasuryDataAfter = await protocolDataProvider.getUserReserveData(
      dai.address,
      treasuryAddress
    );
    const treasuryBalanceAfter = treasuryDataAfter.currentXTokenBalance;

    const liquidationAmount = parseEther("10"); // bayc price
    const feeAmount = liquidationAmount.percentMul(
      baycLiquidationProtocolFeeInput
    );

    // 10% went to treasury
    expect(treasuryBalanceAfter).to.be.closeTo(
      treasuryBalanceBefore.add(feeAmount),
      feeAmount
    );
  });

  it("TC-erc721-liquidation-09 If supplied WETH is not in collateral, after liquidation it should be collateralize", async () => {
    const {
      users: [borrower, liquidator],
      pool,
      bayc,
      weth,
      dai,
      protocolDataProvider,
    } = await loadFixture(fixture);

    await supplyAndValidate(weth, "1", borrower, true);
    await switchCollateralAndValidate(borrower, weth, false);
    await borrowAndValidate(dai, "20000", borrower);
    // reduce BAYC price to liquidation levels
    await changePriceAndValidate(bayc, "2");
    await pool
      .connect(liquidator.signer)
      .liquidateERC721(
        bayc.address,
        borrower.address,
        0,
        parseEther("2").toString(),
        false,
        {gasLimit: 5000000}
      );

    const liquidatedWeth = DRE.ethers.utils
      .parseUnits("2", 20)
      .div(105)
      .add(DRE.ethers.utils.parseUnits("1", 18));

    const borrowerCollateralWeth =
      await protocolDataProvider.getUserReserveData(
        weth.address,
        borrower.address
      );

    const borrowerWethAfter = borrowerCollateralWeth.currentXTokenBalance;
    expect(borrowerWethAfter).to.be.closeTo(liquidatedWeth, 1);
    expect(await weth.balanceOf(borrower.address)).to.be.equal(0);
  });

  context("Auction-based using ETH", () => {
    it("TC-erc721-liquidation-07 Liquidator liquidates ERC-721 using ETH", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
        nBAYC,
        dai,
        weth,
        protocolDataProvider,
      } = await loadFixture(testEnvFixture);

      // assure asset prices for correct health factor calculations
      await changePriceAndValidate(bayc, "101");

      const daiAgg = await getAggregator(undefined, "DAI");
      await daiAgg.updateLatestAnswer("908578801039414");

      // Borrower deposits BAYC
      await supplyAndValidate(bayc, "1", borrower, true);

      // Liquidator deposits 100k DAI and 100 wETH
      await supplyAndValidate(weth, "100", liquidator, true, "1000");
      await supplyAndValidate(dai, "100000", liquidator, true, "200000");

      // 10k DAI ~= 9 ETH
      await borrowAndValidate(dai, "10000", borrower);

      // drop BAYC price to liquidation levels (HF = 0.6)
      await changePriceAndValidate(bayc, "8");

      // start auction
      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .startAuction(borrower.address, bayc.address, 0)
      );
      const {startTime, tickLength} = await pool.getAuctionData(
        nBAYC.address,
        0
      );
      await advanceTimeAndBlock(
        startTime.add(tickLength.mul(BigNumber.from(40))).toNumber()
      );
      const liquidatorBalanceBefore = await pool.provider.getBalance(
        liquidator.address
      );
      const auctionDataAfter = await pool.getAuctionData(nBAYC.address, 0);
      const actualPriceMultiplier = auctionDataAfter.currentPriceMultiplier.lte(
        auctionDataAfter.minPriceMultiplier
      )
        ? auctionDataAfter.minPriceMultiplier
        : auctionDataAfter.currentPriceMultiplier;
      let baycPrice = await (await getParaSpaceOracle())
        .connect(borrower.address)
        .getAssetPrice(bayc.address);
      baycPrice = baycPrice
        .wadMul(actualPriceMultiplier)
        .wadDiv(DRE.ethers.utils.parseUnits("1", 18));
      // liquidate the NFT
      const actualLiquidationAmount = baycPrice;
      const liquidationAmount = parseEther("10").toString();
      const tx = pool
        .connect(liquidator.signer)
        .liquidateERC721(
          bayc.address,
          borrower.address,
          0,
          liquidationAmount,
          false,
          {
            gasLimit: 5000000,
            value: liquidationAmount,
          }
        );

      const txReceipt = await (await tx).wait();
      const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

      const liquidatorBalanceAfter = await pool.provider.getBalance(
        liquidator.address
      );
      const borrowerWethReserveDataAfter = await getUserData(
        pool,
        protocolDataProvider,
        weth.address,
        borrower.address
      );
      //assert nbayc fully swap to pweth
      expect(borrowerWethReserveDataAfter.currentPTokenBalance).to.be.eq(
        baycPrice
      );
      expect(liquidatorBalanceAfter).to.be.eq(
        liquidatorBalanceBefore.sub(actualLiquidationAmount).sub(gasUsed)
      );
    });
  });
});
