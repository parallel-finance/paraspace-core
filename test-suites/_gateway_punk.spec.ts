import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {BigNumber} from "ethers";
import {MAX_UINT_AMOUNT} from "../deploy/helpers/constants";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {getParaSpaceConfig, waitForTx} from "../deploy/helpers/misc-utils";
import {ProtocolErrors} from "../deploy/helpers/types";
import {testEnvFixture} from "./helpers/setup-env";

describe("Punk nToken Mint and Burn Event Accounting", () => {
  let firstDaiDeposit;
  let secondDaiDeposit;
  let testEnv;
  let wPunksFloorPrice: BigNumber;

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
    wPunksFloorPrice = BigNumber.from(
      getParaSpaceConfig().Mocks.AllAssetsInitialPrices.WPUNKS
    );
  });

  before("Initialize WPunk Gateway", async () => {
    const {
      dai,
      wPunk,
      users: [, , user3],
      wPunkGateway,
    } = testEnv;

    firstDaiDeposit = await convertToCurrencyDecimals(dai.address, "10000");
    secondDaiDeposit = await convertToCurrencyDecimals(dai.address, "20000");

    await waitForTx(
      await wPunk
        .connect(user3.signer)
        .setApprovalForAll(wPunkGateway.address, true)
    );
  });

  it("TC-punks-gateway-01 User can mint PUNKS and offer them for sale", async () => {
    const {
      cryptoPunksMarket,
      users: [, , user3],
    } = testEnv;
    await waitForTx(
      await cryptoPunksMarket.connect(user3.signer)["getPunk(uint256)"](0)
    );
    expect(
      await cryptoPunksMarket.connect(user3.signer).balanceOf(user3.address)
    ).to.equal(1);
    await waitForTx(
      await cryptoPunksMarket.connect(user3.signer).offerPunkForSale(0, 0)
    );

    await waitForTx(
      await cryptoPunksMarket.connect(user3.signer)["getPunk(uint256)"](1)
    );
    expect(
      await cryptoPunksMarket.connect(user3.signer).balanceOf(user3.address)
    ).to.equal(2);
    await waitForTx(
      await cryptoPunksMarket.connect(user3.signer).offerPunkForSale(1, 0)
    );
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

    const expectedAvailableToBorrow = wPunksFloorPrice
      .mul(BigNumber.from(30))
      .div(BigNumber.from(100));
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
      pool,
    } = testEnv;

    await waitForTx(
      await dai
        .connect(user4.signer)
        ["mint(uint256)"](await convertToCurrencyDecimals(dai.address, "10000"))
    );

    // approve protocol to access user 4 wallet
    await waitForTx(
      await dai.connect(user4.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    // User 4 - Deposit dai
    await waitForTx(
      await pool
        .connect(user4.signer)
        .supply(dai.address, firstDaiDeposit, user4.address, "0")
    );

    await variableDebtDai.balanceOf(user3.address);

    // User 3 - Borrow dai
    const borrowAmount = await convertToCurrencyDecimals(dai.address, "8000");

    await waitForTx(
      await pool
        .connect(user3.signer)
        .borrow(dai.address, borrowAmount, "0", user3.address)
    );

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

  it("TC-punks-gateway-06 User adds enough collateral and then can remove his WPUNK from collateral without paying the accrued interest", async () => {
    const {
      dai,
      wPunk,
      nWPunk,
      users: [, , user3],
      pool,
    } = testEnv;

    // User 3 - Mints 20k dai
    await waitForTx(
      await dai
        .connect(user3.signer)
        ["mint(uint256)"](await convertToCurrencyDecimals(dai.address, "20000"))
    );

    // User 3 - approves dai for pool
    await waitForTx(
      await dai.connect(user3.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    // User 3 - Deposit dai
    await waitForTx(
      await pool
        .connect(user3.signer)
        .supply(dai.address, secondDaiDeposit, user3.address, "0")
    );

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

  it("TC-punks-gateway-07 User can redeem the supplied WPunks", async () => {
    const {
      wPunk,
      nWPunk,
      users: [, , user3],
      pool,
      wPunkGateway,
      cryptoPunksMarket,
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
    const punkBalance = await cryptoPunksMarket.balanceOf(user3.address);
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
      cryptoPunksMarket,
      wPunk,
      wPunkGateway,
    } = testEnv;
    // WPUNK
    await waitForTx(
      await cryptoPunksMarket.connect(user3.signer)["getPunk(uint256)"](2)
    );
    await cryptoPunksMarket.connect(user3.signer).balanceOf(user3.address);

    await waitForTx(
      await cryptoPunksMarket.connect(user3.signer).offerPunkForSale(2, 0)
    );
    await waitForTx(await wPunk.connect(user3.signer).registerProxy());
    const proxy = await wPunk.proxyInfo(user3.address);
    await waitForTx(
      await cryptoPunksMarket.connect(user3.signer).transferPunk(proxy, 2)
    );
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
      cryptoPunksMarket,
      wPunkGateway,
    } = testEnv;
    // PUNK
    await waitForTx(
      await cryptoPunksMarket.connect(user3.signer)["getPunk(uint256)"](3)
    );
    await cryptoPunksMarket.connect(user3.signer).balanceOf(user3.address);

    await waitForTx(
      await cryptoPunksMarket.connect(user3.signer).offerPunkForSale(3, 0)
    );
    await waitForTx(
      await cryptoPunksMarket
        .connect(user3.signer)
        .transferPunk(wPunkGateway.address, 3)
    );
    expect(
      await cryptoPunksMarket
        .connect(user3.signer)
        .balanceOf(wPunkGateway.address)
    ).to.equal(1);
  });

  it("TC-punks-gateway-11 Gateway owner can do emergency WPUNK transfer to user", async () => {
    const {
      users: [, , user3],
      deployer,
      wPunkGateway,
      wPunk,
    } = testEnv;
    const owner = deployer;

    const userBalance = await wPunk
      .connect(user3.signer)
      .balanceOf(user3.address);

    await waitForTx(
      await wPunkGateway
        .connect(owner.signer)
        .emergencyTokenTransfer(wPunkGateway.address, user3.address, 2)
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
      deployer,
      wPunkGateway,
      cryptoPunksMarket,
    } = testEnv;
    const owner = deployer;

    const userBalance = await cryptoPunksMarket
      .connect(user3.signer)
      .balanceOf(user3.address);

    await waitForTx(
      await wPunkGateway
        .connect(owner.signer)
        .emergencyPunkTransfer(user3.address, 3)
    );
    expect(
      await cryptoPunksMarket
        .connect(user3.signer)
        .balanceOf(wPunkGateway.address)
    ).to.equal(0);

    expect(
      await cryptoPunksMarket.connect(user3.signer).balanceOf(user3.address)
    ).to.equal(userBalance.add(1));
  });
});
