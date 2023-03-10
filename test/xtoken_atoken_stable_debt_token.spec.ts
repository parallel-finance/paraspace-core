import {expect} from "chai";
import {BigNumber, utils} from "ethers";
import {ProtocolErrors} from "../helpers/types";
import {RAY} from "../helpers/constants";
import {
  DRE,
  increaseTime,
  setAutomine,
  waitForTx,
  impersonateAccountsHardhat,
} from "../helpers/misc-utils";
import {
  ATokenStableDebtToken__factory,
  StableDebtToken__factory,
} from "../types";
import {topUpNonPayableWithEther} from "./helpers/utils/funds";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {TestEnv} from "./helpers/make-suite";
import {almostEqual} from "./helpers/uniswapv3-helper";
import {parseEther} from "ethers/lib/utils";

describe("AToken Stable Debt Token Test", () => {
  let testEnv: TestEnv;
  const {CALLER_MUST_BE_POOL} = ProtocolErrors;
  const fixture = async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {deployer, pool} = testEnv;

    await topUpNonPayableWithEther(
      deployer.signer,
      [pool.address],
      utils.parseEther("1")
    );
    await impersonateAccountsHardhat([pool.address]);

    return testEnv;
  };

  it("Tries to mint not being the Pool (revert expected)", async () => {
    const {deployer, aWETH, protocolDataProvider} = await loadFixture(fixture);
    const aWETHStableDebtTokenAddress = (
      await protocolDataProvider.getReserveTokensAddresses(aWETH.address)
    ).stableDebtTokenAddress;
    const stableDebtContract = ATokenStableDebtToken__factory.connect(
      aWETHStableDebtTokenAddress,
      deployer.signer
    );
    await expect(
      stableDebtContract.mint(deployer.address, deployer.address, "1", "1")
    ).to.be.revertedWith(CALLER_MUST_BE_POOL);
  });
  it("Tries to burn not being the Pool (revert expected)", async () => {
    const {deployer, aWETH, protocolDataProvider} = await loadFixture(fixture);
    const aWETHStableDebtTokenAddress = (
      await protocolDataProvider.getReserveTokensAddresses(aWETH.address)
    ).stableDebtTokenAddress;
    const stableDebtContract = StableDebtToken__factory.connect(
      aWETHStableDebtTokenAddress,
      deployer.signer
    );
    const name = await stableDebtContract.name();
    expect(name).to.be.equal("ParaSpace Stable Debt Token aWETH");
    await expect(
      stableDebtContract.burn(deployer.address, "1")
    ).to.be.revertedWith(CALLER_MUST_BE_POOL);
  });

  it("Mint and Burn as expected", async () => {
    const rate1 = BigNumber.from(10).pow(26);
    const rate2 = BigNumber.from(10).pow(26).mul(2);
    const amount1 = parseEther("1");
    const amount2 = parseEther("1");
    const {
      deployer,
      pool,
      aWETH,
      protocolDataProvider,
      users: [user0, user1],
    } = await loadFixture(fixture);

    const poolSigner = await DRE.ethers.getSigner(pool.address);
    const config = await protocolDataProvider.getReserveTokensAddresses(
      aWETH.address
    );
    const stableDebt = ATokenStableDebtToken__factory.connect(
      config.stableDebtTokenAddress,
      deployer.signer
    );
    await setAutomine(false);
    await stableDebt
      .connect(poolSigner)
      .mint(user0.address, user0.address, amount1, rate1);
    await setAutomine(true);
    await waitForTx(
      await stableDebt
        .connect(poolSigner)
        .mint(user1.address, user1.address, amount2, rate2)
    );

    let supplyData = await stableDebt.getSupplyData();
    almostEqual(supplyData[0], parseEther("1").mul(2));
    almostEqual(supplyData[1], parseEther("1").mul(2));
    almostEqual(supplyData[2], BigNumber.from(10).pow(25).mul(15));
    let user0Balance = await stableDebt.balanceOf(user0.address);
    let user1Balance = await stableDebt.balanceOf(user1.address);
    almostEqual(user0Balance, parseEther("1"));
    almostEqual(user1Balance, parseEther("1"));

    await increaseTime(60 * 60 * 24 * 365);
    supplyData = await stableDebt.getSupplyData();
    almostEqual(supplyData[0], parseEther("1").mul(2));
    almostEqual(supplyData[1], BigNumber.from("2323618618389325423"));
    almostEqual(supplyData[2], BigNumber.from(10).pow(25).mul(15));
    user0Balance = await stableDebt.balanceOf(user0.address);
    user1Balance = await stableDebt.balanceOf(user1.address);
    almostEqual(user0Balance, BigNumber.from("1105162046325274579"));
    almostEqual(user1Balance, BigNumber.from("1221332933560973813"));
    almostEqual(user0Balance.add(user1Balance), supplyData[1]);

    await aWETH.setIncomeIndex(BigNumber.from(10).pow(27).mul(2));
    supplyData = await stableDebt.getSupplyData();
    almostEqual(supplyData[0], parseEther("1").mul(4));
    almostEqual(supplyData[1], BigNumber.from("2323618618389325423").mul(2));
    almostEqual(supplyData[2], BigNumber.from(10).pow(25).mul(15));
    user0Balance = await stableDebt.balanceOf(user0.address);
    user1Balance = await stableDebt.balanceOf(user1.address);
    almostEqual(user0Balance, BigNumber.from("1105162046325274579").mul(2));
    almostEqual(user1Balance, BigNumber.from("1221332933560973813").mul(2));

    //burn user0's debt
    await waitForTx(
      await stableDebt.connect(poolSigner).burn(user0.address, user0Balance)
    );
    user0Balance = await stableDebt.balanceOf(user0.address);
    expect(user0Balance).to.be.lte(parseEther("0.0001"));

    //burn user1's debt
    await waitForTx(
      await stableDebt.connect(poolSigner).burn(user1.address, user1Balance)
    );
    supplyData = await stableDebt.getSupplyData();
    expect(supplyData[0]).to.be.eq(0);
    expect(supplyData[1]).to.be.eq(0);
    expect(supplyData[2]).to.be.eq(0);
    user0Balance = await stableDebt.balanceOf(user0.address);
    user1Balance = await stableDebt.balanceOf(user1.address);
    expect(user0Balance).to.be.lte(parseEther("0.0001"));
    expect(user1Balance).to.be.lte(parseEther("0.0001"));
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
    const {deployer, pool, aWETH, protocolDataProvider, users} =
      await loadFixture(fixture);

    const poolSigner = await DRE.ethers.getSigner(pool.address);
    const config = await protocolDataProvider.getReserveTokensAddresses(
      aWETH.address
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
    await waitForTx(
      await stableDebt
        .connect(poolSigner)
        .burn(users[1].address, totalSupplyAfterTime.sub(1))
    );
  });
});
