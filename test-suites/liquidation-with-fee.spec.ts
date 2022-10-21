import {increaseTime, waitForTx} from "../deploy/helpers/misc-utils";
import {MAX_UINT_AMOUNT, oneEther} from "../deploy/helpers/constants";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {ProtocolErrors} from "../deploy/helpers/types";
import {calcExpectedVariableDebtTokenBalance} from "./helpers/utils/calculations";
import {getReserveData, getUserData} from "./helpers/utils/helpers";
import {TestEnv} from "./helpers/make-suite";
import {HardhatRuntimeEnvironment} from "hardhat/types";
import {expect} from "chai";
import {BigNumber} from "ethers";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";

declare let hre: HardhatRuntimeEnvironment;

describe("Pool Liquidation: Add fee to liquidations", () => {
  let testEnv: TestEnv;
  const {INVALID_HF} = ProtocolErrors;

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {addressesProvider, oracle} = testEnv;

    await waitForTx(await addressesProvider.setPriceOracle(oracle.address));
  });

  after(async () => {
    const {paraspaceOracle, addressesProvider} = testEnv;
    await waitForTx(
      await addressesProvider.setPriceOracle(paraspaceOracle.address)
    );
  });

  it("Sets the WETH protocol liquidation fee to 1000 (10.00%)", async () => {
    const {configurator, weth, dai, protocolDataProvider} = testEnv;

    const oldWethLiquidationProtocolFee =
      await protocolDataProvider.getLiquidationProtocolFee(weth.address);
    const oldDAILiquidationProtocolFee =
      await protocolDataProvider.getLiquidationProtocolFee(dai.address);

    const wethLiquidationProtocolFeeInput = 1000;
    const daiLiquidationProtocolFeeInput = 500;

    expect(
      await configurator.setLiquidationProtocolFee(
        weth.address,
        wethLiquidationProtocolFeeInput
      )
    )
      .to.emit(configurator, "LiquidationProtocolFeeChanged")
      .withArgs(
        weth.address,
        oldWethLiquidationProtocolFee,
        wethLiquidationProtocolFeeInput
      );
    expect(
      await configurator.setLiquidationProtocolFee(
        dai.address,
        daiLiquidationProtocolFeeInput
      )
    )
      .to.emit(configurator, "LiquidationProtocolFeeChanged")
      .withArgs(
        dai.address,
        oldDAILiquidationProtocolFee,
        daiLiquidationProtocolFeeInput
      );

    const wethLiquidationProtocolFee =
      await protocolDataProvider.getLiquidationProtocolFee(weth.address);
    const daiLiquidationProtocolFee =
      await protocolDataProvider.getLiquidationProtocolFee(dai.address);

    expect(wethLiquidationProtocolFee).to.be.equal(
      wethLiquidationProtocolFeeInput
    );
    expect(daiLiquidationProtocolFee).to.be.equal(
      daiLiquidationProtocolFeeInput
    );
  });

  it("Deposits WETH, borrows DAI", async () => {
    const {
      dai,
      weth,
      users: [depositor, borrower],
      pool,
      oracle,
    } = testEnv;

    //mints DAI to depositor
    await dai
      .connect(depositor.signer)
      ["mint(uint256)"](await convertToCurrencyDecimals(dai.address, "1000"));

    //approve protocol to access depositor wallet
    await dai.connect(depositor.signer).approve(pool.address, MAX_UINT_AMOUNT);

    //user 1 deposits 1000 DAI
    const amountDAItoDeposit = await convertToCurrencyDecimals(
      dai.address,
      "1000"
    );

    await pool
      .connect(depositor.signer)
      .supply(dai.address, amountDAItoDeposit, depositor.address, "0");
    //user 2 deposits 1 ETH
    const amountETHtoDeposit = await convertToCurrencyDecimals(
      weth.address,
      "0.06775"
    );

    //mints WETH to borrower
    await weth
      .connect(borrower.signer)
      ["mint(uint256)"](await convertToCurrencyDecimals(weth.address, "1000"));

    //approve protocol to access the borrower wallet
    await weth.connect(borrower.signer).approve(pool.address, MAX_UINT_AMOUNT);

    await pool
      .connect(borrower.signer)
      .supply(weth.address, amountETHtoDeposit, borrower.address, "0");

    //user 2 borrows

    const userGlobalData = await pool.getUserAccountData(borrower.address);
    const daiPrice = await oracle.getAssetPrice(dai.address);

    const amountDAIToBorrow = await convertToCurrencyDecimals(
      dai.address,
      userGlobalData.availableBorrowsBase
        .div(daiPrice)
        .percentMul(9500)
        .toString()
    );

    await pool
      .connect(borrower.signer)
      .borrow(dai.address, amountDAIToBorrow, "0", borrower.address);

    const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

    expect(userGlobalDataAfter.currentLiquidationThreshold).to.be.equal(
      8500,
      INVALID_HF
    );
  });

  it("Drop the health factor below 1", async () => {
    const {
      dai,
      users: [, borrower],
      pool,
      oracle,
    } = testEnv;

    const daiPrice = await oracle.getAssetPrice(dai.address);

    await oracle.setAssetPrice(dai.address, daiPrice.percentMul(11800));

    const userGlobalData = await pool.getUserAccountData(borrower.address);

    expect(userGlobalData.healthFactor).to.be.lt(oneEther, INVALID_HF);
  });

  it("Liquidates the borrow", async () => {
    const {
      dai,
      weth,
      pWETH,
      users: [, borrower, , liquidator],
      pool,
      oracle,
      protocolDataProvider,
    } = testEnv;

    //mints dai to the liquidator
    await dai
      .connect(liquidator.signer)
      ["mint(uint256)"](await convertToCurrencyDecimals(dai.address, "1000"));

    //approve protocol to access the liquidator wallet
    await dai.connect(liquidator.signer).approve(pool.address, MAX_UINT_AMOUNT);

    const daiReserveDataBefore = await getReserveData(
      protocolDataProvider,
      dai.address
    );
    const ethReserveDataBefore = await getReserveData(
      protocolDataProvider,
      weth.address
    );

    const liquidatorBalanceBefore = await weth.balanceOf(liquidator.address);

    const treasuryAddress = await pWETH.RESERVE_TREASURY_ADDRESS();
    const treasuryDataBefore = await protocolDataProvider.getUserReserveData(
      weth.address,
      treasuryAddress
    );
    const treasuryBalanceBefore = treasuryDataBefore.currentXTokenBalance;

    const userReserveDataBefore = await getUserData(
      pool,
      protocolDataProvider,
      dai.address,
      borrower.address
    );

    const amountToLiquidate = userReserveDataBefore.currentVariableDebt.div(2);

    const wethLiquidationProtocolFee =
      await protocolDataProvider.getLiquidationProtocolFee(weth.address);

    await increaseTime(100);

    const tx = await pool
      .connect(liquidator.signer)
      .liquidationCall(
        weth.address,
        dai.address,
        borrower.address,
        amountToLiquidate,
        false
      );

    const userReserveDataAfter = await getUserData(
      pool,
      protocolDataProvider,
      dai.address,
      borrower.address
    );

    const daiReserveDataAfter = await getReserveData(
      protocolDataProvider,
      dai.address
    );
    const ethReserveDataAfter = await getReserveData(
      protocolDataProvider,
      weth.address
    );

    const liquidatorBalanceAfter = await weth.balanceOf(liquidator.address);

    const treasuryDataAfter = await protocolDataProvider.getUserReserveData(
      weth.address,
      treasuryAddress
    );
    const treasuryBalanceAfter = treasuryDataAfter.currentXTokenBalance;

    const collateralPrice = await oracle.getAssetPrice(weth.address);
    const principalPrice = await oracle.getAssetPrice(dai.address);

    const collateralDecimals = (
      await protocolDataProvider.getReserveConfigurationData(weth.address)
    ).decimals;
    const principalDecimals = (
      await protocolDataProvider.getReserveConfigurationData(dai.address)
    ).decimals;

    const baseCollateral = principalPrice
      .mul(amountToLiquidate)
      .mul(BigNumber.from(10).pow(collateralDecimals))
      .div(collateralPrice.mul(BigNumber.from(10).pow(principalDecimals)));

    const bonusCollateral = baseCollateral
      .percentMul(10500)
      .sub(baseCollateral);
    const totalCollateralLiquidated = baseCollateral.add(bonusCollateral);
    const liquidationProtocolFees = bonusCollateral.percentMul(
      wethLiquidationProtocolFee
    );
    const expectedLiquidationReward = totalCollateralLiquidated.sub(
      liquidationProtocolFees
    );

    if (!tx.blockNumber) {
      expect(false, "Invalid block number");
      return;
    }
    const txTimestamp = BigNumber.from(
      (await hre.ethers.provider.getBlock(tx.blockNumber)).timestamp
    );

    const variableDebtBeforeTx = calcExpectedVariableDebtTokenBalance(
      daiReserveDataBefore,
      userReserveDataBefore,
      txTimestamp
    );

    expect(userReserveDataAfter.currentVariableDebt).to.be.closeTo(
      variableDebtBeforeTx.sub(amountToLiquidate),
      2,
      "Invalid user debt after liquidation"
    );

    //the liquidity index of the principal reserve needs to be bigger than the index before
    expect(daiReserveDataAfter.liquidityIndex).to.be.gte(
      daiReserveDataBefore.liquidityIndex,
      "Invalid liquidity index"
    );

    //the principal APY after a liquidation needs to be lower than the APY before
    expect(daiReserveDataAfter.liquidityRate).to.be.lt(
      daiReserveDataBefore.liquidityRate,
      "Invalid liquidity APY"
    );

    expect(daiReserveDataAfter.availableLiquidity).to.be.closeTo(
      daiReserveDataBefore.availableLiquidity.add(amountToLiquidate),
      2,
      "Invalid principal available liquidity"
    );

    expect(ethReserveDataAfter.availableLiquidity).to.be.closeTo(
      ethReserveDataBefore.availableLiquidity.sub(expectedLiquidationReward),
      2,
      "Invalid collateral available liquidity"
    );

    expect(treasuryBalanceAfter).to.be.closeTo(
      treasuryBalanceBefore.add(liquidationProtocolFees),
      2,
      "Invalid treasury increase"
    );

    expect(liquidatorBalanceAfter).to.be.closeTo(
      liquidatorBalanceBefore.add(expectedLiquidationReward),
      2,
      "Invalid liquidator balance"
    );
  });

  it("User 3 deposits 1000 USDC, user 4 0.06775 WETH, user 4 borrows - drops HF, liquidates the borrow", async () => {
    const {
      usdc,
      users: [, , , depositor, borrower, liquidator],
      pool,
      oracle,
      weth,
      pWETH,
      protocolDataProvider,
    } = testEnv;

    //mints USDC to depositor
    await usdc
      .connect(depositor.signer)
      ["mint(uint256)"](await convertToCurrencyDecimals(usdc.address, "1000"));

    //approve protocol to access depositor wallet
    await usdc.connect(depositor.signer).approve(pool.address, MAX_UINT_AMOUNT);

    //depositor deposits 1000 USDC
    const amountUSDCtoDeposit = await convertToCurrencyDecimals(
      usdc.address,
      "1000"
    );

    await pool
      .connect(depositor.signer)
      .supply(usdc.address, amountUSDCtoDeposit, depositor.address, "0");

    //borrower deposits 1 ETH
    const amountETHtoDeposit = await convertToCurrencyDecimals(
      weth.address,
      "0.06775"
    );

    //mints WETH to borrower
    await weth
      .connect(borrower.signer)
      ["mint(uint256)"](await convertToCurrencyDecimals(weth.address, "1000"));

    //approve protocol to access the borrower wallet
    await weth.connect(borrower.signer).approve(pool.address, MAX_UINT_AMOUNT);

    await pool
      .connect(borrower.signer)
      .supply(weth.address, amountETHtoDeposit, borrower.address, "0");

    //borrower borrows
    const userGlobalData = await pool.getUserAccountData(borrower.address);

    const usdcPrice = await oracle.getAssetPrice(usdc.address);

    const amountUSDCToBorrow = await convertToCurrencyDecimals(
      usdc.address,
      userGlobalData.availableBorrowsBase
        .div(usdcPrice)
        .percentMul(9502)
        .toString()
    );

    await pool
      .connect(borrower.signer)
      .borrow(usdc.address, amountUSDCToBorrow, "0", borrower.address);

    //drops HF below 1
    await oracle.setAssetPrice(usdc.address, usdcPrice.percentMul(11200));

    //mints usdc to the liquidator
    await usdc
      .connect(liquidator.signer)
      ["mint(uint256)"](await convertToCurrencyDecimals(usdc.address, "1000"));

    //approve protocol to access liquidator wallet
    await usdc
      .connect(liquidator.signer)
      .approve(pool.address, MAX_UINT_AMOUNT);

    const userReserveDataBefore = await protocolDataProvider.getUserReserveData(
      usdc.address,
      borrower.address
    );

    const usdcReserveDataBefore = await getReserveData(
      protocolDataProvider,
      usdc.address
    );
    const ethReserveDataBefore = await getReserveData(
      protocolDataProvider,
      weth.address
    );

    const liquidatorBalanceBefore = await weth.balanceOf(liquidator.address);

    const treasuryAddress = await pWETH.RESERVE_TREASURY_ADDRESS();
    const treasuryDataBefore = await protocolDataProvider.getUserReserveData(
      weth.address,
      treasuryAddress
    );
    const treasuryBalanceBefore = treasuryDataBefore.currentXTokenBalance;

    const amountToLiquidate = userReserveDataBefore.currentVariableDebt.div(2);

    const wethLiquidationProtocolFee =
      await protocolDataProvider.getLiquidationProtocolFee(weth.address);

    await pool
      .connect(liquidator.signer)
      .liquidationCall(
        weth.address,
        usdc.address,
        borrower.address,
        amountToLiquidate,
        false
      );

    const userReserveDataAfter = await protocolDataProvider.getUserReserveData(
      usdc.address,
      borrower.address
    );

    const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

    const usdcReserveDataAfter = await getReserveData(
      protocolDataProvider,
      usdc.address
    );
    const ethReserveDataAfter = await getReserveData(
      protocolDataProvider,
      weth.address
    );

    const liquidatorBalanceAfter = await weth.balanceOf(liquidator.address);
    const treasuryDataAfter = await protocolDataProvider.getUserReserveData(
      weth.address,
      treasuryAddress
    );
    const treasuryBalanceAfter = treasuryDataAfter.currentXTokenBalance;

    const collateralPrice = await oracle.getAssetPrice(weth.address);
    const principalPrice = await oracle.getAssetPrice(usdc.address);

    const collateralDecimals = (
      await protocolDataProvider.getReserveConfigurationData(weth.address)
    ).decimals;
    const principalDecimals = (
      await protocolDataProvider.getReserveConfigurationData(usdc.address)
    ).decimals;

    const baseCollateral = principalPrice
      .mul(amountToLiquidate)
      .mul(BigNumber.from(10).pow(collateralDecimals))
      .div(collateralPrice.mul(BigNumber.from(10).pow(principalDecimals)));

    const bonusCollateral = baseCollateral
      .percentMul(10500)
      .sub(baseCollateral);
    const totalCollateralLiquidated = baseCollateral.add(bonusCollateral);
    const liquidationProtocolFees = bonusCollateral.percentMul(
      wethLiquidationProtocolFee
    );
    const expectedLiquidationReward = totalCollateralLiquidated.sub(
      liquidationProtocolFees
    );

    expect(userGlobalDataAfter.healthFactor).to.be.gt(
      oneEther,
      "Invalid health factor"
    );

    expect(userReserveDataAfter.currentVariableDebt).to.be.closeTo(
      userReserveDataBefore.currentVariableDebt.sub(amountToLiquidate),
      2,
      "Invalid user borrow balance after liquidation"
    );

    //the liquidity index of the principal reserve needs to be bigger than the index before
    expect(usdcReserveDataAfter.liquidityIndex).to.be.gte(
      usdcReserveDataBefore.liquidityIndex,
      "Invalid liquidity index"
    );

    //the principal APY after a liquidation needs to be lower than the APY before
    expect(usdcReserveDataAfter.liquidityRate).to.be.lt(
      usdcReserveDataBefore.liquidityRate,
      "Invalid liquidity APY"
    );

    expect(usdcReserveDataAfter.availableLiquidity).to.be.closeTo(
      usdcReserveDataBefore.availableLiquidity.add(amountToLiquidate),
      2,
      "Invalid principal available liquidity"
    );

    expect(ethReserveDataAfter.availableLiquidity).to.be.closeTo(
      ethReserveDataBefore.availableLiquidity.sub(expectedLiquidationReward),
      2,
      "Invalid collateral available liquidity"
    );

    expect(treasuryBalanceAfter).to.be.closeTo(
      treasuryBalanceBefore.add(liquidationProtocolFees),
      2,
      "Invalid treasury increase"
    );

    expect(liquidatorBalanceAfter).to.be.closeTo(
      liquidatorBalanceBefore.add(expectedLiquidationReward),
      2,
      "Invalid liquidator balance"
    );
  });

  // it("User 4 deposits 0.03 DAI - drops HF, liquidates the DAI, which results on a lower amount being liquidated", async () => {
  //   const snap = await evmSnapshot();
  //   const {
  //     dai,
  //     usdc,
  //     users: [, , , , borrower, liquidator],
  //     pool,
  //     oracle,
  //     protocolDataProvider,
  //   } = testEnv;

  //   //mints DAI to borrower
  //   await dai
  //     .connect(borrower.signer)
  //     ["mint(uint256)"](await convertToCurrencyDecimals(dai.address, "0.03"));

  //   //approve protocol to access the borrower wallet
  //   await dai.connect(borrower.signer).approve(pool.address, MAX_UINT_AMOUNT);

  //   //borrower deposits DAI
  //   const amountToDeposit = await convertToCurrencyDecimals(
  //     dai.address,
  //     "0.03"
  //   );

  //   await pool
  //     .connect(borrower.signer)
  //     .supply(dai.address, amountToDeposit, borrower.address, "0");
  //   const usdcPrice = await oracle.getAssetPrice(usdc.address);

  //   //drops HF below 1
  //   await oracle.setAssetPrice(usdc.address, usdcPrice.percentMul(11400));

  //   //mints usdc to the liquidator
  //   await usdc
  //     .connect(liquidator.signer)
  //     ["mint(uint256)"](await convertToCurrencyDecimals(usdc.address, "1000"));

  //   //approve protocol to access liquidator wallet
  //   await usdc
  //     .connect(liquidator.signer)
  //     .approve(pool.address, MAX_UINT_AMOUNT);

  //   const userReserveDataBefore = await protocolDataProvider.getUserReserveData(
  //     usdc.address,
  //     borrower.address
  //   );

  //   const usdcReserveDataBefore = await getReserveData(
  //     protocolDataProvider,
  //     usdc.address
  //   );
  //   const daiReserveDataBefore = await getReserveData(
  //     protocolDataProvider,
  //     dai.address
  //   );

  //   const amountToLiquidate = userReserveDataBefore.currentVariableDebt.div(2);

  //   const collateralPrice = await oracle.getAssetPrice(dai.address);
  //   const principalPrice = await oracle.getAssetPrice(usdc.address);

  //   const daiTokenAddresses = await protocolDataProvider.getReserveTokensAddresses(
  //     dai.address
  //   );
  //   const pDAITokenAddress = await daiTokenAddresses.xTokenAddress;
  //   const pDAITokenContract = await PToken__factory.connect(
  //     pDAITokenAddress,
  //     hre.ethers.provider
  //   );
  //   const pDAITokenBalanceBefore = await pDAITokenContract.balanceOf(
  //     liquidator.address
  //   );
  //   const borrowerPTokenBalance = await pDAITokenContract.balanceOf(
  //     borrower.address
  //   );

  //   const treasuryAddress = await pDAITokenContract.RESERVE_TREASURY_ADDRESS();
  //   const treasuryDataBefore = await protocolDataProvider.getUserReserveData(
  //     dai.address,
  //     treasuryAddress
  //   );
  //   const treasuryBalanceBefore = treasuryDataBefore.currentPTokenBalance;

  //   await pool
  //     .connect(liquidator.signer)
  //     .liquidationCall(
  //       dai.address,
  //       usdc.address,
  //       borrower.address,
  //       amountToLiquidate,
  //       true
  //     );

  //   const userReserveDataAfter = await protocolDataProvider.getUserReserveData(
  //     usdc.address,
  //     borrower.address
  //   );

  //   const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

  //   const usdcReserveDataAfter = await getReserveData(
  //     protocolDataProvider,
  //     usdc.address
  //   );
  //   const daiReserveDataAfter = await getReserveData(
  //     protocolDataProvider,
  //     dai.address
  //   );

  //   const daiConfiguration = await protocolDataProvider.getReserveConfigurationData(
  //     dai.address
  //   );
  //   const collateralDecimals = daiConfiguration.decimals;
  //   const liquidationBonus = daiConfiguration.liquidationBonus;

  //   const principalDecimals = (
  //     await protocolDataProvider.getReserveConfigurationData(usdc.address)
  //   ).decimals;

  //   const expectedCollateralLiquidated = oneEther.mul(30).div(1000);

  //   const daiLiquidationProtocolFee =
  //     await protocolDataProvider.getLiquidationProtocolFee(dai.address);

  //   const expectedPrincipal = collateralPrice
  //     .mul(expectedCollateralLiquidated)
  //     .mul(BigNumber.from(10).pow(principalDecimals))
  //     .div(principalPrice.mul(BigNumber.from(10).pow(collateralDecimals)))
  //     .percentDiv(liquidationBonus);

  //   const bonusCollateral = borrowerPTokenBalance.sub(
  //     borrowerPTokenBalance.percentDiv(liquidationBonus)
  //   );
  //   const liquidationProtocolFee = bonusCollateral.percentMul(
  //     daiLiquidationProtocolFee
  //   );
  //   const expectedLiquidationReward = borrowerPTokenBalance.sub(
  //     liquidationProtocolFee
  //   );

  //   const pDAITokenBalanceAfter = await pDAITokenContract.balanceOf(
  //     liquidator.address
  //   );

  //   const treasuryDataAfter = await protocolDataProvider.getUserReserveData(
  //     dai.address,
  //     treasuryAddress
  //   );
  //   const treasuryBalanceAfter = treasuryDataAfter.currentPTokenBalance;

  //   expect(userGlobalDataAfter.healthFactor).to.be.gt(
  //     oneEther,
  //     "Invalid health factor"
  //   );

  //   expect(userReserveDataAfter.currentVariableDebt).to.be.closeTo(
  //     userReserveDataBefore.currentVariableDebt.sub(expectedPrincipal),
  //     2,
  //     "Invalid user borrow balance after liquidation"
  //   );

  //   expect(usdcReserveDataAfter.availableLiquidity).to.be.closeTo(
  //     usdcReserveDataBefore.availableLiquidity.add(expectedPrincipal),
  //     2,
  //     "Invalid principal available liquidity"
  //   );

  //   expect(daiReserveDataAfter.availableLiquidity).to.be.closeTo(
  //     daiReserveDataBefore.availableLiquidity,
  //     2,
  //     "Invalid collateral available liquidity"
  //   );

  //   expect(pDAITokenBalanceBefore).to.be.equal(
  //     pDAITokenBalanceAfter.sub(expectedLiquidationReward),
  //     "Liquidator xToken balance incorrect"
  //   );

  //   expect(treasuryBalanceBefore).to.be.equal(
  //     treasuryBalanceAfter.sub(liquidationProtocolFee),
  //     "Treasury xToken balance incorrect"
  //   );

  //   await evmRevert(snap);
  // });

  // it("Set liquidationProtocolFee to 0. User 4 deposits 0.03 DAI - drops HF, liquidates the DAI, which results on a lower amount being liquidated", async () => {
  //   const {
  //     dai,
  //     usdc,
  //     users: [, , , , borrower, liquidator],
  //     pool,
  //     oracle,
  //     protocolDataProvider,
  //     configurator,
  //   } = testEnv;

  //   const oldDAILiquidationProtocolFee =
  //     await protocolDataProvider.getLiquidationProtocolFee(dai.address);

  //   expect(await configurator.setLiquidationProtocolFee(dai.address, 0))
  //     .to.emit(configurator, "LiquidationProtocolFeeChanged")
  //     .withArgs(dai.address, oldDAILiquidationProtocolFee, 0);

  //   //mints DAI to borrower
  //   await dai
  //     .connect(borrower.signer)
  //     ["mint(uint256)"](await convertToCurrencyDecimals(dai.address, "0.03"));

  //   //approve protocol to access the borrower wallet
  //   await dai.connect(borrower.signer).approve(pool.address, MAX_UINT_AMOUNT);

  //   //borrower deposits DAI
  //   const amountToDeposit = await convertToCurrencyDecimals(
  //     dai.address,
  //     "0.03"
  //   );

  //   await pool
  //     .connect(borrower.signer)
  //     .supply(dai.address, amountToDeposit, borrower.address, "0");
  //   const usdcPrice = await oracle.getAssetPrice(usdc.address);

  //   //drops HF below 1
  //   await oracle.setAssetPrice(usdc.address, usdcPrice.percentMul(11400));

  //   //mints usdc to the liquidator
  //   await usdc
  //     .connect(liquidator.signer)
  //     ["mint(uint256)"](await convertToCurrencyDecimals(usdc.address, "1000"));

  //   //approve protocol to access liquidator wallet
  //   await usdc
  //     .connect(liquidator.signer)
  //     .approve(pool.address, MAX_UINT_AMOUNT);

  //   const userReserveDataBefore = await protocolDataProvider.getUserReserveData(
  //     usdc.address,
  //     borrower.address
  //   );

  //   const usdcReserveDataBefore = await getReserveData(
  //     protocolDataProvider,
  //     usdc.address
  //   );
  //   const daiReserveDataBefore = await getReserveData(
  //     protocolDataProvider,
  //     dai.address
  //   );

  //   const amountToLiquidate = userReserveDataBefore.currentVariableDebt.div(2);

  //   const collateralPrice = await oracle.getAssetPrice(dai.address);
  //   const principalPrice = await oracle.getAssetPrice(usdc.address);

  //   const daiTokenAddresses = await protocolDataProvider.getReserveTokensAddresses(
  //     dai.address
  //   );
  //   const pDAITokenAddress = await daiTokenAddresses.xTokenAddress;
  //   const pDAITokenContract = await PToken__factory.connect(
  //     pDAITokenAddress,
  //     hre.ethers.provider
  //   );
  //   const pDAITokenBalanceBefore = await pDAITokenContract.balanceOf(
  //     liquidator.address
  //   );
  //   const borrowerPTokenBalance = await pDAITokenContract.balanceOf(
  //     borrower.address
  //   );

  //   const treasuryAddress = await pDAITokenContract.RESERVE_TREASURY_ADDRESS();
  //   const treasuryDataBefore = await protocolDataProvider.getUserReserveData(
  //     dai.address,
  //     treasuryAddress
  //   );
  //   const treasuryBalanceBefore = treasuryDataBefore.currentPTokenBalance;

  //   await pool
  //     .connect(liquidator.signer)
  //     .liquidationCall(
  //       dai.address,
  //       usdc.address,
  //       borrower.address,
  //       amountToLiquidate,
  //       true
  //     );

  //   const userReserveDataAfter = await protocolDataProvider.getUserReserveData(
  //     usdc.address,
  //     borrower.address
  //   );

  //   const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

  //   const usdcReserveDataAfter = await getReserveData(
  //     protocolDataProvider,
  //     usdc.address
  //   );
  //   const daiReserveDataAfter = await getReserveData(
  //     protocolDataProvider,
  //     dai.address
  //   );

  //   const daiConfiguration = await protocolDataProvider.getReserveConfigurationData(
  //     dai.address
  //   );
  //   const collateralDecimals = daiConfiguration.decimals;
  //   const liquidationBonus = daiConfiguration.liquidationBonus;

  //   const principalDecimals = (
  //     await protocolDataProvider.getReserveConfigurationData(usdc.address)
  //   ).decimals;

  //   const expectedCollateralLiquidated = oneEther.mul(30).div(1000);

  //   const daiLiquidationProtocolFee =
  //     await protocolDataProvider.getLiquidationProtocolFee(dai.address);

  //   const expectedPrincipal = collateralPrice
  //     .mul(expectedCollateralLiquidated)
  //     .mul(BigNumber.from(10).pow(principalDecimals))
  //     .div(principalPrice.mul(BigNumber.from(10).pow(collateralDecimals)))
  //     .percentDiv(liquidationBonus);

  //   const bonusCollateral = borrowerPTokenBalance.sub(
  //     borrowerPTokenBalance.percentDiv(liquidationBonus)
  //   );
  //   const liquidationProtocolFee = bonusCollateral.percentMul(
  //     daiLiquidationProtocolFee
  //   );
  //   const expectedLiquidationReward = borrowerPTokenBalance.sub(
  //     liquidationProtocolFee
  //   );

  //   const pDAITokenBalanceAfter = await pDAITokenContract.balanceOf(
  //     liquidator.address
  //   );

  //   const treasuryDataAfter = await protocolDataProvider.getUserReserveData(
  //     dai.address,
  //     treasuryAddress
  //   );
  //   const treasuryBalanceAfter = treasuryDataAfter.currentPTokenBalance;

  //   expect(userGlobalDataAfter.healthFactor).to.be.gt(
  //     oneEther,
  //     "Invalid health factor"
  //   );

  //   expect(userReserveDataAfter.currentVariableDebt).to.be.closeTo(
  //     userReserveDataBefore.currentVariableDebt.sub(expectedPrincipal),
  //     2,
  //     "Invalid user borrow balance after liquidation"
  //   );

  //   expect(usdcReserveDataAfter.availableLiquidity).to.be.closeTo(
  //     usdcReserveDataBefore.availableLiquidity.add(expectedPrincipal),
  //     2,
  //     "Invalid principal available liquidity"
  //   );

  //   expect(daiReserveDataAfter.availableLiquidity).to.be.closeTo(
  //     daiReserveDataBefore.availableLiquidity,
  //     2,
  //     "Invalid collateral available liquidity"
  //   );

  //   expect(pDAITokenBalanceBefore).to.be.equal(
  //     pDAITokenBalanceAfter.sub(expectedLiquidationReward),
  //     "Liquidator xToken balance incorrect"
  //   );

  //   expect(treasuryBalanceBefore).to.be.equal(
  //     treasuryBalanceAfter.sub(liquidationProtocolFee),
  //     "Treasury xToken balance incorrect"
  //   );
  // });
});
