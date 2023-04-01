import {expect} from "chai";
import {BigNumber, utils} from "ethers";
import {ProtocolErrors} from "../helpers/types";
import {MAX_UINT_AMOUNT, RAY, ZERO_ADDRESS} from "../helpers/constants";
import {
  DRE,
  increaseTime,
  setAutomine,
  impersonateAccountsHardhat,
} from "../helpers/misc-utils";
import {StableDebtToken__factory} from "../types";
import {topUpNonPayableWithEther} from "./helpers/utils/funds";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";

describe("Stable Debt Token Test", () => {
  const {CALLER_MUST_BE_POOL, CALLER_NOT_POOL_ADMIN} = ProtocolErrors;
  it("Check initialization", async () => {
    const {pool, weth, protocolDataProvider, users} = await loadFixture(
      testEnvFixture
    );
    const daiStableDebtTokenAddress = (
      await protocolDataProvider.getReserveTokensAddresses(weth.address)
    ).stableDebtTokenAddress;
    const stableDebtContract = StableDebtToken__factory.connect(
      daiStableDebtTokenAddress,
      users[0].signer
    );
    expect(await stableDebtContract.UNDERLYING_ASSET_ADDRESS()).to.be.eq(
      weth.address
    );
    expect(await stableDebtContract.POOL()).to.be.eq(pool.address);
    expect(await stableDebtContract.getIncentivesController()).to.not.be.eq(
      ZERO_ADDRESS
    );
    const totSupplyAndRateBefore =
      await stableDebtContract.getTotalSupplyAndAvgRate();
    expect(totSupplyAndRateBefore[0].toString()).to.be.eq("0");
    expect(totSupplyAndRateBefore[1].toString()).to.be.eq("0");
    // Need to create some debt to do this good
    await weth
      .connect(users[0].signer)
      ["mint(uint256)"](await convertToCurrencyDecimals(weth.address, "1000"));
    await weth.connect(users[0].signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(users[0].signer)
      .supply(
        weth.address,
        await convertToCurrencyDecimals(weth.address, "1000"),
        users[0].address,
        0
      );
    await weth
      .connect(users[1].signer)
      ["mint(uint256)"](utils.parseEther("10"));
    await weth.connect(users[1].signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(users[1].signer)
      .supply(weth.address, utils.parseEther("10"), users[1].address, 0);
    await pool
      .connect(users[1].signer)
      .borrow(
        weth.address,
        await convertToCurrencyDecimals(weth.address, "1"),
        0,
        users[1].address
      );
    const totSupplyAndRateAfter =
      await stableDebtContract.getTotalSupplyAndAvgRate();
    //borrow by variable
    expect(totSupplyAndRateAfter[0]).to.be.eq(0);
    expect(totSupplyAndRateAfter[1]).to.be.eq(0);
  });
  it("Tries to mint not being the Pool (revert expected)", async () => {
    const {deployer, weth, protocolDataProvider} = await loadFixture(
      testEnvFixture
    );
    const daiStableDebtTokenAddress = (
      await protocolDataProvider.getReserveTokensAddresses(weth.address)
    ).stableDebtTokenAddress;
    const stableDebtContract = StableDebtToken__factory.connect(
      daiStableDebtTokenAddress,
      deployer.signer
    );
    await expect(
      stableDebtContract.mint(deployer.address, deployer.address, "1", "1")
    ).to.be.revertedWith(CALLER_MUST_BE_POOL);
  });
  it("Tries to burn not being the Pool (revert expected)", async () => {
    const {deployer, weth, protocolDataProvider} = await loadFixture(
      testEnvFixture
    );
    const daiStableDebtTokenAddress = (
      await protocolDataProvider.getReserveTokensAddresses(weth.address)
    ).stableDebtTokenAddress;
    const stableDebtContract = StableDebtToken__factory.connect(
      daiStableDebtTokenAddress,
      deployer.signer
    );
    const name = await stableDebtContract.name();
    expect(name).to.be.equal("ParaSpace Stable Debt Token WETH");
    await expect(
      stableDebtContract.burn(deployer.address, "1")
    ).to.be.revertedWith(CALLER_MUST_BE_POOL);
  });
  it("Tries to transfer debt tokens (revert expected)", async () => {
    const {users, weth, protocolDataProvider} = await loadFixture(
      testEnvFixture
    );
    const daiStableDebtTokenAddress = (
      await protocolDataProvider.getReserveTokensAddresses(weth.address)
    ).stableDebtTokenAddress;
    const stableDebtContract = StableDebtToken__factory.connect(
      daiStableDebtTokenAddress,
      users[0].signer
    );
    await expect(
      stableDebtContract
        .connect(users[0].signer)
        .transfer(users[1].address, 500)
    ).to.be.revertedWith(ProtocolErrors.OPERATION_NOT_SUPPORTED);
  });

  it("Tries to approve debt tokens (revert expected)", async () => {
    const {users, weth, protocolDataProvider} = await loadFixture(
      testEnvFixture
    );
    const daiStableDebtTokenAddress = (
      await protocolDataProvider.getReserveTokensAddresses(weth.address)
    ).stableDebtTokenAddress;
    const stableDebtContract = StableDebtToken__factory.connect(
      daiStableDebtTokenAddress,
      users[0].signer
    );
    await expect(
      stableDebtContract.connect(users[0].signer).approve(users[1].address, 500)
    ).to.be.revertedWith(ProtocolErrors.OPERATION_NOT_SUPPORTED);
    await expect(
      stableDebtContract.allowance(users[0].address, users[1].address)
    ).to.be.revertedWith(ProtocolErrors.OPERATION_NOT_SUPPORTED);
  });

  it("Tries to increase allowance of debt tokens (revert expected)", async () => {
    const {users, weth, protocolDataProvider} = await loadFixture(
      testEnvFixture
    );
    const daiStableDebtTokenAddress = (
      await protocolDataProvider.getReserveTokensAddresses(weth.address)
    ).stableDebtTokenAddress;
    const stableDebtContract = StableDebtToken__factory.connect(
      daiStableDebtTokenAddress,
      users[0].signer
    );
    await expect(
      stableDebtContract
        .connect(users[0].signer)
        .increaseAllowance(users[1].address, 500)
    ).to.be.revertedWith(ProtocolErrors.OPERATION_NOT_SUPPORTED);
  });

  it("Tries to decrease allowance of debt tokens (revert expected)", async () => {
    const {users, weth, protocolDataProvider} = await loadFixture(
      testEnvFixture
    );
    const daiStableDebtTokenAddress = (
      await protocolDataProvider.getReserveTokensAddresses(weth.address)
    ).stableDebtTokenAddress;
    const stableDebtContract = StableDebtToken__factory.connect(
      daiStableDebtTokenAddress,
      users[0].signer
    );
    await expect(
      stableDebtContract
        .connect(users[0].signer)
        .decreaseAllowance(users[1].address, 500)
    ).to.be.revertedWith(ProtocolErrors.OPERATION_NOT_SUPPORTED);
  });

  it("Tries to transferFrom (revert expected)", async () => {
    const {users, weth, protocolDataProvider} = await loadFixture(
      testEnvFixture
    );
    const daiStableDebtTokenAddress = (
      await protocolDataProvider.getReserveTokensAddresses(weth.address)
    ).stableDebtTokenAddress;
    const stableDebtContract = StableDebtToken__factory.connect(
      daiStableDebtTokenAddress,
      users[0].signer
    );
    await expect(
      stableDebtContract
        .connect(users[0].signer)
        .transferFrom(users[0].address, users[1].address, 500)
    ).to.be.revertedWith(ProtocolErrors.OPERATION_NOT_SUPPORTED);
  });

  it("Burn stable debt tokens such that `secondTerm >= firstTerm`", async () => {
    // To enter the case where secondTerm >= firstTerm, we also need previousSupply <= amount.
    // The easiest way is to use two users, such that for user 2 his stableRate > average stableRate.
    // In practice to enter the case we can perform the following actions
    // user 1 borrow 2 wei at rate = 10**27
    // user 2 borrow 1 wei rate = 10**30
    // progress time by a year, to accrue significant debt.
    // then let user 2 withdraw sufficient funds such that secondTerm (userStableRate * burnAmount) >= averageRate * supply
    // if we do not have user 1 deposit as well, we will have issues getting past previousSupply <= amount, as amount > supply for secondTerm to be > firstTerm.
    const rateGuess1 = BigNumber.from(RAY);
    const rateGuess2 = BigNumber.from(10).pow(30);
    const amount1 = BigNumber.from(2);
    const amount2 = BigNumber.from(1);
    const {deployer, pool, dai, protocolDataProvider, users} =
      await loadFixture(testEnvFixture);
    // Impersonate the Pool
    await topUpNonPayableWithEther(
      deployer.signer,
      [pool.address],
      utils.parseEther("1")
    );
    await impersonateAccountsHardhat([pool.address]);
    const poolSigner = await DRE.ethers.getSigner(pool.address);
    const config = await protocolDataProvider.getReserveTokensAddresses(
      dai.address
    );
    const stableDebt = StableDebtToken__factory.connect(
      config.stableDebtTokenAddress,
      deployer.signer
    );
    // Next two txs should be mined in the same block
    await setAutomine(false);
    await stableDebt
      .connect(poolSigner)
      .mint(users[0].address, users[0].address, amount1, rateGuess1);
    await stableDebt
      .connect(poolSigner)
      .mint(users[1].address, users[1].address, amount2, rateGuess2);
    await setAutomine(true);
    await increaseTime(60 * 60 * 24 * 365);
    const totalSupplyAfterTime = BigNumber.from(18798191);
    await stableDebt
      .connect(poolSigner)
      .burn(users[1].address, totalSupplyAfterTime.sub(1));
  });

  it("setIncentivesController() ", async () => {
    const {weth, protocolDataProvider, poolAdmin} = await loadFixture(
      testEnvFixture
    );
    const config = await protocolDataProvider.getReserveTokensAddresses(
      weth.address
    );
    const stableDebt = StableDebtToken__factory.connect(
      config.stableDebtTokenAddress,
      poolAdmin.signer
    );
    expect(await stableDebt.getIncentivesController()).to.not.be.eq(
      ZERO_ADDRESS
    );
    expect(
      await stableDebt
        .connect(poolAdmin.signer)
        .setIncentivesController(ZERO_ADDRESS)
    );
    expect(await stableDebt.getIncentivesController()).to.be.eq(ZERO_ADDRESS);
  });
  it("setIncentivesController() from not pool admin (revert expected)", async () => {
    const {
      weth,
      protocolDataProvider,
      users: [user],
    } = await loadFixture(testEnvFixture);
    const config = await protocolDataProvider.getReserveTokensAddresses(
      weth.address
    );
    const stableDebt = StableDebtToken__factory.connect(
      config.stableDebtTokenAddress,
      user.signer
    );
    expect(await stableDebt.getIncentivesController()).to.not.be.eq(
      ZERO_ADDRESS
    );
    await expect(
      stableDebt.connect(user.signer).setIncentivesController(ZERO_ADDRESS)
    ).to.be.revertedWith(CALLER_NOT_POOL_ADMIN);
  });
});
