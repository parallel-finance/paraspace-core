import {expect} from "chai";
import {oneEther, ONE_ADDRESS, ZERO_ADDRESS} from "../helpers/constants";
import {
  evmRevert,
  evmSnapshot,
  getParaSpaceConfig,
} from "../helpers/misc-utils";
import {
  deployMintableERC20,
  deployAggregator,
} from "../helpers/contracts-deployments";
import {MintableERC20, MockAggregator} from "../types";
import {ProtocolErrors} from "../helpers/types";
import {TestEnv} from "./helpers/make-suite";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {ETHERSCAN_VERIFICATION} from "../helpers/hardhat-constants";

describe("ParaSpaceOracle", () => {
  let snap: string;
  let testEnv: TestEnv;

  beforeEach(async () => {
    snap = await evmSnapshot();
  });
  afterEach(async () => {
    await evmRevert(snap);
  });

  let mockToken: MintableERC20;
  let mockAggregator: MockAggregator;
  let assetPrice: string;

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
    mockToken = await deployMintableERC20(
      ["MOCK", "MOCK", "18"],
      ETHERSCAN_VERIFICATION
    );
    assetPrice = getParaSpaceConfig().Mocks!.AllAssetsInitialPrices.WETH;
    mockAggregator = await deployAggregator(
      "MOCK",
      assetPrice,
      ETHERSCAN_VERIFICATION
    );
  });

  it("TC-oracle-aggregator-01:Owner set a new asset source", async () => {
    const {poolAdmin, paraspaceOracle} = testEnv;

    // Asset has no source
    expect(await paraspaceOracle.getSourceOfAsset(mockToken.address)).to.be.eq(
      ZERO_ADDRESS
    );
    await expect(
      paraspaceOracle.getAssetPrice(mockToken.address)
    ).to.be.revertedWith(ProtocolErrors.ORACLE_PRICE_NOT_READY);

    // Add asset source
    expect(
      await paraspaceOracle
        .connect(poolAdmin.signer)
        .setAssetSources([mockToken.address], [mockAggregator.address])
    )
      .to.emit(paraspaceOracle, "AssetSourceUpdated")
      .withArgs(mockToken.address, mockAggregator.address);

    const sourcesPrices = await (
      await paraspaceOracle.getAssetsPrices([mockToken.address])
    ).map((x) => x.toString());
    expect(await paraspaceOracle.getSourceOfAsset(mockToken.address)).to.be.eq(
      mockAggregator.address
    );
    expect(await paraspaceOracle.getAssetPrice(mockToken.address)).to.be.eq(
      assetPrice
    );
    expect(sourcesPrices).to.eql([assetPrice]);
  });

  it("TC-oracle-aggregator-02:Owner update an existing asset source", async () => {
    const {poolAdmin, paraspaceOracle, dai} = testEnv;

    // DAI token has already a source
    const daiSource = await paraspaceOracle.getSourceOfAsset(dai.address);
    expect(daiSource).to.be.not.eq(ZERO_ADDRESS);

    // Update DAI source
    expect(
      await paraspaceOracle
        .connect(poolAdmin.signer)
        .setAssetSources([dai.address], [mockAggregator.address])
    )
      .to.emit(paraspaceOracle, "AssetSourceUpdated")
      .withArgs(dai.address, mockAggregator.address);

    expect(await paraspaceOracle.getSourceOfAsset(dai.address)).to.be.eq(
      mockAggregator.address
    );
    expect(await paraspaceOracle.getAssetPrice(dai.address)).to.be.eq(
      assetPrice
    );
  });

  it("TC-oracle-aggregator-03:Owner tries to set a new asset source with wrong input params (revert expected)", async () => {
    const {poolAdmin, paraspaceOracle} = testEnv;

    await expect(
      paraspaceOracle
        .connect(poolAdmin.signer)
        .setAssetSources([mockToken.address], [])
    ).to.be.revertedWith(ProtocolErrors.INCONSISTENT_PARAMS_LENGTH);
  });

  it("Get price of BASE_CURRENCY asset", async () => {
    const {paraspaceOracle} = testEnv;

    // Check returns the fixed price BASE_CURRENCY_UNIT
    expect(
      await paraspaceOracle.getAssetPrice(await paraspaceOracle.BASE_CURRENCY())
    ).to.be.eq(await paraspaceOracle.BASE_CURRENCY_UNIT());
  });

  it("TC-oracle-aggregator-04:A non-owner user tries to set a new asset source (revert expected)", async () => {
    const {users, paraspaceOracle} = testEnv;
    const user = users[0];

    const {CALLER_NOT_ASSET_LISTING_OR_POOL_ADMIN} = ProtocolErrors;

    await expect(
      paraspaceOracle
        .connect(user.signer)
        .setAssetSources([mockToken.address], [mockAggregator.address])
    ).to.be.revertedWith(CALLER_NOT_ASSET_LISTING_OR_POOL_ADMIN);
  });

  it("TC-oracle-aggregator-05:Set oracle for BASE_CURRENCY asset is not allowed", async () => {
    const {poolAdmin, paraspaceOracle, weth} = testEnv;

    await expect(
      paraspaceOracle
        .connect(poolAdmin.signer)
        .setAssetSources([weth.address], [mockAggregator.address])
    ).to.be.revertedWith(ProtocolErrors.SET_ORACLE_SOURCE_NOT_ALLOWED);
  });

  it("Get price of asset with no asset source and will use fallback", async () => {
    const {paraspaceOracle, oracle} = testEnv;
    const fallbackPrice = oneEther;

    // Register price on FallbackOracle
    expect(await oracle.setAssetPrice(mockToken.address, fallbackPrice));

    // Asset has no source
    expect(await paraspaceOracle.getSourceOfAsset(mockToken.address)).to.be.eq(
      ZERO_ADDRESS
    );

    // Returns 0 price
    expect(await paraspaceOracle.getAssetPrice(mockToken.address)).to.be.eq(
      fallbackPrice
    );
  });

  it("TC-oracle-aggregator-06:Get price of asset without source(reverted)", async () => {
    const {poolAdmin, paraspaceOracle} = testEnv;
    const zeroPriceMockAgg = await deployAggregator(
      "MOCK",
      "0",
      ETHERSCAN_VERIFICATION
    );

    // Asset has no source
    expect(await paraspaceOracle.getSourceOfAsset(mockToken.address)).to.be.eq(
      ZERO_ADDRESS
    );

    // Add asset source
    expect(
      await paraspaceOracle
        .connect(poolAdmin.signer)
        .setAssetSources([mockToken.address], [zeroPriceMockAgg.address])
    )
      .to.emit(paraspaceOracle, "AssetSourceUpdated")
      .withArgs(mockToken.address, zeroPriceMockAgg.address);

    expect(await paraspaceOracle.getSourceOfAsset(mockToken.address)).to.be.eq(
      zeroPriceMockAgg.address
    );
    await expect(
      paraspaceOracle.getAssetPrice(mockToken.address)
    ).to.be.revertedWith(ProtocolErrors.ORACLE_PRICE_NOT_READY);
  });

  it("Get price of asset with 0 price but non-zero fallback price", async () => {
    const {poolAdmin, paraspaceOracle, oracle} = testEnv;
    const zeroPriceMockAgg = await deployAggregator(
      "MOCK",
      "0",
      ETHERSCAN_VERIFICATION
    );
    const fallbackPrice = oneEther;

    // Register price on FallbackOracle
    expect(await oracle.setAssetPrice(mockToken.address, fallbackPrice));

    // Asset has no source
    expect(await paraspaceOracle.getSourceOfAsset(mockToken.address)).to.be.eq(
      ZERO_ADDRESS
    );

    // Add asset source
    expect(
      await paraspaceOracle
        .connect(poolAdmin.signer)
        .setAssetSources([mockToken.address], [zeroPriceMockAgg.address])
    )
      .to.emit(paraspaceOracle, "AssetSourceUpdated")
      .withArgs(mockToken.address, zeroPriceMockAgg.address);

    expect(await paraspaceOracle.getSourceOfAsset(mockToken.address)).to.be.eq(
      zeroPriceMockAgg.address
    );
    expect(await paraspaceOracle.getAssetPrice(mockToken.address)).to.be.eq(
      fallbackPrice
    );
  });

  it("Owner update the FallbackOracle", async () => {
    const {poolAdmin, paraspaceOracle, oracle} = testEnv;

    expect(await paraspaceOracle.getFallbackOracle()).to.be.eq(oracle.address);

    // Update oracle source
    expect(
      await paraspaceOracle
        .connect(poolAdmin.signer)
        .setFallbackOracle(ONE_ADDRESS)
    )
      .to.emit(paraspaceOracle, "FallbackOracleUpdated")
      .withArgs(ONE_ADDRESS);

    expect(await paraspaceOracle.getFallbackOracle()).to.be.eq(ONE_ADDRESS);
  });
});
