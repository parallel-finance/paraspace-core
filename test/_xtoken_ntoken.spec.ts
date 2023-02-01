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

  it("TC-ntoken-02: NToken atomic balance is correct when mint", async () => {
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
    expect(await nBAYC.isAtomicToken("0")).to.true;

    await supplyAndValidate(bayc, "1", user1, true);

    expect(await nBAYC.atomicBalanceOf(user1.address)).to.be.eq(1);
    expect(await nBAYC.atomicCollateralizedBalanceOf(user1.address)).to.be.eq(
      1
    );
  });

  it("TC-ntoken-03: NToken atomic balance is correct when setIsUsedAsCollateral", async () => {
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
    expect(await nBAYC.isAtomicToken("0")).to.true;

    await supplyAndValidate(bayc, "1", user1, true);

    // remove from collateral
    await waitForTx(
      await pool
        .connect(user1.signer)
        .setUserUseERC721AsCollateral(bayc.address, ["0"], false)
    );
    expect(await nBAYC.atomicBalanceOf(user1.address)).to.be.eq(1);
    expect(await nBAYC.atomicCollateralizedBalanceOf(user1.address)).to.be.eq(
      0
    );

    // add back to collateral
    await waitForTx(
      await pool
        .connect(user1.signer)
        .setUserUseERC721AsCollateral(bayc.address, ["0"], true)
    );
    expect(await nBAYC.atomicBalanceOf(user1.address)).to.be.eq(1);
    expect(await nBAYC.atomicCollateralizedBalanceOf(user1.address)).to.be.eq(
      1
    );
  });

  it("TC-ntoken-04: NToken atomic balance is correct when trait multiplier got removed or added", async () => {
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
    expect(await nBAYC.isAtomicToken("0")).to.true;

    await supplyAndValidate(bayc, "1", user1, true);

    // remove multiplier
    await waitForTx(
      await nBAYC.connect(poolAdmin.signer).setTraitsMultipliers(["0"], ["0"])
    );

    expect(await nBAYC.atomicBalanceOf(user1.address)).to.be.eq(0);
    expect(await nBAYC.atomicCollateralizedBalanceOf(user1.address)).to.be.eq(
      0
    );

    // add back multiplier
    await waitForTx(
      await nBAYC
        .connect(poolAdmin.signer)
        .setTraitsMultipliers(["0"], [HALF_WAD])
    );
    expect(await nBAYC.atomicBalanceOf(user1.address)).to.be.eq(1);
    expect(await nBAYC.atomicCollateralizedBalanceOf(user1.address)).to.be.eq(
      1
    );
  });

  it("TC-ntoken-05: NToken atomic balance is correct when transfer", async () => {
    const {
      nBAYC,
      bayc,
      users: [user1, user2],
      poolAdmin,
    } = await loadFixture(testEnvFixture);
    await waitForTx(
      await nBAYC
        .connect(poolAdmin.signer)
        .setTraitsMultipliers(["0"], [HALF_WAD])
    );
    expect(await nBAYC.getTraitMultiplier("0")).eq(HALF_WAD);
    expect(await nBAYC.isAtomicToken("0")).to.true;

    await supplyAndValidate(bayc, "1", user1, true);

    await waitForTx(
      await nBAYC
        .connect(user1.signer)
        .transferFrom(user1.address, user2.address, "0")
    );

    expect(await nBAYC.atomicBalanceOf(user2.address)).to.be.eq(1);
    expect(await nBAYC.atomicCollateralizedBalanceOf(user2.address)).to.be.eq(
      0
    );

    expect(await nBAYC.atomicBalanceOf(user1.address)).to.be.eq(0);
    expect(await nBAYC.atomicCollateralizedBalanceOf(user1.address)).to.be.eq(
      0
    );
  });

  it("TC-ntoken-06: NToken atomic balance is correct when burn", async () => {
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
    expect(await nBAYC.isAtomicToken("0")).to.true;

    await supplyAndValidate(bayc, "1", user1, true);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .withdrawERC721(bayc.address, ["0"], user1.address)
    );

    expect(await nBAYC.atomicBalanceOf(user1.address)).to.be.eq(0);
    expect(await nBAYC.atomicCollateralizedBalanceOf(user1.address)).to.be.eq(
      0
    );
  });

  it("TC-ntoken-07: NToken atomic balance when mixed tokens mint", async () => {
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
    expect(await nBAYC.isAtomicToken("0")).to.true;

    await mintAndValidate(bayc, "2", user1);

    await waitForTx(
      await bayc.connect(user1.signer).setApprovalForAll(pool.address, true)
    );

    await waitForTx(
      await pool.connect(user1.signer).supplyERC721(
        bayc.address,
        [
          {tokenId: 0, useAsCollateral: true},
          {tokenId: 1, useAsCollateral: false},
        ],
        user1.address,
        "0"
      )
    );

    expect(await nBAYC.atomicBalanceOf(user1.address)).to.be.eq(1);
    expect(await nBAYC.balanceOf(user1.address)).to.be.eq(2);
    expect(await nBAYC.atomicCollateralizedBalanceOf(user1.address)).to.be.eq(
      1
    );
    expect(await nBAYC.collateralizedBalanceOf(user1.address)).to.be.eq(1);
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

  it("TC-ntoken-10: non-atomic tokens have no limit but atomic tokens do have", async () => {
    const {
      nBAYC,
      bayc,
      poolAdmin,
      pool,
      users: [user1],
    } = await loadFixture(testEnvFixture);
    await waitForTx(await nBAYC.connect(poolAdmin.signer).setBalanceLimit(1));

    await mintAndValidate(bayc, "12", user1);

    await waitForTx(
      await bayc.connect(user1.signer).setApprovalForAll(pool.address, true)
    );

    await waitForTx(
      await pool.connect(user1.signer).supplyERC721(
        bayc.address,
        [...Array(10).keys()].map((x) => ({
          tokenId: x,
          useAsCollateral: true,
        })),
        user1.address,
        "0"
      )
    );

    await waitForTx(
      await nBAYC
        .connect(poolAdmin.signer)
        .setTraitsMultipliers(["10", "11"], [HALF_WAD, HALF_WAD])
    );

    await expect(
      pool.connect(user1.signer).supplyERC721(
        bayc.address,
        [
          {
            tokenId: "10",
            useAsCollateral: true,
          },
          {
            tokenId: "11",
            useAsCollateral: true,
          },
        ],
        user1.address,
        "0"
      )
    ).to.revertedWith(ProtocolErrors.NTOKEN_BALANCE_EXCEEDED);
  });

  it("TC-ntoken-11: userAccountData increases multiplier times when there is a multiplier", async () => {
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

    // somehow hardhat may didn't restore snapshot correctly etc
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

  it("TC-ntoken-13: atomicTokenOfOwnerByIndex works as expected", async () => {
    const {
      nBAYC,
      bayc,
      poolAdmin,
      pool,
      users: [user1],
    } = await loadFixture(testEnvFixture);
    await mintAndValidate(bayc, "3", user1);

    await waitForTx(
      await bayc.connect(user1.signer).setApprovalForAll(pool.address, true)
    );

    await waitForTx(
      await nBAYC
        .connect(poolAdmin.signer)
        .setTraitsMultipliers(["0", "1", "2"], [HALF_WAD, HALF_WAD, HALF_WAD])
    );

    await waitForTx(
      await pool.connect(user1.signer).supplyERC721(
        bayc.address,
        [...Array(3).keys()]
          .map((x) => ({
            tokenId: x,
            useAsCollateral: true,
          }))
          .reverse(),
        user1.address,
        "0"
      )
    );

    expect(await nBAYC.atomicTokenOfOwnerByIndex(user1.address, 0)).eq(2);
    expect(await nBAYC.atomicTokenOfOwnerByIndex(user1.address, 1)).eq(1);
    expect(await nBAYC.atomicTokenOfOwnerByIndex(user1.address, 2)).eq(0);
  });
});
