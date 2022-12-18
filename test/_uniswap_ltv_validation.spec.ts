import {expect} from "chai";
import {TestEnv} from "./helpers/make-suite";
import {waitForTx} from "../helpers/misc-utils";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";
import {
  createNewPool,
  mintNewPosition,
  fund,
  approveTo,
} from "./helpers/uniswapv3-helper";
import {encodeSqrtRatioX96} from "@uniswap/v3-sdk";
import {ProtocolErrors} from "../helpers/types";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";

describe("Uniswap V3 LTV Validation", () => {
  let testEnv: TestEnv;
  before(async () => {
    testEnv = await loadFixture(testEnvFixture);

    const {
      users: [user1],
      dai,
      weth,
      nftPositionManager,
      pool,
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

    await waitForTx(await nft.setApprovalForAll(pool.address, true));

    await waitForTx(
      await pool
        .connect(user1.signer)
        .supplyERC721(
          nftPositionManager.address,
          [{tokenId: 1, useAsCollateral: true}],
          user1.address,
          0,
          {
            gasLimit: 12_450_000,
          }
        )
    );
  });

  it("check ltv strategy rules when univ3 collection has a minimal ltv [ @skip-on-coverage ]", async () => {
    const {dai, weth, nftPositionManager, pool, protocolDataProvider} = testEnv;

    const daiConfig = await protocolDataProvider.getReserveConfigurationData(
      dai.address
    );
    expect(daiConfig.ltv).to.be.equal(7700);
    expect(daiConfig.liquidationThreshold).to.be.equal(9000);

    const wethConfig = await protocolDataProvider.getReserveConfigurationData(
      weth.address
    );
    expect(wethConfig.ltv).to.be.equal(8250);
    expect(wethConfig.liquidationThreshold).to.be.equal(8600);

    const uniCollectionConfig =
      await protocolDataProvider.getReserveConfigurationData(
        nftPositionManager.address
      );
    expect(uniCollectionConfig.ltv).to.be.equal(3000);
    expect(uniCollectionConfig.liquidationThreshold).to.be.equal(7000);

    const uniTokenConfig = await pool.getAssetLtvAndLT(
      nftPositionManager.address,
      1
    );
    expect(uniTokenConfig.ltv).to.be.equal(uniCollectionConfig.ltv);
    expect(uniTokenConfig.lt).to.be.equal(
      uniCollectionConfig.liquidationThreshold
    );
  });

  it("check ltv strategy rules when underlying asset has a minimal ltv [ @skip-on-coverage ]", async () => {
    const {dai, nftPositionManager, pool, configurator} = testEnv;

    // Set DAI LTV = 0
    await waitForTx(
      await configurator.configureReserveAsCollateral(
        dai.address,
        0,
        8000,
        10500
      )
    );

    const uniTokenConfig = await pool.getAssetLtvAndLT(
      nftPositionManager.address,
      1
    );
    expect(uniTokenConfig.ltv).to.be.equal(0);
  });

  it("user supply weth and borrow dai [ @skip-on-coverage ]", async () => {
    const {
      users: [user1, user2],
      dai,
      weth,
      pool,
    } = testEnv;

    const daiSupplyAmount = await convertToCurrencyDecimals(dai.address, "100");
    const daiBorrowAmount = await convertToCurrencyDecimals(dai.address, "1");
    const wethSupplyAmount = await convertToCurrencyDecimals(
      weth.address,
      "10"
    );
    await fund({token: dai, user: user2, amount: daiSupplyAmount});
    await fund({token: weth, user: user1, amount: wethSupplyAmount});
    await approveTo({
      target: pool.address,
      token: dai,
      user: user2,
    });
    await approveTo({
      target: pool.address,
      token: weth,
      user: user1,
    });

    await waitForTx(
      await pool
        .connect(user2.signer)
        .supply(dai.address, daiSupplyAmount, user2.address, 0)
    );
    await waitForTx(
      await pool
        .connect(user1.signer)
        .supply(weth.address, wethSupplyAmount, user1.address, 0)
    );

    await waitForTx(
      await pool
        .connect(user1.signer)
        .borrow(dai.address, daiBorrowAmount, 0, user1.address)
    );
  });

  it("user can not withdraw weth [ @skip-on-coverage ]", async () => {
    const {
      users: [user1],
      weth,
      pool,
    } = testEnv;
    const {LTV_VALIDATION_FAILED} = ProtocolErrors;

    const wethWithdrawAmount = await convertToCurrencyDecimals(
      weth.address,
      "1"
    );
    await expect(
      pool
        .connect(user1.signer)
        .withdraw(weth.address, wethWithdrawAmount, user1.address)
    ).to.be.revertedWith(LTV_VALIDATION_FAILED);
  });

  it("user can withdraw uniswapv3 [ @skip-on-coverage ]", async () => {
    const {
      users: [user1],
      nftPositionManager,
      pool,
    } = testEnv;

    await waitForTx(
      await pool
        .connect(user1.signer)
        .withdrawERC721(nftPositionManager.address, [1], user1.address)
    );
  });
});
