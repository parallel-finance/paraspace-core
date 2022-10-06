import {expect} from "chai";
import {BigNumberish} from "ethers";
import {MAX_UINT_AMOUNT, ZERO_ADDRESS} from "../deploy/helpers/constants";
import {
  PToken__factory,
  ERC20,
  ERC20__factory,
  MintableERC20,
  MintableERC20__factory,
  StableDebtToken__factory,
  VariableDebtToken__factory,
} from "../types";
import {getFirstSigner} from "../deploy/helpers/contracts-getters";
import {makeSuite} from "./helpers/make-suite";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {waitForTx} from "../deploy/helpers/misc-utils";
import {auctionStrategyExp} from "../deploy/market-config/auctionStrategies";
import {deployDefaultReserveAuctionStrategy} from "../deploy/helpers/contracts-deployments";
import {parseEther} from "ethers/lib/utils";

makeSuite("Reserve Without Incentives Controller", (testEnv) => {
  let mockToken: MintableERC20;
  let oMockToken: ERC20;

  before(async () => {
    const {pool, poolAdmin, oracle, configurator, dai, helpersContract} =
      testEnv;

    mockToken = await new MintableERC20__factory(await getFirstSigner()).deploy(
      "MOCK",
      "MOCK",
      "18"
    );

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
        stableDebtTokenName: "SMOCK",
        stableDebtTokenSymbol: "SMOCK",
        params: "0x10",
      },
    ];

    // Add the mock reserve
    await configurator.connect(poolAdmin.signer).initReserves(initInputParams);

    // Configuration
    const daiReserveConfigurationData =
      await helpersContract.getReserveConfigurationData(dai.address);

    const inputParams: {
      asset: string;
      baseLTV: BigNumberish;
      liquidationThreshold: BigNumberish;
      liquidationBonus: BigNumberish;
      reserveFactor: BigNumberish;
      borrowCap: BigNumberish;
      supplyCap: BigNumberish;
      stableBorrowingEnabled: boolean;
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
        stableBorrowingEnabled: true,
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
    await configurator.setReserveStableRateBorrowing(
      inputParams[i].asset,
      inputParams[i].stableBorrowingEnabled
    );

    await configurator
      .connect(poolAdmin.signer)
      .setSupplyCap(inputParams[i].asset, inputParams[i].supplyCap);
    await configurator
      .connect(poolAdmin.signer)
      .setReserveFactor(inputParams[i].asset, inputParams[i].reserveFactor);

    const reserveData = await pool.getReserveData(mockToken.address);
    oMockToken = ERC20__factory.connect(
      reserveData.xTokenAddress,
      await getFirstSigner()
    );
  });

  it("Deposit mock tokens into paraspace", async () => {
    const {
      pool,
      users: [user],
    } = testEnv;

    expect(await oMockToken.balanceOf(user.address)).to.be.eq(0);

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

    expect(await oMockToken.balanceOf(user.address)).to.be.eq(
      await convertToCurrencyDecimals(oMockToken.address, "1000")
    );
  });

  it("Transfer aMock tokens", async () => {
    const {
      users: [sender, receiver],
    } = testEnv;

    expect(await oMockToken.balanceOf(sender.address)).to.be.eq(
      await convertToCurrencyDecimals(oMockToken.address, "1000")
    );
    expect(await oMockToken.balanceOf(receiver.address)).to.be.eq(0);

    await oMockToken
      .connect(sender.signer)
      .transfer(
        receiver.address,
        await convertToCurrencyDecimals(oMockToken.address, "1000")
      );
    expect(await oMockToken.balanceOf(sender.address)).to.be.eq(0);
    expect(await oMockToken.balanceOf(receiver.address)).to.be.eq(
      await convertToCurrencyDecimals(oMockToken.address, "1000")
    );
  });

  it("Withdraw aMock tokens", async () => {
    const {
      pool,
      users: [, user],
    } = testEnv;

    expect(await mockToken.balanceOf(user.address)).to.be.eq(0);

    const oMockTokenBalanceBefore = await oMockToken.balanceOf(user.address, {
      blockTag: "pending",
    });

    await oMockToken
      .connect(user.signer)
      .approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(user.signer)
      .withdraw(mockToken.address, oMockTokenBalanceBefore, user.address);

    expect(await oMockToken.balanceOf(user.address)).to.be.eq(0);
    expect(await mockToken.balanceOf(user.address)).to.be.eq(
      oMockTokenBalanceBefore
    );
  });
});
