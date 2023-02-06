import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {BigNumber} from "ethers";
import {HALF_WAD, WAD} from "../helpers/constants";
import {waitForTx} from "../helpers/misc-utils";
import {ProtocolErrors} from "../helpers/types";
import {testEnvFixture} from "./helpers/setup-env";
import {mintAndValidate, supplyAndValidate} from "./helpers/validated-steps";

describe("NToken general", async () => {
  it("TC-ntoken-01: NToken is ERC721 compatible", async () => {
    const {nBAYC, nMAYC, nDOODLE, nUniswapV3, nMOONBIRD} = await loadFixture(
      testEnvFixture
    );
    expect(await nBAYC.supportsInterface("0x80ac58cd")).to.be.true;
    expect(await nMAYC.supportsInterface("0x80ac58cd")).to.be.true;
    expect(await nDOODLE.supportsInterface("0x80ac58cd")).to.be.true;
    expect(await nUniswapV3.supportsInterface("0x80ac58cd")).to.be.true;
    expect(await nMOONBIRD.supportsInterface("0x80ac58cd")).to.be.true;
  });

  it("TC-ntoken-02: NToken avg multiplier is correct when mint", async () => {
    const {
      nBAYC,
      bayc,
      users: [user1],
      poolAdmin,
    } = await loadFixture(testEnvFixture);
    await waitForTx(
      await nBAYC
        .connect(poolAdmin.signer)
        .setTraitsMultipliers(["0"], [HALF_WAD])
    );
    expect(await nBAYC.getTraitMultiplier("0")).eq(HALF_WAD);
    expect(await nBAYC.avgMultiplierOf(user1.address)).eq(0);

    await supplyAndValidate(bayc, "1", user1, true);

    expect(await nBAYC.avgMultiplierOf(user1.address)).to.be.eq(HALF_WAD);
  });

  it("TC-ntoken-03: NToken avg multiplier is correct when setIsUsedAsCollateral", async () => {
    const {
      nBAYC,
      bayc,
      pool,
      users: [user1],
      poolAdmin,
    } = await loadFixture(testEnvFixture);
    await waitForTx(
      await nBAYC
        .connect(poolAdmin.signer)
        .setTraitsMultipliers(["0"], [HALF_WAD])
    );
    expect(await nBAYC.getTraitMultiplier("0")).eq(HALF_WAD);

    await supplyAndValidate(bayc, "1", user1, true);
    expect(await nBAYC.getTraitMultiplier("0")).eq(HALF_WAD);

    // remove from collateral
    await waitForTx(
      await pool
        .connect(user1.signer)
        .setUserUseERC721AsCollateral(bayc.address, ["0"], false)
    );
    expect(await nBAYC.avgMultiplierOf(user1.address)).to.be.eq(0);

    // add back to collateral
    await waitForTx(
      await pool
        .connect(user1.signer)
        .setUserUseERC721AsCollateral(bayc.address, ["0"], true)
    );
    expect(await nBAYC.avgMultiplierOf(user1.address)).to.be.eq(HALF_WAD);
  });

  it("TC-ntoken-04: NToken avg multiplier is correct when trait multiplier got removed or added", async () => {
    const {
      nBAYC,
      bayc,
      users: [user1],
      poolAdmin,
    } = await loadFixture(testEnvFixture);
    await waitForTx(
      await nBAYC
        .connect(poolAdmin.signer)
        .setTraitsMultipliers(["0"], [HALF_WAD])
    );
    expect(await nBAYC.getTraitMultiplier("0")).eq(HALF_WAD);

    await supplyAndValidate(bayc, "1", user1, true);
    expect(await nBAYC.avgMultiplierOf(user1.address)).eq(HALF_WAD);

    // remove multiplier
    await waitForTx(
      await nBAYC.connect(poolAdmin.signer).setTraitsMultipliers(["0"], ["0"])
    );
    expect(await nBAYC.avgMultiplierOf(user1.address)).to.be.eq(WAD);

    // add back multiplier
    await waitForTx(
      await nBAYC
        .connect(poolAdmin.signer)
        .setTraitsMultipliers(["0"], [HALF_WAD])
    );
    expect(await nBAYC.avgMultiplierOf(user1.address)).to.be.eq(HALF_WAD);
  });

  it("TC-ntoken-05: NToken avg multiplier is correct when transfer", async () => {
    const {
      nBAYC,
      bayc,
      users: [user1, user2],
      pool,
      poolAdmin,
    } = await loadFixture(testEnvFixture);
    await waitForTx(
      await nBAYC
        .connect(poolAdmin.signer)
        .setTraitsMultipliers(["0"], [HALF_WAD])
    );
    expect(await nBAYC.getTraitMultiplier("0")).eq(HALF_WAD);

    await supplyAndValidate(bayc, "1", user1, true);
    expect(await nBAYC.avgMultiplierOf(user1.address)).to.be.eq(HALF_WAD);

    await waitForTx(
      await nBAYC
        .connect(user1.signer)
        .transferFrom(user1.address, user2.address, "0")
    );
    expect(await nBAYC.avgMultiplierOf(user1.address)).to.be.eq(0);
    expect(await nBAYC.avgMultiplierOf(user2.address)).to.be.eq(0);
    await waitForTx(
      await pool
        .connect(user2.signer)
        .setUserUseERC721AsCollateral(bayc.address, ["0"], true)
    );
    expect(await nBAYC.avgMultiplierOf(user1.address)).to.be.eq(0);
    expect(await nBAYC.avgMultiplierOf(user2.address)).to.be.eq(HALF_WAD);
  });

  it("TC-ntoken-06: NToken avg multiplier is correct when burn", async () => {
    const {
      nBAYC,
      bayc,
      pool,
      users: [user1],
      poolAdmin,
    } = await loadFixture(testEnvFixture);
    await waitForTx(
      await nBAYC
        .connect(poolAdmin.signer)
        .setTraitsMultipliers(["0"], [HALF_WAD])
    );
    expect(await nBAYC.getTraitMultiplier("0")).eq(HALF_WAD);

    await supplyAndValidate(bayc, "1", user1, true);
    expect(await nBAYC.avgMultiplierOf(user1.address)).eq(HALF_WAD);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .withdrawERC721(bayc.address, ["0"], user1.address)
    );
    expect(await nBAYC.avgMultiplierOf(user1.address)).to.be.eq(0);
  });

  it("TC-ntoken-07: NToken avg multiplier is correct when mixed tokens minted", async () => {
    const {
      nBAYC,
      bayc,
      pool,
      users: [user1],
      poolAdmin,
    } = await loadFixture(testEnvFixture);
    await waitForTx(
      await nBAYC
        .connect(poolAdmin.signer)
        .setTraitsMultipliers(["0"], [HALF_WAD])
    );
    expect(await nBAYC.getTraitMultiplier("0")).eq(HALF_WAD);

    await supplyAndValidate(bayc, "2", user1, true);
    // (0.5 + 1) / 2 = 0.75
    expect(await nBAYC.avgMultiplierOf(user1.address)).eq(
      BigNumber.from(WAD).mul(3).div(4)
    );

    await waitForTx(
      await bayc.connect(user1.signer).setApprovalForAll(pool.address, true)
    );

    await waitForTx(
      await pool
        .connect(user1.signer)
        .setUserUseERC721AsCollateral(bayc.address, ["1"], false)
    );

    expect(await nBAYC.avgMultiplierOf(user1.address)).to.be.eq(HALF_WAD);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .setUserUseERC721AsCollateral(bayc.address, ["0"], false)
    );
    expect(await nBAYC.avgMultiplierOf(user1.address)).to.be.eq(0);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .setUserUseERC721AsCollateral(bayc.address, ["0", "1"], true)
    );
    expect(await nBAYC.avgMultiplierOf(user1.address)).eq(
      BigNumber.from(WAD).mul(3).div(4)
    );
  });

  it("TC-ntoken-08: only pool admin is allowed to set trait multipliers", async () => {
    const {
      nBAYC,
      users: [user1],
      poolAdmin,
    } = await loadFixture(testEnvFixture);
    await expect(
      nBAYC.connect(user1.signer).setTraitsMultipliers(["0"], [HALF_WAD])
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_POOL_ADMIN);
    await expect(
      nBAYC.connect(poolAdmin.signer).setTraitsMultipliers(["0"], [HALF_WAD])
    );
  });

  it("TC-ntoken-09: trait multipliers must be in range [0, 10)", async () => {
    const {nBAYC, poolAdmin} = await loadFixture(testEnvFixture);
    await waitForTx(
      await nBAYC.connect(poolAdmin.signer).setTraitsMultipliers(["0"], ["0"])
    );
    await waitForTx(
      await nBAYC
        .connect(poolAdmin.signer)
        .setTraitsMultipliers(["0"], [HALF_WAD])
    );
    await expect(
      nBAYC
        .connect(poolAdmin.signer)
        .setTraitsMultipliers(["0"], [BigNumber.from(WAD).mul(10)])
    ).to.be.revertedWith(ProtocolErrors.INVALID_AMOUNT);
    await waitForTx(
      await nBAYC
        .connect(poolAdmin.signer)
        .setTraitsMultipliers(["0"], [BigNumber.from(WAD).mul(10).sub(1)])
    );
  });

  it("TC-ntoken-10: no balance limit for normal nfts", async () => {
    const {
      nBAYC,
      bayc,
      poolAdmin,
      users: [user1],
    } = await loadFixture(testEnvFixture);
    await waitForTx(await nBAYC.connect(poolAdmin.signer).setBalanceLimit(10));

    await supplyAndValidate(bayc, "12", user1, true);
  });

  it("TC-ntoken-11: userAccountData increases avgMultiplier times when there are multipliers on collateralized tokens", async () => {
    const {
      nBAYC,
      bayc,
      poolAdmin,
      pool,
      users: [user1],
    } = await loadFixture(testEnvFixture);
    await mintAndValidate(bayc, "1", user1);

    await waitForTx(
      await bayc.connect(user1.signer).setApprovalForAll(pool.address, true)
    );

    // somehow hardhat may didn't revert snapshot correctly etc
    await waitForTx(
      await nBAYC.connect(poolAdmin.signer).setTraitsMultipliers(["0"], ["0"])
    );
    await waitForTx(
      await pool.connect(user1.signer).supplyERC721(
        bayc.address,
        [
          {
            tokenId: 0,
            useAsCollateral: true,
          },
        ],
        user1.address,
        "0"
      )
    );

    const accountDataBefore = await pool.getUserAccountData(user1.address);
    await waitForTx(
      await nBAYC
        .connect(poolAdmin.signer)
        .setTraitsMultipliers(["0"], [BigNumber.from(WAD).mul(2)])
    );
    const accountDataAfter = await pool.getUserAccountData(user1.address);

    expect(accountDataAfter.totalCollateralBase).to.be.eq(
      accountDataBefore.totalCollateralBase.mul(2)
    );
  });

  it("TC-ntoken-12: uniswap cannot have trait multiplier", async () => {
    const {nUniswapV3, poolAdmin} = await loadFixture(testEnvFixture);
    await expect(
      nUniswapV3
        .connect(poolAdmin.signer)
        .setTraitsMultipliers(["0"], [HALF_WAD])
    ).to.be.reverted;
  });
});
