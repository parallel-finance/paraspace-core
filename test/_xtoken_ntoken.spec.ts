import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {HALF_WAD} from "../helpers/constants";
import {waitForTx} from "../helpers/misc-utils";
import {testEnvFixture} from "./helpers/setup-env";
import {supplyAndValidate} from "./helpers/validated-steps";

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

    await waitForTx(
      await pool
        .connect(user1.signer)
        .setUserUseERC721AsCollateral(bayc.address, ["0"], false)
    );

    expect(await nBAYC.atomicBalanceOf(user1.address)).to.be.eq(1);
    expect(await nBAYC.atomicCollateralizedBalanceOf(user1.address)).to.be.eq(
      0
    );
  });

  it("TC-ntoken-04: NToken atomic balance is correct when trait multiplier got removed", async () => {
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

    await waitForTx(
      await nBAYC.connect(poolAdmin.signer).setTraitsMultipliers(["0"], ["0"])
    );

    expect(await nBAYC.atomicBalanceOf(user1.address)).to.be.eq(0);
    expect(await nBAYC.atomicCollateralizedBalanceOf(user1.address)).to.be.eq(
      0
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
  });
});
