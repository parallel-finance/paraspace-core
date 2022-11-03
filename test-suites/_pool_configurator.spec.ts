import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {utils} from "ethers";
import {BigNumber, BigNumberish} from "ethers";
import {parseEther, parseUnits} from "ethers/lib/utils";
import {
  MAX_UINT_AMOUNT,
  ONE_ADDRESS,
  RAY,
  ZERO_ADDRESS,
  MAX_BORROW_CAP,
  MAX_SUPPLY_CAP,
} from "../deploy/helpers/constants";
import {topUpNonPayableWithEther} from "./helpers/utils/funds";
import {deployReserveAuctionStrategy} from "../deploy/helpers/contracts-deployments";
import {getFirstSigner} from "../deploy/helpers/contracts-getters";
import {evmRevert, evmSnapshot} from "../deploy/helpers/misc-utils";
import {eContractid, ProtocolErrors} from "../deploy/helpers/types";
import {auctionStrategyExp} from "../deploy/market-config/auctionStrategies";
import {strategyWETH} from "../deploy/market-config/reservesConfigs";
import {
  convertToCurrencyDecimals,
  impersonateAddress,
} from "../deploy/helpers/contracts-helpers";
import {
  MintableERC20__factory,
  MockReserveInterestRateStrategy__factory,
  ProtocolDataProvider,
  PToken__factory,
  VariableDebtToken__factory,
} from "../types";
// import {strategyWETH} from "../market-config/reservesConfigs";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";

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
  // expect(eModeCategory).to.be.eq(
  //   values.eModeCategory,
  //   "eModeCategory is not correct"
  // );
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
    // protocolDataProvider.getReserveEModeCategory(asset),
    protocolDataProvider.getReserveCaps(asset),
    protocolDataProvider.getLiquidationProtocolFee(asset),
    // protocolDataProvider.getUnbackedMintCap(asset),
  ]);
};

describe("PoolConfigurator", () => {
  context("Basical", () => {
    let testEnv: TestEnv;
    let baseConfigValues: ReserveConfigurationValues;

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
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
    baseConfigValues = {
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
  });

    it("InitReserves via AssetListing admin", async () => {
      const {
        addressesProvider,
        configurator,
        poolAdmin,
        aclManager,
        pool,
        assetListingAdmin,
      } = testEnv;

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
      const mockRateStrategy =
        await new MockReserveInterestRateStrategy__factory(
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
        ]
      );
      // Init the reserve
      const initInputParams: {
        xTokenImpl: string;
        variableDebtTokenImpl: string;
        assetType: BigNumberish;
        underlyingAssetDecimals: BigNumberish;
        interestRateStrategyAddress: string;
        auctionStrategyAddress: string;
        underlyingAsset: string;
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
    });

    it("Deactivates the ETH reserve", async () => {
      const {configurator, weth, protocolDataProvider} = testEnv;
      expect(await configurator.setReserveActive(weth.address, false));
      const {isActive} = await protocolDataProvider.getReserveConfigurationData(
        weth.address
      );
      expect(isActive).to.be.equal(false);
    });

    it("Reactivates the ETH reserve", async () => {
      const {configurator, weth, protocolDataProvider} = testEnv;
      expect(await configurator.setReserveActive(weth.address, true));
      const {isActive} = await protocolDataProvider.getReserveConfigurationData(
        weth.address
      );
      expect(isActive).to.be.equal(true);
    });

    it("Pauses the ETH reserve by pool admin", async () => {
      const {configurator, weth, protocolDataProvider} = testEnv;
      expect(await configurator.setReservePause(weth.address, true))
        .to.emit(configurator, "ReservePaused")
        .withArgs(weth.address, true);

      await expectReserveConfigurationData(protocolDataProvider, weth.address, {
        ...baseConfigValues,
        isPaused: true,
      });
    });

    it("Unpauses the ETH reserve by pool admin", async () => {
      const {configurator, protocolDataProvider, weth} = testEnv;
      expect(await configurator.setReservePause(weth.address, false))
        .to.emit(configurator, "ReservePaused")
        .withArgs(weth.address, false);

      await expectReserveConfigurationData(protocolDataProvider, weth.address, {
        ...baseConfigValues,
      });
    });

    it("Pauses the ETH reserve by emergency admin", async () => {
      const {configurator, weth, protocolDataProvider, emergencyAdmin} =
        testEnv;
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

    it("Unpauses the ETH reserve by emergency admin", async () => {
      const {configurator, protocolDataProvider, weth, emergencyAdmin} =
        testEnv;
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

    it("Freezes the ETH reserve by pool Admin", async () => {
      const {configurator, weth, protocolDataProvider} = testEnv;

      expect(await configurator.setReserveFreeze(weth.address, true))
        .to.emit(configurator, "ReserveFrozen")
        .withArgs(weth.address, true);

      await expectReserveConfigurationData(protocolDataProvider, weth.address, {
        ...baseConfigValues,
        isFrozen: true,
      });
    });

    it("Unfreezes the ETH reserve by Pool admin", async () => {
      const {configurator, protocolDataProvider, weth} = testEnv;
      expect(await configurator.setReserveFreeze(weth.address, false))
        .to.emit(configurator, "ReserveFrozen")
        .withArgs(weth.address, false);

      await expectReserveConfigurationData(protocolDataProvider, weth.address, {
        ...baseConfigValues,
      });
    });

    it("Freezes the ETH reserve by Risk Admin", async () => {
      const {configurator, weth, protocolDataProvider, riskAdmin} = testEnv;
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

    it("Unfreezes the ETH reserve by Risk admin", async () => {
      const {configurator, protocolDataProvider, weth, riskAdmin} = testEnv;
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

    it("Deactivates the ETH reserve for borrowing via pool admin", async () => {
      const snap = await evmSnapshot();
      const {configurator, protocolDataProvider, weth} = testEnv;
      expect(await configurator.setReserveBorrowing(weth.address, false))
        .to.emit(configurator, "ReserveBorrowing")
        .withArgs(weth.address, false);

      await expectReserveConfigurationData(protocolDataProvider, weth.address, {
        ...baseConfigValues,
        borrowingEnabled: false,
      });
      await evmRevert(snap);
    });

    it("Deactivates the ETH reserve for borrowing via risk admin", async () => {
      const {configurator, protocolDataProvider, weth, riskAdmin} = testEnv;
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

    it("Activates the ETH reserve for borrowing via pool admin", async () => {
      const snap = await evmSnapshot();
      const {configurator, weth, protocolDataProvider} = testEnv;
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
      await evmRevert(snap);
    });

    it("Activates the ETH reserve for borrowing via risk admin", async () => {
      const {configurator, weth, protocolDataProvider, riskAdmin} = testEnv;
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

    it("Deactivates the ETH reserve as collateral via pool admin", async () => {
      const {configurator, protocolDataProvider, weth} = testEnv;
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

    it("Activates the ETH reserve as collateral via pool admin", async () => {
      const {configurator, protocolDataProvider, weth} = testEnv;
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

    it("Deactivates the ETH reserve as collateral via risk admin", async () => {
      const {configurator, protocolDataProvider, weth, riskAdmin} = testEnv;
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

    it("Activates the ETH reserve as collateral via risk admin", async () => {
      const {configurator, protocolDataProvider, weth, riskAdmin} = testEnv;
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

    it("Changes the reserve factor of WETH via pool admin", async () => {
      const {configurator, protocolDataProvider, weth} = testEnv;

      const {reserveFactor: oldReserveFactor} =
        await protocolDataProvider.getReserveConfigurationData(weth.address);

      const newReserveFactor = "1000";
      expect(
        await configurator.setReserveFactor(weth.address, newReserveFactor)
      )
        .to.emit(configurator, "ReserveFactorChanged")
        .withArgs(weth.address, oldReserveFactor, newReserveFactor);

      await expectReserveConfigurationData(protocolDataProvider, weth.address, {
        ...baseConfigValues,
        reserveFactor: newReserveFactor,
      });
    });

    it("Changes the reserve factor of WETH via risk admin", async () => {
      const {configurator, protocolDataProvider, weth, riskAdmin} = testEnv;

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

    it("Updates the reserve factor of WETH equal to PERCENTAGE_FACTOR", async () => {
      const snapId = await evmSnapshot();
      const {configurator, protocolDataProvider, weth, poolAdmin} = testEnv;

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
      await evmRevert(snapId);
    });

    it("Updates the borrowCap of WETH via pool admin", async () => {
      const {configurator, protocolDataProvider, weth} = testEnv;

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

    it("Updates the borrowCap of WETH risk admin", async () => {
      const {configurator, protocolDataProvider, weth, riskAdmin} = testEnv;

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

    it("Updates the supplyCap of WETH via pool admin", async () => {
      const {configurator, protocolDataProvider, weth} = testEnv;

      const {supplyCap: oldWethSupplyCap} =
        await protocolDataProvider.getReserveCaps(weth.address);

      const newBorrowCap = "3000000";
      const newSupplyCap = "3000000";
      expect(await configurator.setSupplyCap(weth.address, newSupplyCap))
        .to.emit(configurator, "SupplyCapChanged")
        .withArgs(weth.address, oldWethSupplyCap, newSupplyCap);

      await expectReserveConfigurationData(protocolDataProvider, weth.address, {
        ...baseConfigValues,
        borrowCap: newBorrowCap,
        supplyCap: newSupplyCap,
      });
    });

    it("Updates the supplyCap of WETH via risk admin", async () => {
      const {configurator, protocolDataProvider, weth, riskAdmin} = testEnv;

      const {supplyCap: oldWethSupplyCap} =
        await protocolDataProvider.getReserveCaps(weth.address);

      const newBorrowCap = "3000000";
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
        borrowCap: newBorrowCap,
        supplyCap: newSupplyCap,
      });
    });

    it("Updates the ReserveInterestRateStrategy address of WETH via pool admin", async () => {
      const {poolAdmin, pool, configurator, weth} = testEnv;

      const {interestRateStrategyAddress: interestRateStrategyAddressBefore} =
        await pool.getReserveData(weth.address);

      expect(
        await configurator
          .connect(poolAdmin.signer)
          .setReserveInterestRateStrategyAddress(weth.address, ZERO_ADDRESS)
      )
        .to.emit(configurator, "ReserveInterestRateStrategyChanged")
        .withArgs(
          weth.address,
          interestRateStrategyAddressBefore,
          ZERO_ADDRESS
        );
      const {interestRateStrategyAddress: interestRateStrategyAddressAfter} =
        await pool.getReserveData(weth.address);

      expect(interestRateStrategyAddressBefore).to.not.be.eq(ZERO_ADDRESS);
      expect(interestRateStrategyAddressAfter).to.be.eq(ZERO_ADDRESS);

      //reset interest rate strategy to the correct one
      await configurator
        .connect(poolAdmin.signer)
        .setReserveInterestRateStrategyAddress(
          weth.address,
          interestRateStrategyAddressBefore
        );
    });

    it("Updates the ReserveInterestRateStrategy address of WETH via risk admin", async () => {
      const {riskAdmin, pool, configurator, weth} = testEnv;

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

      //reset interest rate strategy to the correct one
      await configurator
        .connect(riskAdmin.signer)
        .setReserveInterestRateStrategyAddress(
          weth.address,
          interestRateStrategyAddressBefore
        );
    });

    it("Register a new risk Admin", async () => {
      const {aclManager, poolAdmin, users, riskAdmin} = testEnv;

      const riskAdminRole = await aclManager.RISK_ADMIN_ROLE();

      const newRiskAdmin = users[3].address;
      expect(await aclManager.addRiskAdmin(newRiskAdmin))
        .to.emit(aclManager, "RoleGranted")
        .withArgs(riskAdminRole, newRiskAdmin, poolAdmin.address);

      expect(await aclManager.isRiskAdmin(riskAdmin.address)).to.be.true;
      expect(await aclManager.isRiskAdmin(newRiskAdmin)).to.be.true;
    });

    it("Unregister the new risk admin", async () => {
      const {aclManager, poolAdmin, users, riskAdmin} = testEnv;

      const riskAdminRole = await aclManager.RISK_ADMIN_ROLE();

      const newRiskAdmin = users[3].address;
      expect(await aclManager.removeRiskAdmin(newRiskAdmin))
        .to.emit(aclManager, "RoleRevoked")
        .withArgs(riskAdminRole, newRiskAdmin, poolAdmin.address);

      expect(await aclManager.isRiskAdmin(riskAdmin.address)).to.be.true;
      expect(await aclManager.isRiskAdmin(newRiskAdmin)).to.be.false;
    });

    it("Authorized a new flash borrower", async () => {
      const {aclManager, poolAdmin, users} = testEnv;

      const authorizedFlashBorrowerRole =
        await aclManager.FLASH_BORROWER_ROLE();

      const authorizedFlashBorrower = users[4].address;
      expect(await aclManager.addFlashBorrower(authorizedFlashBorrower))
        .to.emit(aclManager, "RoleGranted")
        .withArgs(
          authorizedFlashBorrowerRole,
          authorizedFlashBorrower,
          poolAdmin.address
        );

      expect(await aclManager.isFlashBorrower(authorizedFlashBorrower)).to.be
        .true;
    });

    it("Unauthorized flash borrower", async () => {
      const {aclManager, poolAdmin, users} = testEnv;

      const authorizedFlashBorrowerRole =
        await aclManager.FLASH_BORROWER_ROLE();

      const authorizedFlashBorrower = users[4].address;
      expect(await aclManager.removeFlashBorrower(authorizedFlashBorrower))
        .to.emit(aclManager, "RoleRevoked")
        .withArgs(
          authorizedFlashBorrowerRole,
          authorizedFlashBorrower,
          poolAdmin.address
        );

      expect(await aclManager.isFlashBorrower(authorizedFlashBorrower)).to.be
        .false;
    });

    it("Sets siloed borrowing through the pool admin", async () => {
      const {configurator, protocolDataProvider, weth, poolAdmin} = testEnv;

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

      expect(newSiloedBorrowing).to.be.eq(
        true,
        "Invalid siloed borrowing state"
      );
    });

    it("Sets siloed borrowing through the risk admin", async () => {
      const {configurator, protocolDataProvider, weth, riskAdmin} = testEnv;

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

    it("Resets the siloed borrowing mode. Tries to set siloed borrowing after the asset has been borrowed (revert expected)", async () => {
      const snap = await evmSnapshot();

      const {
        configurator,
        weth,
        dai,
        riskAdmin,
        pool,
        users: [user1, user2],
      } = testEnv;

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

      await evmRevert(snap);
    });

    it("set reserve auction strategy address through the pool admin", async () => {
      const {configurator, weth, poolAdmin, pool} = testEnv;
      const {auctionStrategyAddress: oldAuctionStrategyAddress} =
        await pool.getReserveData(weth.address);
      expect(
        await configurator
          .connect(poolAdmin.signer)
          .setReserveAuctionStrategyAddress(weth.address, ZERO_ADDRESS)
      )
        .to.emit(configurator, "ReserveAuctionStrategyChanged")
        .withArgs(weth.address, oldAuctionStrategyAddress, ZERO_ADDRESS);
    });

    it("set auction recovery health factor through the pool admin", async () => {
      const {configurator, poolAdmin, pool} = testEnv;
      const hf = "1500000000000000000";
      expect(
        await configurator
          .connect(poolAdmin.signer)
          .setAuctionRecoveryHealthFactor(hf)
      );
      const recoveryHealthFactor = await pool.AUCTION_RECOVERY_HEALTH_FACTOR();
      expect(recoveryHealthFactor).to.be.equal(hf);
    });

    it("set invalid health factor through the pool admin (revert expected)", async () => {
      const {configurator} = testEnv;
      const {INVALID_AMOUNT} = ProtocolErrors;
      const min_hf = "1";
      const max_hf = "2000000000000000001";
      expect(
        configurator.setAuctionRecoveryHealthFactor(min_hf)
      ).to.be.revertedWith(INVALID_AMOUNT);
      expect(
        configurator.setAuctionRecoveryHealthFactor(max_hf)
      ).to.be.revertedWith(INVALID_AMOUNT);
      expect(
        configurator.setAuctionRecoveryHealthFactor("0")
      ).to.be.revertedWith(INVALID_AMOUNT);
    });
  });

  context("PoolConfigurator: Drop Reserve", () => {
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

    it("User 1 deposits DAI, User 2 borrow DAI variable, should fail to drop DAI reserve", async () => {
      const {
        deployer,
        users: [user1],
        pool,
        dai,
        weth,
        configurator,
      } = testEnv;
      const depositedAmount = utils.parseEther("1000");
      const borrowedAmount = utils.parseEther("100");
      // setting reserve factor to 0 to ease tests, no xToken accrued in reserve
      await configurator.setReserveFactor(dai.address, 0);
      await dai["mint(uint256)"](depositedAmount);
      await dai.approve(pool.address, depositedAmount);
      await dai.connect(user1.signer)["mint(uint256)"](depositedAmount);
      await dai.connect(user1.signer).approve(pool.address, depositedAmount);
      await weth.connect(user1.signer)["mint(uint256)"](depositedAmount);
      await weth.connect(user1.signer).approve(pool.address, depositedAmount);
      await pool.supply(dai.address, depositedAmount, deployer.address, 0);
      await expect(configurator.dropReserve(dai.address)).to.be.revertedWith(
        XTOKEN_SUPPLY_NOT_ZERO
      );
      await pool
        .connect(user1.signer)
        .supply(weth.address, depositedAmount, user1.address, 0);
      await pool
        .connect(user1.signer)
        .borrow(dai.address, borrowedAmount, 0, user1.address);
      await expect(configurator.dropReserve(dai.address)).to.be.revertedWith(
        VARIABLE_DEBT_SUPPLY_NOT_ZERO
      );
      // await pool
      //   .connect(user1.signer)
      //   .borrow(dai.address, borrowedAmount, 1, 0, user1.address);
      // await expect(configurator.dropReserve(dai.address)).to.be.revertedWith(
      //   STABLE_DEBT_NOT_ZERO
      // );
    });

    it("User 2 repays debts, drop DAI reserve should fail", async () => {
      const {
        users: [user1],
        pool,
        dai,
        configurator,
      } = testEnv;
      // expect(
      //   await pool
      //     .connect(user1.signer)
      //     .repay(dai.address, MAX_UINT_AMOUNT, 1, user1.address)
      // );
      // await expect(configurator.dropReserve(dai.address)).to.be.revertedWith(
      //   VARIABLE_DEBT_SUPPLY_NOT_ZERO
      // );
      expect(
        await pool
          .connect(user1.signer)
          .repay(dai.address, MAX_UINT_AMOUNT, user1.address)
      );
      await expect(configurator.dropReserve(dai.address)).to.be.revertedWith(
        XTOKEN_SUPPLY_NOT_ZERO
      );
    });

    it("User 1 withdraw DAI, drop DAI reserve should succeed", async () => {
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

    it("Drop an asset that is not a listed reserve should fail", async () => {
      const {users, configurator} = testEnv;
      await expect(
        configurator.dropReserve(users[5].address)
      ).to.be.revertedWith(ASSET_NOT_LISTED);
    });

    it("Drop a zero asset that is not listed reserve should fail", async () => {
      const {configurator} = testEnv;
      await expect(configurator.dropReserve(ZERO_ADDRESS)).to.be.revertedWith(
        ZERO_ADDRESS_NOT_VALID
      );
    });
  });

  context("PoolConfigurator: Liquidation Protocol Fee", () => {
    let testEnv: TestEnv;
    const {INVALID_LIQUIDATION_PROTOCOL_FEE} = ProtocolErrors;

    before(async () => {
      testEnv = await loadFixture(testEnvFixture);
      const {weth, pool, dai, usdc} = testEnv;

      const mintedAmount = utils.parseEther("1000000000");
      await dai["mint(uint256)"](mintedAmount);
      await weth["mint(uint256)"](mintedAmount);
      await usdc["mint(uint256)"](mintedAmount);

      await dai.approve(pool.address, MAX_UINT_AMOUNT);
      await weth.approve(pool.address, MAX_UINT_AMOUNT);
      await usdc.approve(pool.address, MAX_UINT_AMOUNT);
    });

    it("Reserves should initially have protocol liquidation fee set to 0", async () => {
      const {dai, usdc, protocolDataProvider} = testEnv;

      const usdcLiquidationProtocolFee =
        await protocolDataProvider.getLiquidationProtocolFee(usdc.address);
      const daiLiquidationProtocolFee =
        await protocolDataProvider.getLiquidationProtocolFee(dai.address);

      expect(usdcLiquidationProtocolFee).to.be.equal("0");
      expect(daiLiquidationProtocolFee).to.be.equal("0");
    });

    it("Sets the protocol liquidation fee to 1000 (10.00%)", async () => {
      const {configurator, dai, usdc, protocolDataProvider} = testEnv;

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

    it("Sets the protocol liquidation fee to 10000 (100.00%) equal to PERCENTAGE_FACTOR", async () => {
      const {configurator, dai, usdc, protocolDataProvider} = testEnv;

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

    it("Tries to set the protocol liquidation fee to 10001 (100.01%) > PERCENTAGE_FACTOR (revert expected)", async () => {
      const {configurator, dai, usdc} = testEnv;

      const liquidationProtocolFee = 10001;

      expect(
        configurator.setLiquidationProtocolFee(
          usdc.address,
          liquidationProtocolFee
        )
      ).to.be.revertedWith(INVALID_LIQUIDATION_PROTOCOL_FEE);
      expect(
        configurator.setLiquidationProtocolFee(
          dai.address,
          liquidationProtocolFee
        )
      ).to.be.revertedWith(INVALID_LIQUIDATION_PROTOCOL_FEE);
    });
  });

  context("PoolConfigurator: Modifiers", () => {
    let testEnv: TestEnv;
    before(async () => {
      testEnv = await loadFixture(testEnvFixture);
    });
    const {
      CALLER_NOT_ASSET_LISTING_OR_POOL_ADMIN,
      CALLER_NOT_EMERGENCY_ADMIN,
      CALLER_NOT_POOL_ADMIN,
      CALLER_NOT_POOL_OR_EMERGENCY_ADMIN,
      CALLER_NOT_RISK_OR_POOL_ADMIN,
    } = ProtocolErrors;

    it("Test the accessibility of onlyAssetListingOrPoolAdmins modified functions", async () => {
      const {configurator, users} = testEnv;
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

    it("Test the accessibility of onlyPoolAdmin modified functions", async () => {
      const {configurator, users} = testEnv;
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

    it("Test the accessibility of onlyRiskOrPoolAdmins modified functions", async () => {
      const {configurator, users} = testEnv;
      const nonRiskOrPoolAdmins = users[3];

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
          configurator
            .connect(nonRiskOrPoolAdmins.signer)
            [call.fn](...call.args)
        ).to.be.revertedWith(CALLER_NOT_RISK_OR_POOL_ADMIN);
      }
    });

    it("Tries to pause reserve with non-emergency-admin account (revert expected)", async () => {
      const {configurator, weth, riskAdmin} = testEnv;
      await expect(
        configurator
          .connect(riskAdmin.signer)
          .setReservePause(weth.address, true),
        CALLER_NOT_POOL_ADMIN
      ).to.be.revertedWith(CALLER_NOT_POOL_OR_EMERGENCY_ADMIN);
    });

    it("Tries to unpause reserve with non-emergency-admin account (revert expected)", async () => {
      const {configurator, weth, riskAdmin} = testEnv;
      await expect(
        configurator
          .connect(riskAdmin.signer)
          .setReservePause(weth.address, false),
        CALLER_NOT_POOL_ADMIN
      ).to.be.revertedWith(CALLER_NOT_POOL_OR_EMERGENCY_ADMIN);
    });

    it("Tries to pause pool with not emergency admin (revert expected)", async () => {
      const {configurator, riskAdmin} = testEnv;
      await expect(
        configurator.connect(riskAdmin.signer).setPoolPause(true)
      ).to.be.revertedWith(CALLER_NOT_EMERGENCY_ADMIN);
    });
  });

  context("PoolConfigurator: Edge cases", () => {
    let testEnv: TestEnv;
    before(async () => {
      testEnv = await loadFixture(testEnvFixture);
    });
    const {
      INVALID_RESERVE_FACTOR,
      INVALID_RESERVE_PARAMS,
      INVALID_LIQ_BONUS,
      RESERVE_LIQUIDITY_NOT_ZERO,
      INVALID_BORROW_CAP,
      INVALID_SUPPLY_CAP,
      ASSET_NOT_LISTED,
    } = ProtocolErrors;

    it("ReserveConfiguration setLiquidationBonus() threshold > MAX_VALID_LIQUIDATION_THRESHOLD", async () => {
      const {poolAdmin, dai, configurator} = testEnv;
      await expect(
        configurator
          .connect(poolAdmin.signer)
          .configureReserveAsCollateral(dai.address, 5, 10, 65535 + 1)
      ).to.be.revertedWith(INVALID_LIQ_BONUS);
    });

    it("PoolConfigurator setReserveFactor() reserveFactor > PERCENTAGE_FACTOR (revert expected)", async () => {
      const {dai, configurator} = testEnv;
      const invalidReserveFactor = 20000;
      await expect(
        configurator.setReserveFactor(dai.address, invalidReserveFactor)
      ).to.be.revertedWith(INVALID_RESERVE_FACTOR);
    });

    it("ReserveConfiguration setReserveFactor() reserveFactor > MAX_VALID_RESERVE_FACTOR", async () => {
      const {dai, configurator} = testEnv;
      const invalidReserveFactor = 65536;
      await expect(
        configurator.setReserveFactor(dai.address, invalidReserveFactor)
      ).to.be.revertedWith(INVALID_RESERVE_FACTOR);
    });

    it("PoolConfigurator configureReserveAsCollateral() ltv > liquidationThreshold", async () => {
      const {poolAdmin, dai, configurator, protocolDataProvider} = testEnv;

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

    it("PoolConfigurator configureReserveAsCollateral() liquidationBonus < 10000", async () => {
      const {poolAdmin, dai, configurator, protocolDataProvider} = testEnv;

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

    it("PoolConfigurator configureReserveAsCollateral() liquidationThreshold.percentMul(liquidationBonus) > PercentageMath.PERCENTAGE_FACTOR", async () => {
      const {poolAdmin, dai, configurator} = testEnv;

      await expect(
        configurator
          .connect(poolAdmin.signer)
          .configureReserveAsCollateral(dai.address, 10001, 10001, 10001)
      ).to.be.revertedWith(INVALID_RESERVE_PARAMS);
    });

    it("PoolConfigurator configureReserveAsCollateral() liquidationThreshold == 0 && liquidationBonus > 0", async () => {
      const {poolAdmin, dai, configurator} = testEnv;

      await expect(
        configurator
          .connect(poolAdmin.signer)
          .configureReserveAsCollateral(dai.address, 0, 0, 10500)
      ).to.be.revertedWith(INVALID_RESERVE_PARAMS);
    });

    it("Tries to update borrowCap > MAX_BORROW_CAP (revert expected)", async () => {
      const {configurator, weth} = testEnv;
      await expect(
        configurator.setBorrowCap(
          weth.address,
          BigNumber.from(MAX_BORROW_CAP).add(1)
        )
      ).to.be.revertedWith(INVALID_BORROW_CAP);
    });

    it("Tries to update supplyCap > MAX_SUPPLY_CAP (revert expected)", async () => {
      const {configurator, weth} = testEnv;
      await expect(
        configurator.setSupplyCap(
          weth.address,
          BigNumber.from(MAX_SUPPLY_CAP).add(1)
        )
      ).to.be.revertedWith(INVALID_SUPPLY_CAP);
    });

    it("Tries to set borrowCap of MAX_BORROW_CAP an unlisted asset", async () => {
      const {configurator, users} = testEnv;
      const newCap = 10;
      await expect(
        configurator.setBorrowCap(users[5].address, newCap)
      ).to.be.revertedWith(ASSET_NOT_LISTED);
    });

    it("Tries to disable the DAI reserve with liquidity on it (revert expected)", async () => {
      const {dai, pool, configurator} = testEnv;
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

    it("Tries to withdraw from an inactive reserve (revert expected)", async () => {
      const {dai, pool, configurator, protocolDataProvider} = testEnv;
      const amountDAItoDeposit = await convertToCurrencyDecimals(
        dai.address,
        "1000"
      );
      const userAddress = await pool.signer.getAddress();

      // Impersonate configurator
      const impConfig = await impersonateAddress(configurator.address);
      await topUpNonPayableWithEther(
        pool.signer,
        [configurator.address],
        parseUnits("10", 18)
      );

      // Top up user
      expect(await dai["mint(uint256)"](amountDAItoDeposit));

      // Approve protocol to access depositor wallet
      expect(await dai.approve(pool.address, MAX_UINT_AMOUNT));

      // User 1 deposits 1000 DAI
      expect(
        await pool.supply(dai.address, amountDAItoDeposit, userAddress, "0")
      );

      // get configuration
      const daiConfiguration: BigNumber = (
        await pool.getConfiguration(dai.address)
      ).data;
      const activeMask = BigNumber.from(
        "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFFFFFFFFFF"
      );

      // Set new configuration with active turned off
      expect(
        await pool.connect(impConfig.signer).setConfiguration(dai.address, {
          data: daiConfiguration.and(activeMask),
        })
      );

      const updatedConfiguration =
        await protocolDataProvider.getReserveConfigurationData(dai.address);
      expect(updatedConfiguration.isActive).to.false;

      await expect(
        pool.withdraw(dai.address, amountDAItoDeposit, userAddress)
      ).to.be.revertedWith(ProtocolErrors.RESERVE_INACTIVE);
    });
  });

  context("PoolConfigurator: BorrowCap and SupplyCap", () => {
    let testEnv: TestEnv;
    const {INVALID_BORROW_CAP, INVALID_SUPPLY_CAP} = ProtocolErrors;

    before(async () => {
      testEnv = await loadFixture(testEnvFixture);
      const {
        weth,
        pool,
        dai,
        usdc,
        users: [user1],
      } = testEnv;

      const mintedAmount = utils.parseEther("1000000000");
      // minting for main user
      expect(await dai["mint(uint256)"](mintedAmount));
      expect(await weth["mint(uint256)"](mintedAmount));
      expect(await usdc["mint(uint256)"](mintedAmount));

      // minting for lp user
      expect(await dai.connect(user1.signer)["mint(uint256)"](mintedAmount));
      expect(await weth.connect(user1.signer)["mint(uint256)"](mintedAmount));
      expect(await usdc.connect(user1.signer)["mint(uint256)"](mintedAmount));

      expect(await dai.approve(pool.address, MAX_UINT_AMOUNT));
      expect(await weth.approve(pool.address, MAX_UINT_AMOUNT));
      expect(await usdc.approve(pool.address, MAX_UINT_AMOUNT));
      expect(
        await dai.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
      );
      expect(
        await weth.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
      );
      expect(
        await usdc.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
      );
    });

    it("Sets the borrow cap for DAI and USDC to 10 Units", async () => {
      const {configurator, dai, usdc, protocolDataProvider} = testEnv;

      const {borrowCap: usdcOldBorrowCap} =
        await protocolDataProvider.getReserveCaps(usdc.address);
      const {borrowCap: daiOldBorrowCap} =
        await protocolDataProvider.getReserveCaps(dai.address);

      const newCap = 10;
      expect(await configurator.setBorrowCap(usdc.address, newCap))
        .to.emit(configurator, "BorrowCapChanged")
        .withArgs(usdc.address, daiOldBorrowCap, newCap);
      expect(await configurator.setBorrowCap(dai.address, newCap))
        .to.emit(configurator, "BorrowCapChanged")
        .withArgs(dai.address, usdcOldBorrowCap, newCap);

      const {borrowCap: usdcBorrowCap} =
        await protocolDataProvider.getReserveCaps(usdc.address);
      const {borrowCap: daiBorrowCap} =
        await protocolDataProvider.getReserveCaps(dai.address);

      expect(usdcBorrowCap).to.be.equal(newCap);
      expect(daiBorrowCap).to.be.equal(newCap);
    });

    it("Tries to set the borrow cap for USDC and DAI to > MAX_BORROW_CAP (revert expected)", async () => {
      const {configurator, usdc, dai} = testEnv;
      const newCap = Number(MAX_BORROW_CAP) + 1;

      await expect(
        configurator.setBorrowCap(usdc.address, newCap)
      ).to.be.revertedWith(INVALID_BORROW_CAP);
      await expect(
        configurator.setBorrowCap(dai.address, newCap)
      ).to.be.revertedWith(INVALID_BORROW_CAP);
    });

    it("Sets the supply cap for DAI and USDC to 1000 Unit, leaving 0 Units to reach the limit", async () => {
      const {configurator, dai, usdc, protocolDataProvider} = testEnv;

      const {supplyCap: oldUsdcSupplyCap} =
        await protocolDataProvider.getReserveCaps(usdc.address);
      const {supplyCap: oldDaiSupplyCap} =
        await protocolDataProvider.getReserveCaps(dai.address);

      const newCap = "1000";

      expect(await configurator.setSupplyCap(usdc.address, newCap))
        .to.emit(configurator, "SupplyCapChanged")
        .withArgs(usdc.address, oldUsdcSupplyCap, newCap);
      expect(await configurator.setSupplyCap(dai.address, newCap))
        .to.emit(configurator, "SupplyCapChanged")
        .withArgs(dai.address, oldDaiSupplyCap, newCap);

      const {supplyCap: usdcSupplyCap} =
        await protocolDataProvider.getReserveCaps(usdc.address);
      const {supplyCap: daiSupplyCap} =
        await protocolDataProvider.getReserveCaps(dai.address);

      expect(usdcSupplyCap).to.be.equal(newCap);
      expect(daiSupplyCap).to.be.equal(newCap);
    });

    it("Tries to set the supply cap for USDC and DAI to > MAX_SUPPLY_CAP (revert expected)", async () => {
      const {configurator, usdc, dai} = testEnv;
      const newCap = Number(MAX_SUPPLY_CAP) + 1;

      await expect(
        configurator.setSupplyCap(usdc.address, newCap)
      ).to.be.revertedWith(INVALID_SUPPLY_CAP);
      await expect(
        configurator.setSupplyCap(dai.address, newCap)
      ).to.be.revertedWith(INVALID_SUPPLY_CAP);
    });
  });
});
