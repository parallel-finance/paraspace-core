import {expect} from "chai";
import {waitForTx} from "../deploy/helpers/misc-utils";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {TestEnv} from "./helpers/make-suite";
import {
  borrowAndValidate,
  changePriceAndValidate,
  supplyAndValidate,
} from "./helpers/validated-steps";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {
  approveTo,
  createNewPool,
  fund,
  mintNewPosition,
} from "../deploy/helpers/uniswapv3-helper";
import {encodeSqrtRatioX96} from "@uniswap/v3-sdk";
import {getUniswapV3OracleWrapper} from "../deploy/helpers/contracts-getters";

describe("UI Pool Data Provider", () => {
  let testEnv: TestEnv;

  before("Deploy contract", async () => {
    testEnv = await loadFixture(testEnvFixture);
  });

  it("Test can get list of reserves", async () => {
    const {addressesProvider, poolDataProvider, pool, configurator} = testEnv;
    const expectedReservesList = await pool
      .connect(configurator.signer)
      .getReservesList();

    expect(
      await poolDataProvider.getReservesList(addressesProvider.address)
    ).to.eql(expectedReservesList);
  });

  it("Test can get auction data", async () => {
    const {
      addressesProvider,
      users: [user1, user2, user3],
      dai,
      poolDataProvider,
      pool,
      configurator,
      bayc,
      nBAYC,
    } = testEnv;
    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(dai, "1000", user2, true);
    await borrowAndValidate(dai, "1000", user1);
    await changePriceAndValidate(bayc, "1");

    // start auction
    await waitForTx(
      await pool
        .connect(user3.signer)
        .startAuction(user1.address, bayc.address, 0)
    );

    const expectedAuctionData = await pool
      .connect(configurator.signer)
      .getAuctionData(nBAYC.address, 0);

    const [[auctionData]] = await poolDataProvider.getAuctionData(
      addressesProvider.address,
      user3.address,
      [nBAYC.address],
      [["0"]]
    );
    expect(auctionData).to.eql(expectedAuctionData);
  });

  it("Test can get UniswapV3 LP token data [ @skip-on-coverage ]", async () => {
    const {
      users: [user1],
      dai,
      weth,
      nftPositionManager,
      poolDataProvider,
      addressesProvider,
    } = testEnv;

    const userDaiAmount = await convertToCurrencyDecimals(dai.address, "10000");
    const userWethAmount = await convertToCurrencyDecimals(weth.address, "10");
    await fund({token: dai, user: user1, amount: userDaiAmount});
    await fund({token: weth, user: user1, amount: userWethAmount});
    const nft = nftPositionManager.connect(user1.signer);
    await approveTo({
      target: nftPositionManager.address,
      token: dai,
      user: user1,
    });
    await approveTo({
      target: nftPositionManager.address,
      token: weth,
      user: user1,
    });
    const fee = 3000;
    const tickSpacing = fee / 50;
    const initialPrice = encodeSqrtRatioX96(1, 1000);
    const lowerPrice = encodeSqrtRatioX96(1, 10000);
    const upperPrice = encodeSqrtRatioX96(1, 100);
    await createNewPool({
      positionManager: nft,
      token0: dai,
      token1: weth,
      fee: fee,
      initialSqrtPrice: initialPrice.toString(),
    });
    await mintNewPosition({
      nft: nft,
      token0: dai,
      token1: weth,
      fee: fee,
      user: user1,
      tickSpacing: tickSpacing,
      lowerPrice,
      upperPrice,
      token0Amount: userDaiAmount,
      token1Amount: userWethAmount,
    });
    expect(await nftPositionManager.balanceOf(user1.address)).to.eq(1);
    const tokenId = await nft.tokenOfOwnerByIndex(user1.address, 0);

    const uniV3Oracle = await getUniswapV3OracleWrapper();
    const positionData = await uniV3Oracle.getOnchainPositionData(tokenId);

    const data = await poolDataProvider.getUniswapV3LpTokenData(
      addressesProvider.address,
      nftPositionManager.address,
      tokenId
    );

    expect(data.token0).to.eql(positionData.token0);
    expect(data.token1).to.eql(positionData.token1);
    expect(data.feeRate).to.eql(positionData.fee);
    expect(data.positionTickLower).to.eql(positionData.tickLower);
    expect(data.positionTickUpper).to.eql(positionData.tickUpper);
    expect(data.currentTick).to.eql(positionData.currentTick);
    expect(data.liquidity).to.eql(positionData.liquidity);
  });
});
