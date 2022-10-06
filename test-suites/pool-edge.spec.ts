import {expect} from "chai";
import {BigNumberish, utils} from "ethers";
import {
  evmRevert,
  evmSnapshot,
  impersonateAccountsHardhat,
} from "../deploy/helpers/misc-utils";
import {MAX_UINT_AMOUNT, ZERO_ADDRESS} from "../deploy/helpers/constants";
import {
  deployDefaultReserveAuctionStrategy,
  deployMintableERC20,
  // deployPool,
} from "../deploy/helpers/contracts-deployments";
import {ProtocolErrors} from "../deploy/helpers/types";
import {
  MockReserveInterestRateStrategy__factory,
  // Pool__factory,
  PToken__factory,
  StableDebtToken__factory,
  VariableDebtToken__factory,
} from "../types";
import {topUpNonPayableWithEther} from "./helpers/utils/funds";
import {makeSuite, TestEnv} from "./helpers/make-suite";
import {HardhatRuntimeEnvironment} from "hardhat/types";
import {getFirstSigner} from "../deploy/helpers/contracts-getters";
import {auctionStrategyExp} from "../deploy/market-config/auctionStrategies";

declare let hre: HardhatRuntimeEnvironment;

makeSuite("Pool: Edge cases", (testEnv: TestEnv) => {
  const {
    ASSET_NOT_LISTED,
    ZERO_ADDRESS_NOT_VALID,
    CALLER_NOT_POOL_CONFIGURATOR,
    CALLER_NOT_XTOKEN,
    NOT_CONTRACT,
    RESERVE_ALREADY_INITIALIZED,
    RESERVE_ALREADY_ADDED,
  } = ProtocolErrors;

  const MAX_STABLE_RATE_BORROW_SIZE_PERCENT = 2500;
  const MAX_NUMBER_RESERVES = 128;

  let snap: string;

  beforeEach(async () => {
    snap = await evmSnapshot();
  });

  afterEach(async () => {
    await evmRevert(snap);
  });

  // it("Drop asset while user uses it as collateral, ensure that borrowing power is lowered", async () => {
  //   const {
  //     addressesProvider,
  //     poolAdmin,
  //     dai,
  //     users: [user0],
  //   } = testEnv;
  //   // Deploy the mock Pool with a `dropReserve` skipping the checks

  //   const NEW_POOL_IMPL_ARTIFACT = await deployMockPoolInherited(
  //     addressesProvider.address
  //   );

  //   const poolProxyAddress = await addressesProvider.getPool();
  //   const oldPoolImpl = await getProxyImplementation(
  //     addressesProvider.address,
  //     poolProxyAddress
  //   );

  //   // Upgrade the Pool
  //   expect(
  //     await addressesProvider
  //       .connect(poolAdmin.signer)
  //       .setPoolImpl(NEW_POOL_IMPL_ARTIFACT.address)
  //   )
  //     .to.emit(addressesProvider, "PoolUpdated")
  //     .withArgs(oldPoolImpl, NEW_POOL_IMPL_ARTIFACT.address);

  //   // Get the Pool instance
  //   const mockPoolAddress = await addressesProvider.getPool();
  //   const mockPool = await MockPoolInherited__factory.connect(
  //     mockPoolAddress,
  //     await getFirstSigner()
  //   );

  //   const amount = utils.parseUnits("10", 18);
  //   const amountUSD = amount.div(BigNumber.from(10).pow(10));

  //   await dai.connect(user0.signer)["mint(uint256)"](amount);
  //   await dai.connect(user0.signer).approve(mockPool.address, MAX_UINT_AMOUNT);

  //   expect(
  //     await mockPool
  //       .connect(user0.signer)
  //       .supply(dai.address, amount, user0.address, 0)
  //   );

  //   const userReserveDataBefore = await mockPool.getUserAccountData(
  //     user0.address
  //   );

  //   expect(userReserveDataBefore.totalCollateralBase).to.be.eq(amountUSD);
  //   expect(userReserveDataBefore.totalDebtBase).to.be.eq(0);
  //   expect(userReserveDataBefore.availableBorrowsBase).to.be.eq(
  //     amountUSD.mul(7500).div(10000)
  //   );
  //   expect(userReserveDataBefore.currentLiquidationThreshold).to.be.eq(8000);
  //   expect(userReserveDataBefore.ltv).to.be.eq(7500);
  //   expect(userReserveDataBefore.healthFactor).to.be.eq(MAX_UINT_AMOUNT);

  //   expect(await mockPool.dropReserve(dai.address));

  //   const userReserveDataAfter = await mockPool.getUserAccountData(
  //     user0.address
  //   );

  //   expect(userReserveDataAfter.totalCollateralBase).to.be.eq(0);
  //   expect(userReserveDataAfter.totalDebtBase).to.be.eq(0);
  //   expect(userReserveDataAfter.availableBorrowsBase).to.be.eq(0);
  //   expect(userReserveDataAfter.currentLiquidationThreshold).to.be.eq(0);
  //   expect(userReserveDataAfter.ltv).to.be.eq(0);
  //   expect(userReserveDataAfter.healthFactor).to.be.eq(MAX_UINT_AMOUNT);
  // });

  // it("Initialize fresh deployment with incorrect addresses provider (revert expected)", async () => {
  //   const {
  //     addressesProvider,
  //     users: [deployer],
  //   } = testEnv;
  //
  //   const NEW_POOL_IMPL_ARTIFACT = await deployPool(addressesProvider.address);
  //
  //   const freshPool = Pool__factory.connect(
  //     NEW_POOL_IMPL_ARTIFACT.address,
  //     deployer.signer
  //   );
  //
  //   await expect(freshPool.initialize(deployer.address)).to.be.revertedWith(
  //     INVALID_ADDRESSES_PROVIDER
  //   );
  // });

  it("Check initialization", async () => {
    const {pool} = testEnv;

    expect(await pool.MAX_STABLE_RATE_BORROW_SIZE_PERCENT()).to.be.eq(
      MAX_STABLE_RATE_BORROW_SIZE_PERCENT
    );
    expect(await pool.MAX_NUMBER_RESERVES()).to.be.eq(MAX_NUMBER_RESERVES);
  });

  it("Tries to initialize a reserve as non PoolConfigurator (revert expected)", async () => {
    const {pool, users, dai, helpersContract} = testEnv;

    const config = await helpersContract.getReserveTokensAddresses(dai.address);

    await expect(
      pool
        .connect(users[0].signer)
        .initReserve(
          dai.address,
          config.xTokenAddress,
          config.stableDebtTokenAddress,
          config.variableDebtTokenAddress,
          ZERO_ADDRESS,
          ZERO_ADDRESS
        )
    ).to.be.revertedWith(CALLER_NOT_POOL_CONFIGURATOR);
  });

  it("Call `setUserUseERC20AsCollateral()` to use an asset as collateral when the asset is already set as collateral", async () => {
    const {
      pool,
      helpersContract,
      dai,
      users: [user0],
    } = testEnv;

    const amount = utils.parseUnits("10", 18);
    await dai.connect(user0.signer)["mint(uint256)"](amount);
    await dai.connect(user0.signer).approve(pool.address, MAX_UINT_AMOUNT);

    expect(
      await pool
        .connect(user0.signer)
        .supply(dai.address, amount, user0.address, 0)
    );

    const userReserveDataBefore = await helpersContract.getUserReserveData(
      dai.address,
      user0.address
    );
    expect(userReserveDataBefore.usageAsCollateralEnabled).to.be.true;

    expect(
      await pool
        .connect(user0.signer)
        .setUserUseERC20AsCollateral(dai.address, true)
    ).to.not.emit(pool, "ReserveUsedAsCollateralEnabled");

    const userReserveDataAfter = await helpersContract.getUserReserveData(
      dai.address,
      user0.address
    );
    expect(userReserveDataAfter.usageAsCollateralEnabled).to.be.true;
  });

  it("Call `setUserUseERC20AsCollateral()` to disable an asset as collateral when the asset is already disabled as collateral", async () => {
    const {
      pool,
      helpersContract,
      dai,
      users: [user0],
    } = testEnv;

    const amount = utils.parseUnits("10", 18);
    await dai.connect(user0.signer)["mint(uint256)"](amount);
    await dai.connect(user0.signer).approve(pool.address, MAX_UINT_AMOUNT);

    expect(
      await pool
        .connect(user0.signer)
        .supply(dai.address, amount, user0.address, 0)
    );

    // Disable asset as collateral
    expect(
      await pool
        .connect(user0.signer)
        .setUserUseERC20AsCollateral(dai.address, false)
    )
      .to.emit(pool, "ReserveUsedAsCollateralDisabled")
      .withArgs(dai.address, user0.address);

    const userReserveDataBefore = await helpersContract.getUserReserveData(
      dai.address,
      user0.address
    );
    expect(userReserveDataBefore.usageAsCollateralEnabled).to.be.false;

    expect(
      await pool
        .connect(user0.signer)
        .setUserUseERC20AsCollateral(dai.address, false)
    ).to.not.emit(pool, "ReserveUsedAsCollateralDisabled");

    const userReserveDataAfter = await helpersContract.getUserReserveData(
      dai.address,
      user0.address
    );
    expect(userReserveDataAfter.usageAsCollateralEnabled).to.be.false;
  });

  it("Call `mintToTreasury()` on a pool with an inactive reserve", async () => {
    const {pool, poolAdmin, dai, users, configurator} = testEnv;

    // Deactivate reserve
    expect(
      await configurator
        .connect(poolAdmin.signer)
        .setReserveActive(dai.address, false)
    );

    // MintToTreasury
    expect(await pool.connect(users[0].signer).mintToTreasury([dai.address]));
  });

  it("Tries to call `finalizeTransfer()` by a non-xToken address (revert expected)", async () => {
    const {pool, dai, users} = testEnv;

    await expect(
      pool
        .connect(users[0].signer)
        .finalizeTransfer(
          dai.address,
          users[0].address,
          users[1].address,
          false,
          0,
          0,
          0
        )
    ).to.be.revertedWith(CALLER_NOT_XTOKEN);
  });

  it("Tries to call `initReserve()` with an EOA as reserve (revert expected)", async () => {
    const {pool, deployer, users, configurator} = testEnv;

    // Impersonate PoolConfigurator
    await topUpNonPayableWithEther(
      deployer.signer,
      [configurator.address],
      utils.parseEther("1")
    );
    await impersonateAccountsHardhat([configurator.address]);
    const configSigner = await hre.ethers.getSigner(configurator.address);

    await expect(
      pool
        .connect(configSigner)
        .initReserve(
          users[0].address,
          ZERO_ADDRESS,
          ZERO_ADDRESS,
          ZERO_ADDRESS,
          ZERO_ADDRESS,
          ZERO_ADDRESS
        )
    ).to.be.revertedWith(NOT_CONTRACT);
  });

  it("PoolConfigurator updates the ReserveInterestRateStrategy address", async () => {
    const {pool, deployer, dai, configurator} = testEnv;

    // Impersonate PoolConfigurator
    await topUpNonPayableWithEther(
      deployer.signer,
      [configurator.address],
      utils.parseEther("1")
    );
    await impersonateAccountsHardhat([configurator.address]);
    const configSigner = await hre.ethers.getSigner(configurator.address);

    expect(
      await pool
        .connect(configSigner)
        .setReserveInterestRateStrategyAddress(dai.address, ZERO_ADDRESS)
    );

    const config = await pool.getReserveData(dai.address);
    expect(config.interestRateStrategyAddress).to.be.eq(ZERO_ADDRESS);
  });

  it("PoolConfigurator updates the ReserveInterestRateStrategy address for asset 0", async () => {
    const {pool, deployer, configurator} = testEnv;

    // Impersonate PoolConfigurator
    await topUpNonPayableWithEther(
      deployer.signer,
      [configurator.address],
      utils.parseEther("1")
    );
    await impersonateAccountsHardhat([configurator.address]);
    const configSigner = await hre.ethers.getSigner(configurator.address);

    await expect(
      pool
        .connect(configSigner)
        .setReserveInterestRateStrategyAddress(ZERO_ADDRESS, ZERO_ADDRESS)
    ).to.be.revertedWith(ZERO_ADDRESS_NOT_VALID);
  });

  it("PoolConfigurator updates the ReserveInterestRateStrategy address for an unlisted asset (revert expected)", async () => {
    const {pool, deployer, configurator, users} = testEnv;

    // Impersonate PoolConfigurator
    await topUpNonPayableWithEther(
      deployer.signer,
      [configurator.address],
      utils.parseEther("1")
    );
    await impersonateAccountsHardhat([configurator.address]);
    const configSigner = await hre.ethers.getSigner(configurator.address);

    await expect(
      pool
        .connect(configSigner)
        .setReserveInterestRateStrategyAddress(users[5].address, ZERO_ADDRESS)
    ).to.be.revertedWith(ASSET_NOT_LISTED);
  });

  it("Activates the zero address reserve for borrowing via pool admin (expect revert)", async () => {
    const {configurator} = testEnv;
    await expect(
      configurator.setReserveBorrowing(ZERO_ADDRESS, true)
    ).to.be.revertedWith(ZERO_ADDRESS_NOT_VALID);
  });

  it("Initialize an already initialized reserve. ReserveLogic `init` where xTokenAddress != ZERO_ADDRESS (revert expected)", async () => {
    const {pool, dai, deployer, configurator} = testEnv;

    // Impersonate PoolConfigurator
    await topUpNonPayableWithEther(
      deployer.signer,
      [configurator.address],
      utils.parseEther("1")
    );
    await impersonateAccountsHardhat([configurator.address]);
    const configSigner = await hre.ethers.getSigner(configurator.address);

    const config = await pool.getReserveData(dai.address);

    await expect(
      pool.connect(configSigner).initReserve(
        dai.address,
        config.xTokenAddress, // just need a non-used reserve token
        config.stableDebtTokenAddress,
        config.variableDebtTokenAddress,
        ZERO_ADDRESS,
        ZERO_ADDRESS
      )
    ).to.be.revertedWith(RESERVE_ALREADY_INITIALIZED);
  });

  it("Init reserve with ZERO_ADDRESS as xToken twice, to enter `_addReserveToList()` already added (revert expected)", async () => {
    /**
     * To get into this case, we need to init a reserve with `xTokenAddress = address(0)` twice.
     * `_addReserveToList()` is called from `initReserve`. However, in `initReserve` we run `init` before the `_addReserveToList()`,
     * and in `init` we are checking if `xTokenAddress == address(0)`, so to bypass that we need this odd init.
     */
    const {pool, dai, deployer, configurator} = testEnv;

    // Impersonate PoolConfigurator
    await topUpNonPayableWithEther(
      deployer.signer,
      [configurator.address],
      utils.parseEther("1")
    );
    await impersonateAccountsHardhat([configurator.address]);
    const configSigner = await hre.ethers.getSigner(configurator.address);

    const config = await pool.getReserveData(dai.address);

    const poolListBefore = await pool.getReservesList();

    expect(
      await pool
        .connect(configSigner)
        .initReserve(
          config.xTokenAddress,
          ZERO_ADDRESS,
          config.stableDebtTokenAddress,
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
          config.stableDebtTokenAddress,
          config.variableDebtTokenAddress,
          ZERO_ADDRESS,
          ZERO_ADDRESS
        )
    ).to.be.revertedWith(RESERVE_ALREADY_ADDED);
    const poolListAfter = await pool.getReservesList();
    expect(poolListAfter.length).to.be.eq(poolListMid.length);
  });

  // it("Initialize reserves until max, then add one more (revert expected)", async () => {
  //   // Upgrade the Pool to update the maximum number of reserves
  //   const { addressesProvider, poolAdmin, pool, dai, deployer, configurator } =
  //     testEnv;
  //   const { deployer: deployerName } = await hre.getNamedAccounts();

  //   // Impersonate the PoolConfigurator
  //   await topUpNonPayableWithEther(
  //     deployer.signer,
  //     [configurator.address],
  //     utils.parseEther("1")
  //   );
  //   await impersonateAccountsHardhat([configurator.address]);
  //   const configSigner = await hre.ethers.getSigner(configurator.address);

  //   // Deploy the mock Pool with a setter of `maxNumberOfReserves`
  //   const NEW_POOL_IMPL_ARTIFACT = await deployMockPoolInherited(
  //     addressesProvider.address
  //   );

  //   const poolProxyAddress = await addressesProvider.getPool();
  //   const oldPoolImpl = await getProxyImplementation(
  //     addressesProvider.address,
  //     poolProxyAddress
  //   );

  //   // Upgrade the Pool
  //   expect(
  //     await addressesProvider
  //       .connect(poolAdmin.signer)
  //       .setPoolImpl(NEW_POOL_IMPL_ARTIFACT.address)
  //   )
  //     .to.emit(addressesProvider, "PoolUpdated")
  //     .withArgs(oldPoolImpl, NEW_POOL_IMPL_ARTIFACT.address);

  //   // Get the Pool instance
  //   const mockPoolAddress = await addressesProvider.getPool();
  //   const mockPool = await MockPoolInherited__factory.connect(
  //     mockPoolAddress,
  //     await getFirstSigner()
  //   );

  //   // Get the current number of reserves
  //   const numberOfReserves = (await mockPool.getReservesList()).length;

  //   // Set the limit
  //   expect(await mockPool.setMaxNumberOfReserves(numberOfReserves));
  //   expect(await mockPool.MAX_NUMBER_RESERVES()).to.be.eq(numberOfReserves);

  //   const freshContract = await deployMintableERC20(["MOCK", "MOCK", "18"]);
  //   const config = await pool.getReserveData(dai.address);
  //   await expect(
  //     pool.connect(configSigner).initReserve(
  //       freshContract.address, // just need a non-used reserve token
  //       0,
  //       ZERO_ADDRESS,
  //       config.stableDebtTokenAddress,
  //       config.variableDebtTokenAddress,
  //       ZERO_ADDRESS
  //     )
  //   ).to.be.revertedWith(NO_MORE_RESERVES_ALLOWED);
  // });

  it("Add asset after multiple drops", async () => {
    /**
     * 1. Init assets (done through setup so get this for free)
     * 2. Drop some reserves
     * 3. Init a new asset.
     * Intended behaviour new asset is inserted into one of the available spots in
     */
    const {configurator, pool, poolAdmin, addressesProvider} = testEnv;

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
        assetData.currentStableBorrowRate.eq(0) &&
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

    // Deploy new token and implementations
    const mockToken = await deployMintableERC20(["MOCK", "MOCK", "18"]);
    const stableDebtTokenImplementation = await new StableDebtToken__factory(
      await getFirstSigner()
    ).deploy(pool.address);
    const variableDebtTokenImplementation =
      await new VariableDebtToken__factory(await getFirstSigner()).deploy(
        pool.address
      );
    const xTokenImplementation = await new PToken__factory(
      await getFirstSigner()
    ).deploy(pool.address);
    const mockRateStrategy = await new MockReserveInterestRateStrategy__factory(
      await getFirstSigner()
    ).deploy(addressesProvider.address, 0, 0, 0, 0, 0, 0);
    const mockAuctionStrategy = await await deployDefaultReserveAuctionStrategy(
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
      stableDebtTokenImpl: string;
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
      stableDebtTokenName: string;
      stableDebtTokenSymbol: string;
      params: string;
    }[] = [
      {
        xTokenImpl: xTokenImplementation.address,
        stableDebtTokenImpl: stableDebtTokenImplementation.address,
        variableDebtTokenImpl: variableDebtTokenImplementation.address,
        underlyingAssetDecimals: 18,
        interestRateStrategyAddress: mockRateStrategy.address,
        auctionStrategyAddress: mockAuctionStrategy.address,
        underlyingAsset: mockToken.address,
        assetType: 0,
        treasury: ZERO_ADDRESS,
        incentivesController: ZERO_ADDRESS,
        xTokenName: "PMOCK",
        xTokenSymbol: "PMOCK",
        variableDebtTokenName: "VMOCK",
        variableDebtTokenSymbol: "VMOCK",
        stableDebtTokenName: "SMOCK",
        stableDebtTokenSymbol: "SMOCK",
        params: "0x10",
      },
    ];

    expect(
      await configurator.connect(poolAdmin.signer).initReserves(initInputParams)
    );
    const reservesListAfterInit = await pool
      .connect(configurator.signer)
      .getReservesList();

    const occurrences = reservesListAfterInit.filter(
      (v) => v == mockToken.address
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

  // it("Initialize reserves until max-1, then (drop one and add a new) x 2, finally add to hit max", async () => {
  //   /**
  //    * 1. Update max number of assets to current number og assets
  //    * 2. Drop some reserves
  //    * 3. Init a new asset.
  //    * Intended behaviour: new asset is inserted into one of the available spots in `_reservesList` and `_reservesCount` kept the same
  //    */

  //   // Upgrade the Pool to update the maximum number of reserves
  //   const { addressesProvider, poolAdmin, pool, dai, deployer, configurator } =
  //     testEnv;
  //   const { deployer: deployerName } = await hre.getNamedAccounts();

  //   // Impersonate the PoolConfigurator
  //   await topUpNonPayableWithEther(
  //     deployer.signer,
  //     [configurator.address],
  //     utils.parseEther("1")
  //   );
  //   await impersonateAccountsHardhat([configurator.address]);
  //   const configSigner = await hre.ethers.getSigner(configurator.address);

  //   // Deploy the mock Pool with a setter of `maxNumberOfReserves`
  //   const NEW_POOL_IMPL_ARTIFACT = await deployMockPoolInherited(
  //     addressesProvider.address
  //   );

  //   const proxyAddress = await addressesProvider.getAddress(POOL_ID);
  //   const implementationAddress = await getProxyImplementation(
  //     addressesProvider.address,
  //     proxyAddress
  //   );

  //   // Upgrade the Pool
  //   expect(
  //     await addressesProvider
  //       .connect(poolAdmin.signer)
  //       .setPoolImpl(NEW_POOL_IMPL_ARTIFACT.address)
  //   )
  //     .to.emit(addressesProvider, "PoolUpdated")
  //     .withArgs(implementationAddress, NEW_POOL_IMPL_ARTIFACT.address);

  //   // Get the Pool instance
  //   const mockPoolAddress = await addressesProvider.getPool();
  //   const mockPool = await MockPoolInherited__factory.connect(
  //     mockPoolAddress,
  //     await getFirstSigner()
  //   );

  //   // Get the current number of reserves
  //   let numberOfReserves = (await mockPool.getReservesList()).length;

  //   // Set the limit
  //   expect(await mockPool.setMaxNumberOfReserves(numberOfReserves + 1));
  //   expect(await mockPool.MAX_NUMBER_RESERVES()).to.be.eq(numberOfReserves + 1);

  //   for (let dropped = 0; dropped < 2; dropped++) {
  //     const reservesListBefore = await pool
  //       .connect(configurator.signer)
  //       .getReservesList();
  //     for (let i = 0; i < reservesListBefore.length; i++) {
  //       const reserveAsset = reservesListBefore[i];
  //       const assetData = await pool.getReserveData(reserveAsset);

  //       if (assetData.xTokenAddress == ZERO_ADDRESS) {
  //         continue;
  //       }

  //       if (
  //         assetData.currentLiquidityRate.eq(0) &&
  //         assetData.currentStableBorrowRate.eq(0) &&
  //         assetData.currentVariableBorrowRate.eq(0)
  //       ) {
  //         await configurator
  //           .connect(poolAdmin.signer)
  //           .dropReserve(reserveAsset);
  //         break;
  //       }
  //     }

  //     const reservesListLengthAfterDrop = (await pool.getReservesList()).length;
  //     expect(reservesListLengthAfterDrop).to.be.eq(
  //       reservesListBefore.length - 1
  //     );
  //     expect(reservesListLengthAfterDrop).to.be.lt(
  //       await mockPool.MAX_NUMBER_RESERVES()
  //     );

  //     const freshContract = await deployMintableERC20(["MOCK", "MOCK", "18"]);
  //     const config = await pool.getReserveData(dai.address);
  //     expect(
  //       await pool.connect(configSigner).initReserve(
  //         freshContract.address, // just need a non-used reserve token
  //         ZERO_ADDRESS,
  //         config.stableDebtTokenAddress,
  //         config.variableDebtTokenAddress,
  //         ZERO_ADDRESS
  //       )
  //     );
  //   }

  //   const freshContract = await deployMintableERC20(["MOCK", "MOCK", "18"]);
  //   const config = await pool.getReserveData(dai.address);
  //   expect(
  //     await pool.connect(configSigner).initReserve(
  //       freshContract.address, // just need a non-used reserve token
  //       ZERO_ADDRESS,
  //       config.stableDebtTokenAddress,
  //       config.variableDebtTokenAddress,
  //       ZERO_ADDRESS
  //     )
  //   );
  //   expect((await pool.getReservesList()).length).to.be.eq(
  //     await pool.MAX_NUMBER_RESERVES()
  //   );
  // });

  // it("Call `resetIsolationModeTotalDebt()` to reset isolationModeTotalDebt of an asset with non-zero debt ceiling", async () => {
  //   const {
  //     configurator,
  //     pool,
  //     helpersContract,
  //     dai,
  //     poolAdmin,
  //     deployer,
  //     users: [user0],
  //   } = testEnv;

  //   const debtCeiling = utils.parseUnits("10", 2);

  //   expect(await helpersContract.getDebtCeiling(dai.address)).to.be.eq(0);

  //   await configurator
  //     .connect(poolAdmin.signer)
  //     .setDebtCeiling(dai.address, debtCeiling);

  //   expect(await helpersContract.getDebtCeiling(dai.address)).to.be.eq(
  //     debtCeiling
  //   );

  //   // Impersonate PoolConfigurator
  //   await topUpNonPayableWithEther(
  //     deployer.signer,
  //     [configurator.address],
  //     utils.parseEther("1")
  //   );
  //   await impersonateAccountsHardhat([configurator.address]);
  //   const configSigner = await hre.ethers.getSigner(configurator.address);

  //   await expect(
  //     pool.connect(configSigner).resetIsolationModeTotalDebt(dai.address)
  //   ).to.be.revertedWith(DEBT_CEILING_NOT_ZERO);
  // });

  // it("Tries to initialize a reserve with an PToken, StableDebtToken, and VariableDebt each deployed with the wrong pool address (revert expected)", async () => {
  //   const {pool, deployer, configurator, addressesProvider} = testEnv;
  //
  //   const NEW_POOL_IMPL_ARTIFACT = await deployPool(
  //     addressesProvider.address,
  //     false
  //   );
  //
  //   const xTokenImp = await new PToken__factory(await getFirstSigner()).deploy(
  //     pool.address
  //   );
  //   const stableDebtTokenImp = await new StableDebtToken__factory(
  //     deployer.signer
  //   ).deploy(pool.address);
  //   const variableDebtTokenImp = await new VariableDebtToken__factory(
  //     deployer.signer
  //   ).deploy(pool.address);
  //
  //   const xTokenWrongPool = await new PToken__factory(
  //     await getFirstSigner()
  //   ).deploy(NEW_POOL_IMPL_ARTIFACT.address);
  //   const stableDebtTokenWrongPool = await new StableDebtToken__factory(
  //     deployer.signer
  //   ).deploy(NEW_POOL_IMPL_ARTIFACT.address);
  //   const variableDebtTokenWrongPool = await new VariableDebtToken__factory(
  //     deployer.signer
  //   ).deploy(NEW_POOL_IMPL_ARTIFACT.address);
  //
  //   const mockErc20 = await new ERC20__factory(deployer.signer).deploy(
  //     "mock",
  //     "MOCK"
  //   );
  //   const mockRateStrategy = await new MockReserveInterestRateStrategy__factory(
  //     await getFirstSigner()
  //   ).deploy(addressesProvider.address, 0, 0, 0, 0, 0, 0);
  //   const mockAuctionStrategy = await await deployDefaultReserveAuctionStrategy(
  //     [
  //       auctionStrategyExp.maxPriceMultiplier,
  //       auctionStrategyExp.minExpPriceMultiplier,
  //       auctionStrategyExp.minPriceMultiplier,
  //       auctionStrategyExp.stepLinear,
  //       auctionStrategyExp.stepExp,
  //       auctionStrategyExp.tickLength,
  //     ]
  //   );
  //
  //   // Init the reserve
  //   const initInputParams: {
  //     xTokenImpl: string;
  //     stableDebtTokenImpl: string;
  //     variableDebtTokenImpl: string;
  //     underlyingAssetDecimals: BigNumberish;
  //     interestRateStrategyAddress: string;
  //     auctionStrategyAddress: string;
  //     underlyingAsset: string;
  //     assetType: BigNumberish;
  //     treasury: string;
  //     incentivesController: string;
  //     underlyingAssetName: string;
  //     xTokenName: string;
  //     xTokenSymbol: string;
  //     variableDebtTokenName: string;
  //     variableDebtTokenSymbol: string;
  //     stableDebtTokenName: string;
  //     stableDebtTokenSymbol: string;
  //     params: string;
  //   }[] = [
  //       {
  //         xTokenImpl: xTokenImp.address,
  //         stableDebtTokenImpl: stableDebtTokenImp.address,
  //         variableDebtTokenImpl: variableDebtTokenImp.address,
  //         underlyingAssetDecimals: 18,
  //         interestRateStrategyAddress: mockRateStrategy.address,
  //         auctionStrategyAddress: mockAuctionStrategy.address,
  //         underlyingAsset: mockErc20.address,
  //         assetType: 0,
  //         treasury: ZERO_ADDRESS,
  //         incentivesController: ZERO_ADDRESS,
  //         underlyingAssetName: "MOCK",
  //         xTokenName: "PMOCK",
  //         xTokenSymbol: "PMOCK",
  //         variableDebtTokenName: "VMOCK",
  //         variableDebtTokenSymbol: "VMOCK",
  //         stableDebtTokenName: "SMOCK",
  //         stableDebtTokenSymbol: "SMOCK",
  //         params: "0x10",
  //       },
  //     ];
  //
  //   initInputParams[0].xTokenImpl = xTokenWrongPool.address;
  //   await expect(configurator.initReserves(initInputParams)).to.be.reverted;
  //
  //   initInputParams[0].xTokenImpl = xTokenImp.address;
  //   initInputParams[0].stableDebtTokenImpl = stableDebtTokenWrongPool.address;
  //   await expect(configurator.initReserves(initInputParams)).to.be.reverted;
  //
  //   initInputParams[0].stableDebtTokenImpl = stableDebtTokenImp.address;
  //   initInputParams[0].variableDebtTokenImpl =
  //     variableDebtTokenWrongPool.address;
  //   await expect(configurator.initReserves(initInputParams)).to.be.reverted;
  //
  //   initInputParams[0].variableDebtTokenImpl = variableDebtTokenImp.address;
  //   expect(await configurator.initReserves(initInputParams));
  // });
});
