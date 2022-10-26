import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {waitForTx} from "../deploy/helpers/misc-utils";
import {ProtocolErrors} from "../deploy/helpers/types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {
  borrowAndValidate,
  supplyAndValidate,
  mintAndValidate,
} from "./helpers/validated-steps";
import {MintableERC721} from "../types";

describe("erc721 as pool_core supply unit case", () => {
  it("TC-erc721-supply-01:User1 supply ERC-721 Not mint nor approve will reverted", async () => {
    const {
      users: [user3],
      bayc,
      pool,
    } = await loadFixture(testEnvFixture);

    await expect(
      pool
        .connect(user3.signer)
        .supplyERC721(
          bayc.address,
          [{tokenId: 0, useAsCollateral: false}],
          user3.address,
          "0"
        )
    ).to.be.revertedWith("ERC721: operator query for nonexistent token");
  });

  it("TC-erc721-supply-02:User1 supply Not approved before ERC-721 will reverted", async () => {
    const {
      users: [user1],
      bayc,
    } = await loadFixture(testEnvFixture);

    await expect(supplyAndValidate(bayc, "1", user1, false)).to.be.revertedWith(
      "ERC721: operator query for nonexistent token"
    );
  });

  it("TC-erc721-supply-03:User1 supply ERC-721 Not mint will reverted", async () => {
    const {
      users: [user1],
      bayc,
      pool,
    } = await loadFixture(testEnvFixture);

    await waitForTx(
      await (bayc as MintableERC721)
        .connect(user1.signer)
        .setApprovalForAll(pool.address, true)
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

  it("TC-erc721-supply-04:User1 supply no existing tokenId will reverted", async () => {
    const tokenId = 78997;
    const {
      users: [user1],
      bayc,
      pool,
    } = await loadFixture(testEnvFixture);

    await expect(
      pool
        .connect(user1.signer)
        .supplyERC721(
          bayc.address,
          [{tokenId: tokenId, useAsCollateral: false}],
          user1.address,
          "0"
        )
    ).to.be.revertedWith("ERC721: operator query for nonexistent token");
  });

  it("TC-erc721-supply-05::User1 supply multiple ERC-721s, some owned, some non-existent will reverted", async () => {
    const {
      users: [user1],
      bayc,
      pool,
    } = await loadFixture(testEnvFixture);

    await mintAndValidate(bayc, "2", user1);
    await expect(
      pool.connect(user1.signer).supplyERC721(
        bayc.address,
        [
          {tokenId: 0, useAsCollateral: false},
          {tokenId: 1, useAsCollateral: false},
          {tokenId: 2, useAsCollateral: false},
        ],
        user1.address,
        "0"
      )
    ).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
  });

  it("TC-erc721-supply-06:User1 supplies an owned ERC-721 will succeed", async () => {
    const {
      users: [user1],
      bayc,
    } = await loadFixture(testEnvFixture);

    await supplyAndValidate(bayc, "1", user1, true);
  });

  describe("User who have supplied assets supplies", () => {
    let testEnv: TestEnv;
    beforeEach(async () => {
      testEnv = await loadFixture(testEnvFixture);
      const {
        users: [user1],
        bayc,
      } = testEnv;

      await supplyAndValidate(bayc, "1", user1, true);
    });
    it("TC-erc721-supply-07:User1 transfers the supplied nToken will reverted", async () => {
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

    it("TC-erc721-supply-08:User1 supplies same NFT again will reverted", async () => {
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

    it("TC-erc721-supply-09:User1 who supplied non-collateralized NFT borrows failed", async () => {
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
      // approve bayc
      await waitForTx(
        await (bayc as MintableERC721)
          .connect(user1.signer)
          .setApprovalForAll(pool.address, true)
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

  describe("User who supplied asset borrows ERC20 tokens", () => {
    let testEnv: TestEnv;

    before("User supplies some assets as collateral", async () => {
      testEnv = await loadFixture(testEnvFixture);
      const {
        users: [user1],
        bayc,
      } = testEnv;

      await supplyAndValidate(bayc, "1", user1, true);
    });

    it("TC-erc721-supply-10:User1 borrow 1K Dai (User2 deposits 10k add liquidity) will success", async () => {
      const {
        users: [user1, user2],
        dai,
        bayc,
        pool,
      } = testEnv;

      const supplyDaiUser2 = "10000";
      const borrowDaiFirst = "1000";

      await waitForTx(
        await pool
          .connect(user1.signer)
          .setUserUseERC721AsCollateral(bayc.address, [0], true)
      );
      //add liquidaty
      await supplyAndValidate(dai, supplyDaiUser2, user2, true);
      await borrowAndValidate(dai, borrowDaiFirst, user1);
    });

    it("TC-erc721-supply-11:User1 has debt in case the Borrow again is less than the borrow limit of ERC-20 will success", async () => {
      const {
        users: [user1],
        dai,
      } = testEnv;

      const againBorrowAmount = "1000";
      await borrowAndValidate(dai, againBorrowAmount, user1);
    });

    it("TC-erc721-supply-12:User1 borrow amount is greater than its borrow limit and does not reach the clearing line will reverted", async () => {
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
          .add(await convertToCurrencyDecimals(dai.address, "10"))
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

    it("TC-erc721-supply-13:User1 borrow amount is greater than its borrow limit and reaches the clearing line will reverted", async () => {
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
      const totalCollateralBase = userGlobalData.totalCollateralBase;
      const amountDAIToBorrow = await convertToCurrencyDecimals(
        dai.address,
        currentLiquidationThreshold
          .mul(totalCollateralBase)
          .div(daiPrice.toString())
          .add(await convertToCurrencyDecimals(dai.address, "10"))
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
  });

  it("TC-erc721-supply-15:User3 supply multiple types of ERC-721 will success", async () => {
    const {
      users: [, , user3],
      doodles,
      mayc,
    } = await loadFixture(testEnvFixture);

    await supplyAndValidate(doodles, "1", user3, true);
    await supplyAndValidate(mayc, "1", user3, true);
  });

  it("TC-erc721-supply-16:User3 supply any ERC-721s and will success", async () => {
    const {
      users: [, , user3],
      mayc,
    } = await loadFixture(testEnvFixture);

    await supplyAndValidate(mayc, "3", user3, true);
  });

  it("TC-erc721-supply-17:User3 supply more than multiple ERC-721s at one time will success", async () => {
    const {
      users: [, , user3],
      mayc,
    } = await loadFixture(testEnvFixture);

    await supplyAndValidate(mayc, "100", user3, true);
  });
});
