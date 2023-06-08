import {expect} from "chai";
import {waitForTx} from "../helpers/misc-utils";
import {
  convertToCurrencyDecimals,
  createSeaportOrder,
} from "../helpers/contracts-helpers";
import {AdvancedOrder} from "../helpers/seaport-helpers/types";
import {
  getOfferOrConsiderationItem,
  toBN,
} from "../helpers/seaport-helpers/encoding";
import {
  MAX_UINT_AMOUNT,
  PARASPACE_SEAPORT_ID,
  UNISWAP_V3_SWAP_ADAPTER_ID,
} from "../helpers/constants";
import {mintAndValidate, supplyAndValidate} from "./helpers/validated-steps";
import {getUniswapV3SwapRouter} from "../helpers/contracts-getters";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {deployUniswapV3SwapAdapter} from "../helpers/contracts-deployments";
import {
  approveTo,
  createNewPool,
  mintNewPosition,
  fund,
} from "./helpers/uniswapv3-helper";
import {encodeSqrtRatioX96} from "@uniswap/v3-sdk";
import {constants} from "ethers";
import {solidityPack} from "ethers/lib/utils";

describe("Leveraged Buy Any - Positive tests", () => {
  const fixture = async () => {
    const testEnv = await loadFixture(testEnvFixture);
    const {
      usdc,
      weth,
      users: [, , supplier],
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

    await supplyAndValidate(usdc, "20000", supplier, true);
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
    const usdcWethLowerPrice = encodeSqrtRatioX96(
      100000000000000000,
      1091760000
    );
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

  it("TC-erc721-buy-01: ERC721 <=> ERC20 via paraspace (1% platform fee) - partial borrow and swap", async () => {
    const {
      mayc,
      usdc,
      weth,
      pWETH,
      conduit,
      conduitKey,
      pausableZone,
      seaport,
      pool,
      variableDebtWeth,
      users: [maker, taker, middleman, platform],
    } = await loadFixture(fixture);
    const payNowNumber = "800";
    const creditNumber = "200";
    const payNowAmount = await convertToCurrencyDecimals(
      usdc.address,
      payNowNumber
    );
    const creditAmount = await convertToCurrencyDecimals(
      usdc.address,
      creditNumber
    );
    const startAmount = payNowAmount.add(creditAmount);
    const endAmount = startAmount;
    const nftId = "0";

    // mint USDC to offer
    await mintAndValidate(usdc, payNowNumber, taker);
    // middleman supplies USDC to pool to be borrowed by offer later
    await supplyAndValidate(usdc, creditNumber, middleman, true);
    // maker mint mayc
    await mintAndValidate(mayc, "1", maker);
    // approve
    await waitForTx(
      await mayc.connect(maker.signer).approve(conduit.address, nftId)
    );
    await waitForTx(
      await usdc.connect(taker.signer).approve(pool.address, payNowAmount)
    );

    //before buyWithCredit there is no collateral
    const totalCollateralBase = (await pool.getUserAccountData(taker.address))
      .availableBorrowsBase;
    expect(totalCollateralBase).to.be.equal(0);

    const getSellOrder = async (): Promise<AdvancedOrder> => {
      const offers = [
        getOfferOrConsiderationItem(2, mayc.address, nftId, toBN(1), toBN(1)),
      ];

      const considerations = [
        getOfferOrConsiderationItem(
          1,
          usdc.address,
          toBN(0),
          startAmount.sub(startAmount.div(100)),
          endAmount.sub(startAmount.div(100)),
          maker.address
        ),
        getOfferOrConsiderationItem(
          1,
          usdc.address,
          toBN(0),
          startAmount.div(100),
          endAmount.div(100),
          platform.address
        ),
      ];
      return createSeaportOrder(
        seaport,
        maker,
        offers,
        considerations,
        2,
        pausableZone.address,
        conduitKey
      );
    };
    const encodedData = seaport.interface.encodeFunctionData(
      "fulfillAdvancedOrder",
      [await getSellOrder(), [], conduitKey, pool.address]
    );

    const creditAmountInListingToken = creditAmount;

    const swapRouter = await getUniswapV3SwapRouter();
    const swapPayload = swapRouter.interface.encodeFunctionData("exactOutput", [
      {
        path: solidityPack(
          ["address", "uint24", "address"],
          [usdc.address, 500, weth.address]
        ),
        recipient: pWETH.address,
        deadline: 2659537628,
        amountOut: creditAmountInListingToken,
        amountInMaximum: MAX_UINT_AMOUNT,
      },
    ]);

    const debtBefore = await variableDebtWeth.balanceOf(taker.address);

    await waitForTx(
      await pool.connect(taker.signer).buyAnyWithCredit(
        PARASPACE_SEAPORT_ID,
        `0x${encodedData.slice(10)}`,
        {
          token: weth.address,
          amount: creditAmountInListingToken,
          orderId: constants.HashZero,
          v: 0,
          r: constants.HashZero,
          s: constants.HashZero,
        },
        UNISWAP_V3_SWAP_ADAPTER_ID,
        `0x${swapPayload.slice(10)}`,
        {
          gasLimit: 5000000,
        }
      )
    );

    expect(await mayc.balanceOf(taker.address)).to.be.equal(0);
    expect(await mayc.ownerOf(nftId)).to.be.equal(
      (await pool.getReserveData(mayc.address)).xTokenAddress
    );

    expect(
      (await variableDebtWeth.balanceOf(taker.address)).sub(debtBefore)
    ).eq("183313420582917789");
  });
});
