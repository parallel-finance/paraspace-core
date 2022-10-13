import {expect} from "chai";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {ONE_ADDRESS} from "../deploy/helpers/constants";
import {ProtocolErrors} from "../deploy/helpers/types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";

describe("PoolConfigurator: Modifiers", () => {
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
        configurator.connect(nonRiskOrPoolAdmins.signer)[call.fn](...call.args)
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
