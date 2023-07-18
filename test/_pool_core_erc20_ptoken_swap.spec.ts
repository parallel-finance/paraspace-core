import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {parseEther, solidityPack} from "ethers/lib/utils";
import {UNISWAP_V3_SWAP_ADAPTER_ID} from "../helpers/constants";
import {
  convertToCurrencyDecimals,
  isUsingAsCollateral,
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

describe("PToken swap", () => {
  it("TC-erc20-ptoken-swap-01: user1 supply usdc and swap pUSDC to pWeth", async () => {
    const {
      pool,
      users: [user1],
      usdc,
      pUsdc,
      pWETH,
      weth,
    } = await loadFixture(fixture);
    const swapRouter = await getUniswapV3SwapRouter();
    const swapAmount = await convertToCurrencyDecimals(usdc.address, "1000");
    const beforePusdc = await pUsdc.balanceOf(user1.address);
    const beforePweth = await pWETH.balanceOf(user1.address);
    const swapPayload = swapRouter.interface.encodeFunctionData("exactInput", [
      {
        path: solidityPack(
          ["address", "uint24", "address"],
          [usdc.address, 500, weth.address]
        ),
        recipient: pUsdc.address,
        deadline: 2659537628,
        amountIn: swapAmount,
        amountOutMinimum: 0,
      },
    ]);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .swapPToken(
          usdc.address,
          swapAmount,
          weth.address,
          user1.address,
          UNISWAP_V3_SWAP_ADAPTER_ID,
          `0x${swapPayload.slice(10)}`
        )
    );

    const afterConfigData = await pool.getUserConfiguration(user1.address);

    expect(await pWETH.balanceOf(user1.address)).gt(0);
    expect(beforePusdc.sub(await pUsdc.balanceOf(user1.address))).eq(
      swapAmount
    );
    almostEqual(
      (await pWETH.balanceOf(user1.address)).sub(beforePweth),
      parseEther("0.914712")
    );
    expect(
      isUsingAsCollateral(
        afterConfigData.data,
        (await pool.getReserveData(weth.address)).id
      )
    );
  });

  it("TC-erc20-ptoken-swap-02: user1 supply usdc, borrow maximum and swap pUSDC to pWeth", async () => {
    const {
      pool,
      users: [user1],
      usdc,
      pUsdc,
      weth,
    } = await loadFixture(fixture);
    const swapRouter = await getUniswapV3SwapRouter();
    const swapAmount = await convertToCurrencyDecimals(usdc.address, "20000");
    const swapPayload = swapRouter.interface.encodeFunctionData("exactInput", [
      {
        path: solidityPack(
          ["address", "uint24", "address"],
          [usdc.address, 500, weth.address]
        ),
        recipient: pUsdc.address,
        deadline: 2659537628,
        amountIn: swapAmount,
        amountOutMinimum: 0,
      },
    ]);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .borrow(weth.address, parseEther("15.937568696"), 0, user1.address)
    );

    await expect(
      pool
        .connect(user1.signer)
        .swapPToken(
          usdc.address,
          swapAmount,
          weth.address,
          user1.address,
          UNISWAP_V3_SWAP_ADAPTER_ID,
          `0x${swapPayload.slice(10)}`
        )
    ).to.be.revertedWith(
      ProtocolErrors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
    );
  });

  it("TC-erc20-ptoken-swap-03: user1 supply usdc, borrow half and swap half of pUSDC to pWETH and send to another user (revert expected)", async () => {
    const {
      pool,
      users: [user1, , user3],
      usdc,
      pUsdc,
      weth,
    } = await loadFixture(fixture);
    const swapRouter = await getUniswapV3SwapRouter();
    const swapAmount = await convertToCurrencyDecimals(usdc.address, "10000");
    const swapPayload = swapRouter.interface.encodeFunctionData("exactInput", [
      {
        path: solidityPack(
          ["address", "uint24", "address"],
          [usdc.address, 500, weth.address]
        ),
        recipient: pUsdc.address,
        deadline: 2659537628,
        amountIn: swapAmount,
        amountOutMinimum: 0,
      },
    ]);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .borrow(weth.address, parseEther("8.5"), 0, user1.address)
    );

    await expect(
      pool
        .connect(user1.signer)
        .swapPToken(
          usdc.address,
          swapAmount,
          weth.address,
          user3.address,
          UNISWAP_V3_SWAP_ADAPTER_ID,
          `0x${swapPayload.slice(10)}`
        )
    ).to.be.revertedWith(
      ProtocolErrors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
    );
  });

  it("TC-erc20-ptoken-swap-04: user1 supply usdc and swap pUSDC to pWeth then send to another user", async () => {
    const {
      pool,
      users: [user1, , user3],
      usdc,
      pUsdc,
      pWETH,
      weth,
    } = await loadFixture(fixture);
    const swapRouter = await getUniswapV3SwapRouter();
    const swapAmount = await convertToCurrencyDecimals(usdc.address, "1000");
    const beforePusdc = await pUsdc.balanceOf(user1.address);
    const beforePweth = await pWETH.balanceOf(user3.address);
    const swapPayload = swapRouter.interface.encodeFunctionData("exactInput", [
      {
        path: solidityPack(
          ["address", "uint24", "address"],
          [usdc.address, 500, weth.address]
        ),
        recipient: pUsdc.address,
        deadline: 2659537628,
        amountIn: swapAmount,
        amountOutMinimum: 0,
      },
    ]);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .swapPToken(
          usdc.address,
          swapAmount,
          weth.address,
          user3.address,
          UNISWAP_V3_SWAP_ADAPTER_ID,
          `0x${swapPayload.slice(10)}`
        )
    );

    const configData = await pool.getUserConfiguration(user3.address);

    expect(beforePusdc.sub(await pUsdc.balanceOf(user1.address))).eq(
      swapAmount
    );
    almostEqual(
      (await pWETH.balanceOf(user3.address)).sub(beforePweth),
      parseEther("0.914712")
    );
    expect(
      isUsingAsCollateral(
        configData.data,
        (await pool.getReserveData(weth.address)).id
      )
    );
  });
});