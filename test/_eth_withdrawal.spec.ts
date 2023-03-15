import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {parseEther, parseUnits} from "ethers/lib/utils";
import {
  deployETHValidatorStakingStrategy,
  deployETHWithdrawal,
} from "../helpers/contracts-deployments";
import {getCurrentTime} from "../helpers/contracts-helpers";
import {advanceTimeAndBlock, DRE, waitForTx} from "../helpers/misc-utils";
import {StakingProvider} from "../helpers/types";
import {testEnvFixture} from "./helpers/setup-env";
import {assertAlmostEqual} from "./helpers/validated-steps";

describe("ETH Withdrawal", async () => {
  const fixture = async () => {
    const testEnv = await loadFixture(testEnvFixture);
    const {gatewayAdmin} = testEnv;
    testEnv.ethWithdrawal = await deployETHWithdrawal("ETHWithdrawal");
    const validatorStrategy = await deployETHValidatorStakingStrategy(
      "0",
      "0",
      "0"
    );

    await testEnv.ethWithdrawal
      .connect(gatewayAdmin.signer)
      .setProviderStrategyAddress(0, validatorStrategy.address);
    return testEnv;
  };

  it("TC-eth-withdrawal-02: Check we can mint ETH withdrawal NFT", async () => {
    const {
      ethWithdrawal,
      gatewayAdmin,
      users: [user1],
    } = await loadFixture(fixture);
    const currentTime = await getCurrentTime();
    await waitForTx(
      await ethWithdrawal
        .connect(gatewayAdmin.signer)
        .mint(
          StakingProvider.Validator,
          "1111",
          "1111",
          parseEther("32").toString(),
          gatewayAdmin.address,
          currentTime.add(30 * 24 * 3600)
        )
    );

    expect(
      await ethWithdrawal
        .connect(gatewayAdmin.signer)
        .balanceOf(gatewayAdmin.address, "0")
    ).eq(parseEther("32"));

    // (1 + 0.3 / 31536000) ** (30 * 24 * 3600) = 1.0249640452079391053
    // 32 / 1.0249640452079391053 = 31.220607346775773819

    const {price, discountRate} = await ethWithdrawal
      .connect(user1.signer)
      .getPresentValueAndDiscountRate("0", 5000, parseUnits("0.3", 27));

    assertAlmostEqual(price, "15610304096641855125");
    assertAlmostEqual(discountRate, parseUnits("0.3", 27));

    await advanceTimeAndBlock(30 * 24 * 3600);

    expect(
      (
        await ethWithdrawal
          .connect(user1.signer)
          .getPresentValueAndDiscountRate("0", 5000, parseUnits("0.3", 27))
      ).price
    ).to.be.equal(parseEther("16"));
  });

  it("TC-eth-withdrawal-03: Check we can burn ETH withdrawal NFT", async () => {
    const {
      ethWithdrawal,
      gatewayAdmin,
      users: [user1],
    } = await loadFixture(fixture);
    const currentTime = await getCurrentTime();
    await waitForTx(
      await ethWithdrawal
        .connect(gatewayAdmin.signer)
        .mint(
          StakingProvider.Validator,
          1111,
          1111,
          parseEther("32"),
          gatewayAdmin.address,
          currentTime.add(30 * 24 * 3600),
          {gasLimit: 5000000}
        )
    );

    expect(
      await ethWithdrawal
        .connect(gatewayAdmin.signer)
        .balanceOf(gatewayAdmin.address, "0")
    ).to.be.equal(10000);

    await advanceTimeAndBlock(30 * 24 * 3600);

    await waitForTx(
      await user1.signer.sendTransaction({
        to: ethWithdrawal.address,
        value: parseEther("32"),
      })
    );

    await waitForTx(
      await ethWithdrawal
        .connect(gatewayAdmin.signer)
        .burn("0", gatewayAdmin.address, 10000)
    );

    expect(
      await DRE.ethers.provider.getBalance(ethWithdrawal.address)
    ).to.be.equal(0);
  });
});
