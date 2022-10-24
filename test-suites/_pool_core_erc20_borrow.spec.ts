import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {BigNumber} from "ethers";
import {MAX_UINT_AMOUNT, ONE_YEAR} from "../deploy/helpers/constants";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {advanceTimeAndBlock} from "../deploy/helpers/misc-utils";
import {ProtocolErrors} from "../deploy/helpers/types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {
  borrowAndValidate,
  supplyAndValidate,
  repayAndValidate,
} from "./helpers/validated-steps";

describe("pToken/debtToken Borrow Event Accounting", () => {
  let firstDaiDeposit;
  let secondDaiDeposit;
  let accruedInterest = BigNumber.from(0);
  let testEnv: TestEnv;

  before("Initialize Depositors", async () => {
    testEnv = await loadFixture(testEnvFixture);
    firstDaiDeposit = "10000";
    secondDaiDeposit = "20000";
  });

  it("TC-erc20-borrow-01 User 1 deposits 20k DAI and borrows 8K DAI", async () => {
    const {
      dai,
      users: [user1],
    } = testEnv;

    // User 1 - Deposit dai
    await supplyAndValidate(dai, secondDaiDeposit, user1, true);

    // User 1 - Borrow dai
    await borrowAndValidate(dai, "8000", user1);
  });

  it("TC-erc20-borrow-02 User 1 acquires share of borrower interest", async () => {
    const {
      pDai,
      users: [user1],
    } = testEnv;
    const pDaiBalanceBefore = await pDai.balanceOf(user1.address);

    // Advance time and blocks
    await advanceTimeAndBlock(parseInt(ONE_YEAR));

    // User 1 - pDAI balance should have increased
    const pDaiBalanceAfter = await pDai.balanceOf(user1.address);
    expect(pDaiBalanceAfter).to.be.gt(pDaiBalanceBefore);

    accruedInterest = pDaiBalanceAfter.sub(pDaiBalanceBefore);
  });

  it("TC-erc20-borrow-03 User 1 borrow has No liquidity  tokens ", async () => {
    const {
      wBTC,
      users: [user1],
    } = testEnv;

    // User 1 - Borrow wBTC
    await expect(borrowAndValidate(wBTC, "0.1", user1)).to.be.reverted;
  });

  it("TC-erc20-borrow-04 User 1 Borrow 21K is greater than the max liquidity 20K amount  (should fail)", async () => {
    const {
      dai,
      pool,
      users: [user1],
    } = testEnv;
    const amount = await convertToCurrencyDecimals(dai.address, "20000");
    await expect(
      pool
        .connect(user1.signer)
        .borrow(dai.address, amount, "0", user1.address, {
          gasLimit: 5000000,
        })
    ).to.be.reverted;
  });

  it("TC-erc20-borrow-05 User 1 Borrow 21K is greater than the max borrow limit 20K amount  (should fail)", async () => {
    const {
      dai,
      pool,
      users: [user1],
    } = testEnv;
    const amount = await convertToCurrencyDecimals(
      dai.address,
      secondDaiDeposit
    );
    await expect(
      pool
        .connect(user1.signer)
        .borrow(dai.address, amount, "0", user1.address, {
          gasLimit: 5000000,
        })
    ).to.be.revertedWith(ProtocolErrors.COLLATERAL_CANNOT_COVER_NEW_BORROW);
  });

  it("TC-erc20-borrow-06 User 1 partially repays the accrued interest on borrowed DAI", async () => {
    const {
      users: [user1],
      dai,
    } = testEnv;

    await repayAndValidate(dai, "1000", user1);
  });

  it("TC-erc20-borrow-07 User 1 still acquires share of borrower interest, but now less", async () => {
    const {
      pDai,
      users: [user1],
    } = testEnv;
    const pDaiBalance = await pDai.balanceOf(user1.address);

    // Advance time and blocks
    await advanceTimeAndBlock(parseInt(ONE_YEAR));

    const pDaiBalanceAfter = await pDai.balanceOf(user1.address);
    expect(pDaiBalanceAfter).to.be.gt(pDaiBalance);

    // User 1 - interest should be decreased
    expect(pDaiBalanceAfter.sub(pDaiBalance)).to.be.lt(accruedInterest);
  });

  it("TC-erc20-borrow-08 User 1 If the debt is not exceeded, Ptoken can transfer", async () => {
    const {
      dai,
      pDai,
      users: [user1, , user3],
    } = testEnv;
    const amount = await convertToCurrencyDecimals(dai.address, "100");

    const pDaiBalance = await pDai.balanceOf(user3.address);
    // User 1 transfer to User 3
    await pDai.connect(user1.signer).transfer(user3.address, amount);

    const pDaiBalanceAfter = await pDai.balanceOf(user3.address);

    //  User 3 - pDAI balance should be increased
    expect(pDaiBalanceAfter).to.be.equal(pDaiBalance.add(amount));
  });

  it("TC-erc20-borrow-09 User 2 Users do not supply asset to borrow (should fail) ", async () => {
    const {
      dai,
      pool,
      users: [, user2],
      variableDebtDai,
    } = testEnv;
    const debtBalanceBeforeWithdraw = await variableDebtDai.balanceOf(
      user2.address
    );

    const balance = await dai.balanceOf(user2.address);
    await dai.connect(user2.signer).approve(pool.address, MAX_UINT_AMOUNT);
    const amount = await convertToCurrencyDecimals(
      dai.address,
      firstDaiDeposit
    );
    await expect(
      pool
        .connect(user2.signer)
        .borrow(dai.address, amount, "0", user2.address, {
          gasLimit: 5000000,
        })
    ).to.be.revertedWith(ProtocolErrors.COLLATERAL_BALANCE_IS_ZERO);

    // User 2 - DAI balance should remain unchanged
    const balanceAfter = await dai.balanceOf(user2.address);
    expect(balanceAfter).to.equal(balance);

    // User 2 - debtBalance should not change
    const debtBalanceAfterWithdraw = await variableDebtDai.balanceOf(
      user2.address
    );
    expect(debtBalanceBeforeWithdraw).to.equal(debtBalanceAfterWithdraw);
  });

  it("TC-erc20-borrow-10 User 2 borrow different tokens ", async () => {
    const {
      ape,
      usdt,
      users: [user1, user2],
    } = testEnv;
    // User 2 - deposit liquidity
    await supplyAndValidate(usdt, firstDaiDeposit, user2, true);
    await supplyAndValidate(ape, firstDaiDeposit, user2, true);

    // User 1 - Borrow ape、usdt
    await borrowAndValidate(ape, "100", user1);
    await borrowAndValidate(usdt, "100", user1);
  });
});
