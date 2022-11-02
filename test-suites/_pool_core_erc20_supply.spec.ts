import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {parseEther} from "ethers/lib/utils";
import {MAX_UINT_AMOUNT} from "../deploy/helpers/constants";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {
  mintAndValidate,
  supplyAndValidate,
  switchCollateralAndValidate,
} from "./helpers/validated-steps";

describe("pToken Supply Event Accounting", () => {
  const firstDaiDeposit = "10000";
  const secondDaiDeposit = "20000";

  it("TC-erc20-supply-01 User 1 deposits 10k DAI", async () => {
    const {
      dai,
      users: [user1],
    } = await loadFixture(testEnvFixture);

    // User 2 - Deposit dai
    await supplyAndValidate(dai, firstDaiDeposit, user1, true);
  });

  it("TC-erc20-supply-02 User1 supplies in batches", async () => {
    const {
      dai,
      users: [user1],
    } = await loadFixture(testEnvFixture);

    // User 2 - multiple Deposit dai
    await supplyAndValidate(dai, secondDaiDeposit, user1, true);
    await supplyAndValidate(dai, secondDaiDeposit, user1, true);
  });

  it("TC-erc20-supply-03 User1 shouldn't supply dai more than its allowance (should fail)", async () => {
    const {
      dai,
      pool,
      users: [user1],
    } = await loadFixture(testEnvFixture);
    const amount = await convertToCurrencyDecimals(
      dai.address,
      firstDaiDeposit
    );
    await mintAndValidate(dai, firstDaiDeposit, user1);
    await dai.connect(user1.signer).approve(pool.address, parseEther("5000"));
    await expect(
      pool.connect(user1.signer).supply(dai.address, amount, user1.address, "0")
    ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
  });

  it("TC-erc20-supply-04 User 1 removes the deposited DAI from collateral", async () => {
    const {
      users: [user1],
      dai,
    } = await loadFixture(testEnvFixture);

    // User 1 -  Deposit dai
    await supplyAndValidate(dai, "200", user1, true);

    // User 1 -  close Collateral
    await switchCollateralAndValidate(user1, dai, false);
  });

  it("TC-erc20-supply-05 User 2 tries to supply without obtaining approval (should fail)", async () => {
    const {
      dai,
      pool,
      users: [, user2],
    } = await loadFixture(testEnvFixture);
    await mintAndValidate(dai, firstDaiDeposit, user2);
    await expect(
      pool
        .connect(user2.signer)
        .supply(dai.address, firstDaiDeposit, user2.address, "0")
    ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
  });

  it("TC-erc20-supply-06 User 1 tries to supply 20K exceed the balance amount (should fail)", async () => {
    const {
      dai,
      pool,
      users: [user1],
    } = await loadFixture(testEnvFixture);
    const amount = await convertToCurrencyDecimals(dai.address, "200000");

    await dai.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await expect(
      pool.connect(user1.signer).supply(dai.address, amount, user1.address, "0")
    ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
  });

  it("TC-erc20-supply-07 User 1 Supply not minted token (should fail)", async () => {
    const {
      usdt,
      pool,
      users: [user1],
    } = await loadFixture(testEnvFixture);
    const amount = await convertToCurrencyDecimals(usdt.address, "200000");

    await usdt.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await expect(
      pool
        .connect(user1.signer)
        .supply(usdt.address, amount, user1.address, "0")
    ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
  });

  it("TC-erc20-supply-08 User 1 tries tansfer the pToken to User 2 (no borrow)", async () => {
    const {
      pDai,
      dai,
      users: [user1, user2],
    } = await loadFixture(testEnvFixture);
    await supplyAndValidate(dai, "200", user1, true);
    const user1balance = await pDai.balanceOf(user1.address);
    const user2balance = await pDai.balanceOf(user2.address);
    const amount = await convertToCurrencyDecimals(pDai.address, "100");

    await pDai.connect(user1.signer).transfer(user2.address, amount);
    await switchCollateralAndValidate(user2, dai, true);

    const user1BalanceAfter = await pDai.balanceOf(user1.address);
    const user2BalanceAfter = await pDai.balanceOf(user2.address);

    // user 1 ptoken  should  be reduced
    expect(user1BalanceAfter).to.be.equal(user1balance.sub(amount));

    // user 2 ptoken  should increase
    expect(user2BalanceAfter).to.be.equal(user2balance.add(amount));
  });
});
