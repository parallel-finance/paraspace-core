import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {BigNumber} from "ethers";
import {MAX_UINT_AMOUNT} from "../deploy/helpers/constants";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {waitForTx} from "../deploy/helpers/misc-utils";
import {ProtocolErrors} from "../deploy/helpers/types";
import {MOCK_CHAINLINK_AGGREGATORS_PRICES} from "../deploy/market-config";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {
  borrowAndValidate,
  supplyAndValidate,
  switchCollateralAndValidate,
  withdrawAndValidate,
  mintAndValidate,
} from "./helpers/validated-steps";
import {MintableERC20, MintableERC721} from "../types";

describe("nToken Mint and Burn Event Accounting", () => {
  const firstDaiDeposit = "10000";
  const secondDaiDeposit = "20000";
  let testEnv: TestEnv;
  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
  });
  const fixture = async () => {
    const testEnv = await loadFixture(testEnvFixture);
    return testEnv;
  };

  BigNumber.from(MOCK_CHAINLINK_AGGREGATORS_PRICES.BAYC);

  it("User 1 deposits BAYC", async () => {
    const {
      users: [user1],
      bayc,
    } = testEnv;

    await supplyAndValidate(bayc, "1", user1, true);
  });

  it("User 2 deposits 10k DAI and User 1 borrows 8K DAI", async () => {
    const {
      users: [user1, user2],
      dai,
    } = testEnv;

    await supplyAndValidate(dai, firstDaiDeposit, user2, true);

    // User 1 - Borrow dai
    await borrowAndValidate(dai, "8000", user1);
  });

  it("User 1 tries to withdraw the deposited BAYC without paying the accrued interest (should fail)", async () => {
    const {
      bayc,
      users: [user1],
      pool,
    } = testEnv;

    await expect(
      pool
        .connect(user1.signer)
        .withdrawERC721(bayc.address, [0], user1.address)
    ).to.be.revertedWith(
      ProtocolErrors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
    );
  });

  it("User 1 tries to remove the deposited BAYC from collateral without paying the accrued interest (should fail)", async () => {
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

  it("User 1 tries to send the nToken to User 2 (should fail)", async () => {
    const {
      nBAYC,
      users: [user1, user2],
    } = testEnv;

    await expect(
      nBAYC.connect(user1.signer).transferFrom(user1.address, user2.address, 1)
    ).to.be.revertedWith("ERC721: operator query for nonexistent token");
  });

  it("User 1 adds 20K dai as collateral and then removes their BAYC from collateral without paying the accrued interest", async () => {
    const {
      dai,
      users: [user1],
      pool,
      bayc,
    } = testEnv;

    // User 1 - Mints 20k dai
    await waitForTx(
      await dai
        .connect(user1.signer)
        ["mint(uint256)"](await convertToCurrencyDecimals(dai.address, "20000"))
    );

    // User 1 - approves dai for pool
    await waitForTx(
      await dai.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    // User 1 - Deposit dai
    await waitForTx(
      await pool
        .connect(user1.signer)
        .supply(
          dai.address,
          convertToCurrencyDecimals(dai.address, secondDaiDeposit),
          user1.address,
          "0"
        )
    );

    // User 1 - marks ERC721 as not collateral
    await switchCollateralAndValidate(user1, bayc, false, 0);
  });

  it("User 1 redeems the supplied BAYC", async () => {
    const {
      users: [user1],
      bayc,
    } = testEnv;
    await withdrawAndValidate(bayc, "1", user1, 0);
  });

  it("User 1 tries to remove the deposited DAI from collateral without paying the accrued interest (should fail)", async () => {
    const {
      dai,
      users: [user1],
      pool,
    } = testEnv;

    await expect(
      pool.connect(user1.signer).setUserUseERC20AsCollateral(dai.address, false)
    ).to.be.revertedWith(
      ProtocolErrors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
    );
  });

  it("User 1 tries to withdraw the deposited DAI without paying the accrued interest (should fail)", async () => {
    const {
      dai,
      users: [user1],
      pool,
    } = testEnv;

    await expect(
      pool.connect(user1.signer).withdrawERC721(dai.address, [0], user1.address)
    ).to.be.revertedWith(ProtocolErrors.INVALID_ASSET_TYPE);
  });

  it("TC-1:User 3 supply an ID not owned by itself will reverted", async () => {
    const {
      users: [, , user3],
      bayc,
      pool,
    } = testEnv;
    await expect(
      pool
        .connect(user3.signer)
        .supplyERC721(
          bayc.address,
          [{tokenId: 0, useAsCollateral: false}],
          user3.address,
          "0"
        )
    ).to.be.revertedWith("ERC721: transfer from incorrect owner");
  });

  it("TC-2:User 1 supply no existing tokenId will reverted", async () => {
    const tokenId = 78997;
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
          [{tokenId: tokenId, useAsCollateral: false}],
          user1.address,
          "0"
        )
    ).to.be.revertedWith("ERC721: operator query for nonexistent token");
  });

  it("TC-3:User 1 supply any ERC-721s and will success", async () => {
    const testEnv = await loadFixture(fixture);
    const {
      users: [user1],
      bayc,
    } = testEnv;
    await supplyAndValidate(bayc, "3", user1, true);
  });

  it("TC-4:User 1 supply multiple ERC-721s, some owned, some non-existent will reverted", async () => {
    const testEnv = await loadFixture(fixture);
    const {
      users: [user1],
      bayc,
      pool,
    } = testEnv;
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

  it("TC-5:User 1&2 has debt in case the Borrow again is less than the borrow limit of ERC-20 will success", async () => {
    const testEnv = await loadFixture(fixture);
    const {
      users: [user1, user2],
      bayc,
      dai,
      pool,
      protocolDataProvider,
    } = testEnv;

    const tvlWithSupply = "20000";
    const tvlBorrowAmount = "10000";

    await supplyAndValidate(bayc, "2", user1, true);
    await supplyAndValidate(dai, tvlWithSupply, user2, true);
    const tvlAfterSupply = await protocolDataProvider.getPTokenTotalSupply(
      dai.address
    );
    const amountInBaseUnits = await convertToCurrencyDecimals(
      dai.address,
      tvlBorrowAmount
    );
    await waitForTx(
      await pool
        .connect(user1.signer)
        .borrow(dai.address, amountInBaseUnits, "0", user1.address, {
          gasLimit: 5000000,
        })
    );
    const tvlAfterBorrow = await protocolDataProvider.getPTokenTotalSupply(
      dai.address
    );
    await expect(tvlAfterBorrow).to.be.eq(tvlAfterSupply);
  });

  it("TC-7&8:User 1&2 borrow amount is greater than its borrow limit and (does not) reach the clearing line will reverted", async () => {
    const testEnv = await loadFixture(fixture);
    const {
      users: [user1, user2],
      bayc,
      dai,
      pool,
    } = testEnv;

    const borrowDaiUser1 = "70000";
    const borrowDaiUser2 = "3999999";
    const amountInBaseUnitsBorrowLimit = await convertToCurrencyDecimals(
      dai.address,
      borrowDaiUser1
    );
    const amountInBaseUnitsBorrowlqtPoint = await convertToCurrencyDecimals(
      dai.address,
      borrowDaiUser2
    );
    await supplyAndValidate(bayc, "1", user1, true);
    //add liquidaty
    await supplyAndValidate(dai, "9999999", user2, true);

    const availableToBorrowBefore = (
      await pool.getUserAccountData(user1.address)
    ).availableBorrowsBase;

    //borrow erc20
    await waitForTx(
      await (dai as MintableERC20)
        .connect(user1.signer)
        .approve(pool.address, MAX_UINT_AMOUNT)
    );
    //borrow limit < borrow < lqt.point
    await expect(
      pool
        .connect(user1.signer)
        .borrow(dai.address, amountInBaseUnitsBorrowLimit, "0", user1.address, {
          gasLimit: 5000000,
        })
    ).to.be.revertedWith(ProtocolErrors.COLLATERAL_CANNOT_COVER_NEW_BORROW);

    //borrow limit < borrow
    await expect(
      pool
        .connect(user1.signer)
        .borrow(
          dai.address,
          amountInBaseUnitsBorrowlqtPoint,
          "0",
          user1.address,
          {
            gasLimit: 5000000,
          }
        )
    ).to.be.revertedWith(ProtocolErrors.COLLATERAL_CANNOT_COVER_NEW_BORROW);
    const availableToBorrowAfter = (
      await pool.getUserAccountData(user1.address)
    ).availableBorrowsBase;
    expect(availableToBorrowBefore).to.be.eq(availableToBorrowAfter);
  });

  it("TC-9:User 1 supply erc20 and erc721 ，borrow and withdraw erc721 will success (borrow<erc20*ltv)", async () => {
    const testEnv = await loadFixture(fixture);
    const {
      users: [user1],
      bayc,
      dai,
      pool,
    } = testEnv;
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

  it("TC-10:User 1&2 supply erc20 and erc721 ，borrow and withdraw erc721 will success (borrow>erc20*ltv)", async () => {
    const testEnv = await loadFixture(fixture);
    const {
      users: [user1, user2],
      bayc,
      dai,
      pool,
    } = testEnv;
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

  it("TC-11:User 1&2 supply erc20 and erc721 ，borrow and withdraw erc721 will success (borrow>lqt.point)", async () => {
    const testEnv = await loadFixture(fixture);
    const {
      users: [user1, user2],
      bayc,
      dai,
      pool,
    } = testEnv;
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
    // await withdrawAndValidate(bayc, "1", user1, 0);
  });

  it("TC-12:User 1 borrow amount is greater than its borrow limit and (does not) reach the clearing line", async () => {
    const testEnv = await loadFixture(fixture);
    const {
      users: [user1],
      bayc,
      dai,
      pool,
    } = testEnv;

    const borrowDaiUser1 = "2000";
    const amountInBaseUnitsSupply = await convertToCurrencyDecimals(
      dai.address,
      borrowDaiUser1
    );
    await mintAndValidate(bayc, "1", user1);
    //mint dai
    await waitForTx(
      await dai
        .connect(user1.signer)
        ["mint(address,uint256)"](
          user1.address,
          await convertToCurrencyDecimals(dai.address, "999999")
        )
    );
    // supply erc20
    await expect(
      pool
        .connect(user1.signer)
        .supply(dai.address, amountInBaseUnitsSupply, user1.address, "0")
    ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    //supply erc721
    await expect(
      pool
        .connect(user1.signer)
        .supplyERC721(
          bayc.address,
          [{tokenId: 0, useAsCollateral: true}],
          user1.address,
          "0"
        )
    ).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
  });

  it("TC-13:User 1 borrow supply but not Collateral on and borrow will reverted", async () => {
    const testEnv = await loadFixture(fixture);
    const {
      users: [user1],
      bayc,
      dai,
      pool,
    } = testEnv;
    await supplyAndValidate(bayc, "1", user1, true);
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

  it("TC-14&15:User 1 withdraw illegal token[not our own, incorrect address] will reverted", async () => {
    const testEnv = await loadFixture(fixture);
    const {
      users: [user1],
      bayc,
      dai,
      pool,
    } = testEnv;
    supplyAndValidate(bayc, "1", user1, true);
    await waitForTx(
      await pool
        .connect(user1.signer)
        .setUserUseERC721AsCollateral(bayc.address, [0], false)
    );
    //address = dai
    await expect(
      pool.connect(user1.signer).withdrawERC721(dai.address, [0], user1.address)
    ).to.be.revertedWith(ProtocolErrors.INVALID_ASSET_TYPE);
    //address != owner.address
    await expect(
      pool
        .connect(user1.signer)
        .withdrawERC721(bayc.address, [0], user1.address)
    ).to.be.revertedWith("not the owner of Ntoken");
  });
});
