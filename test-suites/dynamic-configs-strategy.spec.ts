import {expect} from "chai";
import {makeSuite, revertHead, setSnapshot} from "./helpers/make-suite";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {
  createNewPool,
  mintNewPosition,
  fund,
  approveTo,
} from "../deploy/helpers/uniswapv3-helper";
import {encodeSqrtRatioX96} from "@uniswap/v3-sdk";
import {
  getParaSpaceOracle,
  getPoolConfiguratorProxy,
  getUniswapDynamicConfigStrategy,
  getUniswapV3DynamicConfigsStrategy,
  getUniswapV3Gateway,
} from "../deploy/helpers/contracts-getters";

makeSuite("Dynamic Configs Strategy", (testEnv) => {
  let daiConfigs;
  let dynamicConfigsStrategy;
  let userDaiAmount;
  let userWethAmount;
  let userWBTCAmount;
  let uniswapV3Gateway;

  describe("Prepare Uniswap V3 NFT position [  @skip-on-coverage ]", () => {
    before(async () => {
      await setSnapshot();
      const {
        users: [user1],
        dai,
        weth,
        nftPositionManager,
        helpersContract,
        wBTC,
      } = testEnv;

      userDaiAmount = await convertToCurrencyDecimals(dai.address, "10000");
      userWethAmount = await convertToCurrencyDecimals(weth.address, "10");
      userWBTCAmount = await convertToCurrencyDecimals(weth.address, "10");
      await fund({token: dai, user: user1, amount: userDaiAmount});
      await fund({token: weth, user: user1, amount: userWethAmount});
      await fund({token: wBTC, user: user1, amount: userWBTCAmount});

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
      await approveTo({
        target: nftPositionManager.address,
        token: wBTC,
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

      await createNewPool({
        positionManager: nft,
        token0: weth,
        token1: wBTC,
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
        token1Amount: userWethAmount.div(2),
      });

      await mintNewPosition({
        nft: nft,
        token0: weth,
        token1: wBTC,
        fee: fee,
        user: user1,
        tickSpacing: tickSpacing,
        lowerPrice,
        upperPrice,
        token0Amount: userWethAmount.sub(userWethAmount.div(2)),
        token1Amount: userWBTCAmount,
      });

      uniswapV3Gateway = (await getUniswapV3Gateway()).connect(user1.signer);
      await nft.setApprovalForAll(uniswapV3Gateway.address, true);

      await uniswapV3Gateway.supplyUniswapV3(
        [{tokenId: 1, useAsCollateral: true}],
        user1.address,
        {
          gasLimit: 12_450_000,
        }
      );

      daiConfigs = await helpersContract.getReserveConfigurationData(
        dai.address
      );

      dynamicConfigsStrategy = await getUniswapDynamicConfigStrategy();
    });
    after(async () => {
      await revertHead();
    });

    it("Dynamic config strategy should calculate the correct LTV and LT", async () => {
      const dynamicConfigsForToken =
        await dynamicConfigsStrategy.getConfigParams(1);

      expect(dynamicConfigsForToken[0]).to.be.equal(daiConfigs.ltv);
      expect(dynamicConfigsForToken[1]).to.be.equal(
        daiConfigs.liquidationThreshold
      );
    });

    it("user data calculation should use the correct LTV and LT for a supplied Uniswap V3 position", async () => {
      const {
        users: [user1],
        pool,
      } = testEnv;

      const userData = await pool.getUserAccountData(user1.address);

      expect(userData.ltv).to.be.equal(daiConfigs.ltv);
      expect(userData.currentLiquidationThreshold).to.be.equal(
        daiConfigs.liquidationThreshold
      );
    });

    it("Uses the fallback ltv/lt for supplied Uniswap V3 position when dynamic configs is disabled", async () => {
      const {
        users: [user1],
        pool,
        nftPositionManager,
        helpersContract,
      } = testEnv;

      const poolConfigurator = await getPoolConfiguratorProxy();
      await poolConfigurator.setDynamicConfigsEnabled(
        nftPositionManager.address,
        false
      );

      const userData = await pool.getUserAccountData(user1.address);

      const uniswapConfigs = await helpersContract.getReserveConfigurationData(
        nftPositionManager.address
      );

      expect(userData.ltv).to.be.equal(uniswapConfigs.ltv);
      expect(userData.currentLiquidationThreshold).to.be.equal(
        uniswapConfigs.liquidationThreshold
      );
    });

    it("Uses uses the use the weighted avg ltv/lt for supplied Uniswap V3 positions when dynamic configs is enabled", async () => {
      const {
        users: [user1],
        pool,
        nftPositionManager,
      } = testEnv;

      const poolConfigurator = await getPoolConfiguratorProxy();
      const dynamicStrategy = await getUniswapV3DynamicConfigsStrategy();

      await poolConfigurator.setReserveDynamicConfigsStrategyAddress(
        nftPositionManager.address,
        dynamicStrategy.address
      );
      await poolConfigurator.setDynamicConfigsEnabled(
        nftPositionManager.address,
        true
      );

      await uniswapV3Gateway.supplyUniswapV3(
        [{tokenId: 2, useAsCollateral: true}],
        user1.address,
        {
          gasLimit: 12_450_000,
        }
      );

      const userData = await pool.getUserAccountData(user1.address);

      const oracle = await getParaSpaceOracle();

      const token1Price = await oracle.getTokenPrice(
        nftPositionManager.address,
        1
      );

      const token2Price = await oracle.getTokenPrice(
        nftPositionManager.address,
        2
      );

      const dynamicConfigsForToken1 =
        await dynamicConfigsStrategy.getConfigParams(1);

      const dynamicConfigsForToken2 =
        await dynamicConfigsStrategy.getConfigParams(2);

      const totalTokenPrice = token1Price.add(token2Price);

      const expectedLTV = token1Price
        .mul(dynamicConfigsForToken1[0])
        .add(token2Price.mul(dynamicConfigsForToken2[0]))
        .div(totalTokenPrice);

      const expectedLT = token1Price
        .mul(dynamicConfigsForToken1[1])
        .add(token2Price.mul(dynamicConfigsForToken2[1]))
        .div(totalTokenPrice);

      expect(userData.ltv).to.be.equal(expectedLTV);
      expect(userData.currentLiquidationThreshold).to.be.equal(expectedLT);
    });
  });
});
