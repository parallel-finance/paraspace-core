import "./helpers/utils/wadraymath";
import {expect} from "chai";
import {BigNumber} from "ethers";
import {parseEther} from "ethers/lib/utils";
import {
  MAX_UINT_AMOUNT,
  oneEther,
  ZERO_ADDRESS,
} from "../deploy/helpers/constants";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {evmRevert, evmSnapshot, waitForTx} from "../deploy/helpers/misc-utils";
import {TestEnv} from "./helpers/make-suite";
import {VariableDebtToken__factory} from "../types";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {
  borrowAndValidate,
  changePriceAndValidate,
  isAssetInCollateral,
  supplyAndValidate,
} from "./helpers/validated-steps";

describe("Pool Liquidation: Edge cases", () => {
  let snap: string;
  let testEnv: TestEnv;

  beforeEach(async () => {
    snap = await evmSnapshot();
  });
  afterEach(async () => {
    await evmRevert(snap);
  });

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
  });

  it("Liquidation repay asset completely, asset should not be set as borrowed anymore", async () => {
    const {pool, users, dai, usdc, weth, oracle, addressesProvider} = testEnv;

    const depositor = users[0];
    const borrower = users[1];

    await waitForTx(await addressesProvider.setPriceOracle(oracle.address));

    // Deposit dai
    await dai
      .connect(depositor.signer)
      ["mint(uint256)"](
        await convertToCurrencyDecimals(dai.address, "1000000")
      );
    await dai.connect(depositor.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(depositor.signer)
      .supply(
        dai.address,
        await convertToCurrencyDecimals(dai.address, "10000"),
        depositor.address,
        0
      );

    // Deposit usdc
    await usdc
      .connect(depositor.signer)
      ["mint(uint256)"](await convertToCurrencyDecimals(usdc.address, "1000"));
    await usdc.connect(depositor.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(depositor.signer)
      .supply(
        usdc.address,
        await convertToCurrencyDecimals(usdc.address, "1000"),
        depositor.address,
        0
      );

    // Deposit eth, borrow dai
    await weth.connect(borrower.signer)["mint(uint256)"](parseEther("2"));
    await weth.connect(borrower.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(borrower.signer)
      .supply(weth.address, parseEther("2"), borrower.address, 0);

    // Borrow usdc
    await pool
      .connect(borrower.signer)
      .borrow(
        usdc.address,
        await convertToCurrencyDecimals(usdc.address, "1000"),
        0,
        borrower.address
      );

    // Borrow dai variable
    await pool
      .connect(borrower.signer)
      .borrow(
        dai.address,
        await convertToCurrencyDecimals(dai.address, "100"),
        0,
        borrower.address
      );

    // Increase usdc price to allow liquidation
    const usdcPrice = await oracle.getAssetPrice(usdc.address);
    await oracle.setAssetPrice(usdc.address, usdcPrice.mul(10));

    const daiData = await pool.getReserveData(dai.address);
    const variableDebtToken = VariableDebtToken__factory.connect(
      daiData.variableDebtTokenAddress,
      depositor.signer
    );

    expect(await variableDebtToken.balanceOf(borrower.address)).to.be.gt(0);

    const userConfigBefore = BigNumber.from(
      (await pool.getUserConfiguration(borrower.address)).data
    );

    expect(
      await pool
        .connect(depositor.signer)
        .liquidationCall(
          weth.address,
          dai.address,
          borrower.address,
          MAX_UINT_AMOUNT,
          false
        )
    );

    const userConfigAfter = BigNumber.from(
      (await pool.getUserConfiguration(borrower.address)).data
    );

    const isBorrowing = (conf, id) =>
      conf
        .div(BigNumber.from(2).pow(BigNumber.from(id).mul(2)))
        .and(1)
        .gt(0);

    expect(await variableDebtToken.balanceOf(borrower.address)).to.be.eq(0);

    expect(isBorrowing(userConfigBefore, daiData.id)).to.be.true;
    expect(isBorrowing(userConfigAfter, daiData.id)).to.be.false;
  });

  it("Liquidation with debt left will set liquidation asset as collateral", async () => {
    const {pool, users, bayc, dai, usdc, configurator} = testEnv;

    const depositor = users[0];
    const borrower = users[1];
    const liquidator = users[2];

    await changePriceAndValidate(dai, "1");
    await changePriceAndValidate(usdc, "1");
    await changePriceAndValidate(bayc, "100");

    // depositor deposit dai and usdc
    await dai
      .connect(depositor.signer)
      ["mint(uint256)"](
        await convertToCurrencyDecimals(dai.address, "1000000")
      );
    await dai.connect(depositor.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(depositor.signer)
      .supply(
        dai.address,
        await convertToCurrencyDecimals(dai.address, "100000"),
        depositor.address,
        0
      );

    await usdc
      .connect(depositor.signer)
      ["mint(uint256)"](
        await convertToCurrencyDecimals(usdc.address, "1000000")
      );
    await usdc.connect(depositor.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(depositor.signer)
      .supply(
        usdc.address,
        await convertToCurrencyDecimals(usdc.address, "100000"),
        depositor.address,
        0
      );
    expect(await isAssetInCollateral(depositor, dai.address)).to.be.true;
    expect(await isAssetInCollateral(depositor, usdc.address)).to.be.true;

    // borrower deposit 1 dai
    await dai
      .connect(borrower.signer)
      ["mint(uint256)"](await convertToCurrencyDecimals(dai.address, "1"));
    await dai.connect(borrower.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(borrower.signer)
      .supply(
        dai.address,
        await convertToCurrencyDecimals(dai.address, "1"),
        borrower.address,
        0
      );

    // after the initial supply from borrower dai will be set as collateral
    expect(await isAssetInCollateral(borrower, dai.address)).to.be.true;

    //then we supply bayc
    await supplyAndValidate(bayc, "1", borrower, true);

    // then borrow only 1 DAI and 10 usdc
    await borrowAndValidate(dai, "1", borrower);
    await borrowAndValidate(usdc, "10", borrower);

    // assert HF>1 and 721HF>1
    const healthFactorBefore = (await pool.getUserAccountData(borrower.address))
      .healthFactor;
    const erc721HealthFactorBefore = (
      await pool.getUserAccountData(borrower.address)
    ).erc721HealthFactor;
    console.log(healthFactorBefore);
    console.log(erc721HealthFactorBefore);
    expect(healthFactorBefore).to.be.gt(oneEther, "Invalid health factor");
    expect(erc721HealthFactorBefore).to.be.gt(
      oneEther,
      "Invalid health factor"
    );

    // then we set dai not as collateral since HF<1
    await pool
      .connect(borrower.signer)
      .setUserUseERC20AsCollateral(dai.address, false);
    expect(await isAssetInCollateral(borrower, dai.address)).to.be.false;

    //then we set bayc with lower price to make HF<1 and 721HF<1 ready for liquidate
    await changePriceAndValidate(bayc, "15");
    const healthFactorAfter = (await pool.getUserAccountData(borrower.address))
      .healthFactor;
    const erc721HealthFactorAfter = (
      await pool.getUserAccountData(borrower.address)
    ).erc721HealthFactor;
    console.log(healthFactorAfter);
    console.log(erc721HealthFactorAfter);
    expect(healthFactorAfter).to.be.lt(oneEther, "Invalid health factor");
    expect(erc721HealthFactorAfter).to.be.lt(oneEther, "Invalid health factor");

    // mint dai to liquidator and supply
    await dai
      .connect(liquidator.signer)
      ["mint(uint256)"](await convertToCurrencyDecimals(dai.address, "10000"));
    await dai.connect(liquidator.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(liquidator.signer)
      .supply(
        dai.address,
        await convertToCurrencyDecimals(dai.address, "1000"),
        borrower.address,
        0
      );

    // then we disable auction to make things simple
    await waitForTx(
      await configurator.setReserveAuctionStrategyAddress(
        bayc.address,
        ZERO_ADDRESS
      )
    );

    //then we liquidate bayc with dai and global debt partially repay
    await waitForTx(
      await pool
        .connect(liquidator.signer)
        .liquidationERC721(
          bayc.address,
          dai.address,
          borrower.address,
          0,
          await convertToCurrencyDecimals(dai.address, "20"),
          false
        )
    );
    expect(await isAssetInCollateral(borrower, dai.address)).to.be.true;
  });
});
