import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {parseEther, parseUnits} from "ethers/lib/utils";
import {deployETHWithdrawal} from "../helpers/contracts-deployments";
import {getCurrentTime} from "../helpers/contracts-helpers";
import {advanceTimeAndBlock, waitForTx} from "../helpers/misc-utils";
import {StakingProvider} from "../helpers/types";
import {testEnvFixture} from "./helpers/setup-env";
import {assertAlmostEqual} from "./helpers/validated-steps";

describe("ETH Withdrawal", async () => {
  const fixture = async () => {
    const testEnv = await loadFixture(testEnvFixture);
    testEnv.ethWithdrawal = await deployETHWithdrawal(
      "ETHWithdrawal",
      "ETHWithdrawal"
    );
    return testEnv;
  };

  it("TC-eth-withdrawal-01: ETH Withdrawal is ERC721 compatible", async () => {
    const {
      ethWithdrawal,
      users: [user1],
    } = await loadFixture(fixture);
    expect(
      await ethWithdrawal.connect(user1.signer).supportsInterface("0x80ac58cd")
    ).to.be.true;
  });

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
          0,
          1111,
          1111,
          parseEther("32"),
          gatewayAdmin.address,
          currentTime.add(30 * 24 * 3600),
          {gasLimit: 5000000}
        )
    );

    expect(
      await ethWithdrawal.connect(gatewayAdmin.signer).ownerOf("0")
    ).to.be.equal(gatewayAdmin.address);

    // (1 + 0.3 / 31536000) ** (30 * 24 * 3600) = 1.0249640452079391053
    // 32 / 1.0249640452079391053 = 31.220607346775773819

    assertAlmostEqual(
      await ethWithdrawal
        .connect(user1.signer)
        .getTokenPrice("0", parseUnits("0.3", 27)),
      "31220608193283710249"
    );

    await advanceTimeAndBlock(30 * 24 * 3600);

    expect(
      await ethWithdrawal
        .connect(user1.signer)
        .getTokenPrice("0", parseUnits("0.3", 27))
    ).to.be.equal(parseEther("32"));
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
          0,
          1111,
          1111,
          parseEther("32"),
          gatewayAdmin.address,
          currentTime.add(30 * 24 * 3600),
          {gasLimit: 5000000}
        )
    );

    expect(
      await ethWithdrawal.connect(gatewayAdmin.signer).ownerOf("0")
    ).to.be.equal(gatewayAdmin.address);

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
        .burn("0", gatewayAdmin.address)
    );
  });
});
