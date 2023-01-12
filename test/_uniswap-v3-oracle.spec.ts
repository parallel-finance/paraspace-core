import {expect} from "chai";
import {TestEnv} from "./helpers/make-suite";
import {waitForTx, evmSnapshot, evmRevert} from "../helpers/misc-utils";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";
import {
  getUniswapV3OracleWrapper,
  getUniswapV3SwapRouter,
} from "../helpers/contracts-getters";
import {
  almostEqual,
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

describe("Uniswap V3 Oracle", () => {
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
    const daiBalance = await dai.balanceOf(user1.address);
    const wethBalance = await weth.balanceOf(user1.address);
    const liquidityDaiAmount = userDaiAmount.sub(daiBalance);
    const liquidityWethAmount = userWethAmount.sub(wethBalance);

    expect(await nft.balanceOf(user1.address)).to.eq(1);
    const tokenId = await nft.tokenOfOwnerByIndex(user1.address, 0);

    const uniV3Oracle = await getUniswapV3OracleWrapper();
    const liquidityAmount = await uniV3Oracle.getLiquidityAmount(tokenId);
    almostEqual(liquidityAmount.token0Amount, liquidityDaiAmount);
    almostEqual(liquidityAmount.token1Amount, liquidityWethAmount);

    let lpFee = await uniV3Oracle.getLpFeeAmount(tokenId);
    expect(lpFee.token0Amount).to.eq(0);
    expect(lpFee.token1Amount).to.eq(0);

    await oracle.setAssetPrice(dai.address, "1000000000000000"); //weth = 1000 dai
    let tokenPrice = await uniV3Oracle.getTokenPrice(tokenId);
    almostEqual(
      tokenPrice,
      liquidityWethAmount.add(liquidityDaiAmount.div(1000))
    );

    const uniV3Pool = await getV3Pool({token0: dai, token1: weth, fee});
    //check lp fee in range
    let traderDaiAmount = await convertToCurrencyDecimals(dai.address, "1000");
    let traderWethAmount = await convertToCurrencyDecimals(weth.address, "1");
    await fund({token: dai, user: trader, amount: traderDaiAmount});
    await fund({token: weth, user: trader, amount: traderWethAmount});
    const swapRouter = await getUniswapV3SwapRouter();
    await approveTo({token: dai, user: trader, target: swapRouter.address});
    await approveTo({token: weth, user: trader, target: swapRouter.address});

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

    let currentPrice = (await uniV3Pool.slot0()).sqrtPriceX96;
    expect(currentPrice).to.gt(lowerPrice.toString());
    expect(currentPrice).to.lt(upperPrice.toString());

    const targetDaiFee = await convertToCurrencyDecimals(dai.address, "3");
    const targetEthFee = await convertToCurrencyDecimals(weth.address, "0.003");
    const targetTokenPrice = liquidityWethAmount
      .add(targetEthFee)
      .add(liquidityDaiAmount.div(1000))
      .add(targetDaiFee.div(1000));
    lpFee = await uniV3Oracle.getLpFeeAmount(tokenId);
    almostEqual(lpFee.token0Amount, targetDaiFee);
    almostEqual(lpFee.token1Amount, targetEthFee);
    tokenPrice = await uniV3Oracle.getTokenPrice(tokenId);
    almostEqual(tokenPrice, targetTokenPrice);

    traderDaiAmount = await convertToCurrencyDecimals(dai.address, "100000");
    traderWethAmount = await convertToCurrencyDecimals(weth.address, "10000");
    await fund({token: dai, user: trader, amount: traderDaiAmount});
    await fund({token: weth, user: trader, amount: traderWethAmount});

    //check lp fee above range
    await swapToken({
      tokenIn: dai,
      tokenOut: weth,
      fee,
      amountIn: traderDaiAmount,
      trader,
      zeroForOne: true,
    });
    currentPrice = (await uniV3Pool.slot0()).sqrtPriceX96;
    expect(currentPrice).to.lt(lowerPrice.toString());

    const addDaiFeeCap = await convertToCurrencyDecimals(dai.address, "300");
    lpFee = await uniV3Oracle.getLpFeeAmount(tokenId);
    expect(lpFee.token0Amount).to.lt(targetDaiFee.add(addDaiFeeCap));
    expect(lpFee.token0Amount).to.gt(targetDaiFee);
    almostEqual(lpFee.token1Amount, targetEthFee);
    tokenPrice = await uniV3Oracle.getTokenPrice(tokenId);
    expect(tokenPrice).to.lt(targetTokenPrice.add(addDaiFeeCap.div(1000)));
    expect(tokenPrice).to.gt(targetTokenPrice);

    const lastToken0LpFee = lpFee.token0Amount;
    const lastTokenPrice = tokenPrice;

    //check lp fee upper range
    await swapToken({
      tokenIn: weth,
      tokenOut: dai,
      fee,
      amountIn: traderWethAmount,
      trader,
      zeroForOne: false,
    });
    currentPrice = (await uniV3Pool.slot0()).sqrtPriceX96;
    expect(currentPrice).to.gt(upperPrice.toString());

    const addEthFeeCap = await convertToCurrencyDecimals(weth.address, "30");
    lpFee = await uniV3Oracle.getLpFeeAmount(tokenId);
    almostEqual(lpFee.token0Amount, lastToken0LpFee);
    expect(lpFee.token1Amount).to.lt(targetEthFee.add(addEthFeeCap));
    expect(lpFee.token1Amount).to.gt(targetEthFee);
    tokenPrice = await uniV3Oracle.getTokenPrice(tokenId);
    expect(tokenPrice).to.lt(lastTokenPrice.add(addEthFeeCap));
    expect(tokenPrice).to.gt(lastTokenPrice);
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
    const usdcBalance = await usdc.balanceOf(user1.address);
    const wethBalance = await weth.balanceOf(user1.address);
    const liquidityUsdcAmount = userUsdcAmount.sub(usdcBalance);
    const liquidityWethAmount = userWethAmount.sub(wethBalance);

    expect(await nft.balanceOf(user1.address)).to.eq(1);
    const tokenId = await nft.tokenOfOwnerByIndex(user1.address, 0);

    const uniV3Oracle = await getUniswapV3OracleWrapper();
    const liquidityAmount = await uniV3Oracle.getLiquidityAmount(tokenId);
    almostEqual(liquidityAmount.token0Amount, liquidityUsdcAmount);
    almostEqual(liquidityAmount.token1Amount, liquidityWethAmount);

    let lpFee = await uniV3Oracle.getLpFeeAmount(tokenId);
    expect(lpFee.token0Amount).to.eq(0);
    expect(lpFee.token1Amount).to.eq(0);

    await oracle.setAssetPrice(usdc.address, "1000000000000000"); //weth = 1000 usdc
    let tokenPrice = await uniV3Oracle.getTokenPrice(tokenId);
    almostEqual(
      tokenPrice,
      liquidityWethAmount.add(liquidityUsdcAmount.mul("1000000000"))
    );

    const uniV3Pool = await getV3Pool({token0: usdc, token1: weth, fee});
    //check lp fee in range
    let traderUsdcAmount = await convertToCurrencyDecimals(
      usdc.address,
      "1000"
    );
    let traderWethAmount = await convertToCurrencyDecimals(weth.address, "1");
    await fund({token: usdc, user: trader, amount: traderUsdcAmount});
    await fund({token: weth, user: trader, amount: traderWethAmount});
    const swapRouter = await getUniswapV3SwapRouter();
    await approveTo({token: usdc, user: trader, target: swapRouter.address});
    await approveTo({token: weth, user: trader, target: swapRouter.address});

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

    let currentPrice = (await uniV3Pool.slot0()).sqrtPriceX96;
    expect(currentPrice).to.gt(lowerPrice.toString());
    expect(currentPrice).to.lt(upperPrice.toString());

    const targetUsdcFee = await convertToCurrencyDecimals(usdc.address, "3");
    const targetEthFee = await convertToCurrencyDecimals(weth.address, "0.003");
    const targetTokenPrice = liquidityWethAmount
      .add(targetEthFee)
      .add(liquidityUsdcAmount.mul("1000000000"))
      .add(targetUsdcFee.mul("1000000000"));
    lpFee = await uniV3Oracle.getLpFeeAmount(tokenId);
    almostEqual(lpFee.token0Amount, targetUsdcFee);
    almostEqual(lpFee.token1Amount, targetEthFee);
    tokenPrice = await uniV3Oracle.getTokenPrice(tokenId);
    almostEqual(tokenPrice, targetTokenPrice);

    traderUsdcAmount = await convertToCurrencyDecimals(usdc.address, "100000");
    traderWethAmount = await convertToCurrencyDecimals(weth.address, "10000");
    await fund({token: usdc, user: trader, amount: traderUsdcAmount});
    await fund({token: weth, user: trader, amount: traderWethAmount});

    //check lp fee above range
    await swapToken({
      tokenIn: usdc,
      tokenOut: weth,
      fee,
      amountIn: traderUsdcAmount,
      trader,
      zeroForOne: true,
    });
    currentPrice = (await uniV3Pool.slot0()).sqrtPriceX96;
    expect(currentPrice).to.lt(lowerPrice.toString());

    const addUsdcFeeCap = await convertToCurrencyDecimals(usdc.address, "300");
    lpFee = await uniV3Oracle.getLpFeeAmount(tokenId);
    expect(lpFee.token0Amount).to.lt(targetUsdcFee.add(addUsdcFeeCap));
    expect(lpFee.token0Amount).to.gt(targetUsdcFee);
    almostEqual(lpFee.token1Amount, targetEthFee);
    tokenPrice = await uniV3Oracle.getTokenPrice(tokenId);
    expect(tokenPrice).to.lt(
      targetTokenPrice.add(addUsdcFeeCap.mul("1000000000"))
    );
    expect(tokenPrice).to.gt(targetTokenPrice);

    const lastToken0LpFee = lpFee.token0Amount;
    const lastTokenPrice = tokenPrice;

    //check lp fee upper range
    await swapToken({
      tokenIn: weth,
      tokenOut: usdc,
      fee,
      amountIn: traderWethAmount,
      trader,
      zeroForOne: false,
    });
    currentPrice = (await uniV3Pool.slot0()).sqrtPriceX96;
    expect(currentPrice).to.gt(upperPrice.toString());

    const addEthFeeCap = await convertToCurrencyDecimals(weth.address, "30");
    lpFee = await uniV3Oracle.getLpFeeAmount(tokenId);
    almostEqual(lpFee.token0Amount, lastToken0LpFee);
    expect(lpFee.token1Amount).to.lt(targetEthFee.add(addEthFeeCap));
    expect(lpFee.token1Amount).to.gt(targetEthFee);
    tokenPrice = await uniV3Oracle.getTokenPrice(tokenId);
    expect(tokenPrice).to.lt(lastTokenPrice.add(addEthFeeCap));
    expect(tokenPrice).to.gt(lastTokenPrice);
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
    const usdtBalance = await usdt.balanceOf(user1.address);
    const wethBalance = await weth.balanceOf(user1.address);
    const liquidityUsdtAmount = userUsdtAmount.sub(usdtBalance);
    const liquidityWethAmount = userWethAmount.sub(wethBalance);

    expect(await nft.balanceOf(user1.address)).to.eq(1);
    const tokenId = await nft.tokenOfOwnerByIndex(user1.address, 0);

    const uniV3Oracle = await getUniswapV3OracleWrapper();
    const liquidityAmount = await uniV3Oracle.getLiquidityAmount(tokenId);
    almostEqual(liquidityAmount.token0Amount, liquidityWethAmount);
    almostEqual(liquidityAmount.token1Amount, liquidityUsdtAmount);

    let lpFee = await uniV3Oracle.getLpFeeAmount(tokenId);
    expect(lpFee.token0Amount).to.eq(0);
    expect(lpFee.token1Amount).to.eq(0);

    await oracle.setAssetPrice(usdt.address, "1000000000000000"); //weth = 1000 usdt
    let tokenPrice = await uniV3Oracle.getTokenPrice(tokenId);
    almostEqual(
      tokenPrice,
      liquidityWethAmount.add(liquidityUsdtAmount.mul("1000000000"))
    );

    const uniV3Pool = await getV3Pool({token0: usdt, token1: weth, fee});
    //check lp fee in range
    let traderUsdtAmount = await convertToCurrencyDecimals(
      usdt.address,
      "1000"
    );
    let traderWethAmount = await convertToCurrencyDecimals(weth.address, "1");
    await fund({token: usdt, user: trader, amount: traderUsdtAmount});
    await fund({token: weth, user: trader, amount: traderWethAmount});
    const swapRouter = await getUniswapV3SwapRouter();
    await approveTo({token: usdt, user: trader, target: swapRouter.address});
    await approveTo({token: weth, user: trader, target: swapRouter.address});

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

    let currentPrice = (await uniV3Pool.slot0()).sqrtPriceX96;
    expect(currentPrice).to.gt(lowerPrice.toString());
    expect(currentPrice).to.lt(upperPrice.toString());

    const targetUsdtFee = await convertToCurrencyDecimals(usdt.address, "3");
    const targetEthFee = await convertToCurrencyDecimals(weth.address, "0.003");
    const targetTokenPrice = liquidityWethAmount
      .add(targetEthFee)
      .add(liquidityUsdtAmount.mul("1000000000"))
      .add(targetUsdtFee.mul("1000000000"));
    lpFee = await uniV3Oracle.getLpFeeAmount(tokenId);
    almostEqual(lpFee.token0Amount, targetEthFee);
    almostEqual(lpFee.token1Amount, targetUsdtFee);
    tokenPrice = await uniV3Oracle.getTokenPrice(tokenId);
    almostEqual(tokenPrice, targetTokenPrice);

    traderUsdtAmount = await convertToCurrencyDecimals(usdt.address, "100000");
    traderWethAmount = await convertToCurrencyDecimals(weth.address, "10000");
    await fund({token: usdt, user: trader, amount: traderUsdtAmount});
    await fund({token: weth, user: trader, amount: traderWethAmount});

    //check lp fee above range
    await swapToken({
      tokenIn: usdt,
      tokenOut: weth,
      fee,
      amountIn: traderUsdtAmount,
      trader,
      zeroForOne: false,
    });
    currentPrice = (await uniV3Pool.slot0()).sqrtPriceX96;
    expect(currentPrice).to.gt(upperPrice.toString());

    const addUsdtFeeCap = await convertToCurrencyDecimals(usdt.address, "300");
    lpFee = await uniV3Oracle.getLpFeeAmount(tokenId);
    almostEqual(lpFee.token0Amount, targetEthFee);
    expect(lpFee.token1Amount).to.lt(targetUsdtFee.add(addUsdtFeeCap));
    expect(lpFee.token1Amount).to.gt(targetUsdtFee);
    tokenPrice = await uniV3Oracle.getTokenPrice(tokenId);
    expect(tokenPrice).to.lt(
      targetTokenPrice.add(addUsdtFeeCap.mul("1000000000"))
    );
    expect(tokenPrice).to.gt(targetTokenPrice);

    const lastToken1LpFee = lpFee.token1Amount;
    const lastTokenPrice = tokenPrice;

    //check lp fee below range
    await swapToken({
      tokenIn: weth,
      tokenOut: usdt,
      fee,
      amountIn: traderWethAmount,
      trader,
      zeroForOne: true,
    });
    currentPrice = (await uniV3Pool.slot0()).sqrtPriceX96;
    expect(currentPrice).to.lt(lowerPrice.toString());

    const addEthFeeCap = await convertToCurrencyDecimals(weth.address, "30");
    lpFee = await uniV3Oracle.getLpFeeAmount(tokenId);
    almostEqual(lpFee.token1Amount, lastToken1LpFee);
    expect(lpFee.token0Amount).to.lt(targetEthFee.add(addEthFeeCap));
    expect(lpFee.token0Amount).to.gt(targetEthFee);
    tokenPrice = await uniV3Oracle.getTokenPrice(tokenId);
    expect(tokenPrice).to.lt(lastTokenPrice.add(addEthFeeCap));
    expect(tokenPrice).to.gt(lastTokenPrice);
  });

  it("test with dai and weth:(token0 decimal equals token1 decimal) with large price difference [ @skip-on-coverage ]", async () => {
    const {
      users: [user1],
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
    await oracle.setAssetPrice(dai.address, "1"); //ETH = 1^18 dai
    await oracle.setAssetPrice(weth.address, "10000000000000000000"); //weth = 10 ETH

    const fee = 3000;
    const tickSpacing = fee / 50;
    const initialPrice = encodeSqrtRatioX96(1, "10000000000000000000");
    const lowerPrice = encodeSqrtRatioX96(1, "100000000000000000000");
    const upperPrice = encodeSqrtRatioX96(1, "1000000000000000000");
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
    const daiBalance = await dai.balanceOf(user1.address);
    const wethBalance = await weth.balanceOf(user1.address);
    const liquidityDaiAmount = userDaiAmount.sub(daiBalance);
    const liquidityWethAmount = userWethAmount.sub(wethBalance);

    expect(await nft.balanceOf(user1.address)).to.eq(1);
    const tokenId = await nft.tokenOfOwnerByIndex(user1.address, 0);

    const uniV3Oracle = await getUniswapV3OracleWrapper();
    const liquidityAmount = await uniV3Oracle.getLiquidityAmount(tokenId);

    almostEqual(liquidityAmount.token0Amount, liquidityDaiAmount);
    almostEqual(liquidityAmount.token1Amount, liquidityWethAmount);

    const lpFee = await uniV3Oracle.getLpFeeAmount(tokenId);
    expect(lpFee.token0Amount).to.eq(0);
    expect(lpFee.token1Amount).to.eq(0);

    const tokenPrice = await uniV3Oracle.getTokenPrice(tokenId);

    almostEqual(
      tokenPrice,
      liquidityWethAmount
        .mul("10")
        .add(liquidityDaiAmount.div("1000000000000000000"))
    );
  });

  it("test with usdc and weth:(token0 decimal less than token1 decimal) with large price difference [ @skip-on-coverage ]", async () => {
    const {
      users: [user1],
      usdc,
      weth,
      oracle,
      nftPositionManager,
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
    const initialPrice = encodeSqrtRatioX96("1000000000000000000", 1); // 1 USDC = 1e12 WETH
    const lowerPrice = encodeSqrtRatioX96("100000000000000000", 1); // 1 USDC = 1e11 WETH
    const upperPrice = encodeSqrtRatioX96("10000000000000000000", 1); // 1 USDC = 1e13 WETH

    await oracle.setAssetPrice(usdc.address, "1000000000000000000000000");

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

    const usdcBalance = await usdc.balanceOf(user1.address);
    const wethBalance = await weth.balanceOf(user1.address);
    const liquidityUsdcAmount = userUsdcAmount.sub(usdcBalance);
    const liquidityWethAmount = userWethAmount.sub(wethBalance);

    expect(await nft.balanceOf(user1.address)).to.eq(1);
    const tokenId = await nft.tokenOfOwnerByIndex(user1.address, 0);

    const uniV3Oracle = await getUniswapV3OracleWrapper();
    const liquidityAmount = await uniV3Oracle.getLiquidityAmount(tokenId);

    almostEqual(liquidityAmount.token0Amount, liquidityUsdcAmount.sub(1));
    almostEqual(liquidityAmount.token1Amount, liquidityWethAmount.sub(1));

    const tokenPrice = await uniV3Oracle.getTokenPrice(tokenId);
    almostEqual(
      tokenPrice,
      liquidityWethAmount
        .sub(1)
        .add(liquidityUsdcAmount.sub(1).mul("1000000000000000000"))
    );
  });

  it("test with weth and usdt:(token0 decimal greater than token1 decimal) large price [ @skip-on-coverage ]", async () => {
    const {
      users: [user1],
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
    const initialPrice = encodeSqrtRatioX96("1000000000", 1);
    const lowerPrice = encodeSqrtRatioX96("100000000", 1);
    const upperPrice = encodeSqrtRatioX96("10000000000", 1);
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

    const usdtBalance = await usdt.balanceOf(user1.address);
    const wethBalance = await weth.balanceOf(user1.address);

    const liquidityUsdtAmount = userUsdtAmount.sub(usdtBalance);
    const liquidityWethAmount = userWethAmount.sub(wethBalance);

    expect(await nft.balanceOf(user1.address)).to.eq(1);
    const tokenId = await nft.tokenOfOwnerByIndex(user1.address, 0);

    const uniV3Oracle = await getUniswapV3OracleWrapper();
    const liquidityAmount = await uniV3Oracle.getLiquidityAmount(tokenId);
    almostEqual(liquidityAmount.token0Amount, liquidityWethAmount.sub(1));
    almostEqual(liquidityAmount.token1Amount, liquidityUsdtAmount.sub(1));

    await oracle.setAssetPrice(usdt.address, "10");
    await oracle.setAssetPrice(weth.address, "10000000000000000000000");

    const tokenPrice = await uniV3Oracle.getTokenPrice(tokenId);

    almostEqual(
      tokenPrice,
      liquidityWethAmount
        .sub(1)
        .mul("10000")
        .add(liquidityUsdtAmount.sub(1).mul("10").div("1000000"))
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
    const lowerPrice = encodeSqrtRatioX96(1, 1300);
    const upperPrice = encodeSqrtRatioX96(1, 900);
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
    const daiBalance = await dai.balanceOf(user1.address);
    const wethBalance = await weth.balanceOf(user1.address);
    const liquidityDaiAmount = userDaiAmount.sub(daiBalance);
    const liquidityWethAmount = userWethAmount.sub(wethBalance);

    expect(await nft.balanceOf(user1.address)).to.eq(1);
    const tokenId = await nft.tokenOfOwnerByIndex(user1.address, 0);

    const uniV3Oracle = await getUniswapV3OracleWrapper();
    const lpFee = await uniV3Oracle.getLpFeeAmount(tokenId);
    expect(lpFee.token0Amount).to.eq(0);
    expect(lpFee.token1Amount).to.eq(0);

    await oracle.setAssetPrice(dai.address, "1000000000000000"); //weth = 1000 dai
    let tokenPrice = await uniV3Oracle.getTokenPrice(tokenId);
    almostEqual(
      tokenPrice,
      liquidityWethAmount.add(liquidityDaiAmount.div(1000))
    );

    const traderDaiAmount = await convertToCurrencyDecimals(
      dai.address,
      "15000"
    );
    const traderWethAmount = await convertToCurrencyDecimals(
      weth.address,
      "100"
    );
    await fund({token: dai, user: trader, amount: traderDaiAmount});
    await fund({token: weth, user: trader, amount: traderWethAmount});
    const swapRouter = await getUniswapV3SwapRouter();
    await approveTo({token: dai, user: trader, target: swapRouter.address});
    await approveTo({token: weth, user: trader, target: swapRouter.address});

    await swapToken({
      tokenIn: dai,
      tokenOut: weth,
      fee,
      amountIn: traderDaiAmount,
      trader,
      zeroForOne: true,
    });

    tokenPrice = await uniV3Oracle.getTokenPrice(tokenId);

    const targetEthFee = await convertToCurrencyDecimals(weth.address, "0.003");

    const targetTokenPrice = liquidityWethAmount
      .add(targetEthFee)
      .add(liquidityDaiAmount.div(1000));

    expect(tokenPrice.div(targetTokenPrice)).to.be.eq(1); // price is almost 100% equal
  });
});
