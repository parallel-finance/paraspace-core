import {expect} from "chai";
import {BigNumber} from "ethers";
import {
  deployMockReserveConfiguration,
  deployPoolCoreLibraries,
  deployReserveAuctionStrategy,
} from "../helpers/contracts-deployments";
import {
  ERC20__factory,
  IPool,
  IPoolAddressesProvider,
  MintableERC20__factory,
  MockReserveConfiguration,
  MockReserveInterestRateStrategy__factory,
  PoolCore__factory,
  PToken__factory,
  VariableDebtToken__factory,
} from "../types";
import {ProtocolErrors} from "../helpers/types";
import {testEnvFixture} from "./helpers/setup-env";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {topUpNonPayableWithEther} from "./helpers/utils/funds";
import {ZERO_ADDRESS} from "../helpers/constants";
import {ConfiguratorInputTypes} from "../types/interfaces/IPoolConfigurator";
import {getFirstSigner} from "../helpers/contracts-getters";
import {auctionStrategyExp} from "../market-config/auctionStrategies";
import {BigNumberish, utils} from "ethers";
import {ETHERSCAN_VERIFICATION} from "../helpers/hardhat-constants";
import {impersonateAddress} from "../helpers/contracts-helpers";

describe("ReserveConfiguration", async () => {
  const fixture = async () => {
    const testEnv = await loadFixture(testEnvFixture);
    configMock = await deployMockReserveConfiguration(ETHERSCAN_VERIFICATION);
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

  it("TC-reserve-configuration-20 Initialize an already initialized reserve. ReserveLogic `init` where xTokenAddress != ZERO_ADDRESS (revert expected)", async () => {
    const {pool, dai, deployer, configurator} = await loadFixture(
      testEnvFixture
    );

    // Impersonate PoolConfigurator
    await topUpNonPayableWithEther(
      deployer.signer,
      [configurator.address],
      utils.parseEther("1")
    );
    const configSigner = (await impersonateAddress(configurator.address))
      .signer;

    const config = await pool.getReserveData(dai.address);

    await expect(
      pool.connect(configSigner).initReserve(
        dai.address,
        config.xTokenAddress, // just need a non-used reserve token
        config.variableDebtTokenAddress,
        ZERO_ADDRESS,
        ZERO_ADDRESS
      )
    ).to.be.revertedWith(ProtocolErrors.RESERVE_ALREADY_INITIALIZED);
  });

  it("TC-reserve-configuration-21 Init reserve with ZERO_ADDRESS as xToken twice, to enter `_addReserveToList()` already added (revert expected)", async () => {
    /**
     * To get into this case, we need to init a reserve with `xTokenAddress = address(0)` twice.
     * `_addReserveToList()` is called from `initReserve`. However, in `initReserve` we run `init` before the `_addReserveToList()`,
     * and in `init` we are checking if `xTokenAddress == address(0)`, so to bypass that we need this odd init.
     */
    const {pool, dai, deployer, configurator} = await loadFixture(
      testEnvFixture
    );

    // Impersonate PoolConfigurator
    await topUpNonPayableWithEther(
      deployer.signer,
      [configurator.address],
      utils.parseEther("1")
    );
    const configSigner = (await impersonateAddress(configurator.address))
      .signer;

    const config = await pool.getReserveData(dai.address);

    const poolListBefore = await pool.getReservesList();

    expect(
      await pool
        .connect(configSigner)
        .initReserve(
          config.xTokenAddress,
          ZERO_ADDRESS,
          config.variableDebtTokenAddress,
          ZERO_ADDRESS,
          ZERO_ADDRESS
        )
    );
    const poolListMid = await pool.getReservesList();
    expect(poolListBefore.length + 1).to.be.eq(poolListMid.length);

    // Add it again.
    await expect(
      pool
        .connect(configSigner)
        .initReserve(
          config.xTokenAddress,
          ZERO_ADDRESS,
          config.variableDebtTokenAddress,
          ZERO_ADDRESS,
          ZERO_ADDRESS
        )
    ).to.be.revertedWith(ProtocolErrors.RESERVE_ALREADY_ADDED);
    const poolListAfter = await pool.getReservesList();
    expect(poolListAfter.length).to.be.eq(poolListMid.length);
  });

  it("TC-reserve-configuration-22 Initialize reserves until max, then add one more (revert expected)", async () => {
    const {addressesProvider, poolAdmin, pool, configurator} =
      await loadFixture(testEnvFixture);

    const currentNumReserves = (await pool.getReservesList()).length;
    const expectedMaxReserves = 128;

    // Check the limit
    expect(await pool.MAX_NUMBER_RESERVES()).to.be.eq(expectedMaxReserves);

    for (let i = currentNumReserves + 1; i == expectedMaxReserves; i++) {
      // Deploy mock `InitReserveInput`
      const initInputParams = await getReserveParams(pool, addressesProvider);

      if (i == expectedMaxReserves) {
        await expect(
          await configurator
            .connect(poolAdmin.signer)
            .initReserves(initInputParams)
        ).to.be.revertedWith(ProtocolErrors.NO_MORE_RESERVES_ALLOWED);
      } else {
        expect(
          await configurator
            .connect(poolAdmin.signer)
            .initReserves(initInputParams)
        );
      }
    }
  });

  it("TC-reserve-configuration-23 Add asset after multiple drops", async () => {
    /**
     * 1. Init assets (done through setup so get this for free)
     * 2. Drop some reserves
     * 3. Init a new asset.
     * Intended behaviour new asset is inserted into one of the available spots in
     */
    const {configurator, pool, poolAdmin, addressesProvider} =
      await loadFixture(testEnvFixture);

    const reservesListBefore = await pool
      .connect(configurator.signer)
      .getReservesList();

    // Remove first 2 assets that has no borrows
    let dropped = 0;
    for (let i = 0; i < reservesListBefore.length; i++) {
      if (dropped == 2) {
        break;
      }
      const reserveAsset = reservesListBefore[i];
      const assetData = await pool.getReserveData(reserveAsset);

      if (
        assetData.currentLiquidityRate.eq(0) &&
        assetData.currentVariableBorrowRate.eq(0)
      ) {
        await configurator.connect(poolAdmin.signer).dropReserve(reserveAsset);
        dropped++;
      }
    }

    const reservesListAfterDrop = await pool
      .connect(configurator.signer)
      .getReservesList();
    expect(reservesListAfterDrop.length).to.be.eq(
      reservesListBefore.length - 2
    );

    // Init the reserve
    const initInputParams = await getReserveParams(pool, addressesProvider);
    expect(
      await configurator.connect(poolAdmin.signer).initReserves(initInputParams)
    );
    const reservesListAfterInit = await pool
      .connect(configurator.signer)
      .getReservesList();

    const occurrences = reservesListAfterInit.filter(
      (v) => v == initInputParams[0].underlyingAsset
    ).length;
    expect(occurrences).to.be.eq(
      1,
      "Asset has multiple occurrences in the reserves list"
    );

    expect(reservesListAfterInit.length).to.be.eq(
      reservesListAfterDrop.length + 1,
      "Reserves list was increased by more than 1"
    );
  });

  it("TC-reserve-configuration-24 Initialize reserves until max-1, then (drop one and add a new) x 2, finally add to hit max", async () => {
    /**
     * 1. Update max number of assets to current number og assets
     * 2. Drop some reserves
     * 3. Init a new asset.
     * Intended behaviour: new asset is inserted into one of the available spots in `_reservesList` and `_reservesCount` kept the same
     */
    const {addressesProvider, poolAdmin, pool, configurator} =
      await loadFixture(testEnvFixture);

    const currentNumReserves = (await pool.getReservesList()).length;
    const expectedMaxReserves = 128;

    for (let i = currentNumReserves + 1; i == expectedMaxReserves; i++) {
      // Init the reserve
      const initInputParams = await getReserveParams(pool, addressesProvider);

      if (i == expectedMaxReserves - 1) {
        // drop one, add new
        for (let dropped = 0; dropped < 2; dropped++) {
          // drop one
          const reservesListBefore = await pool
            .connect(configurator.signer)
            .getReservesList();
          for (let i = 0; i < reservesListBefore.length; i++) {
            const reserveAsset = reservesListBefore[i];
            const assetData = await pool.getReserveData(reserveAsset);

            if (assetData.xTokenAddress == ZERO_ADDRESS) {
              continue;
            }

            if (
              assetData.currentLiquidityRate.eq(0) &&
              assetData.currentVariableBorrowRate.eq(0)
            ) {
              await configurator
                .connect(poolAdmin.signer)
                .dropReserve(reserveAsset);
              break;
            }
          }

          // add new
          const initInputParams = await getReserveParams(
            pool,
            addressesProvider
          );
          expect(
            await configurator
              .connect(poolAdmin.signer)
              .initReserves(initInputParams)
          );
        }
      } else if (i == expectedMaxReserves) {
        // add to hit max
        const initInputParams = await getReserveParams(pool, addressesProvider);

        await expect(
          await configurator
            .connect(poolAdmin.signer)
            .initReserves(initInputParams)
        ).to.be.revertedWith(ProtocolErrors.NO_MORE_RESERVES_ALLOWED);
      } else {
        // keep adding reserves
        expect(
          await configurator
            .connect(poolAdmin.signer)
            .initReserves(initInputParams)
        );
      }
    }
  });

  it("Tries to initialize a reserve with a PToken and VariableDebt each deployed with the wrong pool address (revert expected)", async () => {
    const {pool, deployer, configurator, addressesProvider} = await loadFixture(
      testEnvFixture
    );

    const coreLibraries = await deployPoolCoreLibraries(false);
    const NEW_POOL_IMPL_ARTIFACT = await new PoolCore__factory(
      coreLibraries,
      await getFirstSigner()
    ).deploy(addressesProvider.address);

    const xTokenImp = await new PToken__factory(await getFirstSigner()).deploy(
      pool.address
    );
    const variableDebtTokenImp = await new VariableDebtToken__factory(
      deployer.signer
    ).deploy(pool.address);

    const xTokenWrongPool = await new PToken__factory(
      await getFirstSigner()
    ).deploy(NEW_POOL_IMPL_ARTIFACT.address);

    const variableDebtTokenWrongPool = await new VariableDebtToken__factory(
      deployer.signer
    ).deploy(NEW_POOL_IMPL_ARTIFACT.address);

    const mockErc20 = await new ERC20__factory(deployer.signer).deploy(
      "mock",
      "MOCK"
    );
    const mockRateStrategy = await new MockReserveInterestRateStrategy__factory(
      await getFirstSigner()
    ).deploy(addressesProvider.address, 0, 0, 0, 0);
    const mockAuctionStrategy = await deployReserveAuctionStrategy("test", [
      auctionStrategyExp.maxPriceMultiplier,
      auctionStrategyExp.minExpPriceMultiplier,
      auctionStrategyExp.minPriceMultiplier,
      auctionStrategyExp.stepLinear,
      auctionStrategyExp.stepExp,
      auctionStrategyExp.tickLength,
    ]);

    // Init the reserve
    const initInputParams: {
      xTokenImpl: string;
      variableDebtTokenImpl: string;
      underlyingAssetDecimals: BigNumberish;
      interestRateStrategyAddress: string;
      auctionStrategyAddress: string;
      underlyingAsset: string;
      assetType: BigNumberish;
      treasury: string;
      incentivesController: string;
      underlyingAssetName: string;
      xTokenName: string;
      xTokenSymbol: string;
      variableDebtTokenName: string;
      variableDebtTokenSymbol: string;
      stableDebtTokenName: string;
      stableDebtTokenSymbol: string;
      params: string;
    }[] = [
      {
        xTokenImpl: xTokenImp.address,
        variableDebtTokenImpl: variableDebtTokenImp.address,
        underlyingAssetDecimals: 18,
        interestRateStrategyAddress: mockRateStrategy.address,
        auctionStrategyAddress: mockAuctionStrategy.address,
        underlyingAsset: mockErc20.address,
        assetType: 0,
        treasury: ZERO_ADDRESS,
        incentivesController: ZERO_ADDRESS,
        underlyingAssetName: "MOCK",
        xTokenName: "PMOCK",
        xTokenSymbol: "PMOCK",
        variableDebtTokenName: "VMOCK",
        variableDebtTokenSymbol: "VMOCK",
        stableDebtTokenName: "SMOCK",
        stableDebtTokenSymbol: "SMOCK",
        params: "0x10",
      },
    ];

    initInputParams[0].xTokenImpl = xTokenWrongPool.address;
    await expect(configurator.initReserves(initInputParams)).to.be.reverted;
    initInputParams[0].xTokenImpl = xTokenImp.address;

    initInputParams[0].variableDebtTokenImpl =
      variableDebtTokenWrongPool.address;
    await expect(configurator.initReserves(initInputParams)).to.be.reverted;
    initInputParams[0].variableDebtTokenImpl = variableDebtTokenImp.address;

    expect(await configurator.initReserves(initInputParams));
  });
});

const getReserveParams = async (
  pool: IPool,
  addressesProvider: IPoolAddressesProvider
): Promise<ConfiguratorInputTypes.InitReserveInputStruct[]> => {
  // Deploy mock `InitReserveInput`
  const mockToken = await new MintableERC20__factory(
    await getFirstSigner()
  ).deploy("MOCK", "MOCK", "18");
  const variableDebtTokenImplementation = await new VariableDebtToken__factory(
    await getFirstSigner()
  ).deploy(pool.address);
  const xTokenImplementation = await new PToken__factory(
    await getFirstSigner()
  ).deploy(pool.address);
  const mockRateStrategy = await new MockReserveInterestRateStrategy__factory(
    await getFirstSigner()
  ).deploy(addressesProvider.address, 0, 0, 0, 0);

  // Init the reserve
  const initInputParams = [
    {
      xTokenImpl: xTokenImplementation.address,
      variableDebtTokenImpl: variableDebtTokenImplementation.address,
      assetType: 0,
      underlyingAssetDecimals: 18,
      interestRateStrategyAddress: mockRateStrategy.address,
      auctionStrategyAddress: ZERO_ADDRESS,
      underlyingAsset: mockToken.address,
      treasury: ZERO_ADDRESS,
      incentivesController: ZERO_ADDRESS,
      xTokenName: "PMOCK",
      xTokenSymbol: "PMOCK",
      variableDebtTokenName: "VMOCK",
      variableDebtTokenSymbol: "VMOCK",
      params: "0x10",
    },
  ];

  return initInputParams;
};
