import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {utils} from "ethers";
import {BigNumber} from "ethers";
import {parseEther} from "ethers/lib/utils";
import {
  MAX_UINT_AMOUNT,
  ONE_ADDRESS,
  RAY,
  ZERO_ADDRESS,
  MAX_BORROW_CAP,
  MAX_SUPPLY_CAP,
} from "../helpers/constants";
import {deployReserveAuctionStrategy} from "../helpers/contracts-deployments";
import {getFirstSigner} from "../helpers/contracts-getters";
import {eContractid, ProtocolErrors} from "../helpers/types";
import {auctionStrategyExp} from "../market-config/auctionStrategies";
import {strategyWETH} from "../market-config/reservesConfigs";
import {
  convertToCurrencyDecimals,
  impersonateAddress,
} from "../helpers/contracts-helpers";
import {
  ERC20,
  ERC20__factory,
  MintableERC20,
  MintableERC20__factory,
  MockReserveInterestRateStrategy__factory,
  ProtocolDataProvider,
  PToken__factory,
  VariableDebtToken__factory,
} from "../types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {waitForTx} from "../helpers/misc-utils";
import {BigNumberish} from "ethers";
import "./helpers/utils/wadraymath";
import {supplyAndValidate} from "./helpers/validated-steps";
import {topUpNonPayableWithEther} from "./helpers/utils/funds";
import {ETHERSCAN_VERIFICATION} from "../helpers/hardhat-constants";

describe("PoolConfigurator: Common", () => {
  type ReserveConfigurationValues = {
    reserveDecimals: string;
    baseLTVAsCollateral: string;
    liquidationThreshold: string;
    liquidationBonus: string;
    reserveFactor: string;
    usageAsCollateralEnabled: boolean;
    borrowingEnabled: boolean;
    isActive: boolean;
    isFrozen: boolean;
    isPaused: boolean;
    borrowCap: string;
    supplyCap: string;
    liquidationProtocolFee: BigNumber;
  };

  const expectReserveConfigurationData = async (
    protocolDataProvider: ProtocolDataProvider,
    asset: string,
    values: ReserveConfigurationValues
  ) => {
    const [reserveCfg, reserveCaps, liquidationProtocolFee] =
      await getReserveData(protocolDataProvider, asset);
    expect(reserveCfg.decimals).to.be.eq(
      values.reserveDecimals,
      "reserveDecimals is not correct"
    );
    expect(reserveCfg.ltv).to.be.eq(
      values.baseLTVAsCollateral,
      "ltv is not correct"
    );
    expect(reserveCfg.liquidationThreshold).to.be.eq(
      values.liquidationThreshold,
      "liquidationThreshold is not correct"
    );
    expect(reserveCfg.liquidationBonus).to.be.eq(
      values.liquidationBonus,
      "liquidationBonus is not correct"
    );
    expect(reserveCfg.reserveFactor).to.be.eq(
      values.reserveFactor,
      "reserveFactor is not correct"
    );
    expect(reserveCfg.usageAsCollateralEnabled).to.be.eq(
      values.usageAsCollateralEnabled,
      "usageAsCollateralEnabled is not correct"
    );
    expect(reserveCfg.borrowingEnabled).to.be.eq(
      values.borrowingEnabled,
      "borrowingEnabled is not correct"
    );
    expect(reserveCfg.isActive).to.be.eq(
      values.isActive,
      "isActive is not correct"
    );
    expect(reserveCfg.isFrozen).to.be.eq(
      values.isFrozen,
      "isFrozen is not correct"
    );
    expect(reserveCfg.isPaused).to.be.equal(
      values.isPaused,
      "isPaused is not correct"
    );
    expect(reserveCaps.borrowCap).to.be.eq(
      values.borrowCap,
      "borrowCap is not correct"
    );
    expect(reserveCaps.supplyCap).to.be.eq(
      values.supplyCap,
      "supplyCap is not correct"
    );
    expect(liquidationProtocolFee).to.be.eq(
      values.liquidationProtocolFee,
      "liquidationProtocolFee is not correct"
    );
  };

  const getReserveData = async (
    protocolDataProvider: ProtocolDataProvider,
    asset: string
  ) => {
    return Promise.all([
      protocolDataProvider.getReserveConfigurationData(asset),
      protocolDataProvider.getReserveCaps(asset),
      protocolDataProvider.getLiquidationProtocolFee(asset),
    ]);
  };
  const {
    reserveDecimals,
    baseLTVAsCollateral,
    liquidationThreshold,
    liquidationBonus,
    reserveFactor,
    borrowingEnabled,
    borrowCap,
    supplyCap,
  } = strategyWETH;
  const baseConfigValues = {
    reserveDecimals,
    baseLTVAsCollateral,
    liquidationThreshold,
    liquidationBonus,
    reserveFactor,
    usageAsCollateralEnabled: true,
    borrowingEnabled,
    isActive: true,
    isFrozen: false,
    isPaused: false,
    borrowCap: borrowCap,
    supplyCap: supplyCap,
    liquidationProtocolFee: BigNumber.from(0),
  };

  it("TC-poolConfigurator-initReserves-01: InitReserves via AssetListing admin", async () => {
    const {
      addressesProvider,
      configurator,
      poolAdmin,
      aclManager,
      pool,
      assetListingAdmin,
    } = await loadFixture(testEnvFixture);

    // Add new AssetListingAdmin
    expect(
      await aclManager
        .connect(poolAdmin.signer)
        .addAssetListingAdmin(assetListingAdmin.address)
    );

    // Deploy mock `InitReserveInput`
    const mockToken = await new MintableERC20__factory(
      await getFirstSigner()
    ).deploy("MOCK", "MOCK", "18");
    const variableDebtTokenImplementation =
      await new VariableDebtToken__factory(await getFirstSigner()).deploy(
        pool.address
      );
    const xTokenImplementation = await new PToken__factory(
      await getFirstSigner()
    ).deploy(pool.address);
    const mockRateStrategy = await new MockReserveInterestRateStrategy__factory(
      await getFirstSigner()
    ).deploy(addressesProvider.address, 0, 0, 0, 0);
    const mockAuctionStrategy = await deployReserveAuctionStrategy(
      eContractid.DefaultReserveAuctionStrategy,
      [
        auctionStrategyExp.maxPriceMultiplier,
        auctionStrategyExp.minExpPriceMultiplier,
        auctionStrategyExp.minPriceMultiplier,
        auctionStrategyExp.stepLinear,
        auctionStrategyExp.stepExp,
        auctionStrategyExp.tickLength,
      ],
      ETHERSCAN_VERIFICATION
    );
    // Init the reserve
    const initInputParams = [
      {
        xTokenImpl: xTokenImplementation.address,
        variableDebtTokenImpl: variableDebtTokenImplementation.address,
        assetType: 0,
        underlyingAssetDecimals: 18,
        interestRateStrategyAddress: mockRateStrategy.address,
        auctionStrategyAddress: mockAuctionStrategy.address,
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

    expect(
      await configurator
        .connect(assetListingAdmin.signer)
        .initReserves(initInputParams)
    );

    const {
      interestRateStrategyAddress: currentInterestRateStrategyAddress,
      auctionStrategyAddress: currentAuctionStrategyAddress,
    } = await pool.getReserveData(mockToken.address);

    expect(currentInterestRateStrategyAddress).to.be.equal(
      mockRateStrategy.address
    );
    expect(currentAuctionStrategyAddress).to.be.equal(
      mockAuctionStrategy.address
    );
  });

  it("TC-poolConfigurator-setReserveActive-01: Deactivates the ETH reserve", async () => {
    const {configurator, weth, protocolDataProvider} = await loadFixture(
      testEnvFixture
    );
    expect(await configurator.setReserveActive(weth.address, false));
    const {isActive} = await protocolDataProvider.getReserveConfigurationData(
      weth.address
    );
    expect(isActive).to.be.equal(false);
  });

  it("TC-poolConfigurator-setReserveActive-02: Reactivates the ETH reserve", async () => {
    const {configurator, weth, protocolDataProvider} = await loadFixture(
      testEnvFixture
    );
    expect(await configurator.setReserveActive(weth.address, true));
    const {isActive} = await protocolDataProvider.getReserveConfigurationData(
      weth.address
    );
    expect(isActive).to.be.equal(true);
  });

  it("TC-poolConfigurator-setReservePause-01: Pauses the ETH reserve by pool admin", async () => {
    const {configurator, weth, protocolDataProvider} = await loadFixture(
      testEnvFixture
    );
    expect(await configurator.setReservePause(weth.address, true))
      .to.emit(configurator, "ReservePaused")
      .withArgs(weth.address, true);

    await expectReserveConfigurationData(protocolDataProvider, weth.address, {
      ...baseConfigValues,
      isPaused: true,
    });
  });

  it("TC-poolConfigurator-setReservePause-02: Unpauses the ETH reserve by pool admin", async () => {
    const {configurator, protocolDataProvider, weth} = await loadFixture(
      testEnvFixture
    );
    expect(await configurator.setReservePause(weth.address, false))
      .to.emit(configurator, "ReservePaused")
      .withArgs(weth.address, false);

    await expectReserveConfigurationData(protocolDataProvider, weth.address, {
      ...baseConfigValues,
    });
  });

  it("TC-poolConfigurator-setReservePause-03: Pauses the ETH reserve by emergency admin", async () => {
    const {configurator, weth, protocolDataProvider, emergencyAdmin} =
      await loadFixture(testEnvFixture);
    expect(
      await configurator
        .connect(emergencyAdmin.signer)
        .setReservePause(weth.address, true)
    )
      .to.emit(configurator, "ReservePaused")
      .withArgs(weth.address, true);

    await expectReserveConfigurationData(protocolDataProvider, weth.address, {
      ...baseConfigValues,
      isPaused: true,
    });
  });

  it("TC-poolConfigurator-setReservePause-04: Unpauses the ETH reserve by emergency admin", async () => {
    const {configurator, protocolDataProvider, weth, emergencyAdmin} =
      await loadFixture(testEnvFixture);
    expect(
      await configurator
        .connect(emergencyAdmin.signer)
        .setReservePause(weth.address, false)
    )
      .to.emit(configurator, "ReservePaused")
      .withArgs(weth.address, false);

    await expectReserveConfigurationData(protocolDataProvider, weth.address, {
      ...baseConfigValues,
    });
  });

  it("TC-poolConfigurator-setReserveFreeze-01: Freezes the ETH reserve by pool Admin", async () => {
    const {configurator, weth, protocolDataProvider} = await loadFixture(
      testEnvFixture
    );

    expect(await configurator.setReserveFreeze(weth.address, true))
      .to.emit(configurator, "ReserveFrozen")
      .withArgs(weth.address, true);

    await expectReserveConfigurationData(protocolDataProvider, weth.address, {
      ...baseConfigValues,
      isFrozen: true,
    });
  });

  it("TC-poolConfigurator-setReserveFreeze-02: Unfreezes the ETH reserve by Pool admin", async () => {
    const {configurator, protocolDataProvider, weth} = await loadFixture(
      testEnvFixture
    );
    expect(await configurator.setReserveFreeze(weth.address, false))
      .to.emit(configurator, "ReserveFrozen")
      .withArgs(weth.address, false);

    await expectReserveConfigurationData(protocolDataProvider, weth.address, {
      ...baseConfigValues,
    });
  });

  it("TC-poolConfigurator-setReserveFreeze-03: Freezes the ETH reserve by Risk Admin", async () => {
    const {configurator, weth, protocolDataProvider, riskAdmin} =
      await loadFixture(testEnvFixture);
    expect(
      await configurator
        .connect(riskAdmin.signer)
        .setReserveFreeze(weth.address, true)
    )
      .to.emit(configurator, "ReserveFrozen")
      .withArgs(weth.address, true);

    await expectReserveConfigurationData(protocolDataProvider, weth.address, {
      ...baseConfigValues,
      isFrozen: true,
    });
  });

  it("TC-poolConfigurator-setReserveFreeze-04: Unfreezes the ETH reserve by Risk admin", async () => {
    const {configurator, protocolDataProvider, weth, riskAdmin} =
      await loadFixture(testEnvFixture);
    expect(
      await configurator
        .connect(riskAdmin.signer)
        .setReserveFreeze(weth.address, false)
    )
      .to.emit(configurator, "ReserveFrozen")
      .withArgs(weth.address, false);

    await expectReserveConfigurationData(protocolDataProvider, weth.address, {
      ...baseConfigValues,
    });
  });

  it("TC-poolConfigurator-setReserveBorrowing-01: Deactivates the ETH reserve for borrowing via pool admin", async () => {
    const {configurator, protocolDataProvider, weth} = await loadFixture(
      testEnvFixture
    );
    expect(await configurator.setReserveBorrowing(weth.address, false))
      .to.emit(configurator, "ReserveBorrowing")
      .withArgs(weth.address, false);

    await expectReserveConfigurationData(protocolDataProvider, weth.address, {
      ...baseConfigValues,
      borrowingEnabled: false,
    });
  });

  it("TC-poolConfigurator-setReserveBorrowing-02: Deactivates the ETH reserve for borrowing via risk admin", async () => {
    const {configurator, protocolDataProvider, weth, riskAdmin} =
      await loadFixture(testEnvFixture);
    expect(
      await configurator
        .connect(riskAdmin.signer)
        .setReserveBorrowing(weth.address, false)
    )
      .to.emit(configurator, "ReserveBorrowing")
      .withArgs(weth.address, false);

    await expectReserveConfigurationData(protocolDataProvider, weth.address, {
      ...baseConfigValues,
      borrowingEnabled: false,
    });
  });

  it("TC-poolConfigurator-setReserveBorrowing-03: Activates the ETH reserve for borrowing via pool admin", async () => {
    const {configurator, weth, protocolDataProvider} = await loadFixture(
      testEnvFixture
    );
    expect(await configurator.setReserveBorrowing(weth.address, true))
      .to.emit(configurator, "ReserveBorrowing")
      .withArgs(weth.address, true);

    const {variableBorrowIndex} = await protocolDataProvider.getReserveData(
      weth.address
    );

    await expectReserveConfigurationData(protocolDataProvider, weth.address, {
      ...baseConfigValues,
    });
    expect(variableBorrowIndex.toString()).to.be.equal(RAY);
  });

  it("TC-poolConfigurator-setReserveBorrowing-04: Activates the ETH reserve for borrowing via risk admin", async () => {
    const {configurator, weth, protocolDataProvider, riskAdmin} =
      await loadFixture(testEnvFixture);
    expect(
      await configurator
        .connect(riskAdmin.signer)
        .setReserveBorrowing(weth.address, true)
    )
      .to.emit(configurator, "ReserveBorrowing")
      .withArgs(weth.address, true);

    const {variableBorrowIndex} = await protocolDataProvider.getReserveData(
      weth.address
    );

    await expectReserveConfigurationData(protocolDataProvider, weth.address, {
      ...baseConfigValues,
    });
    expect(variableBorrowIndex.toString()).to.be.equal(RAY);
  });

  it("TC-poolConfigurator-configureReserveAsCollateral-01: Deactivates the ETH reserve as collateral via pool admin", async () => {
    const {configurator, protocolDataProvider, weth} = await loadFixture(
      testEnvFixture
    );
    expect(
      await configurator.configureReserveAsCollateral(weth.address, 0, 0, 0)
    )
      .to.emit(configurator, "CollateralConfigurationChanged")
      .withArgs(weth.address, 0, 0, 0);

    await expectReserveConfigurationData(protocolDataProvider, weth.address, {
      ...baseConfigValues,
      baseLTVAsCollateral: "0",
      liquidationThreshold: "0",
      liquidationBonus: "0",
      usageAsCollateralEnabled: false,
    });
  });

  it("TC-poolConfigurator-configureReserveAsCollateral-02: Activates the ETH reserve as collateral via pool admin", async () => {
    const {configurator, protocolDataProvider, weth} = await loadFixture(
      testEnvFixture
    );
    expect(
      await configurator.configureReserveAsCollateral(
        weth.address,
        baseConfigValues.baseLTVAsCollateral,
        baseConfigValues.liquidationThreshold,
        baseConfigValues.liquidationBonus
      )
    )
      .to.emit(configurator, "CollateralConfigurationChanged")
      .withArgs(
        weth.address,
        baseConfigValues.baseLTVAsCollateral,
        baseConfigValues.liquidationThreshold,
        baseConfigValues.liquidationBonus
      );

    await expectReserveConfigurationData(protocolDataProvider, weth.address, {
      ...baseConfigValues,
      baseLTVAsCollateral: baseConfigValues.baseLTVAsCollateral,
      liquidationThreshold: baseConfigValues.liquidationThreshold,
      liquidationBonus: baseConfigValues.liquidationBonus,
    });
  });

  it("TC-poolConfigurator-configureReserveAsCollateral-03: Deactivates the ETH reserve as collateral via risk admin", async () => {
    const {configurator, protocolDataProvider, weth, riskAdmin} =
      await loadFixture(testEnvFixture);
    expect(
      await configurator
        .connect(riskAdmin.signer)
        .configureReserveAsCollateral(weth.address, 0, 0, 0)
    )
      .to.emit(configurator, "CollateralConfigurationChanged")
      .withArgs(weth.address, 0, 0, 0);

    await expectReserveConfigurationData(protocolDataProvider, weth.address, {
      ...baseConfigValues,
      baseLTVAsCollateral: "0",
      liquidationThreshold: "0",
      liquidationBonus: "0",
      usageAsCollateralEnabled: false,
    });
  });

  it("TC-poolConfigurator-configureReserveAsCollateral-04: Activates the ETH reserve as collateral via risk admin", async () => {
    const {configurator, protocolDataProvider, weth, riskAdmin} =
      await loadFixture(testEnvFixture);
    expect(
      await configurator
        .connect(riskAdmin.signer)
        .configureReserveAsCollateral(
          weth.address,
          baseConfigValues.baseLTVAsCollateral,
          baseConfigValues.liquidationThreshold,
          baseConfigValues.liquidationBonus
        )
    )
      .to.emit(configurator, "CollateralConfigurationChanged")
      .withArgs(
        weth.address,
        baseConfigValues.baseLTVAsCollateral,
        baseConfigValues.liquidationThreshold,
        baseConfigValues.liquidationBonus
      );

    await expectReserveConfigurationData(protocolDataProvider, weth.address, {
      ...baseConfigValues,
      baseLTVAsCollateral: baseConfigValues.baseLTVAsCollateral,
      liquidationThreshold: baseConfigValues.liquidationThreshold,
      liquidationBonus: baseConfigValues.liquidationBonus,
    });
  });

  it("TC-poolConfigurator-setReserveFactor-01: Changes the reserve factor of WETH via pool admin", async () => {
    const {configurator, protocolDataProvider, weth} = await loadFixture(
      testEnvFixture
    );

    const {reserveFactor: oldReserveFactor} =
      await protocolDataProvider.getReserveConfigurationData(weth.address);

    const newReserveFactor = "1000";
    expect(await configurator.setReserveFactor(weth.address, newReserveFactor))
      .to.emit(configurator, "ReserveFactorChanged")
      .withArgs(weth.address, oldReserveFactor, newReserveFactor);

    await expectReserveConfigurationData(protocolDataProvider, weth.address, {
      ...baseConfigValues,
      reserveFactor: newReserveFactor,
    });
  });

  it("TC-poolConfigurator-setReserveFactor-02: Changes the reserve factor of WETH via risk admin", async () => {
    const {configurator, protocolDataProvider, weth, riskAdmin} =
      await loadFixture(testEnvFixture);

    const {reserveFactor: oldReserveFactor} =
      await protocolDataProvider.getReserveConfigurationData(weth.address);

    const newReserveFactor = "1000";
    expect(
      await configurator
        .connect(riskAdmin.signer)
        .setReserveFactor(weth.address, newReserveFactor)
    )
      .to.emit(configurator, "ReserveFactorChanged")
      .withArgs(weth.address, oldReserveFactor, newReserveFactor);

    await expectReserveConfigurationData(protocolDataProvider, weth.address, {
      ...baseConfigValues,
      reserveFactor: newReserveFactor,
    });
  });

  it("TC-poolConfigurator-setReserveFactor-03: Updates the reserve factor of WETH equal to PERCENTAGE_FACTOR", async () => {
    const {configurator, protocolDataProvider, weth, poolAdmin} =
      await loadFixture(testEnvFixture);

    const {reserveFactor: oldReserveFactor} =
      await protocolDataProvider.getReserveConfigurationData(weth.address);

    const newReserveFactor = "10000";
    expect(
      await configurator
        .connect(poolAdmin.signer)
        .setReserveFactor(weth.address, newReserveFactor)
    )
      .to.emit(configurator, "ReserveFactorChanged")
      .withArgs(weth.address, oldReserveFactor, newReserveFactor);

    await expectReserveConfigurationData(protocolDataProvider, weth.address, {
      ...baseConfigValues,
      reserveFactor: newReserveFactor,
    });
  });

  it("TC-poolConfigurator-setBorrowCap-01: Updates the borrowCap of WETH via pool admin", async () => {
    const {configurator, protocolDataProvider, weth} = await loadFixture(
      testEnvFixture
    );

    const {borrowCap: wethOldBorrowCap} =
      await protocolDataProvider.getReserveCaps(weth.address);

    const newBorrowCap = "3000000";
    expect(await configurator.setBorrowCap(weth.address, newBorrowCap))
      .to.emit(configurator, "BorrowCapChanged")
      .withArgs(weth.address, wethOldBorrowCap, newBorrowCap);

    await expectReserveConfigurationData(protocolDataProvider, weth.address, {
      ...baseConfigValues,
      borrowCap: newBorrowCap,
    });
  });

  it("TC-poolConfigurator-setBorrowCap-02: Updates the borrowCap of WETH risk admin", async () => {
    const {configurator, protocolDataProvider, weth, riskAdmin} =
      await loadFixture(testEnvFixture);

    const {borrowCap: wethOldBorrowCap} =
      await protocolDataProvider.getReserveCaps(weth.address);

    const newBorrowCap = "3000000";
    expect(
      await configurator
        .connect(riskAdmin.signer)
        .setBorrowCap(weth.address, newBorrowCap)
    )
      .to.emit(configurator, "BorrowCapChanged")
      .withArgs(weth.address, wethOldBorrowCap, newBorrowCap);

    await expectReserveConfigurationData(protocolDataProvider, weth.address, {
      ...baseConfigValues,
      borrowCap: newBorrowCap,
    });
  });

  it("TC-poolConfigurator-setSupplyCap-01: Updates the supplyCap of WETH via pool admin", async () => {
    const {configurator, protocolDataProvider, weth} = await loadFixture(
      testEnvFixture
    );

    const {supplyCap: oldWethSupplyCap} =
      await protocolDataProvider.getReserveCaps(weth.address);

    const newSupplyCap = "3000000";
    expect(await configurator.setSupplyCap(weth.address, newSupplyCap))
      .to.emit(configurator, "SupplyCapChanged")
      .withArgs(weth.address, oldWethSupplyCap, newSupplyCap);

    await expectReserveConfigurationData(protocolDataProvider, weth.address, {
      ...baseConfigValues,
      supplyCap: newSupplyCap,
    });
  });

  it("TC-poolConfigurator-setSupplyCap-02: Updates the supplyCap of WETH via risk admin", async () => {
    const {configurator, protocolDataProvider, weth, riskAdmin} =
      await loadFixture(testEnvFixture);

    const {supplyCap: oldWethSupplyCap} =
      await protocolDataProvider.getReserveCaps(weth.address);

    const newSupplyCap = "3000000";
    expect(
      await configurator
        .connect(riskAdmin.signer)
        .setSupplyCap(weth.address, newSupplyCap)
    )
      .to.emit(configurator, "SupplyCapChanged")
      .withArgs(weth.address, oldWethSupplyCap, newSupplyCap);

    await expectReserveConfigurationData(protocolDataProvider, weth.address, {
      ...baseConfigValues,
      supplyCap: newSupplyCap,
    });
  });

  it("TC-poolConfigurator-setReserveInterestRateStrategyAddress-01: Updates the ReserveInterestRateStrategy address of WETH via pool admin", async () => {
    const {poolAdmin, pool, configurator, weth} = await loadFixture(
      testEnvFixture
    );

    const {interestRateStrategyAddress: interestRateStrategyAddressBefore} =
      await pool.getReserveData(weth.address);

    expect(
      await configurator
        .connect(poolAdmin.signer)
        .setReserveInterestRateStrategyAddress(weth.address, ZERO_ADDRESS)
    )
      .to.emit(configurator, "ReserveInterestRateStrategyChanged")
      .withArgs(weth.address, interestRateStrategyAddressBefore, ZERO_ADDRESS);
    const {interestRateStrategyAddress: interestRateStrategyAddressAfter} =
      await pool.getReserveData(weth.address);

    expect(interestRateStrategyAddressBefore).to.not.be.eq(ZERO_ADDRESS);
    expect(interestRateStrategyAddressAfter).to.be.eq(ZERO_ADDRESS);
  });

  it("TC-poolConfigurator-setReserveInterestRateStrategyAddress-02: Updates the ReserveInterestRateStrategy address of WETH via risk admin", async () => {
    const {riskAdmin, pool, configurator, weth} = await loadFixture(
      testEnvFixture
    );

    const {interestRateStrategyAddress: interestRateStrategyAddressBefore} =
      await pool.getReserveData(weth.address);

    expect(
      await configurator
        .connect(riskAdmin.signer)
        .setReserveInterestRateStrategyAddress(weth.address, ONE_ADDRESS)
    )
      .to.emit(configurator, "ReserveInterestRateStrategyChanged")
      .withArgs(weth.address, interestRateStrategyAddressBefore, ONE_ADDRESS);
    const {interestRateStrategyAddress: interestRateStrategyAddressAfter} =
      await pool.getReserveData(weth.address);

    expect(interestRateStrategyAddressBefore).to.not.be.eq(ONE_ADDRESS);
    expect(interestRateStrategyAddressAfter).to.be.eq(ONE_ADDRESS);
  });

  it("TC-poolConfigurator-setReserveInterestRateStrategyAddress-03 PoolConfigurator updates the ReserveInterestRateStrategy address for asset 0 (revert expected)", async () => {
    const {pool, deployer, configurator} = await loadFixture(testEnvFixture);

    // Impersonate PoolConfigurator
    await topUpNonPayableWithEther(
      deployer.signer,
      [configurator.address],
      utils.parseEther("1")
    );
    const configSigner = (await impersonateAddress(configurator.address))
      .signer;

    await expect(
      pool
        .connect(configSigner)
        .setReserveInterestRateStrategyAddress(ZERO_ADDRESS, ZERO_ADDRESS)
    ).to.be.revertedWith(ProtocolErrors.ZERO_ADDRESS_NOT_VALID);
  });

  it("TC-poolConfigurator-setReserveInterestRateStrategyAddress-04 PoolConfigurator updates the ReserveInterestRateStrategy address for an unlisted asset (revert expected)", async () => {
    const {pool, deployer, configurator, users} = await loadFixture(
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

    await expect(
      pool
        .connect(configSigner)
        .setReserveInterestRateStrategyAddress(users[5].address, ZERO_ADDRESS)
    ).to.be.revertedWith(ProtocolErrors.ASSET_NOT_LISTED);
  });

  it("TC-poolConfigurator-setReserveInterestRateStrategyAddress-05 Activates the zero address reserve for borrowing via pool admin (expect revert)", async () => {
    const {configurator} = await loadFixture(testEnvFixture);
    await expect(
      configurator.setReserveBorrowing(ZERO_ADDRESS, true)
    ).to.be.revertedWith(ProtocolErrors.ZERO_ADDRESS_NOT_VALID);
  });

  it("TC-poolConfigurator-setSiloedBorrowing-01: Sets siloed borrowing through the pool admin", async () => {
    const {configurator, protocolDataProvider, weth, poolAdmin} =
      await loadFixture(testEnvFixture);

    const oldSiloedBorrowing = await protocolDataProvider.getSiloedBorrowing(
      weth.address
    );

    expect(
      await configurator
        .connect(poolAdmin.signer)
        .setSiloedBorrowing(weth.address, true)
    )
      .to.emit(configurator, "SiloedBorrowingChanged")
      .withArgs(weth.address, oldSiloedBorrowing, true);

    const newSiloedBorrowing = await protocolDataProvider.getSiloedBorrowing(
      weth.address
    );

    expect(newSiloedBorrowing).to.be.eq(true, "Invalid siloed borrowing state");
  });

  it("TC-poolConfigurator-setSiloedBorrowing-02: Sets siloed borrowing through the risk admin", async () => {
    const {configurator, protocolDataProvider, weth, riskAdmin} =
      await loadFixture(testEnvFixture);

    const oldSiloedBorrowing = await protocolDataProvider.getSiloedBorrowing(
      weth.address
    );

    expect(
      await configurator
        .connect(riskAdmin.signer)
        .setSiloedBorrowing(weth.address, false)
    )
      .to.emit(configurator, "SiloedBorrowingChanged")
      .withArgs(weth.address, oldSiloedBorrowing, false);

    const newSiloedBorrowing = await protocolDataProvider.getSiloedBorrowing(
      weth.address
    );

    expect(newSiloedBorrowing).to.be.eq(
      false,
      "Invalid siloed borrowing state"
    );
  });

  it("TC-poolConfigurator-setSiloedBorrowing-03: Resets the siloed borrowing mode. Tries to set siloed borrowing after the asset has been borrowed (revert expected)", async () => {
    const {
      configurator,
      weth,
      dai,
      riskAdmin,
      pool,
      users: [user1, user2],
    } = await loadFixture(testEnvFixture);

    await configurator
      .connect(riskAdmin.signer)
      .setSiloedBorrowing(weth.address, false);

    const wethAmount = parseEther("1");
    const daiAmount = parseEther("1000");
    // user 1 supplies WETH
    await weth.connect(user1.signer)["mint(uint256)"](wethAmount);

    await weth.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT);

    await pool
      .connect(user1.signer)
      .supply(weth.address, wethAmount, user1.address, "0");

    // user 2 supplies DAI, borrows WETH
    await dai.connect(user2.signer)["mint(uint256)"](daiAmount);

    await dai.connect(user2.signer).approve(pool.address, MAX_UINT_AMOUNT);

    await pool
      .connect(user2.signer)
      .supply(dai.address, daiAmount, user2.address, "0");

    await pool
      .connect(user2.signer)
      .borrow(weth.address, "100", "0", user2.address);

    await expect(
      configurator.setSiloedBorrowing(weth.address, true)
    ).to.be.revertedWith(ProtocolErrors.RESERVE_DEBT_NOT_ZERO);
  });

  it("TC-poolConfigurator-setReserveAuctionStrategyAddress-01: Set reserve auction strategy address through the pool admin", async () => {
    const {configurator, weth, poolAdmin, pool} = await loadFixture(
      testEnvFixture
    );
    const {auctionStrategyAddress: oldAuctionStrategyAddress} =
      await pool.getReserveData(weth.address);
    expect(
      await configurator
        .connect(poolAdmin.signer)
        .setReserveAuctionStrategyAddress(weth.address, ZERO_ADDRESS)
    )
      .to.emit(configurator, "ReserveAuctionStrategyChanged")
      .withArgs(weth.address, oldAuctionStrategyAddress, ZERO_ADDRESS);
    const {auctionStrategyAddress: newAuctionStrategyAddress} =
      await pool.getReserveData(weth.address);
    expect(newAuctionStrategyAddress).to.be.equal(ZERO_ADDRESS);
  });

  it("TC-poolConfigurator-setAuctionRecoveryHealthFactor-01: Set auction recovery health factor through the pool admin", async () => {
    const {configurator, poolAdmin, pool} = await loadFixture(testEnvFixture);
    const hf = "1500000000000000000";
    expect(
      await configurator
        .connect(poolAdmin.signer)
        .setAuctionRecoveryHealthFactor(hf)
    );
    const recoveryHealthFactor = await pool.AUCTION_RECOVERY_HEALTH_FACTOR();
    expect(recoveryHealthFactor).to.be.equal(hf);
  });

  it("TC-poolConfigurator-setAuctionRecoveryHealthFactor-02: Set invalid health factor through the pool admin (revert expected)", async () => {
    const {configurator} = await loadFixture(testEnvFixture);
    const {INVALID_AMOUNT} = ProtocolErrors;
    const min_hf = "1";
    const max_hf = "3000000000000000001";
    await expect(
      configurator.setAuctionRecoveryHealthFactor(min_hf)
    ).to.be.revertedWith(INVALID_AMOUNT);
    await expect(
      configurator.setAuctionRecoveryHealthFactor(max_hf)
    ).to.be.revertedWith(INVALID_AMOUNT);
    await expect(
      configurator.setAuctionRecoveryHealthFactor("0")
    ).to.be.revertedWith(INVALID_AMOUNT);
  });
});

describe("PoolConfigurator: Drop Reserve", () => {
  let testEnv: TestEnv;
  const {
    XTOKEN_SUPPLY_NOT_ZERO,
    VARIABLE_DEBT_SUPPLY_NOT_ZERO,
    ASSET_NOT_LISTED,
    ZERO_ADDRESS_NOT_VALID,
  } = ProtocolErrors;

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
  });

  it("TC-poolConfigurator-dropReserve-01: User 1 deposits DAI, User 2 borrow DAI variable, should fail to drop DAI reserve", async () => {
    const {
      deployer,
      users: [user1],
      pool,
      dai,
      weth,
      configurator,
    } = testEnv;
    const borrowedAmount = utils.parseEther("100");
    const depositedAmount = utils.parseEther("1000");
    // setting reserve factor to 0 to ease tests, no xToken accrued in reserve
    await configurator.setReserveFactor(dai.address, 0);
    await dai["mint(uint256)"](depositedAmount);
    await dai.approve(pool.address, depositedAmount);
    await dai.connect(user1.signer)["mint(uint256)"](depositedAmount);
    await dai.connect(user1.signer).approve(pool.address, depositedAmount);
    await weth.connect(user1.signer)["mint(uint256)"](depositedAmount);
    await weth.connect(user1.signer).approve(pool.address, depositedAmount);

    await pool.supply(dai.address, depositedAmount, deployer.address, 0, {
      gasLimit: 5000000,
    });
    await expect(configurator.dropReserve(dai.address)).to.be.revertedWith(
      XTOKEN_SUPPLY_NOT_ZERO
    );
    await pool
      .connect(user1.signer)
      .supply(weth.address, depositedAmount, user1.address, 0, {
        gasLimit: 5000000,
      });
    await pool
      .connect(user1.signer)
      .borrow(dai.address, borrowedAmount, 0, user1.address, {
        gasLimit: 5000000,
      });
    await expect(configurator.dropReserve(dai.address)).to.be.revertedWith(
      VARIABLE_DEBT_SUPPLY_NOT_ZERO
    );
  });

  it("TC-poolConfigurator-dropReserve-02: User 2 repays debts, drop DAI reserve should fail", async () => {
    const {
      users: [user1],
      pool,
      dai,
      configurator,
    } = testEnv;
    expect(
      await pool
        .connect(user1.signer)
        .repay(dai.address, MAX_UINT_AMOUNT, user1.address, {gasLimit: 5000000})
    );
    await expect(configurator.dropReserve(dai.address)).to.be.revertedWith(
      XTOKEN_SUPPLY_NOT_ZERO
    );
  });

  it("TC-poolConfigurator-dropReserve-03: User 1 withdraw DAI, drop DAI reserve should succeed", async () => {
    const {deployer, pool, dai, configurator, protocolDataProvider} = testEnv;
    await pool.withdraw(dai.address, MAX_UINT_AMOUNT, deployer.address);
    const reserveCount = (await pool.getReservesList()).length;
    expect(await configurator.dropReserve(dai.address));
    const tokens = await pool.getReservesList();
    expect(tokens.length).to.be.eq(reserveCount - 1);
    expect(tokens.includes(dai.address)).to.be.false;
    const {isActive} = await protocolDataProvider.getReserveConfigurationData(
      dai.address
    );
    expect(isActive).to.be.false;
  });

  it("TC-poolConfigurator-dropReserve-04: Drop an asset that is not a listed reserve should fail", async () => {
    const {users, configurator} = await loadFixture(testEnvFixture);
    await expect(configurator.dropReserve(users[5].address)).to.be.revertedWith(
      ASSET_NOT_LISTED
    );
  });

  it("TC-poolConfigurator-dropReserve-05: Drop a zero asset that is not listed reserve should fail", async () => {
    const {configurator} = await loadFixture(testEnvFixture);
    await expect(configurator.dropReserve(ZERO_ADDRESS)).to.be.revertedWith(
      ZERO_ADDRESS_NOT_VALID
    );
  });

  it("TC-poolConfigurator-dropReserve-06: Cannot drop asset with supplied liquidity", async () => {
    const {
      configurator,
      weth,
      users: [user0],
    } = await loadFixture(testEnvFixture);
    await supplyAndValidate(weth, "10", user0, true);

    await expect(configurator.dropReserve(weth.address)).to.be.revertedWith(
      ProtocolErrors.XTOKEN_SUPPLY_NOT_ZERO
    );
  });
});

describe("PoolConfigurator: Liquidation Protocol Fee", () => {
  it("TC-poolConfigurator-liquidationProtocolFee-01: Reserves should initially have protocol liquidation fee set to 0", async () => {
    const {dai, usdc, protocolDataProvider} = await loadFixture(testEnvFixture);

    const usdcLiquidationProtocolFee =
      await protocolDataProvider.getLiquidationProtocolFee(usdc.address);
    const daiLiquidationProtocolFee =
      await protocolDataProvider.getLiquidationProtocolFee(dai.address);

    expect(usdcLiquidationProtocolFee).to.be.equal("0");
    expect(daiLiquidationProtocolFee).to.be.equal("0");
  });

  it("TC-poolConfigurator-setLiquidationProtocolFee-01: Sets the protocol liquidation fee to 1000 (10.00%)", async () => {
    const {configurator, dai, usdc, protocolDataProvider} = await loadFixture(
      testEnvFixture
    );

    const oldUsdcLiquidationProtocolFee =
      await protocolDataProvider.getLiquidationProtocolFee(usdc.address);
    const oldDaiLiquidationProtocolFee =
      await protocolDataProvider.getLiquidationProtocolFee(dai.address);

    const liquidationProtocolFee = 1000;

    expect(
      await configurator.setLiquidationProtocolFee(
        usdc.address,
        liquidationProtocolFee
      )
    )
      .to.emit(configurator, "LiquidationProtocolFeeChanged")
      .withArgs(
        usdc.address,
        oldUsdcLiquidationProtocolFee,
        liquidationProtocolFee
      );
    expect(
      await configurator.setLiquidationProtocolFee(
        dai.address,
        liquidationProtocolFee
      )
    )
      .to.emit(configurator, "LiquidationProtocolFeeChanged")
      .withArgs(
        dai.address,
        oldDaiLiquidationProtocolFee,
        liquidationProtocolFee
      );

    const usdcLiquidationProtocolFee =
      await protocolDataProvider.getLiquidationProtocolFee(usdc.address);
    const daiLiquidationProtocolFee =
      await protocolDataProvider.getLiquidationProtocolFee(dai.address);

    expect(usdcLiquidationProtocolFee).to.be.equal(liquidationProtocolFee);
    expect(daiLiquidationProtocolFee).to.be.equal(liquidationProtocolFee);
  });

  it("TC-poolConfigurator-setLiquidationProtocolFee-02: Sets the protocol liquidation fee to 10000 (100.00%) equal to PERCENTAGE_FACTOR", async () => {
    const {configurator, dai, usdc, protocolDataProvider} = await loadFixture(
      testEnvFixture
    );

    const oldUsdcLiquidationProtocolFee =
      await protocolDataProvider.getLiquidationProtocolFee(usdc.address);
    const oldDaiLiquidationProtocolFee =
      await protocolDataProvider.getLiquidationProtocolFee(dai.address);

    const liquidationProtocolFee = 10000;

    expect(
      await configurator.setLiquidationProtocolFee(
        usdc.address,
        liquidationProtocolFee
      )
    )
      .to.emit(configurator, "LiquidationProtocolFeeChanged")
      .withArgs(
        usdc.address,
        oldUsdcLiquidationProtocolFee,
        liquidationProtocolFee
      );
    expect(
      await configurator.setLiquidationProtocolFee(
        dai.address,
        liquidationProtocolFee
      )
    )
      .to.emit(configurator, "LiquidationProtocolFeeChanged")
      .withArgs(
        dai.address,
        oldDaiLiquidationProtocolFee,
        liquidationProtocolFee
      );

    const usdcLiquidationProtocolFee =
      await protocolDataProvider.getLiquidationProtocolFee(usdc.address);
    const daiLiquidationProtocolFee =
      await protocolDataProvider.getLiquidationProtocolFee(dai.address);

    expect(usdcLiquidationProtocolFee).to.be.equal(liquidationProtocolFee);
    expect(daiLiquidationProtocolFee).to.be.equal(liquidationProtocolFee);
  });

  it("TC-poolConfigurator-setLiquidationProtocolFee-03: Tries to set the protocol liquidation fee to 10001 (100.01%) > PERCENTAGE_FACTOR (revert expected)", async () => {
    const {configurator, dai, usdc} = await loadFixture(testEnvFixture);
    const {INVALID_LIQUIDATION_PROTOCOL_FEE} = ProtocolErrors;
    const liquidationProtocolFee = 10001;

    await expect(
      configurator.setLiquidationProtocolFee(
        usdc.address,
        liquidationProtocolFee
      )
    ).to.be.revertedWith(INVALID_LIQUIDATION_PROTOCOL_FEE);
    await expect(
      configurator.setLiquidationProtocolFee(
        dai.address,
        liquidationProtocolFee
      )
    ).to.be.revertedWith(INVALID_LIQUIDATION_PROTOCOL_FEE);
  });
});

describe("PoolConfigurator: Modifiers", () => {
  const {
    CALLER_NOT_ASSET_LISTING_OR_POOL_ADMIN,
    CALLER_NOT_EMERGENCY_ADMIN,
    CALLER_NOT_POOL_ADMIN,
    CALLER_NOT_POOL_OR_EMERGENCY_ADMIN,
    CALLER_NOT_RISK_OR_POOL_ADMIN,
  } = ProtocolErrors;

  it("TC-poolConfigurator-modifiers-01: Test the accessibility of onlyAssetListingOrPoolAdmins modified functions", async () => {
    const {configurator, users} = await loadFixture(testEnvFixture);
    const nonPoolAdmin = users[2];

    const randomAddress = ONE_ADDRESS;
    const randomNumber = "0";
    const randomInitReserve = [
      {
        xTokenImpl: randomAddress,
        assetType: 0,
        variableDebtTokenImpl: randomAddress,
        underlyingAssetDecimals: randomNumber,
        interestRateStrategyAddress: randomAddress,
        auctionStrategyAddress: randomAddress,
        underlyingAsset: randomAddress,
        treasury: randomAddress,
        incentivesController: randomAddress,
        underlyingAssetName: "MOCK",
        xTokenName: "MOCK",
        xTokenSymbol: "MOCK",
        variableDebtTokenName: "MOCK",
        variableDebtTokenSymbol: "MOCK",
        params: "0x10",
      },
    ];

    const calls = [{fn: "initReserves", args: [randomInitReserve]}];
    for (const call of calls) {
      await expect(
        configurator.connect(nonPoolAdmin.signer)[call.fn](...call.args)
      ).to.be.revertedWith(CALLER_NOT_ASSET_LISTING_OR_POOL_ADMIN);
    }
  });

  it("TC-poolConfigurator-modifiers-02: Test the accessibility of onlyPoolAdmin modified functions", async () => {
    const {configurator, users} = await loadFixture(testEnvFixture);
    const nonPoolAdmin = users[2];

    const randomAddress = ONE_ADDRESS;
    // const randomNumber = "0";
    const randomUpdatePToken = {
      asset: randomAddress,
      treasury: randomAddress,
      incentivesController: randomAddress,
      name: "MOCK",
      symbol: "MOCK",
      implementation: randomAddress,
      params: "0x10",
    };
    const randomUpdateDebtToken = {
      asset: randomAddress,
      incentivesController: randomAddress,
      name: "MOCK",
      symbol: "MOCK",
      implementation: randomAddress,
      params: "0x10",
    };

    const calls = [
      {fn: "dropReserve", args: [randomAddress]},
      {fn: "updatePToken", args: [randomUpdatePToken]},
      {fn: "updateVariableDebtToken", args: [randomUpdateDebtToken]},
      {fn: "setReserveActive", args: [randomAddress, true]},
      {fn: "setReserveActive", args: [randomAddress, false]},
    ];
    for (const call of calls) {
      // failing here
      await expect(
        configurator.connect(nonPoolAdmin.signer)[call.fn](...call.args)
      ).to.be.revertedWith(CALLER_NOT_POOL_ADMIN);
    }
  });

  it("TC-poolConfigurator-modifiers-03: Test the accessibility of onlyRiskOrPoolAdmins modified functions", async () => {
    const {configurator, users} = await loadFixture(testEnvFixture);
    const nonRiskOrPoolAdmins = users[5];

    const randomAddress = ONE_ADDRESS;
    const randomNumber = "0";

    const calls = [
      {fn: "setReserveBorrowing", args: [randomAddress, false]},
      {fn: "setReserveBorrowing", args: [randomAddress, true]},
      {
        fn: "configureReserveAsCollateral",
        args: [randomAddress, randomNumber, randomNumber, randomNumber],
      },
      {fn: "setReserveFreeze", args: [randomAddress, true]},
      {fn: "setReserveFreeze", args: [randomAddress, false]},
      {fn: "setReserveFactor", args: [randomAddress, randomNumber]},
      {fn: "setBorrowCap", args: [randomAddress, randomNumber]},
      {fn: "setSupplyCap", args: [randomAddress, randomNumber]},
      {
        fn: "setReserveInterestRateStrategyAddress",
        args: [randomAddress, randomAddress],
      },
    ];
    for (const call of calls) {
      // failing here
      await expect(
        configurator.connect(nonRiskOrPoolAdmins.signer)[call.fn](...call.args)
      ).to.be.revertedWith(CALLER_NOT_RISK_OR_POOL_ADMIN);
    }
  });

  it("TC-poolConfigurator-modifiers-04: Tries to pause reserve with non-emergency-admin account (revert expected)", async () => {
    const {configurator, weth, riskAdmin} = await loadFixture(testEnvFixture);
    await expect(
      configurator
        .connect(riskAdmin.signer)
        .setReservePause(weth.address, true),
      CALLER_NOT_POOL_ADMIN
    ).to.be.revertedWith(CALLER_NOT_POOL_OR_EMERGENCY_ADMIN);
  });

  it("TC-poolConfigurator-modifiers-05: Tries to unpause reserve with non-emergency-admin account (revert expected)", async () => {
    const {configurator, weth, riskAdmin} = await loadFixture(testEnvFixture);
    await expect(
      configurator
        .connect(riskAdmin.signer)
        .setReservePause(weth.address, false),
      CALLER_NOT_POOL_ADMIN
    ).to.be.revertedWith(CALLER_NOT_POOL_OR_EMERGENCY_ADMIN);
  });

  it("TC-poolConfigurator-modifiers-06: Tries to pause pool with not emergency admin (revert expected)", async () => {
    const {configurator, riskAdmin} = await loadFixture(testEnvFixture);
    await expect(
      configurator.connect(riskAdmin.signer).setPoolPause(true)
    ).to.be.revertedWith(CALLER_NOT_EMERGENCY_ADMIN);
  });
});

describe("PoolConfigurator: Edge cases", () => {
  const {
    INVALID_RESERVE_FACTOR,
    INVALID_RESERVE_PARAMS,
    INVALID_LIQ_BONUS,
    RESERVE_LIQUIDITY_NOT_ZERO,
    INVALID_BORROW_CAP,
    INVALID_SUPPLY_CAP,
    ASSET_NOT_LISTED,
  } = ProtocolErrors;

  it("TC-poolConfigurator-Edge-configureReserveAsCollateral-01: ReserveConfiguration setLiquidationBonus() threshold > MAX_VALID_LIQUIDATION_THRESHOLD", async () => {
    const {poolAdmin, dai, configurator} = await loadFixture(testEnvFixture);
    await expect(
      configurator
        .connect(poolAdmin.signer)
        .configureReserveAsCollateral(dai.address, 5, 10, 65535 + 1)
    ).to.be.revertedWith(INVALID_LIQ_BONUS);
  });

  it("TC-poolConfigurator-Edge-setReserveFactor-01: PoolConfigurator setReserveFactor() reserveFactor > PERCENTAGE_FACTOR (revert expected)", async () => {
    const {dai, configurator} = await loadFixture(testEnvFixture);
    const invalidReserveFactor = 20000;
    await expect(
      configurator.setReserveFactor(dai.address, invalidReserveFactor)
    ).to.be.revertedWith(INVALID_RESERVE_FACTOR);
  });

  it("TC-poolConfigurator-Edge-setReserveFactor-02: ReserveConfiguration setReserveFactor() reserveFactor > MAX_VALID_RESERVE_FACTOR", async () => {
    const {dai, configurator} = await loadFixture(testEnvFixture);
    const invalidReserveFactor = 65536;
    await expect(
      configurator.setReserveFactor(dai.address, invalidReserveFactor)
    ).to.be.revertedWith(INVALID_RESERVE_FACTOR);
  });

  it("TC-poolConfigurator-Edge-configureReserveAsCollateral-02: PoolConfigurator configureReserveAsCollateral() ltv > liquidationThreshold", async () => {
    const {poolAdmin, dai, configurator, protocolDataProvider} =
      await loadFixture(testEnvFixture);

    const config = await protocolDataProvider.getReserveConfigurationData(
      dai.address
    );

    await expect(
      configurator
        .connect(poolAdmin.signer)
        .configureReserveAsCollateral(
          dai.address,
          65535 + 1,
          config.liquidationThreshold,
          config.liquidationBonus
        )
    ).to.be.revertedWith(INVALID_RESERVE_PARAMS);
  });

  it("TC-poolConfigurator-Edge-configureReserveAsCollateral-03: PoolConfigurator configureReserveAsCollateral() liquidationBonus < 10000", async () => {
    const {poolAdmin, dai, configurator, protocolDataProvider} =
      await loadFixture(testEnvFixture);

    const config = await protocolDataProvider.getReserveConfigurationData(
      dai.address
    );

    await expect(
      configurator
        .connect(poolAdmin.signer)
        .configureReserveAsCollateral(
          dai.address,
          config.ltv,
          config.liquidationThreshold,
          9999
        )
    ).to.be.revertedWith(INVALID_RESERVE_PARAMS);
  });

  it("TC-poolConfigurator-Edge-configureReserveAsCollateral-04: PoolConfigurator configureReserveAsCollateral() liquidationThreshold.percentMul(liquidationBonus) > PercentageMath.PERCENTAGE_FACTOR", async () => {
    const {poolAdmin, dai, configurator} = await loadFixture(testEnvFixture);

    await expect(
      configurator
        .connect(poolAdmin.signer)
        .configureReserveAsCollateral(dai.address, 10001, 10001, 10001)
    ).to.be.revertedWith(INVALID_RESERVE_PARAMS);
  });

  it("TC-poolConfigurator-Edge-configureReserveAsCollateral-05: PoolConfigurator configureReserveAsCollateral() liquidationThreshold == 0 && liquidationBonus > 0", async () => {
    const {poolAdmin, dai, configurator} = await loadFixture(testEnvFixture);

    await expect(
      configurator
        .connect(poolAdmin.signer)
        .configureReserveAsCollateral(dai.address, 0, 0, 10500)
    ).to.be.revertedWith(INVALID_RESERVE_PARAMS);
  });

  it("TC-poolConfigurator-Edge-setBorrowCap-01: Tries to update borrowCap > MAX_BORROW_CAP (revert expected)", async () => {
    const {configurator, weth} = await loadFixture(testEnvFixture);
    await expect(
      configurator.setBorrowCap(
        weth.address,
        BigNumber.from(MAX_BORROW_CAP).add(1)
      )
    ).to.be.revertedWith(INVALID_BORROW_CAP);
  });

  it("TC-poolConfigurator-Edge-setSupplyCap-01: Tries to update supplyCap > MAX_SUPPLY_CAP (revert expected)", async () => {
    const {configurator, weth} = await loadFixture(testEnvFixture);
    await expect(
      configurator.setSupplyCap(
        weth.address,
        BigNumber.from(MAX_SUPPLY_CAP).add(1)
      )
    ).to.be.revertedWith(INVALID_SUPPLY_CAP);
  });

  it("TC-poolConfigurator-Edge-setBorrowCap-02: Tries to set borrowCap of MAX_BORROW_CAP an unlisted asset", async () => {
    const {configurator, users} = await loadFixture(testEnvFixture);
    const newCap = 10;
    await expect(
      configurator.setBorrowCap(users[5].address, newCap)
    ).to.be.revertedWith(ASSET_NOT_LISTED);
  });

  it("TC-poolConfigurator-Edge-setReserveActive: Tries to disable the DAI reserve with liquidity on it (revert expected)", async () => {
    const {dai, pool, configurator} = await loadFixture(testEnvFixture);
    const userAddress = await pool.signer.getAddress();
    const amountDAItoDeposit = await convertToCurrencyDecimals(
      dai.address,
      "1000"
    );

    // Top up user
    expect(await dai["mint(uint256)"](amountDAItoDeposit));

    // Approve protocol to access depositor wallet
    expect(await dai.approve(pool.address, MAX_UINT_AMOUNT));

    // User 1 deposits 1000 DAI
    expect(
      await pool.supply(dai.address, amountDAItoDeposit, userAddress, "0")
    );

    await expect(
      configurator.setReserveActive(dai.address, false),
      RESERVE_LIQUIDITY_NOT_ZERO
    ).to.be.revertedWith(RESERVE_LIQUIDITY_NOT_ZERO);
  });
});

describe("PoolConfigurator: Reserve Without Incentives Controller", () => {
  let mockToken: MintableERC20;
  let pMockToken: ERC20;
  let testEnv: TestEnv;

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {pool, poolAdmin, oracle, configurator, dai, protocolDataProvider} =
      testEnv;

    mockToken = await new MintableERC20__factory(await getFirstSigner()).deploy(
      "MOCK",
      "MOCK",
      "18"
    );

    const variableDebtTokenImplementation =
      await new VariableDebtToken__factory(await getFirstSigner()).deploy(
        pool.address
      );
    const xTokenImplementation = await new PToken__factory(
      await getFirstSigner()
    ).deploy(pool.address);

    const daiData = await pool.getReserveData(dai.address);
    await waitForTx(
      await oracle
        .connect(poolAdmin.signer)
        .setAssetPrice(
          mockToken.address,
          parseEther("0.000908578801039414").toString()
        )
    );

    const interestRateStrategyAddress = daiData.interestRateStrategyAddress;
    const mockAuctionStrategy = await deployReserveAuctionStrategy(
      eContractid.DefaultReserveAuctionStrategy,
      [
        auctionStrategyExp.maxPriceMultiplier,
        auctionStrategyExp.minExpPriceMultiplier,
        auctionStrategyExp.minPriceMultiplier,
        auctionStrategyExp.stepLinear,
        auctionStrategyExp.stepExp,
        auctionStrategyExp.tickLength,
      ],
      ETHERSCAN_VERIFICATION
    );

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
      xTokenName: string;
      xTokenSymbol: string;
      variableDebtTokenName: string;
      variableDebtTokenSymbol: string;
      params: string;
    }[] = [
      {
        xTokenImpl: xTokenImplementation.address,
        variableDebtTokenImpl: variableDebtTokenImplementation.address,
        underlyingAssetDecimals: 18,
        interestRateStrategyAddress: interestRateStrategyAddress,
        auctionStrategyAddress: mockAuctionStrategy.address,
        underlyingAsset: mockToken.address,
        assetType: 0,
        treasury: ZERO_ADDRESS,
        incentivesController: ZERO_ADDRESS,
        xTokenName: "PMOCK",
        xTokenSymbol: "PMOCK",
        variableDebtTokenName: "VMOCK",
        variableDebtTokenSymbol: "VMOCK",
        params: "0x10",
      },
    ];

    // Add the mock reserve
    await configurator.connect(poolAdmin.signer).initReserves(initInputParams);

    // Configuration
    const daiReserveConfigurationData =
      await protocolDataProvider.getReserveConfigurationData(dai.address);

    const inputParams: {
      asset: string;
      baseLTV: BigNumberish;
      liquidationThreshold: BigNumberish;
      liquidationBonus: BigNumberish;
      reserveFactor: BigNumberish;
      borrowCap: BigNumberish;
      supplyCap: BigNumberish;
      borrowingEnabled: boolean;
    }[] = [
      {
        asset: mockToken.address,
        baseLTV: daiReserveConfigurationData.ltv,
        liquidationThreshold: daiReserveConfigurationData.liquidationThreshold,
        liquidationBonus: daiReserveConfigurationData.liquidationBonus,
        reserveFactor: daiReserveConfigurationData.reserveFactor,
        borrowCap: 68719476735,
        supplyCap: 68719476735,
        borrowingEnabled: true,
      },
    ];

    const i = 0;
    await configurator
      .connect(poolAdmin.signer)
      .configureReserveAsCollateral(
        inputParams[i].asset,
        inputParams[i].baseLTV,
        inputParams[i].liquidationThreshold,
        inputParams[i].liquidationBonus
      );
    await configurator
      .connect(poolAdmin.signer)
      .setReserveBorrowing(inputParams[i].asset, true);

    await configurator.setBorrowCap(
      inputParams[i].asset,
      inputParams[i].borrowCap
    );

    await configurator
      .connect(poolAdmin.signer)
      .setSupplyCap(inputParams[i].asset, inputParams[i].supplyCap);
    await configurator
      .connect(poolAdmin.signer)
      .setReserveFactor(inputParams[i].asset, inputParams[i].reserveFactor);

    const reserveData = await pool.getReserveData(mockToken.address);
    pMockToken = ERC20__factory.connect(
      reserveData.xTokenAddress,
      await getFirstSigner()
    );
  });

  it("TC-poolConfigurator-no-incentives-01 Deposit mock tokens into paraspace - no incentives controller", async () => {
    const {
      pool,
      users: [user],
    } = testEnv;

    expect(await pMockToken.balanceOf(user.address)).to.be.eq(0);

    await mockToken
      .connect(user.signer)
      ["mint(uint256)"](
        await convertToCurrencyDecimals(mockToken.address, "10000")
      );
    await mockToken.connect(user.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(user.signer)
      .supply(
        mockToken.address,
        await convertToCurrencyDecimals(mockToken.address, "1000"),
        user.address,
        0
      );

    expect(await pMockToken.balanceOf(user.address)).to.be.eq(
      await convertToCurrencyDecimals(pMockToken.address, "1000")
    );
  });

  it("TC-poolConfigurator-no-incentives-02 Transfer pMock tokens - no incentives controller", async () => {
    const {
      users: [sender, receiver],
    } = testEnv;

    expect(await pMockToken.balanceOf(sender.address)).to.be.eq(
      await convertToCurrencyDecimals(pMockToken.address, "1000")
    );
    expect(await pMockToken.balanceOf(receiver.address)).to.be.eq(0);

    await pMockToken
      .connect(sender.signer)
      .transfer(
        receiver.address,
        await convertToCurrencyDecimals(pMockToken.address, "1000")
      );
    expect(await pMockToken.balanceOf(sender.address)).to.be.eq(0);
    expect(await pMockToken.balanceOf(receiver.address)).to.be.eq(
      await convertToCurrencyDecimals(pMockToken.address, "1000")
    );
  });

  it("TC-poolConfigurator-no-incentives-03 Withdraw pMock tokens - no incentives controller", async () => {
    const {
      pool,
      users: [, user],
    } = testEnv;

    expect(await mockToken.balanceOf(user.address)).to.be.eq(0);

    const pMockTokenBalanceBefore = await pMockToken.balanceOf(user.address, {
      blockTag: "pending",
    });

    await pMockToken
      .connect(user.signer)
      .approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(user.signer)
      .withdraw(mockToken.address, pMockTokenBalanceBefore, user.address);

    expect(await pMockToken.balanceOf(user.address)).to.be.eq(0);
    expect(await mockToken.balanceOf(user.address)).to.be.eq(
      pMockTokenBalanceBefore
    );
  });
});

describe("PoolConfigurator: Pausable Reserve", () => {
  let testEnv: TestEnv;
  const {RESERVE_PAUSED} = ProtocolErrors;
  const INVALID_TO_BALANCE_AFTER_TRANSFER =
    "Invalid 'TO' balance after transfer!";
  const INVALID_FROM_BALANCE_AFTER_TRANSFER =
    "Invalid 'FROMO' balance after transfer!";

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
  });

  it("TC-poolConfigurator-pausable-reserve-01 User 0 supplies 1000 DAI. Configurator pauses pool. Transfers to user 1 reverts. Configurator unpauses the network and next transfer succeeds", async () => {
    const {users, pool, dai, pDai, configurator, emergencyAdmin} = testEnv;
    const amountDAItoDeposit = await convertToCurrencyDecimals(
      dai.address,
      "1000"
    );
    await dai.connect(users[0].signer)["mint(uint256)"](amountDAItoDeposit);
    // user 0 supplys 1000 DAI
    await dai.connect(users[0].signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(users[0].signer)
      .supply(dai.address, amountDAItoDeposit, users[0].address, "0");
    const user0Balance = await pDai.balanceOf(users[0].address);
    const user1Balance = await pDai.balanceOf(users[1].address);
    // Configurator pauses the pool
    await configurator
      .connect(emergencyAdmin.signer)
      .setReservePause(dai.address, true);
    // User 0 tries the transfer to User 1
    await expect(
      pDai
        .connect(users[0].signer)
        .transfer(users[1].address, amountDAItoDeposit)
    ).to.revertedWith(RESERVE_PAUSED);
    const pausedFromBalance = await pDai.balanceOf(users[0].address);
    const pausedToBalance = await pDai.balanceOf(users[1].address);
    expect(pausedFromBalance).to.be.equal(
      user0Balance.toString(),
      INVALID_TO_BALANCE_AFTER_TRANSFER
    );
    expect(pausedToBalance.toString()).to.be.equal(
      user1Balance.toString(),
      INVALID_FROM_BALANCE_AFTER_TRANSFER
    );
    // Configurator unpauses the pool
    await configurator
      .connect(emergencyAdmin.signer)
      .setReservePause(dai.address, false);
    // User 0 succeeds transfer to User 1
    expect(
      await pDai
        .connect(users[0].signer)
        .transfer(users[1].address, amountDAItoDeposit)
    );
    const fromBalance = await pDai.balanceOf(users[0].address);
    const toBalance = await pDai.balanceOf(users[1].address);
    expect(fromBalance.toString()).to.be.equal(
      user0Balance.sub(amountDAItoDeposit),
      INVALID_FROM_BALANCE_AFTER_TRANSFER
    );
    expect(toBalance.toString()).to.be.equal(
      user1Balance.add(amountDAItoDeposit),
      INVALID_TO_BALANCE_AFTER_TRANSFER
    );
  });

  it("TC-poolConfigurator-pausable-reserve-02 User cannot supply if reserve is paused (revert expected)", async () => {
    const {users, pool, dai, configurator, emergencyAdmin} = testEnv;
    const amountDAItoDeposit = await convertToCurrencyDecimals(
      dai.address,
      "1000"
    );
    await dai.connect(users[0].signer)["mint(uint256)"](amountDAItoDeposit);
    // user 0 supplys 1000 DAI
    await dai.connect(users[0].signer).approve(pool.address, MAX_UINT_AMOUNT);
    // Configurator pauses the pool
    await configurator
      .connect(emergencyAdmin.signer)
      .setReservePause(dai.address, true);
    await expect(
      pool
        .connect(users[0].signer)
        .supply(dai.address, amountDAItoDeposit, users[0].address, "0")
    ).to.revertedWith(RESERVE_PAUSED);
    // Configurator unpauses the pool
    await configurator
      .connect(emergencyAdmin.signer)
      .setReservePause(dai.address, false);
  });

  it("TC-poolConfigurator-pausable-reserve-03 User cannot withdraw if reserve is paused (revert expected)", async () => {
    const {users, pool, dai, configurator, emergencyAdmin} = testEnv;
    const amountDAItoDeposit = await convertToCurrencyDecimals(
      dai.address,
      "1000"
    );
    await dai.connect(users[0].signer)["mint(uint256)"](amountDAItoDeposit);
    // user 0 supplys 1000 DAI
    await dai.connect(users[0].signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(users[0].signer)
      .supply(dai.address, amountDAItoDeposit, users[0].address, "0");
    // Configurator pauses the pool
    await configurator
      .connect(emergencyAdmin.signer)
      .setReservePause(dai.address, true);
    // user tries to burn
    await expect(
      pool
        .connect(users[0].signer)
        .withdraw(dai.address, amountDAItoDeposit, users[0].address)
    ).to.revertedWith(RESERVE_PAUSED);
    // Configurator unpauses the pool
    await configurator
      .connect(emergencyAdmin.signer)
      .setReservePause(dai.address, false);
  });

  it("TC-poolConfigurator-pausable-reserve-04 User cannot borrow if reserve is paused (revert expected)", async () => {
    const {pool, dai, configurator, emergencyAdmin} = testEnv;
    const user = emergencyAdmin;
    // Pause the pool
    await configurator
      .connect(emergencyAdmin.signer)
      .setReservePause(dai.address, true);
    // Try to execute liquidation
    await expect(
      pool.connect(user.signer).borrow(dai.address, "1", "0", user.address)
    ).to.be.revertedWith(RESERVE_PAUSED);
    // Unpause the pool
    await configurator
      .connect(emergencyAdmin.signer)
      .setReservePause(dai.address, false);
  });

  it("TC-poolConfigurator-pausable-reserve-05 User cannot repay if reserve is paused (revert expected)", async () => {
    const {pool, dai, configurator, emergencyAdmin} = testEnv;
    const user = emergencyAdmin;
    // Pause the pool
    await configurator
      .connect(emergencyAdmin.signer)
      .setReservePause(dai.address, true);
    // Try to execute liquidation
    await expect(
      pool.connect(user.signer).repay(dai.address, "1", user.address)
    ).to.be.revertedWith(RESERVE_PAUSED);
    // Unpause the pool
    await configurator
      .connect(emergencyAdmin.signer)
      .setReservePause(dai.address, false);
  });

  it("TC-poolConfigurator-pausable-reserve-06 User cannot liquidate if reserve is paused (revert expected)", async () => {
    const {
      users,
      pool,
      usdc,
      oracle,
      weth,
      configurator,
      protocolDataProvider,
      emergencyAdmin,
    } = testEnv;
    const supplyor = users[3];
    const borrower = users[4];
    //mints USDC to supplyor
    await usdc
      .connect(supplyor.signer)
      ["mint(uint256)"](await convertToCurrencyDecimals(usdc.address, "1000"));
    //approve protocol to access supplyor wallet
    await usdc.connect(supplyor.signer).approve(pool.address, MAX_UINT_AMOUNT);
    //user 3 supplys 1000 USDC
    const amountUSDCtoDeposit = await convertToCurrencyDecimals(
      usdc.address,
      "1000"
    );
    await pool
      .connect(supplyor.signer)
      .supply(usdc.address, amountUSDCtoDeposit, supplyor.address, "0");
    //user 4 supplys ETH
    const amountETHtoDeposit = await convertToCurrencyDecimals(
      weth.address,
      "0.06775"
    );
    //mints WETH to borrower
    await weth.connect(borrower.signer)["mint(uint256)"](amountETHtoDeposit);
    //approve protocol to access borrower wallet
    await weth.connect(borrower.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(borrower.signer)
      .supply(weth.address, amountETHtoDeposit, borrower.address, "0");
    //user 4 borrows
    const userGlobalData = await pool.getUserAccountData(borrower.address);
    const usdcPrice = await oracle.getAssetPrice(usdc.address);
    const amountUSDCToBorrow = await convertToCurrencyDecimals(
      usdc.address,
      userGlobalData.availableBorrowsBase
        .div(usdcPrice)
        .percentMul(9502)
        .toString()
    );
    await pool
      .connect(borrower.signer)
      .borrow(usdc.address, amountUSDCToBorrow, "0", borrower.address);
    // Drops HF below 1
    await oracle.setAssetPrice(usdc.address, usdcPrice.percentMul(12000));
    //mints dai to the liquidator
    await usdc["mint(uint256)"](
      await convertToCurrencyDecimals(usdc.address, "1000")
    );
    await usdc.approve(pool.address, MAX_UINT_AMOUNT);
    const userReserveDataBefore = await protocolDataProvider.getUserReserveData(
      usdc.address,
      borrower.address
    );
    const amountToLiquidate = userReserveDataBefore.currentVariableDebt.div(2);
    // Pause pool
    await configurator
      .connect(emergencyAdmin.signer)
      .setReservePause(usdc.address, true);
    // Do liquidation
    await expect(
      pool.liquidateERC20(
        weth.address,
        usdc.address,
        borrower.address,
        amountToLiquidate,
        true
      )
    ).to.be.revertedWith(RESERVE_PAUSED);
    // Unpause pool
    await configurator
      .connect(emergencyAdmin.signer)
      .setReservePause(usdc.address, false);
  });

  it("TC-poolConfigurator-pausable-reserve-07 User cannot setUserUseERC20AsCollateral if reserve is paused.", async () => {
    const {pool, weth, configurator, emergencyAdmin} = testEnv;
    const user = emergencyAdmin;
    const amountWETHToDeposit = utils.parseEther("1");
    await weth.connect(user.signer)["mint(uint256)"](amountWETHToDeposit);
    await weth.connect(user.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(user.signer)
      .supply(weth.address, amountWETHToDeposit, user.address, "0");
    // Pause pool
    await configurator
      .connect(emergencyAdmin.signer)
      .setReservePause(weth.address, true);
    await expect(
      pool.connect(user.signer).setUserUseERC20AsCollateral(weth.address, false)
    ).to.be.revertedWith(RESERVE_PAUSED);
    // Unpause pool
    await configurator
      .connect(emergencyAdmin.signer)
      .setReservePause(weth.address, false);
  });
});
