import {expect} from "chai";
import {BigNumber} from "ethers";
import {ethers} from "hardhat";
import {MAX_UINT_AMOUNT} from "../deploy/helpers/constants";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {waitForTx} from "../deploy/helpers/misc-utils";
import {RateMode} from "../deploy/helpers/types";
import {MOCK_CHAINLINK_AGGREGATORS_PRICES} from "../deploy/market-config";
import {makeSuite} from "./helpers/make-suite";
import {borrowAndValidate, supplyAndValidate} from "./helpers/validated-steps";

makeSuite("nToken Mint and Burn Event Accounting", (testEnv) => {
  let firstDaiDeposit;
  let secondDaiDeposit;
  BigNumber.from(MOCK_CHAINLINK_AGGREGATORS_PRICES.BAYC);

  before("Initialize Depositors", async () => {
    const {dai} = testEnv;
    firstDaiDeposit = await convertToCurrencyDecimals(dai.address, "10000");
    secondDaiDeposit = await convertToCurrencyDecimals(dai.address, "20000");
  });

  it("User 1 Deposit BAYC", async () => {
    const {
      bayc,
      users: [user1],
      pool,
    } = testEnv;

    await waitForTx(
      await bayc.connect(user1.signer)["mint(address)"](user1.address)
    );

    // User 1 initial BAYC balance is 1
    const initialBaycBalance = await bayc.balanceOf(user1.address);
    expect(initialBaycBalance).to.be.equal(1);

    // initially available to borrow should be 0
    const availableToBorrow = (await pool.getUserAccountData(user1.address))
      .availableBorrowsBase;
    expect(availableToBorrow).to.be.equal(0);
    // initially amount in collateral should be 0
    const totalCollateral = (await pool.getUserAccountData(user1.address))
      .totalCollateralBase;
    expect(totalCollateral).to.be.equal(0);

    await supplyAndValidate("BAYC", "1", user1);
  });

  it("User 2 deposits 10k DAI and User 1 borrows 8K DAI", async () => {
    const {
      users: [user1, user2],
    } = testEnv;

    await supplyAndValidate("DAI", "10000", user2, true);

    // User 1 - Borrow dai
    await borrowAndValidate("DAI", "8000", user1);
  });

  it("User 1 tries to withdraw the deposited BAYC without paying the accrued interest (should fail)", async () => {
    const {
      bayc,
      users: [user1],
      pool,
    } = testEnv;

    expect(
      pool
        .connect(user1.signer)
        .withdrawERC721(bayc.address, [0], user1.address)
    ).to.be.reverted;
  });

  it("User 1 tries to remove the deposited BAYC from collateral without paying the accrued interest (should fail)", async () => {
    const {
      bayc,
      users: [user1],
      pool,
    } = testEnv;

    expect(
      pool
        .connect(user1.signer)
        .setUserUseERC721AsCollateral(bayc.address, [0], false)
    ).to.be.reverted;
  });

  it("User 1 tries to send the nToken to User 2 (should fail)", async () => {
    const {
      nBAYC,
      users: [user1, user2],
    } = testEnv;

    expect(
      nBAYC.connect(user1.signer).transferFrom(user1.address, user2.address, 1)
    ).to.be.reverted;
  });

  it("User 1 adds 20K dai as collateral and then removes their BAYC from collateral without paying the accrued interest", async () => {
    const {
      bayc,
      dai,
      nBAYC,
      users: [user1],
      pool,
    } = testEnv;

    // User 1 - Mints 20k dai
    await waitForTx(
      await dai
        .connect(user1.signer)
        ["mint(uint256)"](await convertToCurrencyDecimals(dai.address, "20000"))
    );

    // User 1 - approves dai for pool
    await waitForTx(
      await dai.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    // User 1 - Deposit dai
    await waitForTx(
      await pool
        .connect(user1.signer)
        .supply(dai.address, secondDaiDeposit, user1.address, "0")
    );

    // User 1 - marks dai as collateral
    await waitForTx(
      await pool
        .connect(user1.signer)
        .setUserUseReserveAsCollateral(dai.address, true)
    );

    const availableToBorrow = (await pool.getUserAccountData(user1.address))
      .availableBorrowsBase;
    const totalCollateral = (await pool.getUserAccountData(user1.address))
      .totalCollateralBase;

    // User 1 - marks ERC721 as not collateral
    await waitForTx(
      await pool
        .connect(user1.signer)
        .setUserUseERC721AsCollateral(bayc.address, [0], false)
    );

    const newTotalCollateral = (await pool.getUserAccountData(user1.address))
      .totalCollateralBase;
    expect(newTotalCollateral).to.be.lt(totalCollateral);

    const newAvailableToBorrow = (await pool.getUserAccountData(user1.address))
      .availableBorrowsBase;
    expect(newAvailableToBorrow).to.be.lt(availableToBorrow);

    const baycBalance = await bayc.balanceOf(user1.address);
    expect(baycBalance).to.be.equal(0);

    const nBaycBalance = await nBAYC.balanceOf(user1.address);
    expect(nBaycBalance).to.be.equal(1);
  });

  it("User 1 redeems the supplied BAYC", async () => {
    const {
      bayc,
      nBAYC,
      users: [user1],
      pool,
    } = testEnv;
    const availableToBorrow = (await pool.getUserAccountData(user1.address))
      .availableBorrowsBase;
    (await pool.getUserAccountData(user1.address)).totalCollateralBase;

    // withdraw BAYC
    const withdrawBAYCTx = await pool
      .connect(user1.signer)
      .withdrawERC721(bayc.address, [0], user1.address);

    await withdrawBAYCTx.wait();

    const nBaycBalance = await nBAYC.balanceOf(user1.address);
    expect(nBaycBalance).to.be.equal(0);

    const baycBalance = await bayc.balanceOf(user1.address);
    expect(baycBalance).to.be.equal(1);

    // availableToBorrow must've decreased
    const newAvailableToBorrow = (await pool.getUserAccountData(user1.address))
      .availableBorrowsBase;
    expect(newAvailableToBorrow).to.be.lt(availableToBorrow);
  });

  it("User 1 tries to remove the deposited DAI from collateral without paying the accrued interest (should fail)", async () => {
    const {
      dai,
      users: [user1],
      pool,
    } = testEnv;

    expect(
      pool
        .connect(user1.signer)
        .setUserUseReserveAsCollateral(dai.address, false)
    ).to.be.reverted;
  });

  it("User 1 tries to withdraw the deposited DAI without paying the accrued interest (should fail)", async () => {
    const {
      dai,
      users: [user1],
      pool,
    } = testEnv;

    expect(
      pool.connect(user1.signer).withdrawERC721(dai.address, [0], user1.address)
    ).to.be.reverted;
  });

  it("User 1 pays the accrued interest and withdraw deposited DAI", async () => {
    const {
      dai,
      users: [user1],
      pool,
    } = testEnv;
    await waitForTx(
      await dai
        .connect(user1.signer)
        ["mint(uint256)"](await convertToCurrencyDecimals(dai.address, "10000"))
    );

    // approve protocol to access user1 wallet
    await waitForTx(
      await dai.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    // repay dai loan
    const repayTx = await pool
      .connect(user1.signer)
      .repay(
        dai.address,
        firstDaiDeposit,
        RateMode.Variable,
        user1.address,
        false
      );
    await repayTx.wait();

    const daiBalanceBefore = await dai.balanceOf(user1.address);
    await ethers.utils.formatUnits(daiBalanceBefore, 18);

    // withdraw DAI
    const withdrawDAITx = await pool
      .connect(user1.signer)
      .withdraw(dai.address, secondDaiDeposit, user1.address);

    await withdrawDAITx.wait();

    await dai.balanceOf(user1.address);
  });
});
