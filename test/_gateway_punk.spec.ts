import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {BigNumber} from "ethers";
import {ONE_YEAR} from "../helpers/constants";
import {
  getParaSpaceConfig,
  waitForTx,
  advanceTimeAndBlock,
} from "../helpers/misc-utils";
import {ProtocolErrors} from "../helpers/types";
import {strategyWPunks} from "../market-config/reservesConfigs";
import {testEnvFixture} from "./helpers/setup-env";

import {borrowAndValidate, supplyAndValidate} from "./helpers/validated-steps";

describe("Punk nToken Mint and Burn Event Accounting", () => {
  const firstDaiDeposi = "10000";
  const secondDaiDeposit = "20000";
  const borrowAmount = "8000";
  let testEnv;
  let wPunksFloorPrice: BigNumber;

  before("Initialize WPunk Gateway", async () => {
    testEnv = await loadFixture(testEnvFixture);
    wPunksFloorPrice = BigNumber.from(
      getParaSpaceConfig().Mocks!.AllAssetsInitialPrices.WPUNKS
    );
    const {
      wPunk,
      users: [, , user3],
      wPunkGateway,
    } = testEnv;

    await waitForTx(
      await wPunk
        .connect(user3.signer)
        .setApprovalForAll(wPunkGateway.address, true)
    );
  });

  it("TC-punks-gateway-01 User can mint PUNKS and offer them for sale", async () => {
    const {
      punks,
      users: [, , user3],
    } = testEnv;
    await waitForTx(await punks.connect(user3.signer)["getPunk(uint256)"](0));
    expect(await punks.connect(user3.signer).balanceOf(user3.address)).to.equal(
      1
    );
    await waitForTx(await punks.connect(user3.signer).offerPunkForSale(0, 0));

    await waitForTx(await punks.connect(user3.signer)["getPunk(uint256)"](1));
    expect(await punks.connect(user3.signer).balanceOf(user3.address)).to.equal(
      2
    );

    await waitForTx(await punks.connect(user3.signer).offerPunkForSale(1, 0));
  });

  it("TC-punks-gateway-02 User1 can't supply User3 WPUNK", async () => {
    const {
      users: [user1, , user3],
      pool,
      wPunkGateway,
    } = testEnv;

    const availableToBorrow = (await pool.getUserAccountData(user3.address))
      .availableBorrowsBase;
    expect(availableToBorrow).to.be.equal(0);
    const totalCollateral = (await pool.getUserAccountData(user3.address))
      .totalCollateralBase;
    expect(totalCollateral).to.be.equal(0);

    await expect(
      wPunkGateway
        .connect(user1.signer)
        .supplyPunk([{tokenId: 0, useAsCollateral: true}], user3.address, "0")
    ).to.be.revertedWith("WPunkGateway: Not owner of Punk");
  });

  it("TC-punks-gateway-02 User can supply WPUNK", async () => {
    const {
      wPunk,
      nWPunk,
      users: [, , user3],
      pool,
      wPunkGateway,
    } = testEnv;

    const availableToBorrow = (await pool.getUserAccountData(user3.address))
      .availableBorrowsBase;
    expect(availableToBorrow).to.be.equal(0);
    const totalCollateral = (await pool.getUserAccountData(user3.address))
      .totalCollateralBase;
    expect(totalCollateral).to.be.equal(0);

    await wPunkGateway
      .connect(user3.signer)
      .supplyPunk([{tokenId: 0, useAsCollateral: true}], user3.address, "0");

    const nWPunkBalance = await nWPunk.balanceOf(user3.address);
    expect(nWPunkBalance).to.be.equal(1);

    const newTotalCollateral = (await pool.getUserAccountData(user3.address))
      .totalCollateralBase;
    expect(newTotalCollateral).to.be.eq(wPunksFloorPrice);

    // availableToBorrow must've increased in exactly NFT's floor price * 30% (LTV)
    const newAvailableToBorrow = (await pool.getUserAccountData(user3.address))
      .availableBorrowsBase;

    const expectedAvailableToBorrow = wPunksFloorPrice.percentMul(
      strategyWPunks.baseLTVAsCollateral
    );
    expect(newAvailableToBorrow).to.be.eq(expectedAvailableToBorrow);

    const wPunkBalance = await wPunk.balanceOf(user3.address);
    expect(wPunkBalance).to.be.equal(0);
  });

  it("TC-punks-gateway-03 User tries to withdraw the deposited WPUNK without paying borrowing accrued interest (should fail)", async () => {
    const {
      dai,
      variableDebtDai,
      users: [, , user3],
      gatewayAdmin: user4,
      wPunkGateway,
    } = testEnv;

    // User 4 - Deposit dai

    await supplyAndValidate(dai, firstDaiDeposi, user4, true);

    await variableDebtDai.balanceOf(user3.address);

    // User 3 - Borrow dai
    await borrowAndValidate(dai, borrowAmount, user3);

    await expect(
      wPunkGateway.connect(user3.signer).withdrawPunk([0], user3.address)
    ).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
  });

  it("TC-punks-gateway-04 User tries to remove the deposited WPUNK from collateral without paying the accrued interest (should fail)", async () => {
    const {
      wPunk,
      users: [, , user3],
      pool,
    } = testEnv;

    await expect(
      pool
        .connect(user3.signer)
        .setUserUseERC721AsCollateral(wPunk.address, [0], false)
    ).to.be.revertedWith(
      ProtocolErrors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
    );
  });

  it("TC-punks-gateway-05 User with a borrow position tries to send the nToken to another user (should fail)", async () => {
    const {
      nWPunk,
      users: [, , user3],
      gatewayAdmin: user4,
    } = testEnv;

    await expect(
      nWPunk.connect(user3.signer).transferFrom(user3.address, user4.address, 0)
    ).to.be.revertedWith(
      ProtocolErrors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
    );
  });

  it("TC-punks-gateway-06 User adds enough collateral and then can remove his WPUNK from collateral without paying the accrued interest [ @skip-on-coverage ]", async () => {
    const {
      dai,
      wPunk,
      nWPunk,
      users: [, , user3],
      pool,
    } = testEnv;

    // User 3 - Deposit dai
    await supplyAndValidate(dai, secondDaiDeposit, user3, true);

    // User 3 - marks dai as collateral
    await waitForTx(
      await pool
        .connect(user3.signer)
        .setUserUseERC20AsCollateral(dai.address, true)
    );

    const availableToBorrow = (await pool.getUserAccountData(user3.address))
      .availableBorrowsBase;
    const totalCollateral = (await pool.getUserAccountData(user3.address))
      .totalCollateralBase;

    // User 3 - marks ERC721 as not collateral
    await waitForTx(
      await pool
        .connect(user3.signer)
        .setUserUseERC721AsCollateral(wPunk.address, [0], false)
    );

    const newTotalCollateral = (await pool.getUserAccountData(user3.address))
      .totalCollateralBase;
    expect(newTotalCollateral).to.be.lt(totalCollateral);

    const newAvailableToBorrow = (await pool.getUserAccountData(user3.address))
      .availableBorrowsBase;
    expect(newAvailableToBorrow).to.be.lt(availableToBorrow);

    const wPunkBalance = await wPunk.balanceOf(user3.address);
    expect(wPunkBalance).to.be.equal(0);

    const nWPunkBalance = await nWPunk.balanceOf(user3.address);
    expect(nWPunkBalance).to.be.equal(1);
  });

  it("TC-punks-gateway-07 User can redeem the supplied WPunks [ @skip-on-coverage ]", async () => {
    const {
      wPunk,
      nWPunk,
      users: [, , user3],
      pool,
      wPunkGateway,
      punks,
    } = testEnv;
    const availableToBorrow = (await pool.getUserAccountData(user3.address))
      .availableBorrowsBase;
    (await pool.getUserAccountData(user3.address)).totalCollateralBase;

    // withdraw WPUNKS
    await waitForTx(
      await nWPunk
        .connect(user3.signer)
        .setApprovalForAll(wPunkGateway.address, true)
    );

    await nWPunk.isApprovedForAll(user3.address, wPunkGateway.address);

    // withdraw WPUNKS
    const withdrawWPUNKSTx = await wPunkGateway
      .connect(user3.signer)
      .withdrawPunk([0], user3.address);

    await withdrawWPUNKSTx.wait();

    const nWPunkBalance = await nWPunk.balanceOf(user3.address);
    expect(nWPunkBalance).to.be.equal(0);

    const wPunkBalance = await wPunk.balanceOf(user3.address);
    expect(wPunkBalance).to.be.equal(0);

    // minted both id of 0 and 1 at the beginning so Punk balance should be back at 2
    const punkBalance = await punks.balanceOf(user3.address);
    expect(punkBalance).to.be.equal(2);

    // availableToBorrow must've decreased
    const newAvailableToBorrow = (await pool.getUserAccountData(user3.address))
      .availableBorrowsBase;
    expect(newAvailableToBorrow).to.be.lt(availableToBorrow);
  });

  it("TC-punks-gateway-08 getWPunkAddress() returns correct address", async () => {
    const {
      wPunk,
      users: [, , user3],
      wPunkGateway,
    } = testEnv;

    const wPunkAddress = await wPunkGateway
      .connect(user3.signer)
      .getWPunkAddress();

    expect(wPunkAddress).to.be.equal(wPunk.address);
  });

  it("TC-punks-gateway-09 wPunkGateway can receive 1 WPUNK via safeTransfer()", async () => {
    const {
      users: [, , user3],
      punks,
      wPunk,
      wPunkGateway,
    } = testEnv;
    // WPUNK
    await waitForTx(await punks.connect(user3.signer)["getPunk(uint256)"](2));
    await punks.connect(user3.signer).balanceOf(user3.address);

    await waitForTx(await punks.connect(user3.signer).offerPunkForSale(2, 0));
    await waitForTx(await wPunk.connect(user3.signer).registerProxy());
    const proxy = await wPunk.proxyInfo(user3.address);
    await waitForTx(await punks.connect(user3.signer).transferPunk(proxy, 2));
    await waitForTx(await wPunk.connect(user3.signer).mint(2));
    await waitForTx(
      await wPunk
        .connect(user3.signer)
        ["safeTransferFrom(address,address,uint256)"](
          user3.address,
          wPunkGateway.address,
          2
        )
    );
    expect(
      await wPunk.connect(user3.signer).balanceOf(wPunkGateway.address)
    ).to.equal(1);
  });

  it("TC-punks-gateway-10 wPunkGateway can receive 1 PUNK via transferPunk()", async () => {
    const {
      users: [, , user3],
      punks,
      wPunkGateway,
    } = testEnv;
    // PUNK
    await waitForTx(await punks.connect(user3.signer)["getPunk(uint256)"](3));
    await punks.connect(user3.signer).balanceOf(user3.address);

    await waitForTx(await punks.connect(user3.signer).offerPunkForSale(3, 0));
    await waitForTx(
      await punks.connect(user3.signer).transferPunk(wPunkGateway.address, 3)
    );
    expect(
      await punks.connect(user3.signer).balanceOf(wPunkGateway.address)
    ).to.equal(1);
  });

  it("TC-punks-gateway-11 Gateway owner can do emergency WPUNK transfer to user", async () => {
    const {
      users: [, , user3],
      gatewayAdmin,
      wPunkGateway,
      wPunk,
    } = testEnv;
    const owner = gatewayAdmin;

    const userBalance = await wPunk
      .connect(user3.signer)
      .balanceOf(user3.address);

    await waitForTx(
      await wPunkGateway
        .connect(owner.signer)
        .emergencyERC721TokenTransfer(wPunk.address, 2, user3.address, {
          gasLimit: 5000000,
        })
    );
    expect(
      await wPunk.connect(user3.signer).balanceOf(wPunkGateway.address)
    ).to.equal(0);

    expect(await wPunk.connect(user3.signer).balanceOf(user3.address)).to.equal(
      userBalance.add(1)
    );
  });

  it("TC-punks-gateway-12 Gateway owner can do emergency PUNK transfer to user", async () => {
    const {
      users: [, , user3],
      gatewayAdmin,
      wPunkGateway,
      punks,
    } = testEnv;
    const owner = gatewayAdmin;

    const userBalance = await punks
      .connect(user3.signer)
      .balanceOf(user3.address);

    await waitForTx(
      await wPunkGateway
        .connect(owner.signer)
        .emergencyPunkTransfer(user3.address, 3, {
          gasLimit: 5000000,
        })
    );
    expect(
      await punks.connect(user3.signer).balanceOf(wPunkGateway.address)
    ).to.equal(0);

    expect(await punks.connect(user3.signer).balanceOf(user3.address)).to.equal(
      userBalance.add(1)
    );
  });
});

describe("gateway Punk unit tests", () => {
  const fixture = async () => {
    const testEnv = await loadFixture(testEnvFixture);
    const {
      punks,
      users: [user1],
    } = testEnv;

    await waitForTx(await punks.connect(user1.signer)["getPunk(uint256)"](0));
    await waitForTx(await punks.connect(user1.signer).offerPunkForSale(0, 0));

    await waitForTx(await punks.connect(user1.signer)["getPunk(uint256)"](1));
    await waitForTx(await punks.connect(user1.signer).offerPunkForSale(1, 0));
    expect(await punks.connect(user1.signer).balanceOf(user1.address)).to.equal(
      2
    );
    return testEnv;
  };

  it("TC-punks-gateway-13 User Health factor remains the same over time if user has only a punk supply position", async () => {
    const {
      users: [user1],
      pool,
      wPunkGateway,
    } = await loadFixture(fixture);

    // User 1 - Deposit Punk
    await wPunkGateway
      .connect(user1.signer)
      .supplyPunk([{tokenId: 1, useAsCollateral: true}], user1.address, "0");

    const initialHealthFactor = (await pool.getUserAccountData(user1.address))
      .healthFactor;

    // Advance time and blocks
    await advanceTimeAndBlock(parseInt(ONE_YEAR) * 100);

    // health factor should remain the same
    expect(initialHealthFactor).to.eq(
      (await pool.getUserAccountData(user1.address)).healthFactor
    );
  });

  it("TC-punks-gateway-14 User multiple Supply PunkToken", async () => {
    const {
      pool,
      nWPunk,
      wPunkGateway,
      users: [user1],
    } = await loadFixture(fixture);

    const wPunksFloorPrice = BigNumber.from(
      getParaSpaceConfig().Mocks!.AllAssetsInitialPrices.WPUNKS
    ).mul(2);

    const availableToBorrow = (await pool.getUserAccountData(user1.address))
      .availableBorrowsBase;
    expect(availableToBorrow).to.be.equal(0);
    const totalCollateral = (await pool.getUserAccountData(user1.address))
      .totalCollateralBase;
    expect(totalCollateral).to.be.equal(0);

    await wPunkGateway
      .connect(user1.signer)
      .supplyPunk([{tokenId: 0, useAsCollateral: true}], user1.address, "0");

    await wPunkGateway
      .connect(user1.signer)
      .supplyPunk([{tokenId: 1, useAsCollateral: true}], user1.address, "0");

    //  User 1 nWPunk should reincreaseduce
    const nWPunkBalance = await nWPunk.balanceOf(user1.address);
    expect(nWPunkBalance).to.be.equal(2);

    //  User 1 Collateral should increase
    const newTotalCollateral = (await pool.getUserAccountData(user1.address))
      .totalCollateralBase;

    expect(newTotalCollateral).to.be.eq(wPunksFloorPrice);

    // availableToBorrow must've increased in exactly NFT's floor price * 30% (LTV)
    const newAvailableToBorrow = (await pool.getUserAccountData(user1.address))
      .availableBorrowsBase;

    const expectedAvailableToBorrow = wPunksFloorPrice.percentMul(
      strategyWPunks.baseLTVAsCollateral
    );
    expect(newAvailableToBorrow).to.be.eq(expectedAvailableToBorrow);
  });

  it("TC-punks-gateway-15 User Supply PunkToken but collateral status closes", async () => {
    const {
      pool,
      nWPunk,
      users: [user1],
      wPunkGateway,
    } = await loadFixture(fixture);

    const availableToBorrow = (await pool.getUserAccountData(user1.address))
      .availableBorrowsBase;
    expect(availableToBorrow).to.be.equal(0);
    const totalCollateral = (await pool.getUserAccountData(user1.address))
      .totalCollateralBase;
    expect(totalCollateral).to.be.equal(0);

    // User 1 deposit Collateral closes
    await wPunkGateway
      .connect(user1.signer)
      .supplyPunk([{tokenId: 0, useAsCollateral: false}], user1.address, "0");

    //  User 1 nWPunk should reincreaseduce
    const nWPunkBalance = await nWPunk.balanceOf(user1.address);
    expect(nWPunkBalance).to.be.equal(1);

    //  User 1 Collateral should No change
    const newTotalCollateral = (await pool.getUserAccountData(user1.address))
      .totalCollateralBase;
    expect(newTotalCollateral).to.be.eq(totalCollateral);

    //  User 1 availableToBorrow should No change
    const newAvailableToBorrow = (await pool.getUserAccountData(user1.address))
      .availableBorrowsBase;
    expect(newAvailableToBorrow).to.be.eq(availableToBorrow);
  });

  it("TC-punks-gateway-16 User again supply  same Punk token id (should fail)", async () => {
    const {
      users: [user1],
      wPunkGateway,
    } = await loadFixture(fixture);

    await wPunkGateway
      .connect(user1.signer)
      .supplyPunk([{tokenId: 0, useAsCollateral: true}], user1.address, "0");

    await expect(
      wPunkGateway
        .connect(user1.signer)
        .supplyPunk([{tokenId: 0, useAsCollateral: true}], user1.address, "0")
    ).to.be.revertedWith("WPunkGateway: Not owner of Punk");
  });

  it("TC-punks-gateway-17 User tries to Supply not minted token (should fail)", async () => {
    const {
      users: [user1],
      wPunkGateway,
    } = await loadFixture(fixture);

    await expect(
      wPunkGateway
        .connect(user1.signer)
        .supplyPunk([{tokenId: 2, useAsCollateral: true}], user1.address, "0")
    ).to.be.revertedWith("WPunkGateway: Not owner of Punk");
  });

  it("TC-punks-gateway-18 User tries to punks repeat get Punk (should fail)", async () => {
    const {
      punks,
      users: [user1],
    } = await loadFixture(fixture);
    await expect(
      punks.connect(user1.signer)["getPunk(uint256)"](0)
    ).to.be.revertedWith("CryptoPunksMarket: already got");
  });

  it("TC-punks-gateway-19 User tries to sale the not minted punk (should fail)", async () => {
    const {
      punks,
      users: [user1],
    } = await loadFixture(fixture);
    await expect(
      punks.connect(user1.signer).offerPunkForSale(10, 0)
    ).to.be.revertedWith("CryptoPunksMarket: not owner");
  });

  it("TC-punks-gateway-20 User tries to mint punkIndex id overtake 10000 (should fail)", async () => {
    const {
      punks,
      users: [user1],
    } = await loadFixture(fixture);
    await expect(
      punks.connect(user1.signer)["getPunk(uint256)"](10001)
    ).to.be.revertedWith("CryptoPunksMarket: punkIndex overflow");
  });

  it("TC-punks-gateway-21 User Withdrawal of non personal supply assets (should fail)", async () => {
    const {
      wPunkGateway,
      users: [user1, user2],
    } = await loadFixture(fixture);

    // User 2 deposit
    await wPunkGateway
      .connect(user1.signer)
      .supplyPunk([{tokenId: 0, useAsCollateral: true}], user2.address, "0");

    // User 1 tries to withdraw
    await expect(
      wPunkGateway.connect(user1.signer).withdrawPunk([0], user1.address)
    ).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
  });

  it("TC-punks-gateway-22 User tries to withdraw an asset that does not have a supply (should fail)", async () => {
    const {
      wPunkGateway,
      users: [user1],
    } = await loadFixture(fixture);

    // User 1 deposit tokenId 0
    await wPunkGateway
      .connect(user1.signer)
      .supplyPunk([{tokenId: 0, useAsCollateral: true}], user1.address, "0");

    // User 1 withdraw tokenId 1

    await expect(
      wPunkGateway.connect(user1.signer).withdrawPunk([1], user1.address)
    ).to.be.revertedWith("ERC721: operator query for nonexistent token");
  });
});
