import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {solidityPack} from "ethers/lib/utils";
import {
  MAX_UINT_AMOUNT,
  UNISWAP_V3_SWAP_ADAPTER_ID,
} from "../helpers/constants";
import {
  convertToCurrencyDecimals,
  isBorrowing,
} from "../helpers/contracts-helpers";
import {waitForTx} from "../helpers/misc-utils";
import {testEnvFixture} from "./helpers/setup-env";
import {supplyAndValidate} from "./helpers/validated-steps";
import {
  almostEqual,
  approveTo,
  createNewPool,
  fund,
  mintNewPosition,
} from "./helpers/uniswapv3-helper";
import {encodeSqrtRatioX96} from "@uniswap/v3-sdk";
import {deployUniswapV3SwapAdapter} from "../helpers/contracts-deployments";
import {getUniswapV3SwapRouter} from "../helpers/contracts-getters";
import {ProtocolErrors} from "../helpers/types";

const fixture = async () => {
  const testEnv = await loadFixture(testEnvFixture);
  const {
    usdc,
    weth,
    users: [user1, supplier],
    nftPositionManager,
    pool,
  } = testEnv;
  const swapAdapter = await deployUniswapV3SwapAdapter(false);
  const swapRouter = await getUniswapV3SwapRouter();
  await waitForTx(
    await pool.setSwapAdapter(UNISWAP_V3_SWAP_ADAPTER_ID, {
      adapter: swapAdapter.address,
      router: swapRouter.address,
      paused: false,
    })
  );

  // User 1 - Deposit usdc
  await supplyAndValidate(usdc, "20000", user1, true);

  // supplier
  await supplyAndValidate(weth, "1000", supplier, true);

  ////////////////////////////////////////////////////////////////////////////////
  // Uniswap USDC/WETH
  ////////////////////////////////////////////////////////////////////////////////
  const userUsdcAmount = await convertToCurrencyDecimals(
    usdc.address,
    "800000"
  );
  const userWethAmount = await convertToCurrencyDecimals(
    weth.address,
    "732.76177"
  );
  await fund({token: weth, user: supplier, amount: userWethAmount});
  await fund({token: usdc, user: supplier, amount: userUsdcAmount});
  const nft = nftPositionManager.connect(supplier.signer);
  await approveTo({
    target: nftPositionManager.address,
    token: usdc,
    user: supplier,
  });
  await approveTo({
    target: nftPositionManager.address,
    token: weth,
    user: supplier,
  });
  const usdcWethFee = 500;
  const usdcWethTickSpacing = usdcWethFee / 50;
  const usdcWethInitialPrice = encodeSqrtRatioX96(
    1000000000000000000,
    1091760000
  );
  const usdcWethLowerPrice = encodeSqrtRatioX96(100000000000000000, 1091760000);
  const usdcWethUpperPrice = encodeSqrtRatioX96(
    10000000000000000000,
    1091760000
  );
  await createNewPool({
    positionManager: nft,
    token0: usdc,
    token1: weth,
    fee: usdcWethFee,
    initialSqrtPrice: usdcWethInitialPrice.toString(),
  });
  await mintNewPosition({
    nft: nft,
    token0: usdc,
    token1: weth,
    fee: usdcWethFee,
    user: supplier,
    tickSpacing: usdcWethTickSpacing,
    lowerPrice: usdcWethLowerPrice,
    upperPrice: usdcWethUpperPrice,
    token0Amount: userUsdcAmount,
    token1Amount: userWethAmount,
  });

  return testEnv;
};

describe("Debt swap", () => {
  it("TC-erc20-debt-swap-01: user1 borrow weth and swap debt to usdc", async () => {
    const {
      pool,
      users: [user1],
      usdc,
      variableDebtUsdc,
      variableDebtWeth,
      weth,
      pUsdc,
    } = await loadFixture(fixture);

    const swapRouter = await getUniswapV3SwapRouter();
    const borrowAmount = await convertToCurrencyDecimals(weth.address, "1");
    const swapPayload = swapRouter.interface.encodeFunctionData("exactOutput", [
      {
        path: solidityPack(
          ["address", "uint24", "address"],
          [weth.address, 500, usdc.address]
        ),
        recipient: pUsdc.address,
        deadline: 2659537628,
        amountOut: borrowAmount,
        amountInMaximum: MAX_UINT_AMOUNT,
      },
    ]);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .borrow(weth.address, borrowAmount, 0, user1.address)
    );

    const beforeUsdcDebt = await variableDebtUsdc.balanceOf(user1.address);
    const beforeWethDebt = await variableDebtWeth.balanceOf(user1.address);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .swapDebt(
          weth.address,
          borrowAmount,
          usdc.address,
          UNISWAP_V3_SWAP_ADAPTER_ID,
          `0x${swapPayload.slice(10)}`
        )
    );

    const afterConfigData = await pool.getUserConfiguration(user1.address);
    almostEqual(
      beforeWethDebt.sub(await variableDebtWeth.balanceOf(user1.address)),
      borrowAmount
    );
    expect(
      isBorrowing(
        afterConfigData.data,
        (await pool.getReserveData(usdc.address)).id
      )
    );

    almostEqual(
      (await variableDebtUsdc.balanceOf(user1.address)).sub(beforeUsdcDebt),
      await convertToCurrencyDecimals(usdc.address, "1093")
    );
  });

  it("TC-erc20-debt-swap-02: user1 borrow maximum of eth and swap debt to usdc (reverted expected)", async () => {
    const {
      pool,
      users: [user1],
      usdc,
      weth,
      pUsdc,
    } = await loadFixture(fixture);

    const swapRouter = await getUniswapV3SwapRouter();
    const borrowAmount = await convertToCurrencyDecimals(
      weth.address,
      "15.937568696"
    );
    const swapPayload = swapRouter.interface.encodeFunctionData("exactOutput", [
      {
        path: solidityPack(
          ["address", "uint24", "address"],
          [weth.address, 500, usdc.address]
        ),
        recipient: pUsdc.address,
        deadline: 2659537628,
        amountOut: borrowAmount,
        amountInMaximum: MAX_UINT_AMOUNT,
      },
    ]);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .borrow(weth.address, borrowAmount, 0, user1.address)
    );

    await expect(
      pool
        .connect(user1.signer)
        .swapDebt(
          weth.address,
          borrowAmount,
          usdc.address,
          UNISWAP_V3_SWAP_ADAPTER_ID,
          `0x${swapPayload.slice(10)}`
        )
    ).to.be.revertedWith(ProtocolErrors.COLLATERAL_CANNOT_COVER_NEW_BORROW);
  });
});