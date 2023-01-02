import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {waitForTx} from "../helpers/misc-utils";
import {ProtocolErrors} from "../helpers/types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {
  supplyAndValidate,
  borrowAndValidate,
  withdrawAndValidate,
} from "./helpers/validated-steps";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";

describe("Functionality tests of ERC721 withdraw in PoolCore contract", () => {
  it("TC-erc721-withdraw-01:User shouldn't withdraw a ERC721 token that hasn't been supplied by him", async () => {
    const {
      users: [user1],
      bayc,
    } = await loadFixture(testEnvFixture);

    await expect(withdrawAndValidate(bayc, "1", user1, 0)).to.be.revertedWith(
      "not the owner of Ntoken"
    );
  });

  it("TC-erc721-withdraw-02:User should withdraw with empty ERC721 token list", async () => {
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

  it("TC-erc721-withdraw-04:User shouldn't withdraw ERC721 when the address provided doesn't Implement ERC721", async () => {
    const {
      users: [user1],
      pool,
      dai,
    } = await loadFixture(testEnvFixture);

    await expect(
      pool.connect(user1.signer).withdrawERC721(dai.address, [], user1.address)
    ).to.be.revertedWith(ProtocolErrors.INVALID_ASSET_TYPE);
  });

  it("TC-erc721-withdraw-05:User should withdraw his ERC721 when he doesn't have debt", async () => {
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

  it("TC-erc721-withdraw-06:User with no debt should be able to withdraw multiple ERC721 collateral at once", async () => {
    const {
      users: [user1],
      pool,
      bayc,
    } = await loadFixture(testEnvFixture);

    await supplyAndValidate(bayc, "3", user1, true);
    const userGlobalDataBefore = await pool.getUserAccountData(user1.address);
    await waitForTx(
      await pool
        .connect(user1.signer)
        .withdrawERC721(bayc.address, [0, 1, 2], user1.address)
    );
    const userGlobalDataAfter = await pool.getUserAccountData(user1.address);
    expect(
      userGlobalDataBefore.availableBorrowsBase.sub(
        userGlobalDataAfter.availableBorrowsBase
      )
    ).to.be.eq(userGlobalDataBefore.availableBorrowsBase);
  });

  it("TC-erc721-withdraw-07:User with no debt should be able to withdraw various ERC721 collateral", async () => {
    const {
      users: [user1],
      bayc,
      mayc,
      pool,
    } = await loadFixture(testEnvFixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(mayc, "1", user1, true);
    const userGlobalDataBefore = await pool.getUserAccountData(user1.address);
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
    const userGlobalDataAfter = await pool.getUserAccountData(user1.address);
    expect(
      userGlobalDataBefore.availableBorrowsBase.sub(
        userGlobalDataAfter.availableBorrowsBase
      )
    ).to.be.eq(userGlobalDataBefore.availableBorrowsBase);
  });

  describe("User withdraws ERC721 when has enough collaterals", () => {
    let testEnv: TestEnv;
    before(async () => {
      testEnv = await loadFixture(testEnvFixture);
    });

    it("TC-erc721-withdraw-08:User shouldn't withdraw ERC721 if his HF would be lower than liquidation threshold", async () => {
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

    it("TC-erc721-withdraw-09:User shouldn't redeem ERC721 collateral if his HF would be lower that liquidation threshold", async () => {
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

    it("TC-erc721-withdraw-10:User should withdraw ERC721 collateral if his collateral were still enough", async () => {
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

    it("TC-erc721-withdraw-11:User shouldn't withdraw ERC20 collateral after ERC721 collateral redeemed and his debt should be kept", async () => {
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
    });
  });

  it("TC-erc721-withdraw-12:User should withdraw ERC721 when he has debts (borrowed >ERC20*ltv)", async () => {
    const {
      users: [user1, user2],
      bayc,
      dai,
      pool,
      oracle,
    } = await loadFixture(testEnvFixture);

    const supplyDaiUser2 = "999999";
    const supplyDaiUser1 = "10000";
    await supplyAndValidate(dai, supplyDaiUser2, user2, true);
    await supplyAndValidate(dai, supplyDaiUser1, user1, true);
    const userGlobalData = await pool.getUserAccountData(user1.address);
    const daiPrice = await oracle.getAssetPrice(dai.address);
    const ltv = userGlobalData.ltv;
    const totalCollateralBase = userGlobalData.totalCollateralBase;
    const amountDAIToBorrow = await convertToCurrencyDecimals(
      dai.address,
      totalCollateralBase
        .mul(ltv)
        .div(10000)
        .div(daiPrice.toString())
        .add(10)
        // .percentMul(9500)
        .toString()
    );
    await supplyAndValidate(bayc, "1", user1, true);
    await waitForTx(
      await pool
        .connect(user1.signer)
        .borrow(dai.address, amountDAIToBorrow, "0", user1.address, {
          gasLimit: 5000000,
        })
    );
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

  it("TC-erc721-withdraw-13:User should not withdraw ERC721 which would result in hf<1", async () => {
    const {
      users: [user1, user2],
      bayc,
      dai,
      pool,
      oracle,
    } = await loadFixture(testEnvFixture);

    const supplyDaiUser2 = "999999";
    const supplyDaiUser1 = "10000";
    await supplyAndValidate(dai, supplyDaiUser2, user2, true);
    await supplyAndValidate(dai, supplyDaiUser1, user1, true);
    const userGlobalData = await pool.getUserAccountData(user1.address);
    const daiPrice = await oracle.getAssetPrice(dai.address);
    const currentLiquidationThreshold =
      userGlobalData.currentLiquidationThreshold;
    const totalCollateralBase = userGlobalData.totalCollateralBase;
    const amountDAIToBorrow = await convertToCurrencyDecimals(
      dai.address,
      totalCollateralBase
        .mul(currentLiquidationThreshold)
        .div(10000)
        .div(daiPrice.toString())
        .add(10)
        // .percentMul(9500)
        .toString()
    );
    await supplyAndValidate(bayc, "1", user1, true);
    await waitForTx(
      await pool
        .connect(user1.signer)
        .borrow(dai.address, amountDAIToBorrow, "0", user1.address, {
          gasLimit: 5000000,
        })
    );
    await expect(
      pool
        .connect(user1.signer)
        .setUserUseERC721AsCollateral(bayc.address, [0], false)
    ).to.be.revertedWith(
      ProtocolErrors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
    );
  });
});

//TODO(alan): update test case sheet
// describe("user can withdraw un-collateralized nft when hf < 1", () => {
//   let testEnv: TestEnv;
//   before(async () => {
//     testEnv = await loadFixture(testEnvFixture);
//   });
//
//   it("User deposits 2 BAYC, only 1 collateralized", async () => {
//     const {
//       users: [user1],
//       bayc,
//       pool,
//     } = testEnv;
//
//     await supplyAndValidate(bayc, "2", user1, true);
//     await waitForTx(
//       await pool
//         .connect(user1.signer)
//         .setUserUseERC721AsCollateral(bayc.address, [1], false)
//     );
//   });
//
//   it("User 2 deposits 100 ETH and User 1 borrows 30 ETH", async () => {
//     const {
//       users: [user1, user2],
//       weth,
//       bayc,
//     } = testEnv;
//
//     await supplyAndValidate(weth, "100", user2, true);
//     await changePriceAndValidate(bayc, "100");
//     await borrowAndValidate(weth, "30", user1);
//   });
//
//   it("change bayc price and make user1's hf < 1", async () => {
//     const {
//       users: [user1],
//       bayc,
//       pool,
//     } = testEnv;
//
//     await changePriceAndValidate(bayc, "10");
//     const user1Data = await pool.getUserAccountData(user1.address);
//     expect(user1Data.healthFactor).to.lt("1000000000000000000");
//   });
//
//   it("User 1 tries to withdraw the collateralized BAYC (should fail)", async () => {
//     const {
//       bayc,
//       users: [user1],
//       pool,
//     } = testEnv;
//
//     await expect(
//       pool
//         .connect(user1.signer)
//         .withdrawERC721(bayc.address, [0], user1.address)
//     ).to.be.revertedWith(
//       ProtocolErrors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
//     );
//   });
//
//   it("User 1 tries to withdraw the un-collateralized BAYC (should success)", async () => {
//     const {
//       bayc,
//       users: [user1],
//       pool,
//     } = testEnv;
//
//     await waitForTx(
//       await pool
//         .connect(user1.signer)
//         .withdrawERC721(bayc.address, [1], user1.address)
//     );
//   });
// });
