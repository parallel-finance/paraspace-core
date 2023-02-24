import {TestEnv} from "./helpers/make-suite";
import {waitForTx, evmSnapshot, evmRevert} from "../helpers/misc-utils";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";
import {getUniswapV3SwapRouter} from "../helpers/contracts-getters";
import {
  createNewPool,
  mintNewPosition,
  swapToken,
  fund,
  approveTo,
  getV3Pool,
} from "./helpers/uniswapv3-helper";
import {encodeSqrtRatioX96} from "@uniswap/v3-sdk";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {deployUniswapV3TwapOracleWrapper} from "../helpers/contracts-deployments";
import {assertAlmostEqual} from "./helpers/validated-steps";

describe("Uniswap V3 Twap Oracle", () => {
  let snap: string;
  let testEnv: TestEnv;

  beforeEach(async () => {
    snap = await evmSnapshot();
  });
  afterEach(async () => {
    await evmRevert(snap);
  });

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {addressesProvider, oracle} = testEnv;
    await waitForTx(await addressesProvider.setPriceOracle(oracle.address));
  });

  after(async () => {
    const {paraspaceOracle, addressesProvider} = testEnv;
    await waitForTx(
      await addressesProvider.setPriceOracle(paraspaceOracle.address)
    );
  });

  it("test with dai and weth:(token0 decimal equals token1 decimal) [ @skip-on-coverage ]", async () => {
    const {
      users: [user1, trader],
      dai,
      weth,
      nftPositionManager,
      oracle,
    } = testEnv;
    const userDaiAmount = await convertToCurrencyDecimals(dai.address, "10000");
    const userWethAmount = await convertToCurrencyDecimals(weth.address, "10");
    await fund({token: dai, user: user1, amount: userDaiAmount});
    await fund({token: weth, user: user1, amount: userWethAmount});
    const nft = nftPositionManager.connect(user1.signer);
    await approveTo({token: dai, user: user1, target: nft.address});
    await approveTo({token: weth, user: user1, target: nft.address});

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
    await oracle.setAssetPrice(dai.address, "1000000000000000"); //weth = 1000 dai
    const uniV3Pool = await getV3Pool({token0: dai, token1: weth, fee});
    const daiTwapOracle = await deployUniswapV3TwapOracleWrapper(
      uniV3Pool.address,
      weth.address,
      "144",
      "TwapDAI",
      false
    );

    const traderDaiAmount = await convertToCurrencyDecimals(
      dai.address,
      "1000"
    );
    const traderWethAmount = await convertToCurrencyDecimals(weth.address, "1");
    await fund({token: dai, user: trader, amount: traderDaiAmount});
    await fund({token: weth, user: trader, amount: traderWethAmount});
    const swapRouter = await getUniswapV3SwapRouter();
    await approveTo({token: dai, user: trader, target: swapRouter.address});
    await approveTo({token: weth, user: trader, target: swapRouter.address});

    for (let i = 0; i < 144; i++) {
      await waitForTx(
        await uniV3Pool
          .connect(trader.signer)
          .increaseObservationCardinalityNext(i + 2)
      );
      await swapToken({
        tokenIn: dai,
        tokenOut: weth,
        fee,
        amountIn: traderDaiAmount,
        trader,
        zeroForOne: true,
      });
      await swapToken({
        tokenIn: weth,
        tokenOut: dai,
        fee,
        amountIn: traderWethAmount,
        trader,
        zeroForOne: false,
      });
    }

    assertAlmostEqual(await daiTwapOracle.latestAnswer(), "1022856835094767");
  });

  it("test with usdc and weth:(token0 decimal less than token1 decimal) [ @skip-on-coverage ]", async () => {
    const {
      users: [user1, trader],
      usdc,
      weth,
      nftPositionManager,
      oracle,
    } = testEnv;
    const userUsdcAmount = await convertToCurrencyDecimals(
      usdc.address,
      "10000"
    );
    const userWethAmount = await convertToCurrencyDecimals(weth.address, "10");
    await fund({token: usdc, user: user1, amount: userUsdcAmount});
    await fund({token: weth, user: user1, amount: userWethAmount});
    const nft = nftPositionManager.connect(user1.signer);
    await approveTo({token: usdc, user: user1, target: nft.address});
    await approveTo({token: weth, user: user1, target: nft.address});

    const fee = 3000;
    const tickSpacing = fee / 50;
    const initialPrice = encodeSqrtRatioX96("1000000000", 1);
    const lowerPrice = encodeSqrtRatioX96("100000000", 1);
    const upperPrice = encodeSqrtRatioX96("10000000000", 1);
    await createNewPool({
      positionManager: nft,
      token0: usdc,
      token1: weth,
      fee: fee,
      initialSqrtPrice: initialPrice.toString(),
    });
    await mintNewPosition({
      nft: nft,
      token0: usdc,
      token1: weth,
      fee: fee,
      user: user1,
      tickSpacing: tickSpacing,
      lowerPrice,
      upperPrice,
      token0Amount: userUsdcAmount,
      token1Amount: userWethAmount,
    });
    await oracle.setAssetPrice(usdc.address, "1000000000000000"); //weth = 1000 usdc
    const uniV3Pool = await getV3Pool({token0: usdc, token1: weth, fee});
    const usdcTwapOracle = await deployUniswapV3TwapOracleWrapper(
      uniV3Pool.address,
      weth.address,
      "144",
      "TwapUSDC",
      false
    );

    const traderUsdcAmount = await convertToCurrencyDecimals(
      usdc.address,
      "1000"
    );
    const traderWethAmount = await convertToCurrencyDecimals(weth.address, "1");
    await fund({token: usdc, user: trader, amount: traderUsdcAmount});
    await fund({token: weth, user: trader, amount: traderWethAmount});
    const swapRouter = await getUniswapV3SwapRouter();
    await approveTo({token: usdc, user: trader, target: swapRouter.address});
    await approveTo({token: weth, user: trader, target: swapRouter.address});

    for (let i = 0; i < 144; i++) {
      await waitForTx(
        await uniV3Pool
          .connect(trader.signer)
          .increaseObservationCardinalityNext(i + 2)
      );
      await swapToken({
        tokenIn: usdc,
        tokenOut: weth,
        fee,
        amountIn: traderUsdcAmount,
        trader,
        zeroForOne: true,
      });
      await swapToken({
        tokenIn: weth,
        tokenOut: usdc,
        fee,
        amountIn: traderWethAmount,
        trader,
        zeroForOne: false,
      });
    }

    assertAlmostEqual(await usdcTwapOracle.latestAnswer(), "1022856835094767");
  });

  it("test with weth and usdt:(token0 decimal greater than token1 decimal) [ @skip-on-coverage ]", async () => {
    const {
      users: [user1, trader],
      usdt,
      weth,
      nftPositionManager,
      oracle,
    } = testEnv;
    const userUsdtAmount = await convertToCurrencyDecimals(
      usdt.address,
      "10000"
    );
    const userWethAmount = await convertToCurrencyDecimals(weth.address, "10");
    await fund({token: usdt, user: user1, amount: userUsdtAmount});
    await fund({token: weth, user: user1, amount: userWethAmount});
    const nft = nftPositionManager.connect(user1.signer);
    await approveTo({token: usdt, user: user1, target: nft.address});
    await approveTo({token: weth, user: user1, target: nft.address});

    const fee = 3000;
    const tickSpacing = fee / 50;
    const initialPrice = encodeSqrtRatioX96(1, "1000000000");
    const lowerPrice = encodeSqrtRatioX96(1, "10000000000");
    const upperPrice = encodeSqrtRatioX96(1, "100000000");
    await createNewPool({
      positionManager: nft,
      token0: weth,
      token1: usdt,
      fee: fee,
      initialSqrtPrice: initialPrice.toString(),
    });
    await mintNewPosition({
      nft: nft,
      token0: weth,
      token1: usdt,
      fee: fee,
      user: user1,
      tickSpacing: tickSpacing,
      lowerPrice,
      upperPrice,
      token0Amount: userWethAmount,
      token1Amount: userUsdtAmount,
    });
    await oracle.setAssetPrice(usdt.address, "1000000000000000"); //weth = 1000 usdt
    const uniV3Pool = await getV3Pool({token0: usdt, token1: weth, fee});
    const usdtTwapOracle = await deployUniswapV3TwapOracleWrapper(
      uniV3Pool.address,
      weth.address,
      "144",
      "TwapUSDT",
      false
    );

    const traderUsdtAmount = await convertToCurrencyDecimals(
      usdt.address,
      "1000"
    );
    const traderWethAmount = await convertToCurrencyDecimals(weth.address, "1");
    await fund({token: usdt, user: trader, amount: traderUsdtAmount});
    await fund({token: weth, user: trader, amount: traderWethAmount});
    const swapRouter = await getUniswapV3SwapRouter();
    await approveTo({token: usdt, user: trader, target: swapRouter.address});
    await approveTo({token: weth, user: trader, target: swapRouter.address});

    for (let i = 0; i < 144; i++) {
      await waitForTx(
        await uniV3Pool
          .connect(trader.signer)
          .increaseObservationCardinalityNext(i + 2)
      );
      await swapToken({
        tokenIn: usdt,
        tokenOut: weth,
        fee,
        amountIn: traderUsdtAmount,
        trader,
        zeroForOne: false,
      });
      await swapToken({
        tokenIn: weth,
        tokenOut: usdt,
        fee,
        amountIn: traderWethAmount,
        trader,
        zeroForOne: true,
      });
    }

    assertAlmostEqual(await usdtTwapOracle.latestAnswer(), "1022856835094767");
  });
});
