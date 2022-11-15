import {expect} from "chai";
import {BigNumber} from "ethers";
import {deployMockReserveConfiguration} from "../deploy/helpers/contracts-deployments";
import {MockReserveConfiguration} from "../types";
import {ProtocolErrors} from "../deploy/helpers/types";
import {testEnvFixture} from "./helpers/setup-env";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";

describe("ReserveConfiguration", async () => {
  const fixture = async () => {
    const testEnv = await loadFixture(testEnvFixture);
    configMock = await deployMockReserveConfiguration();
    return testEnv;
  };

  before(async () => {
    await loadFixture(fixture);
  });

  let configMock: MockReserveConfiguration;

  const ZERO = BigNumber.from(0);
  const LTV = BigNumber.from(8000);
  const LB = BigNumber.from(500);
  const RESERVE_FACTOR = BigNumber.from(1000);
  const DECIMALS = BigNumber.from(18);
  const BORROW_CAP = BigNumber.from(100);
  const SUPPLY_CAP = BigNumber.from(200);

  const MAX_VALID_LTV = BigNumber.from(65535);
  const MAX_VALID_LIQUIDATION_THRESHOLD = BigNumber.from(65535);
  const MAX_VALID_DECIMALS = BigNumber.from(255);
  const MAX_VALID_RESERVE_FACTOR = BigNumber.from(65535);
  const MAX_VALID_LIQUIDATION_PROTOCOL_FEE = BigNumber.from(65535);

  const bigNumbersToArrayString = (arr: BigNumber[]): string[] =>
    arr.map((x) => x.toString());

  it("TC-reserve-configuration-01 getLtv()", async () => {
    expect(bigNumbersToArrayString(await configMock.getParams())).to.be.eql(
      bigNumbersToArrayString([ZERO, ZERO, ZERO, ZERO, ZERO])
    );
    expect(await configMock.getLtv()).to.be.eq(ZERO);
    expect(await configMock.setLtv(LTV));
    // LTV is the 1st param
    expect(bigNumbersToArrayString(await configMock.getParams())).to.be.eql(
      bigNumbersToArrayString([LTV, ZERO, ZERO, ZERO, ZERO])
    );
    expect(await configMock.getLtv()).to.be.eq(LTV);
    expect(await configMock.setLtv(0));
    expect(bigNumbersToArrayString(await configMock.getParams())).to.be.eql(
      bigNumbersToArrayString([ZERO, ZERO, ZERO, ZERO, ZERO])
    );
    expect(await configMock.getLtv()).to.be.eq(ZERO);
  });

  it("TC-reserve-configuration-02 getLiquidationBonus()", async () => {
    expect(bigNumbersToArrayString(await configMock.getParams())).to.be.eql(
      bigNumbersToArrayString([ZERO, ZERO, ZERO, ZERO, ZERO])
    );
    expect(await configMock.getLiquidationBonus()).to.be.eq(ZERO);
    expect(await configMock.setLiquidationBonus(LB));
    // LB is the 3rd param
    expect(bigNumbersToArrayString(await configMock.getParams())).to.be.eql(
      bigNumbersToArrayString([ZERO, ZERO, LB, ZERO, ZERO])
    );
    expect(await configMock.getLiquidationBonus()).to.be.eq(LB);
    expect(await configMock.setLiquidationBonus(0));
    expect(bigNumbersToArrayString(await configMock.getParams())).to.be.eql(
      bigNumbersToArrayString([ZERO, ZERO, ZERO, ZERO, ZERO])
    );
    expect(await configMock.getLiquidationBonus()).to.be.eq(ZERO);
  });

  it("TC-reserve-configuration-03 getDecimals()", async () => {
    expect(bigNumbersToArrayString(await configMock.getParams())).to.be.eql(
      bigNumbersToArrayString([ZERO, ZERO, ZERO, ZERO, ZERO])
    );
    expect(await configMock.getDecimals()).to.be.eq(ZERO);
    expect(await configMock.setDecimals(DECIMALS));
    // decimals is the 4th param
    expect(bigNumbersToArrayString(await configMock.getParams())).to.be.eql(
      bigNumbersToArrayString([ZERO, ZERO, ZERO, DECIMALS, ZERO])
    );
    expect(await configMock.getDecimals()).to.be.eq(DECIMALS);
    expect(await configMock.setDecimals(0));
    expect(bigNumbersToArrayString(await configMock.getParams())).to.be.eql(
      bigNumbersToArrayString([ZERO, ZERO, ZERO, ZERO, ZERO])
    );
    expect(await configMock.getDecimals()).to.be.eq(ZERO);
  });

  it("TC-reserve-configuration-04 getFrozen()", async () => {
    expect(await configMock.getFlags()).to.be.eql([
      false,
      false,
      false,
      false,
      0,
    ]);
    expect(await configMock.getFrozen()).to.be.false;
    expect(await configMock.setFrozen(true));
    // frozen is the 2nd flag
    expect(await configMock.getFlags()).to.be.eql([
      false,
      true,
      false,
      false,
      0,
    ]);
    expect(await configMock.getFrozen()).to.be.true;
    expect(await configMock.setFrozen(false));
    expect(await configMock.getFlags()).to.be.eql([
      false,
      false,
      false,
      false,
      0,
    ]);
    expect(await configMock.getFrozen()).to.be.false;
  });

  it("TC-reserve-configuration-05 setAssetType() and getAssetType()", async () => {
    expect(await configMock.getFlags()).to.be.eql([
      false,
      false,
      false,
      false,
      0,
    ]);
    expect(await configMock.getAssetType()).to.be.eq(0);

    expect(await configMock.setAssetType(1));
    // frozen is the 2nd flag
    expect(await configMock.getFlags()).to.be.eql([
      false,
      false,
      false,
      false,
      1,
    ]);
    expect(await configMock.getAssetType()).to.be.eq(1);
    expect(await configMock.setAssetType(0));
    expect(await configMock.getFlags()).to.be.eql([
      false,
      false,
      false,
      false,
      0,
    ]);
  });

  it("TC-reserve-configuration-06 getBorrowingEnabled()", async () => {
    expect(await configMock.getFlags()).to.be.eql([
      false,
      false,
      false,
      false,
      0,
    ]);
    expect(await configMock.getBorrowingEnabled()).to.be.false;
    expect(await configMock.setBorrowingEnabled(true));
    // borrowing is the 3rd flag
    expect(await configMock.getFlags()).to.be.eql([
      false,
      false,
      true,
      false,
      0,
    ]);
    expect(await configMock.getBorrowingEnabled()).to.be.true;
    expect(await configMock.setBorrowingEnabled(false));
    expect(await configMock.getFlags()).to.be.eql([
      false,
      false,
      false,
      false,
      0,
    ]);
    expect(await configMock.getBorrowingEnabled()).to.be.false;
  });

  it("TC-reserve-configuration-07 getReserveFactor()", async () => {
    expect(bigNumbersToArrayString(await configMock.getParams())).to.be.eql(
      bigNumbersToArrayString([ZERO, ZERO, ZERO, ZERO, ZERO])
    );
    expect(await configMock.getReserveFactor()).to.be.eq(ZERO);
    expect(await configMock.setReserveFactor(RESERVE_FACTOR));
    // reserve factor is the 5th param
    expect(bigNumbersToArrayString(await configMock.getParams())).to.be.eql(
      bigNumbersToArrayString([ZERO, ZERO, ZERO, ZERO, RESERVE_FACTOR])
    );
    expect(await configMock.getReserveFactor()).to.be.eq(RESERVE_FACTOR);
    expect(await configMock.setReserveFactor(ZERO));
    expect(bigNumbersToArrayString(await configMock.getParams())).to.be.eql(
      bigNumbersToArrayString([ZERO, ZERO, ZERO, ZERO, ZERO])
    );
    expect(await configMock.getReserveFactor()).to.be.eq(ZERO);
  });

  it("TC-reserve-configuration-08 setReserveFactor() with reserveFactor == MAX_VALID_RESERVE_FACTOR", async () => {
    expect(bigNumbersToArrayString(await configMock.getParams())).to.be.eql(
      bigNumbersToArrayString([ZERO, ZERO, ZERO, ZERO, ZERO])
    );
    expect(await configMock.setReserveFactor(MAX_VALID_RESERVE_FACTOR));
    expect(bigNumbersToArrayString(await configMock.getParams())).to.be.eql(
      bigNumbersToArrayString([
        ZERO,
        ZERO,
        ZERO,
        ZERO,
        MAX_VALID_RESERVE_FACTOR,
      ])
    );
  });

  it("TC-reserve-configuration-09 setReserveFactor() with reserveFactor > MAX_VALID_RESERVE_FACTOR (revert expected)", async () => {
    await loadFixture(fixture);

    expect(bigNumbersToArrayString(await configMock.getParams())).to.be.eql(
      bigNumbersToArrayString([ZERO, ZERO, ZERO, ZERO, ZERO])
    );
    await expect(
      configMock.setReserveFactor(MAX_VALID_RESERVE_FACTOR.add(1))
    ).to.be.revertedWith(ProtocolErrors.INVALID_RESERVE_FACTOR);
    expect(bigNumbersToArrayString(await configMock.getParams())).to.be.eql(
      bigNumbersToArrayString([ZERO, ZERO, ZERO, ZERO, ZERO])
    );
  });

  it("TC-reserve-configuration-10 getBorrowCap()", async () => {
    expect(bigNumbersToArrayString(await configMock.getCaps())).to.be.eql(
      bigNumbersToArrayString([ZERO, ZERO])
    );
    expect(await configMock.getBorrowCap()).to.be.eq(ZERO);
    expect(await configMock.setBorrowCap(BORROW_CAP));
    // borrow cap is the 1st cap
    expect(bigNumbersToArrayString(await configMock.getCaps())).to.be.eql(
      bigNumbersToArrayString([BORROW_CAP, ZERO])
    );
    expect(await configMock.getBorrowCap()).to.be.eq(BORROW_CAP);
    expect(await configMock.setBorrowCap(ZERO));
    expect(bigNumbersToArrayString(await configMock.getCaps())).to.be.eql(
      bigNumbersToArrayString([ZERO, ZERO])
    );
    expect(await configMock.getBorrowCap()).to.be.eq(ZERO);
  });

  it("TC-reserve-configuration-11 getSupplyCap()", async () => {
    expect(bigNumbersToArrayString(await configMock.getCaps())).to.be.eql(
      bigNumbersToArrayString([ZERO, ZERO])
    );
    expect(await configMock.getSupplyCap()).to.be.eq(ZERO);
    expect(await configMock.setSupplyCap(SUPPLY_CAP));
    // supply cap is the 2nd cap
    expect(bigNumbersToArrayString(await configMock.getCaps())).to.be.eql(
      bigNumbersToArrayString([ZERO, SUPPLY_CAP])
    );
    expect(await configMock.getSupplyCap()).to.be.eq(SUPPLY_CAP);
    expect(await configMock.setSupplyCap(ZERO));
    expect(bigNumbersToArrayString(await configMock.getCaps())).to.be.eql(
      bigNumbersToArrayString([ZERO, ZERO])
    );
    expect(await configMock.getSupplyCap()).to.be.eq(ZERO);
  });

  it("TC-reserve-configuration-12 setLtv() with ltv = MAX_VALID_LTV", async () => {
    expect(bigNumbersToArrayString(await configMock.getParams())).to.be.eql(
      bigNumbersToArrayString([ZERO, ZERO, ZERO, ZERO, ZERO])
    );
    expect(await configMock.getLtv()).to.be.eq(ZERO);
    expect(await configMock.setLtv(MAX_VALID_LTV));
    // LTV is the 1st param
    expect(bigNumbersToArrayString(await configMock.getParams())).to.be.eql(
      bigNumbersToArrayString([MAX_VALID_LTV, ZERO, ZERO, ZERO, ZERO])
    );
    expect(await configMock.getLtv()).to.be.eq(MAX_VALID_LTV);
    expect(await configMock.setLtv(0));
    expect(bigNumbersToArrayString(await configMock.getParams())).to.be.eql(
      bigNumbersToArrayString([ZERO, ZERO, ZERO, ZERO, ZERO])
    );
    expect(await configMock.getLtv()).to.be.eq(ZERO);
  });

  it("TC-reserve-configuration-13 setLtv() with ltv > MAX_VALID_LTV (revert expected)", async () => {
    expect(await configMock.getLtv()).to.be.eq(ZERO);

    const {INVALID_LTV} = ProtocolErrors;

    // setLTV to MAX_VALID_LTV + 1
    await expect(configMock.setLtv(MAX_VALID_LTV.add(1))).to.be.revertedWith(
      INVALID_LTV
    );
    expect(await configMock.getLtv()).to.be.eq(ZERO);
  });

  it("TC-reserve-configuration-14 setLiquidationThreshold() with threshold = MAX_VALID_LIQUIDATION_THRESHOLD", async () => {
    expect(bigNumbersToArrayString(await configMock.getParams())).to.be.eql(
      bigNumbersToArrayString([ZERO, ZERO, ZERO, ZERO, ZERO])
    );
    expect(await configMock.getLiquidationThreshold()).to.be.eq(ZERO);
    expect(
      await configMock.setLiquidationThreshold(MAX_VALID_LIQUIDATION_THRESHOLD)
    );
    // LIQ_THRESHOLD is the 2nd param
    expect(bigNumbersToArrayString(await configMock.getParams())).to.be.eql(
      bigNumbersToArrayString([
        ZERO,
        MAX_VALID_LIQUIDATION_THRESHOLD,
        ZERO,
        ZERO,
        ZERO,
      ])
    );
    expect(await configMock.getLiquidationThreshold()).to.be.eq(
      MAX_VALID_LIQUIDATION_THRESHOLD
    );
    expect(await configMock.setLiquidationThreshold(0));
    expect(bigNumbersToArrayString(await configMock.getParams())).to.be.eql(
      bigNumbersToArrayString([ZERO, ZERO, ZERO, ZERO, ZERO])
    );
    expect(await configMock.getLiquidationThreshold()).to.be.eq(ZERO);
  });

  it("TC-reserve-configuration-15 setLiquidationThreshold() with threshold > MAX_VALID_LIQUIDATION_THRESHOLD (revert expected)", async () => {
    expect(await configMock.getLiquidationThreshold()).to.be.eq(ZERO);

    const {INVALID_LIQ_THRESHOLD} = ProtocolErrors;

    // setLiquidationThreshold to MAX_VALID_LIQUIDATION_THRESHOLD + 1
    await expect(
      configMock.setLiquidationThreshold(MAX_VALID_LIQUIDATION_THRESHOLD.add(1))
    ).to.be.revertedWith(INVALID_LIQ_THRESHOLD);
    expect(await configMock.getLiquidationThreshold()).to.be.eq(ZERO);
  });

  it("TC-reserve-configuration-16 setDecimals() with decimals = MAX_VALID_DECIMALS", async () => {
    expect(bigNumbersToArrayString(await configMock.getParams())).to.be.eql(
      bigNumbersToArrayString([ZERO, ZERO, ZERO, ZERO, ZERO])
    );
    expect(await configMock.getDecimals()).to.be.eq(ZERO);
    expect(await configMock.setDecimals(MAX_VALID_DECIMALS));
    // Decimals is the 4th param
    expect(bigNumbersToArrayString(await configMock.getParams())).to.be.eql(
      bigNumbersToArrayString([ZERO, ZERO, ZERO, MAX_VALID_DECIMALS, ZERO])
    );
    expect(await configMock.getDecimals()).to.be.eq(MAX_VALID_DECIMALS);
    expect(await configMock.setDecimals(0));
    expect(bigNumbersToArrayString(await configMock.getParams())).to.be.eql(
      bigNumbersToArrayString([ZERO, ZERO, ZERO, ZERO, ZERO])
    );
    expect(await configMock.getDecimals()).to.be.eq(ZERO);
  });

  it("TC-reserve-configuration-17 setDecimals() with decimals > MAX_VALID_DECIMALS (revert expected)", async () => {
    expect(await configMock.getDecimals()).to.be.eq(ZERO);

    const {INVALID_DECIMALS} = ProtocolErrors;

    // setDecimals to MAX_VALID_DECIMALS + 1
    await expect(
      configMock.setDecimals(MAX_VALID_DECIMALS.add(1))
    ).to.be.revertedWith(INVALID_DECIMALS);
    expect(await configMock.getDecimals()).to.be.eq(ZERO);
  });

  it("TC-reserve-configuration-18 setLiquidationProtocolFee() with liquidationProtocolFee == MAX_VALID_LIQUIDATION_PROTOCOL_FEE", async () => {
    expect(await configMock.getLiquidationProtocolFee()).to.be.eq(ZERO);
    expect(
      await configMock.setLiquidationProtocolFee(
        MAX_VALID_LIQUIDATION_PROTOCOL_FEE
      )
    );
    expect(await configMock.getLiquidationProtocolFee()).to.be.eq(
      MAX_VALID_LIQUIDATION_PROTOCOL_FEE
    );
  });

  it("TC-reserve-configuration-19 setLiquidationProtocolFee() with liquidationProtocolFee > MAX_VALID_LIQUIDATION_PROTOCOL_FEE", async () => {
    await loadFixture(fixture);

    expect(await configMock.getLiquidationProtocolFee()).to.be.eq(ZERO);
    await expect(
      configMock.setLiquidationProtocolFee(
        MAX_VALID_LIQUIDATION_PROTOCOL_FEE.add(1)
      )
    ).to.be.revertedWith(ProtocolErrors.INVALID_LIQUIDATION_PROTOCOL_FEE);
    expect(await configMock.getLiquidationProtocolFee()).to.be.eq(ZERO);
  });
});
