import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {waitForTx} from "../deploy/helpers/misc-utils";
import {ProtocolErrors} from "../deploy/helpers/types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {
  supplyAndValidate,
  borrowAndValidate,
  withdrawAndValidate,
} from "./helpers/validated-steps";

//FIXME(alan): "Functionality tests of ERC721 withdrawal in PoolCore contract"
describe("erc721 as pool_core withdraw unit case", () => {
  //FIXME(alan): "User1 shouldn't withdraw a ERC721 token that hasn't been supplied by him"
  it("TC-erc721-withdraw-01:User1 has no supply directly withdraw ERC-721 [not mint] will reverted", async () => {
    const {
      users: [user1],
      bayc,
    } = await loadFixture(testEnvFixture);
    await expect(withdrawAndValidate(bayc, "1", user1, 0)).to.be.revertedWith(
      "not the owner of Ntoken"
    );
  });

  //FIXME(alan): "User1 should withdraw with empty token list"
  it("TC-erc721-withdraw-02:User1 withdraw tokenId empty ERC-721 will success", async () => {
    const {
      users: [user1],
      pool,
      bayc,
    } = await loadFixture(testEnvFixture);
    await waitForTx(
      await pool
        .connect(user1.signer)
        .withdrawERC721(bayc.address, [], user1.address)
    );
  });

  //TODO(alan): This case is same as TC-erc721-withdraw-01
  it("TC-erc721-withdraw-03:User1 withdraw non-existent tokenId will reverted", async () => {
    const {
      users: [user1],
      pool,
      bayc,
    } = await loadFixture(testEnvFixture);
    await expect(
      pool
        .connect(user1.signer)
        .withdrawERC721(bayc.address, [999914], user1.address)
    ).to.be.revertedWith("not the owner of Ntoken");
  });

  //FIXME(alan): What's this test meaning?
  it("TC-erc721-withdraw-04:User1 withdraw ERC-721 address Input a string will reverted", async () => {
    const {
      users: [user1],
      pool,
    } = await loadFixture(testEnvFixture);
    await expect(
      pool
        .connect(user1.signer)
        .withdrawERC721(
          "0x60E4d786628Fea6478F785A6d7e704777c86a7c6",
          [],
          user1.address
        )
    ).to.be.revertedWith(
      "Transaction reverted: function returned an unexpected amount of data"
    );
  });

  //FIXME(alan): "User shouldn't withdraw ERC721 when the address provided doesn't Implement IERC721"
  it("TC-erc721-withdraw-05:User1 withdraw ERC721 address is incorrect (dai.address) will reverted", async () => {
    const {
      users: [user1],
      pool,
      dai,
    } = await loadFixture(testEnvFixture);
    await expect(
      pool.connect(user1.signer).withdrawERC721(dai.address, [], user1.address)
    ).to.be.revertedWith(ProtocolErrors.INVALID_ASSET_TYPE);
  });

  //FIXME(alan): "User1 who doesn't have debt should withdraw his ERC-721 collateral"
  it("TC-erc721-withdraw-06:User1 withdraw Collateral opened ERC-721 without debt will success", async () => {
    const {
      users: [user1],
      bayc,
      pool,
    } = await loadFixture(testEnvFixture);

    // Collateralize asset supplied in first time is by default.
    await supplyAndValidate(bayc, "1", user1, true);
    await waitForTx(
      await pool
        .connect(user1.signer)
        .withdrawERC721(bayc.address, [0], user1.address)
    );
  });

  it("TC-erc721-withdraw-07:User1 withdraw the deposited ERC-721 will success", async () => {
    const {
      users: [user1],
      bayc,
      pool,
    } = await loadFixture(testEnvFixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await waitForTx(
      await pool
        .connect(user1.signer)
        .setUserUseERC721AsCollateral(bayc.address, [0], false)
    );
    await withdrawAndValidate(bayc, "1", user1, 0);
  });

  it("TC-erc721-withdraw-08:User1 withdraw multiple ERC-721s at once will success", async () => {
    const {
      users: [user1],
      pool,
      bayc,
    } = await loadFixture(testEnvFixture);

    await supplyAndValidate(bayc, "3", user1, true);
    // await withdrawAndValidate(bayc,"3",user1);
    await waitForTx(
      await pool
        .connect(user1.signer)
        .withdrawERC721(bayc.address, [0, 1, 2], user1.address)
    );
    const userGlobalData = await pool.getUserAccountData(user1.address);
    expect(userGlobalData.availableBorrowsBase).to.be.eq(0);
  });

  it("TC-erc721-withdraw-09:User1 withdraw different types of ERC-721 will success", async () => {
    const {
      users: [user1],
      bayc,
      mayc,
      pool,
    } = await loadFixture(testEnvFixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(mayc, "1", user1, true);
    await waitForTx(
      await pool
        .connect(user1.signer)
        .withdrawERC721(bayc.address, [0], user1.address)
    );
    await waitForTx(
      await pool
        .connect(user1.signer)
        .withdrawERC721(mayc.address, [0], user1.address)
    );
  });

  describe("User1 withdraws ERC-721 when has enough collaterals", () => {
    let testEnv: TestEnv;
    before(async () => {
      testEnv = await loadFixture(testEnvFixture);
    });

    //FIXME(alan): "User1 shouldn't withdraw ERC721 if his HF would be lower than liquidation threshold"
    it("TC-erc721-withdraw-10:User1 draws ERC-721 from collateral in case of debt will reverted", async () => {
      const {
        users: [user1, user2],
        bayc,
        dai,
        pool,
      } = testEnv;

      await supplyAndValidate(bayc, "1", user1, true);
      await supplyAndValidate(dai, "999999", user2, true);
      await borrowAndValidate(dai, "1000", user1);
      await expect(
        pool
          .connect(user1.signer)
          .withdrawERC721(bayc.address, [0], user1.address)
      ).to.be.revertedWith(
        ProtocolErrors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
      );
    });

    //FIXME(alan): "User1 shouldn't redeem ERC721 collateral if his HF would be lower that liquidation threshold"
    it("TC-erc721-withdraw-11:User1 closes ERC-721 collateral in case of debt will reverted will reverted", async () => {
      const {
        bayc,
        users: [user1],
        pool,
      } = testEnv;

      await expect(
        pool
          .connect(user1.signer)
          .setUserUseERC721AsCollateral(bayc.address, [0], false)
      ).to.be.revertedWith(
        ProtocolErrors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
      );
    });

    //FIXME(alan): "User1 should redeem ERC721 collateral if his collateral were still enough"
    it("TC-erc721-withdraw-12:User1 supplies enough ERC-20(20K) in the collateral to withdraw ERC-721 from the collateral will success", async () => {
      const {
        dai,
        users: [user1],
        pool,
        bayc,
      } = testEnv;

      await supplyAndValidate(dai, "200000", user1, true);
      await pool
        .connect(user1.signer)
        .setUserUseERC721AsCollateral(bayc.address, [0], false);
      await withdrawAndValidate(bayc, "1", user1, 0);
    });

    //FIXME(alan): "User1 shouldn't redeem ERC20 collateral after ERC721 collateral redeemed and his debt should be kept"
    it("TC-erc721-withdraw-13:User 1 tries to remove the deposited DAI from collateral without paying the accrued interest will reverted", async () => {
      const {
        dai,
        users: [user1],
        pool,
      } = testEnv;

      await expect(
        pool
          .connect(user1.signer)
          .setUserUseERC20AsCollateral(dai.address, false)
      ).to.be.revertedWith(
        ProtocolErrors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
      );

      // TODO(alan): trace user's debt and ensure it not changed. Or modify description if we don't do that.
    });
  });

  //FIXME(alan): It seems like overlapped with TC-erc721-withdraw--13
  it("TC-erc721-withdraw-14:User1 supply erc20 and erc721,borrow and withdraw erc721 will success (borrow<erc20*ltv) will success", async () => {
    const {
      users: [user1],
      bayc,
      dai,
      pool,
    } = await loadFixture(testEnvFixture);

    const supplyDaiUser1 = "10000";
    const borrowDaiFirst = "1000";
    await supplyAndValidate(dai, supplyDaiUser1, user1, true);
    await supplyAndValidate(bayc, "1", user1, true);
    await borrowAndValidate(dai, borrowDaiFirst, user1);
    await waitForTx(
      await pool
        .connect(user1.signer)
        .setUserUseERC721AsCollateral(bayc.address, [0], false)
    );
    await withdrawAndValidate(bayc, "1", user1, 0);
  });

  it("TC-erc721-withdraw-15:User1 supply erc20 and erc721,borrow and withdraw erc721 will success (borrow>erc20*ltv) will success", async () => {
    const {
      users: [user1, user2],
      bayc,
      dai,
      pool,
    } = await loadFixture(testEnvFixture);

    const supplyDaiUser2 = "999999";
    const supplyDaiUser1 = "10000";
    const borrowDaiFirst = "7500";
    await supplyAndValidate(dai, supplyDaiUser2, user2, true);
    await supplyAndValidate(dai, supplyDaiUser1, user1, true);
    await supplyAndValidate(bayc, "1", user1, true);
    await borrowAndValidate(dai, borrowDaiFirst, user1);
    await waitForTx(
      await pool
        .connect(user1.signer)
        .setUserUseERC721AsCollateral(bayc.address, [0], false)
    );
    await withdrawAndValidate(bayc, "1", user1, 0);
    expect(0).to.be.eq(
      (await pool.getUserAccountData(user1.address)).availableBorrowsBase
    );
  });

  //FIXME(alan): "User1 supply erc20 and erc721,borrow and withdraw erc721 will success (borrow>erc20*ltv) will reverted"
  it("TC-erc721-withdraw-16:User1 supply erc20 and erc721,borrow and withdraw erc721 will success (borrow>lqt.point) will reverted", async () => {
    const {
      users: [user1, user2],
      bayc,
      dai,
      pool,
    } = await loadFixture(testEnvFixture);

    const supplyDaiUser2 = "999999";
    const supplyDaiUser1 = "10000";
    const borrowDaiFirst = "10000";
    await supplyAndValidate(dai, supplyDaiUser2, user2, true);
    await supplyAndValidate(dai, supplyDaiUser1, user1, true);
    await supplyAndValidate(bayc, "1", user1, true);
    await borrowAndValidate(dai, borrowDaiFirst, user1);
    await expect(
      pool
        .connect(user1.signer)
        .setUserUseERC721AsCollateral(bayc.address, [0], false)
    ).to.be.revertedWith(
      ProtocolErrors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
    );
  });
});
