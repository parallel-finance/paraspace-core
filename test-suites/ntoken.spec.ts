import {expect} from "chai";
import {BigNumber} from "ethers";
import {MAX_UINT_AMOUNT} from "../deploy/helpers/constants";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {waitForTx} from "../deploy/helpers/misc-utils";
import {ProtocolErrors} from "../deploy/helpers/types";
import {MOCK_CHAINLINK_AGGREGATORS_PRICES} from "../deploy/market-config";
import {makeSuite} from "./helpers/make-suite";
import {
  borrowAndValidate,
  supplyAndValidate,
  switchCollateralAndValidate,
  withdrawAndValidate,
} from "./helpers/validated-steps";

makeSuite("nToken Mint and Burn Event Accounting", (testEnv) => {
  const firstDaiDeposit = "10000";
  const secondDaiDeposit = "20000";
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
});
