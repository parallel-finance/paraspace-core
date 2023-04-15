import {expect} from "chai";
import {TestEnv} from "./helpers/make-suite";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {
  getAggregator,
  getMockBendDaoLendPool,
} from "../helpers/contracts-getters";
import {waitForTx} from "../helpers/misc-utils";
import {
  changePriceAndValidate,
  mintAndValidate,
  supplyAndValidate,
} from "./helpers/validated-steps";
import {deployMintableERC721} from "../helpers/contracts-deployments";

describe("Pool: rescue tokens", () => {
  let testEnv: TestEnv;
  let bendDaoLendPool;

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {
      users: [user1, user2],
      bayc,
      pool,
    } = testEnv;

    bendDaoLendPool = await getMockBendDaoLendPool();

    await mintAndValidate(bayc, "5", user1);
    await bayc
      .connect(user1.signer)
      .transferFrom(user1.address, user2.address, 2);
    await waitForTx(
      await bayc.connect(user1.signer).setApprovalForAll(pool.address, true)
    );

    await waitForTx(
      await bayc
        .connect(user1.signer)
        .setApprovalForAll(bendDaoLendPool.address, true)
    );
    await waitForTx(
      await bayc.connect(user2.signer).setApprovalForAll(pool.address, true)
    );

    await waitForTx(
      await bayc
        .connect(user2.signer)
        .setApprovalForAll(bendDaoLendPool.address, true)
    );
  });

  it("moving position should fail if there's no enough WETH in the protocol", async () => {
    const {
      users: [user1],
      bayc,
      pool,
    } = testEnv;
    await bendDaoLendPool.setLoan(
      1,
      bayc.address,
      1,
      user1.address,
      "200000",
      2
    );

    await expect(pool.connect(user1.signer).movePositionFromBendDAO([1])).to.be
      .reverted;
  });

  it("moving position should succeed for an active loan", async () => {
    const {
      users: [user1],
      pool,
      weth,
      variableDebtWeth,
      nBAYC,
    } = testEnv;
    await supplyAndValidate(weth, "20000000000", user1, true);

    await expect(await pool.connect(user1.signer).movePositionFromBendDAO([1]));

    await expect(await variableDebtWeth.balanceOf(user1.address)).to.be.eq(
      "200000"
    );
    await expect(await nBAYC.balanceOf(user1.address)).to.be.eq(1);
  });

  it("moving position should fail for a non-active loan", async () => {
    const {
      users: [user1],
      pool,
    } = testEnv;

    await expect(
      pool.connect(user1.signer).movePositionFromBendDAO([1])
    ).to.be.revertedWith("Loan not active");
  });

  it("moving position should fail when user HF < 1 after moving the position", async () => {
    const {
      users: [, user2],
      bayc,
      pool,
    } = testEnv;

    await bendDaoLendPool.setLoan(
      2,
      bayc.address,
      2,
      user2.address,
      "200000",
      2
    );

    const agg = await getAggregator(undefined, await bayc.symbol());
    await agg.updateLatestAnswer("100000");

    await expect(pool.connect(user2.signer).movePositionFromBendDAO([2])).to.be
      .reverted;

    await changePriceAndValidate(bayc, "50");
  });

  it("moving position should fail when sender is not the owner of the position", async () => {
    const {
      users: [user1, user2],
      bayc,
      pool,
    } = testEnv;

    await bendDaoLendPool.setLoan(
      3,
      bayc.address,
      0,
      user1.address,
      "200000",
      2
    );

    await expect(pool.connect(user2.signer).movePositionFromBendDAO([3])).to.be
      .reverted;
  });

  it("moving position should fail if the asset is not supported", async () => {
    const {
      users: [user1],
      pool,
    } = testEnv;

    const randomAsset = await deployMintableERC721(["test", "test", "0"]);

    await randomAsset["mint(address)"](user1.address);
    await waitForTx(
      await randomAsset
        .connect(user1.signer)
        .setApprovalForAll(pool.address, true)
    );

    await waitForTx(
      await randomAsset
        .connect(user1.signer)
        .setApprovalForAll(bendDaoLendPool.address, true)
    );
    await bendDaoLendPool.setLoan(
      4,
      randomAsset.address,
      0,
      user1.address,
      "200000",
      2
    );

    await expect(pool.connect(user1.signer).movePositionFromBendDAO([4])).to.be
      .reverted;
  });

  it("moving multiple positions should succeed for active loans", async () => {
    const {
      users: [user1],
      pool,
      bayc,
      variableDebtWeth,
      nBAYC,
    } = testEnv;
    await bendDaoLendPool.setLoan(
      4,
      bayc.address,
      4,
      user1.address,
      "200000",
      2
    );

    await expect(
      await pool.connect(user1.signer).movePositionFromBendDAO([3, 4])
    );

    await expect(await variableDebtWeth.balanceOf(user1.address)).to.be.eq(
      "600000"
    );
    await expect(await nBAYC.balanceOf(user1.address)).to.be.eq(3);
  });
});
