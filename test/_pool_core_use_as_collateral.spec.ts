import {expect} from "chai";
import {BigNumber} from "ethers";
import {TestEnv} from "./helpers/make-suite";
import {advanceBlock, waitForTx} from "../helpers/misc-utils";
import {parseEther} from "ethers/lib/utils";
import {MAX_UINT_AMOUNT} from "../helpers/constants";
import {ProtocolErrors} from "../helpers/types";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {isUsingAsCollateral} from "../helpers/contracts-helpers";
import {
  changePriceAndValidate,
  supplyAndValidate,
} from "./helpers/validated-steps";

describe("UserConfigurator for ERC721: check user usedAsCollateral and collateralizedBalance status", () => {
  let testEnv: TestEnv;
  beforeEach(async () => {
    testEnv = await loadFixture(testEnvFixture);
  });

  it("TC-use-as-collateral-01:check by supply and withdraw", async () => {
    const {
      bayc,
      nBAYC,
      users: [user1],
      pool,
    } = testEnv;

    const baycData = await pool.getReserveData(bayc.address);

    await waitForTx(
      await bayc.connect(user1.signer)["mint(address)"](user1.address)
    );
    await waitForTx(
      await bayc.connect(user1.signer)["mint(address)"](user1.address)
    );

    await waitForTx(
      await bayc.connect(user1.signer).setApprovalForAll(pool.address, true)
    );

    await waitForTx(
      await pool
        .connect(user1.signer)
        .supplyERC721(
          bayc.address,
          [{tokenId: 0, useAsCollateral: false}],
          user1.address,
          "0"
        )
    );
    let userConfig = BigNumber.from(
      (await pool.getUserConfiguration(user1.address)).data
    );

    expect(await nBAYC.collateralizedBalanceOf(user1.address)).to.be.equal(0);
    expect(isUsingAsCollateral(userConfig, baycData.id)).to.be.false;

    await waitForTx(
      await pool
        .connect(user1.signer)
        .supplyERC721(
          bayc.address,
          [{tokenId: 1, useAsCollateral: true}],
          user1.address,
          "0"
        )
    );
    userConfig = BigNumber.from(
      (await pool.getUserConfiguration(user1.address)).data
    );

    expect(isUsingAsCollateral(userConfig, baycData.id)).to.be.true;
    expect(await nBAYC.collateralizedBalanceOf(user1.address)).to.be.equal(1);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .withdrawERC721(bayc.address, [1], user1.address)
    );
    userConfig = BigNumber.from(
      (await pool.getUserConfiguration(user1.address)).data
    );

    expect(isUsingAsCollateral(userConfig, baycData.id)).to.be.false;
    expect(await nBAYC.collateralizedBalanceOf(user1.address)).to.be.equal(0);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .withdrawERC721(bayc.address, [0], user1.address)
    );
    userConfig = BigNumber.from(
      (await pool.getUserConfiguration(user1.address)).data
    );

    expect(isUsingAsCollateral(userConfig, baycData.id)).to.be.false;
    expect(await nBAYC.collateralizedBalanceOf(user1.address)).to.be.equal(0);
  });

  it("TC-use-as-collateral-02:check by supply and transfer", async () => {
    const {
      bayc,
      nBAYC,
      users: [user1, user2],
      pool,
    } = testEnv;

    const baycData = await pool.getReserveData(bayc.address);

    await waitForTx(
      await bayc.connect(user1.signer)["mint(address)"](user1.address)
    );

    await waitForTx(
      await bayc.connect(user1.signer).setApprovalForAll(pool.address, true)
    );

    await waitForTx(
      await pool
        .connect(user1.signer)
        .supplyERC721(
          bayc.address,
          [{tokenId: 0, useAsCollateral: true}],
          user1.address,
          "0"
        )
    );
    let user1Config = BigNumber.from(
      (await pool.getUserConfiguration(user1.address)).data
    );

    expect(await nBAYC.collateralizedBalanceOf(user1.address)).to.be.equal(1);
    expect(isUsingAsCollateral(user1Config, baycData.id)).to.be.true;

    await waitForTx(
      await nBAYC
        .connect(user1.signer)
        .transferFrom(user1.address, user2.address, 0)
    );

    user1Config = BigNumber.from(
      (await pool.getUserConfiguration(user1.address)).data
    );
    expect(await nBAYC.collateralizedBalanceOf(user1.address)).to.be.equal(0);
    expect(isUsingAsCollateral(user1Config, baycData.id)).to.be.false;

    const user2Config = BigNumber.from(
      (await pool.getUserConfiguration(user2.address)).data
    );
    expect(await nBAYC.collateralizedBalanceOf(user2.address)).to.be.equal(0);
    expect(isUsingAsCollateral(user2Config, baycData.id)).to.be.false;
  });

  it("TC-use-as-collateral-03:check setUserUseERC721AsCollateral", async () => {
    const {
      bayc,
      nBAYC,
      users: [user1],
      pool,
    } = testEnv;

    const baycData = await pool.getReserveData(bayc.address);

    await waitForTx(
      await bayc.connect(user1.signer)["mint(address)"](user1.address)
    );
    await waitForTx(
      await bayc.connect(user1.signer)["mint(address)"](user1.address)
    );
    await waitForTx(
      await bayc.connect(user1.signer)["mint(address)"](user1.address)
    );

    await waitForTx(
      await bayc.connect(user1.signer).setApprovalForAll(pool.address, true)
    );

    await waitForTx(
      await pool.connect(user1.signer).supplyERC721(
        bayc.address,
        [
          {tokenId: 0, useAsCollateral: false},
          {tokenId: 1, useAsCollateral: false},
          {tokenId: 2, useAsCollateral: false},
        ],
        user1.address,
        "0"
      )
    );
    let user1Config = BigNumber.from(
      (await pool.getUserConfiguration(user1.address)).data
    );

    expect(await nBAYC.collateralizedBalanceOf(user1.address)).to.be.equal(0);
    expect(isUsingAsCollateral(user1Config, baycData.id)).to.be.false;

    await waitForTx(
      await pool
        .connect(user1.signer)
        .setUserUseERC721AsCollateral(bayc.address, [0, 1, 2], true)
    );
    user1Config = BigNumber.from(
      (await pool.getUserConfiguration(user1.address)).data
    );
    expect(await nBAYC.collateralizedBalanceOf(user1.address)).to.be.equal(3);
    expect(isUsingAsCollateral(user1Config, baycData.id)).to.be.true;

    await waitForTx(
      await pool
        .connect(user1.signer)
        .setUserUseERC721AsCollateral(bayc.address, [0, 1], false)
    );
    user1Config = BigNumber.from(
      (await pool.getUserConfiguration(user1.address)).data
    );
    expect(await nBAYC.collateralizedBalanceOf(user1.address)).to.be.equal(1);
    expect(isUsingAsCollateral(user1Config, baycData.id)).to.be.true;

    await waitForTx(
      await pool
        .connect(user1.signer)
        .setUserUseERC721AsCollateral(bayc.address, [2], false)
    );
    user1Config = BigNumber.from(
      (await pool.getUserConfiguration(user1.address)).data
    );
    expect(await nBAYC.collateralizedBalanceOf(user1.address)).to.be.equal(0);
    expect(isUsingAsCollateral(user1Config, baycData.id)).to.be.false;
  });

  it("TC-use-as-collateral-04:check liquidation", async () => {
    const {
      weth,
      bayc,
      nBAYC,
      users: [user1, liquidator, depositor],
      pool,
    } = testEnv;

    await changePriceAndValidate(bayc, "40");

    //1 depositor deposit 20 eth
    await supplyAndValidate(weth, "20", depositor, true);
    //2 user1 supply bayc and borrow 10 eth
    await supplyAndValidate(bayc, "1", user1, true);
    await waitForTx(
      await pool
        .connect(user1.signer)
        .borrow(weth.address, parseEther("10"), 0, user1.address)
    );
    //3 bayc price drop
    await changePriceAndValidate(bayc, "1");
    //4 user1 try to liquidate himself
    await weth.connect(user1.signer)["mint(uint256)"](parseEther("20"));
    await weth.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT);

    await waitForTx(
      await pool
        .connect(liquidator.signer)
        .startAuction(user1.address, bayc.address, 0)
    );
    expect(await nBAYC.isAuctioned(0)).to.be.true;

    await expect(
      pool
        .connect(user1.signer)
        .liquidateERC721(bayc.address, user1.address, 0, parseEther("20"), true)
    ).to.be.revertedWith(ProtocolErrors.LIQUIDATOR_CAN_NOT_BE_SELF);

    //4 liquidator liquidate user1
    await weth.connect(liquidator.signer)["mint(uint256)"](parseEther("20"));
    await weth
      .connect(liquidator.signer)
      .approve(pool.address, MAX_UINT_AMOUNT);
    const {startTime, tickLength} = await pool.getAuctionData(nBAYC.address, 0);
    // price drops to 1 * floor price
    await advanceBlock(
      startTime.add(tickLength.mul(BigNumber.from(40))).toNumber()
    );
    await waitForTx(
      await pool
        .connect(liquidator.signer)
        .liquidateERC721(
          bayc.address,
          user1.address,
          0,
          parseEther("20"),
          true,
          {gasLimit: 5000000}
        )
    );

    //5 check user1's config
    const baycData = await pool.getReserveData(bayc.address);
    const user1Config = BigNumber.from(
      (await pool.getUserConfiguration(user1.address)).data
    );
    expect(await nBAYC.collateralizedBalanceOf(user1.address)).to.be.equal(0);
    expect(isUsingAsCollateral(user1Config, baycData.id)).to.be.false;

    //6 check liquidator's config
    const liquidatorConfig = BigNumber.from(
      (await pool.getUserConfiguration(liquidator.address)).data
    );
    expect(await nBAYC.collateralizedBalanceOf(liquidator.address)).to.be.equal(
      0
    );
    expect(isUsingAsCollateral(liquidatorConfig, baycData.id)).to.be.false;
  });

  it("TC-use-as-collateral-05:supply multiple nft with some as collateral and some are not,then transfer and check", async () => {
    const {
      bayc,
      nBAYC,
      users: [user1, user2],
      pool,
    } = testEnv;

    const baycData = await pool.getReserveData(bayc.address);

    await waitForTx(
      await bayc.connect(user1.signer)["mint(address)"](user1.address)
    );
    await waitForTx(
      await bayc.connect(user1.signer)["mint(address)"](user1.address)
    );
    await waitForTx(
      await bayc.connect(user2.signer)["mint(address)"](user2.address)
    );

    await waitForTx(
      await bayc.connect(user1.signer).setApprovalForAll(pool.address, true)
    );
    await waitForTx(
      await bayc.connect(user2.signer).setApprovalForAll(pool.address, true)
    );

    await waitForTx(
      await pool.connect(user1.signer).supplyERC721(
        bayc.address,
        [
          {tokenId: 0, useAsCollateral: false},
          {tokenId: 1, useAsCollateral: true},
        ],
        user1.address,
        "0"
      )
    );
    await waitForTx(
      await pool
        .connect(user2.signer)
        .supplyERC721(
          bayc.address,
          [{tokenId: 2, useAsCollateral: false}],
          user2.address,
          "0"
        )
    );

    let user1Config = BigNumber.from(
      (await pool.getUserConfiguration(user1.address)).data
    );
    expect(await nBAYC.collateralizedBalanceOf(user1.address)).to.be.equal(1);
    expect(isUsingAsCollateral(user1Config, baycData.id)).to.be.true;

    let user2Config = BigNumber.from(
      (await pool.getUserConfiguration(user2.address)).data
    );
    expect(await nBAYC.collateralizedBalanceOf(user2.address)).to.be.equal(0);
    expect(isUsingAsCollateral(user2Config, baycData.id)).to.be.false;

    await waitForTx(
      await nBAYC
        .connect(user1.signer)
        .transferFrom(user1.address, user2.address, 1)
    );

    user1Config = BigNumber.from(
      (await pool.getUserConfiguration(user1.address)).data
    );
    expect(await nBAYC.collateralizedBalanceOf(user1.address)).to.be.equal(0);
    expect(isUsingAsCollateral(user1Config, baycData.id)).to.be.false;

    user2Config = BigNumber.from(
      (await pool.getUserConfiguration(user2.address)).data
    );
    expect(await nBAYC.collateralizedBalanceOf(user2.address)).to.be.equal(0);
    expect(isUsingAsCollateral(user2Config, baycData.id)).to.be.false;
  });

  it("TC-use-as-collateral-06:Call `setUserUseERC20AsCollateral()` to use an asset as collateral when the asset is already set as collateral", async () => {
    const {
      pool,
      protocolDataProvider,
      dai,
      users: [user0],
    } = await loadFixture(testEnvFixture);

    await supplyAndValidate(dai, "10", user0, true);

    const userReserveDataBefore = await protocolDataProvider.getUserReserveData(
      dai.address,
      user0.address
    );
    expect(userReserveDataBefore.usageAsCollateralEnabled).to.be.true;

    expect(
      await pool
        .connect(user0.signer)
        .setUserUseERC20AsCollateral(dai.address, true)
    ).to.not.emit(pool, "ReserveUsedAsCollateralEnabled");

    const userReserveDataAfter = await protocolDataProvider.getUserReserveData(
      dai.address,
      user0.address
    );
    expect(userReserveDataAfter.usageAsCollateralEnabled).to.be.true;
  });

  it("TC-use-as-collateral-07:Call `setUserUseERC20AsCollateral()` to disable an asset as collateral when the asset is already disabled as collateral", async () => {
    const {
      pool,
      protocolDataProvider,
      dai,
      users: [user0],
    } = await loadFixture(testEnvFixture);

    await supplyAndValidate(dai, "10", user0, true);

    // Disable asset as collateral
    expect(
      await pool
        .connect(user0.signer)
        .setUserUseERC20AsCollateral(dai.address, false)
    )
      .to.emit(pool, "ReserveUsedAsCollateralDisabled")
      .withArgs(dai.address, user0.address);

    const userReserveDataBefore = await protocolDataProvider.getUserReserveData(
      dai.address,
      user0.address
    );
    expect(userReserveDataBefore.usageAsCollateralEnabled).to.be.false;

    expect(
      await pool
        .connect(user0.signer)
        .setUserUseERC20AsCollateral(dai.address, false)
    ).to.not.emit(pool, "ReserveUsedAsCollateralDisabled");

    const userReserveDataAfter = await protocolDataProvider.getUserReserveData(
      dai.address,
      user0.address
    );
    expect(userReserveDataAfter.usageAsCollateralEnabled).to.be.false;
  });
});
