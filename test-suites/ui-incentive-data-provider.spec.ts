import {expect} from "chai";
import {TestEnv} from "./helpers/make-suite";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {
  getMockIncentivesController,
  getUiIncentiveDataProviderV3,
} from "../deploy/helpers/contracts-getters";
import {UiIncentiveDataProvider} from "../types";

describe("UI Incentives Data Provider", () => {
  let testEnv: TestEnv;
  let uiIncentiveDataProvider: UiIncentiveDataProvider;

  before("Load fixture and contract", async () => {
    testEnv = await loadFixture(testEnvFixture);
    uiIncentiveDataProvider = await getUiIncentiveDataProviderV3();
  });

  it("Test can get reserve incentive data", async () => {
    const {
      addressesProvider,
      users: [user1],
      dai,
      pool,
      configurator,
    } = testEnv;
    const reservesList = await pool
      .connect(configurator.signer)
      .getReservesList();

    const [data] = await uiIncentiveDataProvider.getFullReservesIncentiveData(
      addressesProvider.address,
      user1.address
    );
    expect(data.length).to.eq(reservesList.length);

    const [daiData] = data.filter((it) => it.underlyingAsset == dai.address);

    // get reserve data for DAI
    const expectedReserveData = await pool
      .connect(configurator.signer)
      .getReserveData(dai.address);

    expect(daiData.underlyingAsset).to.eq(dai.address);
    expect(daiData.aIncentiveData.tokenAddress).to.eq(
      expectedReserveData.xTokenAddress
    );
    expect(daiData.vIncentiveData.tokenAddress).to.eq(
      expectedReserveData.variableDebtTokenAddress
    );
    expect(daiData.aIncentiveData.incentiveControllerAddress).to.eq(
      (await getMockIncentivesController()).address
    );
  });

  it("Test can get user reserves incentive data", async () => {
    const {
      addressesProvider,
      users: [user1],
      dai,
      pool,
      configurator,
    } = testEnv;
    const reservesList = await pool
      .connect(configurator.signer)
      .getReservesList();

    const data = await uiIncentiveDataProvider.getUserReservesIncentivesData(
      addressesProvider.address,
      user1.address
    );
    expect(data.length).to.eq(reservesList.length);

    const [daiData] = data.filter((it) => it.underlyingAsset == dai.address);

    // get reserve data for DAI
    const expectedReserveData = await pool
      .connect(configurator.signer)
      .getReserveData(dai.address);

    expect(daiData.underlyingAsset).to.eq(dai.address);
    expect(daiData.xTokenIncentivesUserData.tokenAddress).to.eq(
      expectedReserveData.xTokenAddress
    );
    expect(daiData.vTokenIncentivesUserData.tokenAddress).to.eq(
      expectedReserveData.variableDebtTokenAddress
    );
  });
});
