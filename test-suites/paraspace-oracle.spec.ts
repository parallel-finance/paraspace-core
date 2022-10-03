import {expect} from "chai";
import {oneEther, ONE_ADDRESS, ZERO_ADDRESS} from "../deploy/helpers/constants";
import {evmRevert, evmSnapshot} from "../deploy/helpers/misc-utils";
import {
  deployMintableERC20,
  deployMockAggregator,
} from "../deploy/helpers/contracts-deployments";
import {MintableERC20, MockAggregator} from "../types";
import {ProtocolErrors} from "../deploy/helpers/types";
import {makeSuite, TestEnv} from "./helpers/make-suite";
import {MOCK_CHAINLINK_AGGREGATORS_PRICES} from "../deploy/market-config";

makeSuite("ParaSpaceOracle", (testEnv: TestEnv) => {
  let snap: string;

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
    mockToken = await deployMintableERC20(["MOCK", "MOCK", "18"]);
    assetPrice = MOCK_CHAINLINK_AGGREGATORS_PRICES.WETH;
    mockAggregator = await deployMockAggregator("MOCK", assetPrice);
  });

  it("Owner set a new asset source", async () => {
    const {poolAdmin, paraspaceOracle} = testEnv;

    // Asset has no source
    expect(await paraspaceOracle.getSourceOfAsset(mockToken.address)).to.be.eq(
      ZERO_ADDRESS
    );
    await expect(
      paraspaceOracle.getAssetPrice(mockToken.address)
    ).to.be.revertedWith("price not ready");

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

  it("Owner update an existing asset source", async () => {
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

  it("Owner tries to set a new asset source with wrong input params (revert expected)", async () => {
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

  it("A non-owner user tries to set a new asset source (revert expected)", async () => {
    const {users, paraspaceOracle} = testEnv;
    const user = users[0];

    const {CALLER_NOT_ASSET_LISTING_OR_POOL_ADMIN} = ProtocolErrors;

    await expect(
      paraspaceOracle
        .connect(user.signer)
        .setAssetSources([mockToken.address], [mockAggregator.address])
    ).to.be.revertedWith(CALLER_NOT_ASSET_LISTING_OR_POOL_ADMIN);
  });

  it("Get price of BASE_CURRENCY asset with registered asset source for its address", async () => {
    const {poolAdmin, paraspaceOracle, weth} = testEnv;

    // Add asset source for BASE_CURRENCY address
    expect(
      await paraspaceOracle
        .connect(poolAdmin.signer)
        .setAssetSources([weth.address], [mockAggregator.address])
    )
      .to.emit(paraspaceOracle, "AssetSourceUpdated")
      .withArgs(weth.address, mockAggregator.address);

    // Check returns the fixed price BASE_CURRENCY_UNIT
    expect(await paraspaceOracle.getAssetPrice(weth.address)).to.be.eq(
      MOCK_CHAINLINK_AGGREGATORS_PRICES.WETH
    );
  });

  it("Get price of asset with no asset source", async () => {
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

  it("Get price of asset with 0 price and no fallback price", async () => {
    const {poolAdmin, paraspaceOracle} = testEnv;
    const zeroPriceMockAgg = await deployMockAggregator("MOCK", "0");

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
    ).to.be.revertedWith("price not ready");
  });

  it("Get price of asset with 0 price but non-zero fallback price", async () => {
    const {poolAdmin, paraspaceOracle, oracle} = testEnv;
    const zeroPriceMockAgg = await deployMockAggregator("MOCK", "0");
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
