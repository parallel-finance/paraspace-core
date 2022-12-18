import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {ONE_YEAR} from "../helpers/constants";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";
import {advanceTimeAndBlock, waitForTx} from "../helpers/misc-utils";
import {ProtocolErrors} from "../helpers/types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {
  borrowAndValidate,
  supplyAndValidate,
  mintAndValidate,
} from "./helpers/validated-steps";

describe("Functionality tests of ERC721 supply in PoolCore contract", () => {
  it("TC-erc721-supply-01:User shouldn't supply ERC721 token when he didn't own it", async () => {
    const {
      users: [user1],
      bayc,
      pool,
    } = await loadFixture(testEnvFixture);

    await waitForTx(
      await bayc.connect(user1.signer).setApprovalForAll(pool.address, true)
    );
    await expect(
      pool
        .connect(user1.signer)
        .supplyERC721(
          bayc.address,
          [{tokenId: 0, useAsCollateral: false}],
          user1.address,
          "0"
        )
    ).to.be.revertedWith("ERC721: operator query for nonexistent token");
  });

  it("TC-erc721-supply-02:User shouldn't supply ERC721 token when he doesn't approve", async () => {
    const {
      users: [user1],
      bayc,
      pool,
    } = await loadFixture(testEnvFixture);

    await mintAndValidate(bayc, "1", user1);
    await expect(
      pool
        .connect(user1.signer)
        .supplyERC721(
          bayc.address,
          [{tokenId: 0, useAsCollateral: false}],
          user1.address,
          "0"
        )
    ).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
  });

  it("TC-erc721-supply-03:User shouldn't supply ERC721 tokens when part of tokens are not owned by him", async () => {
    const {
      users: [user1, user2],
      bayc,
      pool,
    } = await loadFixture(testEnvFixture);

    await waitForTx(
      await bayc.connect(user1.signer)["mint(address)"](user1.address)
    );
    await waitForTx(
      await bayc.connect(user2.signer)["mint(address)"](user2.address)
    );
    await waitForTx(
      await bayc.connect(user1.signer).setApprovalForAll(pool.address, true)
    );
    await waitForTx(
      await bayc.connect(user2.signer).setApprovalForAll(pool.address, true)
    );
    await expect(
      pool.connect(user1.signer).supplyERC721(
        bayc.address,
        [
          {tokenId: 0, useAsCollateral: false},
          {tokenId: 1, useAsCollateral: false},
        ],
        user1.address,
        "0"
      )
    ).to.be.revertedWith("ERC721: transfer from incorrect owner");
  });

  it("TC-erc721-supply-04:User should supply an owned ERC721 token", async () => {
    const {
      users: [user1],
      bayc,
    } = await loadFixture(testEnvFixture);

    await supplyAndValidate(bayc, "1", user1, true);
  });

  describe("Supplying behaviors when user has supplied before", () => {
    let testEnv: TestEnv;
    beforeEach(async () => {
      testEnv = await loadFixture(testEnvFixture);
      const {
        users: [user1],
        bayc,
      } = testEnv;

      await supplyAndValidate(bayc, "1", user1, true);
    });

    it("TC-erc721-supply-05:User shouldn't transfer non-existent nToken", async () => {
      const {
        nBAYC,
        users: [user1, user2],
      } = testEnv;

      await expect(
        nBAYC
          .connect(user1.signer)
          .transferFrom(user1.address, user2.address, 1)
      ).to.be.revertedWith("ERC721: operator query for nonexistent token");
    });

    it("TC-erc721-supply-06:User supplies same NFT again will reverted", async () => {
      const {
        users: [user1],
        bayc,
        pool,
      } = testEnv;

      await expect(
        pool
          .connect(user1.signer)
          .supplyERC721(
            bayc.address,
            [{tokenId: 0, useAsCollateral: false}],
            user1.address,
            "0"
          )
      ).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
    });

    it("TC-erc721-supply-07:User shouldn't borrow assets when he doesn't collateralize supplied ERC721", async () => {
      const {
        users: [user1],
        bayc,
        dai,
        pool,
      } = testEnv;

      await waitForTx(
        await pool
          .connect(user1.signer)
          .setUserUseERC721AsCollateral(bayc.address, [0], false)
      );
      await expect(
        pool
          .connect(user1.signer)
          .borrow(
            dai.address,
            await convertToCurrencyDecimals(dai.address, "100"),
            "0",
            user1.address,
            {
              gasLimit: 5000000,
            }
          )
      ).to.be.revertedWith(ProtocolErrors.COLLATERAL_BALANCE_IS_ZERO);
    });
  });

  describe("Borrowing behaviors when user has supplied asset before", () => {
    let testEnv: TestEnv;

    before(async () => {
      testEnv = await loadFixture(testEnvFixture);
      const {
        users: [user1, user2],
        bayc,
        dai,
      } = testEnv;

      const poolLiquidity = "10000";
      await supplyAndValidate(bayc, "1", user1, true);
      await supplyAndValidate(dai, poolLiquidity, user2, true);
    });

    it("TC-erc721-supply-08:User should borrow ERC20 token when he has enough borrow capacity", async () => {
      const {
        users: [user1],
        bayc,
        dai,
        pool,
      } = testEnv;

      const borrowDaiFirst = "1000";
      await waitForTx(
        await pool
          .connect(user1.signer)
          .setUserUseERC721AsCollateral(bayc.address, [0], true)
      );
      await borrowAndValidate(dai, borrowDaiFirst, user1);
    });

    it("TC-erc721-supply-09:User should borrow more ERC20 tokens when he has enough borrow capacity", async () => {
      const {
        users: [user1],
        dai,
      } = testEnv;

      const againBorrowAmount = "1000";
      await borrowAndValidate(dai, againBorrowAmount, user1);
    });

    it("TC-erc721-supply-10:User shouldn't borrow ERC20 tokens if his debt would be over borrow limit but his hf is over liquidation threshold", async () => {
      const {
        users: [user1],
        dai,
        pool,
        oracle,
      } = testEnv;

      const userGlobalData = await pool.getUserAccountData(user1.address);
      const daiPrice = await oracle.getAssetPrice(dai.address);
      const amountDAIToBorrow = await convertToCurrencyDecimals(
        dai.address,
        userGlobalData.availableBorrowsBase
          .div(daiPrice.toString())
          .add(10)
          // .percentMul(9500)
          .toString()
      );
      await expect(
        pool
          .connect(user1.signer)
          .borrow(dai.address, amountDAIToBorrow, "0", user1.address, {
            gasLimit: 5000000,
          })
      ).to.be.revertedWith(ProtocolErrors.COLLATERAL_CANNOT_COVER_NEW_BORROW);
    });

    it("TC-erc721-supply-11:User shouldn't borrow ERC20 tokens if his debt is over borrow limit and his hf is under liquidation threshold", async () => {
      const {
        users: [user1],
        dai,
        pool,
        oracle,
      } = testEnv;

      const userGlobalData = await pool.getUserAccountData(user1.address);
      const daiPrice = await oracle.getAssetPrice(dai.address);
      const currentLiquidationThreshold =
        userGlobalData.currentLiquidationThreshold;
      const availableBorrowsBase = userGlobalData.availableBorrowsBase;
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
      expect(amountDAIToBorrow).to.be.gt(availableBorrowsBase);
      await expect(
        pool
          .connect(user1.signer)
          .borrow(dai.address, amountDAIToBorrow, "0", user1.address, {
            gasLimit: 5000000,
          })
      ).to.be.revertedWith(ProtocolErrors.COLLATERAL_CANNOT_COVER_NEW_BORROW);
    });
  });

  it("TC-erc721-supply-12:User should supply multiple ERC721 tokens", async () => {
    const {
      users: [user1],
      doodles,
      mayc,
    } = await loadFixture(testEnvFixture);

    await supplyAndValidate(doodles, "1", user1, true);
    await supplyAndValidate(mayc, "1", user1, true);
  });

  it("TC-erc721-supply-13:User should supply many ERC721 tokens", async () => {
    const {
      users: [user1],
      mayc,
    } = await loadFixture(testEnvFixture);

    await supplyAndValidate(mayc, "3", user1, true);
  });

  it("TC-erc721-supply-14: ERC-721 health factor is the same over time if user has only a supplied position", async () => {
    const {
      users: [user1],
      pool,
      bayc,
    } = await loadFixture(testEnvFixture);

    // User 1 - Deposit BAYC
    await supplyAndValidate(bayc, "1", user1, true);

    const initialHealthFactor = (await pool.getUserAccountData(user1.address))
      .erc721HealthFactor;

    // Advance time and blocks
    await advanceTimeAndBlock(parseInt(ONE_YEAR) * 100);

    // health factor should remain the same
    expect(initialHealthFactor).to.eq(
      (await pool.getUserAccountData(user1.address)).erc721HealthFactor
    );
  });
});
