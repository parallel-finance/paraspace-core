import {expect} from "chai";
import {DRE, waitForTx} from "../helpers/misc-utils";
import {
  convertToCurrencyDecimals,
  createSeaportOrder,
} from "../helpers/contracts-helpers";
import {TestEnv} from "./helpers/make-suite";
import {AdvancedOrder} from "../helpers/seaport-helpers/types";
import {
  getItemETH,
  getOfferOrConsiderationItem,
  toBN,
} from "../helpers/seaport-helpers/encoding";
import {createX2Y2Order, createRunput} from "../helpers/x2y2-helpers";
import {
  generateMakerOrderTypedData,
  MakerOrder,
  MakerOrderWithSignature,
  MakerOrderWithVRS,
  TakerOrder,
} from "@looksrare/sdk";
import {
  LOOKSRARE_ID,
  PARASPACE_SEAPORT_ID,
  X2Y2_ID,
} from "../helpers/constants";
import {parseEther, splitSignature} from "ethers/lib/utils";
import {BigNumber, BigNumberish, constants} from "ethers";
import {
  borrowAndValidate,
  changePriceAndValidate,
  mintAndValidate,
  supplyAndValidate,
  switchCollateralAndValidate,
} from "./helpers/validated-steps";
import {MintableERC20} from "../types";
import {getMintableERC721} from "../helpers/contracts-getters";
import {ProtocolErrors} from "../helpers/types";
import {
  executeBlurBuyWithCredit,
  executeLooksrareBuyWithCredit,
  executeSeaportBuyWithCredit,
  executeX2Y2BuyWithCredit,
} from "./helpers/marketplace-helper";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {AdvancedOrderStruct} from "../types/dependencies/seaport/contracts/Seaport";

describe("Leveraged Buy - Positive tests", () => {
  it("TC-erc721-buy-01: ERC721 <=> ERC20 via seaport - no loan", async () => {
    const {
      bayc,
      usdt,
      conduit,
      seaport,
      pausableZone,
      conduitKey,
      users: [maker, taker],
    } = await loadFixture(testEnvFixture);
    const startNumber = "1000";
    const startAmount = await convertToCurrencyDecimals(
      usdt.address,
      startNumber
    );
    const endAmount = startAmount;
    const nftId = 0;

    // mint USDT to offer
    await mintAndValidate(usdt, startNumber, taker);
    // mint BAYC to maker
    await mintAndValidate(bayc, "1", maker);
    // approve BAYC to be transferred by seaport
    await waitForTx(
      await bayc.connect(maker.signer).approve(conduit.address, nftId)
    );
    // approve USDT to be transferred by seaport
    await waitForTx(
      await usdt.connect(taker.signer).approve(conduit.address, startAmount)
    );

    const getSellOrder = async () => {
      const offers = [
        getOfferOrConsiderationItem(2, bayc.address, nftId, toBN(1), toBN(1)),
      ];
      const considerations = [
        getOfferOrConsiderationItem(
          1,
          usdt.address,
          toBN(0),
          startAmount,
          endAmount,
          maker.address
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
    // middleman call seaport to match offer, offer orders
    await waitForTx(
      await seaport
        .connect(taker.signer)
        .fulfillAdvancedOrder(
          await getSellOrder(),
          [],
          conduitKey,
          taker.address
        )
    );
    expect(await bayc.balanceOf(taker.address)).to.be.equal(1);
    expect(await bayc.ownerOf(nftId)).to.be.equal(taker.address);
    expect(await usdt.balanceOf(maker.address)).to.be.equal(startAmount);
  });

  it("TC-erc721-buy-02: ERC721 <=> ERC20 via paraspace (1% platform fee) - partial borrow", async () => {
    const {
      mayc,
      nMAYC,
      usdc,
      conduit,
      conduitKey,
      pausableZone,
      seaport,
      pool,
      users: [maker, taker, middleman, platform],
    } = await loadFixture(testEnvFixture);
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
    let totalCollateralBase = (await pool.getUserAccountData(taker.address))
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

    await waitForTx(
      await pool.connect(taker.signer).buyWithCredit(
        PARASPACE_SEAPORT_ID,
        `0x${encodedData.slice(10)}`,
        {
          token: usdc.address,
          amount: creditAmount,
          orderId: constants.HashZero,
          v: 0,
          r: constants.HashZero,
          s: constants.HashZero,
        },
        0,
        {
          gasLimit: 5000000,
        }
      )
    );

    expect(await mayc.balanceOf(taker.address)).to.be.equal(0);
    expect(await mayc.ownerOf(nftId)).to.be.equal(
      (await pool.getReserveData(mayc.address)).xTokenAddress
    );
    expect(await usdc.balanceOf(maker.address)).to.be.equal(
      startAmount.sub(startAmount.div(100))
    );
    expect(await usdc.balanceOf(platform.address)).to.be.equal(
      startAmount.div(100)
    );

    //after buyWithCredit offerer will have ntoken as collateral
    const nMaycBalance = await nMAYC.balanceOf(taker.address);
    expect(nMaycBalance).to.be.equal(1);
    totalCollateralBase = (await pool.getUserAccountData(taker.address))
      .availableBorrowsBase;
    expect(totalCollateralBase).to.be.gt(0);

    // taker cannot remove NFT from collateral as has acquired debt
    expect(
      switchCollateralAndValidate(taker, mayc, false, nftId)
    ).to.be.revertedWith(
      ProtocolErrors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
    );

    // taker supplies enough USDC to pool to cover debt
    await supplyAndValidate(usdc, "250", taker, true);

    // now taker is good to remove NFT from collateral
    await switchCollateralAndValidate(taker, mayc, false, nftId);
  });

  it("TC-erc721-buy-03: ERC721 <=> ERC20 via paraspace - full borrow", async () => {
    const {
      bayc,
      nBAYC,
      usdc,
      pool,
      users: [maker, taker, middleman],
    } = await loadFixture(testEnvFixture);
    const middlemanInitialBalance = "1000";
    const payLaterAmount = await convertToCurrencyDecimals(
      usdc.address,
      "1000"
    );
    const startAmount = payLaterAmount;
    const endAmount = startAmount;
    const nftId = 0;

    // mint USDC to middleman (liquidity provider) and supplies USDC to pool to be borrowed by taker later
    await supplyAndValidate(usdc, middlemanInitialBalance, middleman, true);
    // mint BAYC to maker
    await mintAndValidate(bayc, "1", maker);

    await executeSeaportBuyWithCredit(
      bayc,
      usdc,
      startAmount,
      endAmount,
      payLaterAmount,
      nftId,
      maker,
      taker
    );

    expect(await bayc.balanceOf(taker.address)).to.be.equal(0);
    expect(await nBAYC.balanceOf(taker.address)).to.be.equal(1);
    expect(await bayc.ownerOf(nftId)).to.be.equal(
      (await pool.getReserveData(bayc.address)).xTokenAddress
    );
    expect(await usdc.balanceOf(maker.address)).to.be.equal(startAmount);
  });

  it("TC-erc721-buy-04: ERC721 <=> ERC20 via looksrare - partial borrow", async () => {
    const {
      doodles,
      dai,
      pool,
      users: [maker, taker, middleman],
    } = await loadFixture(testEnvFixture);
    const payNowNumber = "800";
    const creditNumber = "200";
    const payNowAmount = await convertToCurrencyDecimals(
      dai.address,
      payNowNumber
    );
    const creditAmount = await convertToCurrencyDecimals(
      dai.address,
      creditNumber
    );
    const startAmount = payNowAmount.add(creditAmount);
    const nftId = 0;
    // mint DAI to offer
    await mintAndValidate(dai, payNowNumber, taker);
    // middleman supplies DAI to pool to be borrowed by offer later
    await supplyAndValidate(dai, creditNumber, middleman, true);
    // maker mint mayc
    await mintAndValidate(doodles, "1", maker);
    // approve
    await waitForTx(
      await dai.connect(taker.signer).approve(pool.address, payNowAmount)
    );

    await executeLooksrareBuyWithCredit(
      doodles,
      dai,
      startAmount,
      creditAmount,
      nftId,
      maker,
      taker
    );

    expect(await doodles.balanceOf(taker.address)).to.be.equal(0);
    expect(await doodles.ownerOf(nftId)).to.be.equal(
      (await pool.getReserveData(doodles.address)).xTokenAddress
    );
    expect(await dai.balanceOf(maker.address)).to.be.equal(startAmount);
  });

  it("TC-erc721-buy-05: ERC721 can be sold for ERC20 via Looksrare using PayLater (full borrow)", async () => {
    const {
      doodles,
      dai,
      pool,
      users: [maker, taker, middleman],
    } = await loadFixture(testEnvFixture);
    const middlemanInitialBalance = "200";
    const payLaterAmount = await convertToCurrencyDecimals(
      dai.address,
      middlemanInitialBalance
    );
    const startAmount = payLaterAmount;
    const nftId = 0;
    // middleman supplies DAI to the pool
    await supplyAndValidate(dai, middlemanInitialBalance, middleman, true);
    // mint DOODLE to maker
    await mintAndValidate(doodles, "1", maker);

    await executeLooksrareBuyWithCredit(
      doodles,
      dai,
      startAmount,
      payLaterAmount,
      nftId,
      maker,
      taker
    );
    expect(await doodles.balanceOf(taker.address)).to.be.equal(0);
    expect(await doodles.ownerOf(nftId)).to.be.equal(
      (await pool.getReserveData(doodles.address)).xTokenAddress
    );
    expect(await dai.balanceOf(maker.address)).to.be.equal(startAmount);
  });

  it("TC-erc721-buy-06: ERC721 <=> ETH via paraspace (1% platform fee) - partial borrow", async () => {
    const {
      mayc,
      conduit,
      conduitKey,
      pausableZone,
      seaport,
      pool,
      wETHGateway,
      weth,
      users: [maker, taker, middleman, platform],
    } = await loadFixture(testEnvFixture);
    const masGasFeeLeft = parseEther("5");
    const payNowAmount = (await taker.signer.getBalance()).sub(masGasFeeLeft);
    const creditAmount = parseEther("2");
    const startAmount = payNowAmount.add(creditAmount);
    const refundAmount = parseEther("1");
    const nftId = "0";

    // middleman supplies ETH to pool to be borrowed by offer later
    await waitForTx(
      await wETHGateway
        .connect(middleman.signer)
        .depositETH(middleman.address, 0, {
          value: creditAmount,
        })
    );
    // verify pool holds liquidity
    expect(
      await weth.balanceOf(
        (
          await pool.getReserveData(weth.address)
        ).xTokenAddress
      )
    ).to.be.equal(creditAmount);

    // mint MAYC to maker
    await mintAndValidate(mayc, "1", maker);
    // approve
    await waitForTx(
      await mayc.connect(maker.signer).approve(conduit.address, nftId)
    );
    const oldOfferBalance = await maker.signer.getBalance();
    const oldPlatformBalance = await platform.signer.getBalance();

    const getSellOrder = async (): Promise<AdvancedOrder> => {
      const offers = [
        getOfferOrConsiderationItem(2, mayc.address, nftId, toBN(1), toBN(1)),
      ];
      const considerations = [
        getItemETH(
          startAmount.sub(startAmount.div(100)),
          startAmount.sub(startAmount.div(100)),
          maker.address
        ),
        getItemETH(
          startAmount.div(100),
          startAmount.div(100),
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
    const offerBeforeBalance = await taker.signer.getBalance();
    const txReceipt = await waitForTx(
      await pool.connect(taker.signer).buyWithCredit(
        PARASPACE_SEAPORT_ID,
        `0x${encodedData.slice(10)}`,
        {
          token: constants.AddressZero,
          amount: creditAmount,
          orderId: constants.HashZero,
          v: 0,
          r: constants.HashZero,
          s: constants.HashZero,
        },
        0,
        {
          gasLimit: 5000000,
          value: payNowAmount.add(refundAmount),
        }
      )
    );
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    expect(await mayc.balanceOf(taker.address)).to.be.equal(0);
    expect(await mayc.ownerOf(nftId)).to.be.equal(
      (await pool.getReserveData(mayc.address)).xTokenAddress
    );
    expect(await maker.signer.getBalance()).to.be.equal(
      startAmount.sub(startAmount.div(100)).add(oldOfferBalance)
    );
    expect(await platform.signer.getBalance()).to.be.equal(
      startAmount.div(100).add(oldPlatformBalance)
    );
    expect(await pool.provider.getBalance(pool.address)).to.be.equal(0);
    //check offerer got refund
    expect(await taker.signer.getBalance()).to.be.equal(
      offerBeforeBalance.sub(payNowAmount).sub(gasUsed)
    );
  });

  it("TC-erc721-buy-07: ERC721 <=> WETH via paraspace (1% platform fee) - partial borrow", async () => {
    const {
      mayc,
      conduit,
      conduitKey,
      pausableZone,
      seaport,
      pool,
      wETHGateway,
      weth,
      users: [maker, taker, middleman, platform],
    } = await loadFixture(testEnvFixture);
    const masGasFeeLeft = parseEther("5");
    const payNowAmount = (await taker.signer.getBalance()).sub(masGasFeeLeft);
    const creditAmount = parseEther("2");
    const startAmount = payNowAmount.add(creditAmount);
    const nftId = "0";

    // middleman supplies ETH to pool to be borrowed by offerer later
    await waitForTx(
      await wETHGateway
        .connect(middleman.signer)
        .depositETH(middleman.address, 0, {
          value: creditAmount,
        })
    );
    // verify pool holds liquidity
    expect(
      await weth.balanceOf(
        (
          await pool.getReserveData(weth.address)
        ).xTokenAddress
      )
    ).to.be.equal(creditAmount);

    // mint MAYC to maker
    await mintAndValidate(mayc, "1", maker);
    // approve
    await waitForTx(
      await mayc.connect(maker.signer).approve(conduit.address, nftId)
    );
    await waitForTx(
      await weth.connect(taker.signer).approve(pool.address, payNowAmount)
    );
    const oldOfferBalance = await weth.balanceOf(maker.address);
    const oldPlatformBalance = await weth.balanceOf(platform.address);

    const getSellOrder = async (): Promise<AdvancedOrder> => {
      const offers = [
        getOfferOrConsiderationItem(2, mayc.address, nftId, toBN(1), toBN(1)),
      ];
      const considerations = [
        getOfferOrConsiderationItem(
          1,
          weth.address,
          toBN(0),
          startAmount.sub(startAmount.div(100)),
          startAmount.sub(startAmount.div(100)),
          maker.address
        ),
        getOfferOrConsiderationItem(
          1,
          weth.address,
          toBN(0),
          startAmount.div(100),
          startAmount.div(100),
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
    const offerBeforeBalance = await taker.signer.getBalance();
    const txReceipt = await waitForTx(
      await pool.connect(taker.signer).buyWithCredit(
        PARASPACE_SEAPORT_ID,
        `0x${encodedData.slice(10)}`,
        {
          token: weth.address,
          amount: creditAmount,
          orderId: constants.HashZero,
          v: 0,
          r: constants.HashZero,
          s: constants.HashZero,
        },
        0,
        {
          gasLimit: 5000000,
          value: payNowAmount,
        }
      )
    );
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    expect(await mayc.balanceOf(taker.address)).to.be.equal(0);
    expect(await mayc.ownerOf(nftId)).to.be.equal(
      (await pool.getReserveData(mayc.address)).xTokenAddress
    );
    expect(await weth.balanceOf(maker.address)).to.be.equal(
      startAmount.sub(startAmount.div(100)).add(oldOfferBalance)
    );
    expect(await weth.balanceOf(platform.address)).to.be.equal(
      startAmount.div(100).add(oldPlatformBalance)
    );
    expect(await pool.provider.getBalance(pool.address)).to.be.equal(0);
    expect(await weth.balanceOf(pool.address)).to.be.equal(0);

    //check offerer got refund
    expect(await taker.signer.getBalance()).to.be.equal(
      offerBeforeBalance.sub(payNowAmount).sub(gasUsed)
    );
  });

  it("TC-erc721-buy-08: ERC721 <=> ETH batch buy via paraspace", async () => {
    const {
      mayc,
      nMAYC,
      conduit,
      conduitKey,
      pausableZone,
      seaport,
      pool,
      wETHGateway,
      weth,
      users: [maker, taker, middleman],
    } = await loadFixture(testEnvFixture);

    const masGasFeeLeft = parseEther("4");
    const totalPayNowAmount = (await taker.signer.getBalance()).sub(
      masGasFeeLeft
    );
    const totalCreditAmount = parseEther("3");
    const creditAmount = totalCreditAmount.div(3);
    const payNowAmount = totalPayNowAmount.div(3);
    const startAmount = payNowAmount.add(creditAmount);
    const nftIds = ["0", "1", "2"];

    // middleman supplies ETH to pool to be borrowed by offerer later
    await waitForTx(
      await wETHGateway
        .connect(middleman.signer)
        .depositETH(middleman.address, 0, {
          value: totalCreditAmount,
        })
    );
    // verify pool holds liquidity
    expect(
      await weth.balanceOf(
        (
          await pool.getReserveData(weth.address)
        ).xTokenAddress
      )
    ).to.be.equal(totalCreditAmount);

    // mint MAYC to maker
    const mintableMayc = await getMintableERC721(mayc.address);
    for (const nftId of nftIds) {
      await waitForTx(
        await mintableMayc.connect(maker.signer)["mint(address)"](maker.address)
      );
      expect(await mayc.ownerOf(nftId)).to.be.equal(maker.address);
    }

    const getSellOrder = async (
      token: string,
      nftId: BigNumberish,
      listPrice: BigNumberish
    ): Promise<AdvancedOrder> => {
      const offers = [
        getOfferOrConsiderationItem(2, token, nftId, toBN(1), toBN(1)),
      ];
      const considerations = [getItemETH(listPrice, listPrice, maker.address)];
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

    const getEncodedData = (order: AdvancedOrderStruct): string =>
      `0x${seaport.interface
        .encodeFunctionData("fulfillAdvancedOrder", [
          order,
          [],
          conduitKey,
          pool.address,
        ])
        .slice(10)}`;

    const orderETH0 = await getSellOrder(mayc.address, nftIds[0], startAmount);
    const orderETH1 = await getSellOrder(mayc.address, nftIds[1], startAmount);
    const orderETH2 = await getSellOrder(mayc.address, nftIds[2], startAmount);

    const emptySig = {
      orderId: constants.HashZero,
      v: 0,
      r: constants.HashZero,
      s: constants.HashZero,
    };

    const creditETH0 = {
      token: constants.AddressZero,
      amount: creditAmount,
      ...emptySig,
    };
    const creditETH1 = {
      token: constants.AddressZero,
      amount: creditAmount,
      ...emptySig,
    };
    const creditETH2 = {
      token: constants.AddressZero,
      amount: creditAmount,
      ...emptySig,
    };

    // approve
    await waitForTx(
      await mayc.connect(maker.signer).setApprovalForAll(conduit.address, true)
    );

    const makerETHBeforeBalance = await maker.signer.getBalance();
    const takerETHBeforeBalance = await taker.signer.getBalance();

    const txReceipt = await waitForTx(
      await pool
        .connect(taker.signer)
        .batchBuyWithCredit(
          [PARASPACE_SEAPORT_ID, PARASPACE_SEAPORT_ID, PARASPACE_SEAPORT_ID],
          [
            getEncodedData(orderETH0),
            getEncodedData(orderETH1),
            getEncodedData(orderETH2),
          ],
          [creditETH0, creditETH1, creditETH2],
          0,
          {
            gasLimit: 5000000,
            value: totalPayNowAmount,
          }
        )
    );
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    expect(await mayc.balanceOf(maker.address)).to.be.equal(0);
    expect(await nMAYC.balanceOf(taker.address)).to.be.equal(3);
    for (const nftId of nftIds) {
      expect(await mayc.ownerOf(nftId)).to.be.equal(
        (await pool.getReserveData(mayc.address)).xTokenAddress
      );
    }
    expect(await pool.provider.getBalance(maker.address)).to.be.equal(
      startAmount.mul(3).add(makerETHBeforeBalance)
    );
    expect(await pool.provider.getBalance(taker.address)).to.be.equal(
      takerETHBeforeBalance.sub(totalPayNowAmount).sub(gasUsed)
    );
    expect(await pool.provider.getBalance(pool.address)).to.be.equal(0);
  });

  it("TC-erc721-buy-09: ERC721 <=> WETH/ETH batch buy via paraspace", async () => {
    const {
      mayc,
      nMAYC,
      conduit,
      conduitKey,
      pausableZone,
      seaport,
      pool,
      wETHGateway,
      weth,
      users: [maker, taker, middleman],
    } = await loadFixture(testEnvFixture);
    const masGasFeeLeft = parseEther("4");

    const totalPayNowAmount = (await taker.signer.getBalance()).sub(
      masGasFeeLeft
    );
    const totalPayNowAmountInETH = totalPayNowAmount.div(3).mul(2);
    const totalPayNowAmountInWETH = totalPayNowAmount.sub(
      totalPayNowAmountInETH
    );
    const totalCreditAmount = parseEther("3");
    const creditAmount = totalCreditAmount.div(3);
    const payNowAmount = totalPayNowAmount.div(3);
    const startAmount = payNowAmount.add(creditAmount);
    const nftIds = ["0", "1", "2"];

    // middleman supplies ETH to pool to be borrowed by offerer later
    await waitForTx(
      await wETHGateway
        .connect(middleman.signer)
        .depositETH(middleman.address, 0, {
          value: totalCreditAmount,
        })
    );

    // verify pool holds liquidity
    expect(
      await weth.balanceOf(
        (
          await pool.getReserveData(weth.address)
        ).xTokenAddress
      )
    ).to.be.equal(totalCreditAmount);

    // mint MAYC to maker
    const mintableMayc = await getMintableERC721(mayc.address);
    for (const nftId of nftIds) {
      await waitForTx(
        await mintableMayc.connect(maker.signer)["mint(address)"](maker.address)
      );
      expect(await mayc.ownerOf(nftId)).to.be.equal(maker.address);
    }

    const getSellOrder = async (
      token: string,
      nftId: BigNumberish,
      listPrice: BigNumberish,
      listInETH = true
    ): Promise<AdvancedOrder> => {
      const offers = [
        getOfferOrConsiderationItem(2, token, nftId, toBN(1), toBN(1)),
      ];

      const considerations = [
        listInETH
          ? getItemETH(listPrice, listPrice, maker.address)
          : getOfferOrConsiderationItem(
              1,
              weth.address,
              toBN(0),
              listPrice,
              listPrice,
              maker.address
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

    const getEncodedData = (order: AdvancedOrderStruct): string =>
      `0x${seaport.interface
        .encodeFunctionData("fulfillAdvancedOrder", [
          order,
          [],
          conduitKey,
          pool.address,
        ])
        .slice(10)}`;

    const orderETH0 = await getSellOrder(mayc.address, nftIds[0], startAmount);
    const orderETH1 = await getSellOrder(mayc.address, nftIds[1], startAmount);
    const orderWETH2 = await getSellOrder(
      mayc.address,
      nftIds[2],
      startAmount,
      false
    );

    const emptySig = {
      orderId: constants.HashZero,
      v: 0,
      r: constants.HashZero,
      s: constants.HashZero,
    };

    const creditETH0 = {
      token: constants.AddressZero,
      amount: creditAmount,
      ...emptySig,
    };
    const creditETH1 = {
      token: constants.AddressZero,
      amount: creditAmount,
      ...emptySig,
    };
    const creditWETH2 = {
      token: weth.address,
      amount: creditAmount,
      ...emptySig,
    };

    // approve
    await waitForTx(
      await mayc.connect(maker.signer).setApprovalForAll(conduit.address, true)
    );
    await waitForTx(
      await weth
        .connect(taker.signer)
        .approve(pool.address, totalPayNowAmountInWETH)
    );

    // batchBuyWithCredit([ETH, WETH, ETH]) will fail
    await expect(
      pool
        .connect(taker.signer)
        .batchBuyWithCredit(
          [PARASPACE_SEAPORT_ID, PARASPACE_SEAPORT_ID, PARASPACE_SEAPORT_ID],
          [
            getEncodedData(orderETH0),
            getEncodedData(orderWETH2),
            getEncodedData(orderETH1),
          ],
          [creditETH0, creditWETH2, creditETH1],
          0,
          {
            gasLimit: 5000000,
            value: totalPayNowAmount,
          }
        )
    ).to.revertedWith(ProtocolErrors.PAYNOW_NOT_ENOUGH);

    const makerETHBeforeBalance = await maker.signer.getBalance();
    const takerETHBeforeBalance = await taker.signer.getBalance();
    const makerWETHBeforeBalance = await weth.balanceOf(maker.address);
    const txReceipt = await waitForTx(
      await pool
        .connect(taker.signer)
        .batchBuyWithCredit(
          [PARASPACE_SEAPORT_ID, PARASPACE_SEAPORT_ID, PARASPACE_SEAPORT_ID],
          [
            getEncodedData(orderETH0),
            getEncodedData(orderETH1),
            getEncodedData(orderWETH2),
          ],
          [creditETH0, creditETH1, creditWETH2],
          0,
          {
            gasLimit: 5000000,
            value: totalPayNowAmount,
          }
        )
    );
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    expect(await mayc.balanceOf(maker.address)).to.be.equal(0);
    expect(await nMAYC.balanceOf(taker.address)).to.be.equal(3);
    for (const nftId of nftIds) {
      expect(await mayc.ownerOf(nftId)).to.be.equal(
        (await pool.getReserveData(mayc.address)).xTokenAddress
      );
    }
    expect(await weth.balanceOf(maker.address)).to.be.equal(
      startAmount.add(makerWETHBeforeBalance)
    );
    expect(await pool.provider.getBalance(maker.address)).to.be.equal(
      startAmount.mul(2).add(makerETHBeforeBalance)
    );
    expect(await pool.provider.getBalance(taker.address)).to.be.equal(
      takerETHBeforeBalance.sub(totalPayNowAmount).sub(gasUsed)
    );
    expect(await weth.balanceOf(taker.address)).to.be.equal(0);
    expect(await pool.provider.getBalance(pool.address)).to.be.equal(0);
    expect(await weth.balanceOf(pool.address)).to.be.equal(0);
    expect(await weth.allowance(taker.address, pool.address)).to.be.equal(0);
  });

  it("TC-erc721-buy-10: NToken(collateralized) <=> ERC20 via paraspace - partial borrow", async () => {
    const {
      bayc,
      nBAYC,
      usdc,
      pool,
      users: [maker, taker, middleman],
    } = await loadFixture(testEnvFixture);
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
    const endAmount = startAmount; // fixed price but offer cannot afford this
    const nftId = 0;

    // mint USDC to taker and middleman
    await mintAndValidate(usdc, payNowNumber, taker);
    // middleman supplies USDC to pool to be borrowed by offer later
    await supplyAndValidate(usdc, creditNumber, middleman, true);
    await supplyAndValidate(bayc, "1", maker, true);

    await waitForTx(
      await usdc.connect(taker.signer).approve(pool.address, startAmount)
    );
    await executeSeaportBuyWithCredit(
      nBAYC,
      usdc,
      startAmount,
      endAmount,
      creditAmount,
      nftId,
      maker,
      taker
    );

    expect(await nBAYC.ownerOf(nftId)).to.be.equal(taker.address);
    expect(await nBAYC.collateralizedBalanceOf(taker.address)).to.be.equal(1);
    expect(await usdc.balanceOf(maker.address)).to.be.equal(startAmount);
  });

  it("TC-erc721-buy-11: NToken(uncollateralized) <=> ERC20 via paraspace", async () => {
    const {
      bayc,
      nBAYC,
      usdc,
      pool,
      users: [maker, taker, middleman],
    } = await loadFixture(testEnvFixture);
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
    const endAmount = startAmount; // fixed price but offer cannot afford this
    const nftId = 0;

    // mint USDC to taker and middleman
    await mintAndValidate(usdc, payNowNumber, taker);
    // middleman supplies USDC to pool to be borrowed by offer later
    await supplyAndValidate(usdc, creditNumber, middleman, true);
    await supplyAndValidate(bayc, "1", maker, true);

    await waitForTx(
      await pool
        .connect(maker.signer)
        .setUserUseERC721AsCollateral(bayc.address, [0], false)
    );
    await waitForTx(
      await usdc.connect(taker.signer).approve(pool.address, startAmount)
    );
    await executeSeaportBuyWithCredit(
      nBAYC,
      usdc,
      startAmount,
      endAmount,
      creditAmount,
      nftId,
      maker,
      taker
    );

    expect(await nBAYC.ownerOf(nftId)).to.be.equal(taker.address);
    expect(await nBAYC.collateralizedBalanceOf(taker.address)).to.be.equal(1);
    expect(await usdc.balanceOf(maker.address)).to.be.equal(startAmount);
  });

  it("TC-erc721-buy-12: (ERC721 & ERC721) <=> ERC20 via looksrare and x2y2 - partial borrow", async () => {
    const {
      doodles,
      weth,
      wETHGateway,
      looksRareExchange,
      strategyStandardSaleForFixedPrice,
      transferManagerERC721,
      pool,
      users: [maker, taker, middleman],
      dai,
      x2y2r1,
      erc721Delegate,
      deployer,
    } = await loadFixture(testEnvFixture);

    const masGasFeeLeft = parseEther("5");
    const payNowAmount = (await taker.signer.getBalance()).sub(masGasFeeLeft);
    const payLaterAmount = parseEther("2");
    const startAmount = payNowAmount.add(payLaterAmount);
    const nftId = 0;

    // middleman provides ETH liquidity to the pool
    await waitForTx(
      await wETHGateway
        .connect(middleman.signer)
        .depositETH(middleman.address, 0, {
          value: payLaterAmount,
        })
    );
    // pool holds ETH liquidity
    expect(
      await weth.balanceOf(
        (
          await pool.getReserveData(weth.address)
        ).xTokenAddress
      )
    ).to.be.equal(payLaterAmount);

    const creditNumber = "1000";
    const creditAmount = await convertToCurrencyDecimals(
      dai.address,
      creditNumber
    );
    const startAmountX2Y2 = creditAmount;
    const nftIdX2Y2 = 1;

    // mint DOODLE to maker
    await mintAndValidate(doodles, "2", maker);
    // middleman supplies DAI
    await supplyAndValidate(dai, creditNumber, middleman, true);
    // approve
    await waitForTx(
      await doodles
        .connect(maker.signer)
        .approve(erc721Delegate.address, nftIdX2Y2)
    );
    // Prepare X2Y2 order data
    waitForTx(
      await x2y2r1
        .connect(deployer.signer)
        .updateSigners([middleman.address], [])
    );
    const now = Math.floor(Date.now() / 1000);

    const order = await createX2Y2Order({
      chainId: (await DRE.ethers.provider.getNetwork()).chainId,
      signer: maker.signer,
      tokenAddress: doodles.address,
      tokenId: nftIdX2Y2,
      price: startAmountX2Y2,
      currency: dai.address,
      expirationTime: BigNumber.from(now).add(86400),
    });

    const input = await createRunput(
      middleman.address,
      erc721Delegate.address,
      order,
      pool.address,
      []
    );
    // encode order data
    const encodedDataX2Y2 = x2y2r1.interface.encodeFunctionData("run", [input]);
    // Prepare Looksrare order
    await waitForTx(
      await doodles
        .connect(maker.signer)
        .approve(transferManagerERC721.address, nftId)
    );
    const oldMakerBalance = await maker.signer.getBalance();
    const signer = DRE.ethers.provider.getSigner(maker.address);
    const chainId = await maker.signer.getChainId();
    const nonce = await maker.signer.getTransactionCount();

    const paramsValue = [];
    const makerOrder: MakerOrder = {
      isOrderAsk: true,
      signer: maker.address,
      collection: doodles.address,
      price: startAmount,
      tokenId: nftId,
      amount: "1",
      strategy: strategyStandardSaleForFixedPrice.address,
      currency: weth.address,
      nonce: nonce,
      startTime: now - 86400,
      endTime: now + 86400, // 2 day validity
      minPercentageToAsk: 7500,
      params: paramsValue,
    };

    const {domain, value, type} = generateMakerOrderTypedData(
      maker.address,
      chainId,
      makerOrder,
      looksRareExchange.address
    );

    const signatureHash = await signer._signTypedData(domain, type, value);
    const makerOrderWithSignature: MakerOrderWithSignature = {
      ...makerOrder,
      signature: signatureHash,
    };
    const vrs = splitSignature(makerOrderWithSignature.signature);
    const makerOrderWithVRS: MakerOrderWithVRS = {
      ...makerOrderWithSignature,
      ...vrs,
    };
    const takerOrder: TakerOrder = {
      isOrderAsk: false,
      taker: pool.address,
      price: makerOrderWithSignature.price,
      tokenId: makerOrderWithSignature.tokenId,
      minPercentageToAsk: 7500,
      params: paramsValue,
    };

    // encode order data
    const encodedData = looksRareExchange.interface.encodeFunctionData(
      "matchAskWithTakerBidUsingETHAndWETH",
      [takerOrder, makerOrderWithVRS]
    );
    await waitForTx(
      await pool.connect(taker.signer).batchBuyWithCredit(
        [LOOKSRARE_ID, X2Y2_ID],
        [`0x${encodedData.slice(10)}`, `0x${encodedDataX2Y2.slice(10)}`],
        [
          {
            token: constants.AddressZero,
            amount: payLaterAmount,
            orderId: constants.HashZero,
            v: 0,
            r: constants.HashZero,
            s: constants.HashZero,
          },
          {
            token: dai.address,
            amount: creditAmount,
            orderId: constants.HashZero,
            v: 0,
            r: constants.HashZero,
            s: constants.HashZero,
          },
        ],
        0,
        {
          gasLimit: 5000000,
          value: payNowAmount,
        }
      )
    );

    expect(await doodles.balanceOf(taker.address)).to.be.equal(0);
    expect(await doodles.ownerOf(nftId)).to.be.equal(
      (await pool.getReserveData(doodles.address)).xTokenAddress
    );
    expect(await weth.balanceOf(maker.address)).to.be.equal(startAmount);
    expect(await maker.signer.getBalance()).to.be.equal(oldMakerBalance);

    expect(await doodles.ownerOf(nftId)).to.be.equal(
      (await pool.getReserveData(doodles.address)).xTokenAddress
    );
    expect(await dai.balanceOf(maker.address)).to.be.equal(startAmountX2Y2);
  });

  it("TC-erc721-buy-13: ERC721 <=> ERC20 via x2y2 - partial borrow", async () => {
    const {
      doodles,
      dai,
      x2y2r1,
      deployer,
      pool,
      users: [maker, taker, middleman],
    } = await loadFixture(testEnvFixture);

    const payNowNumber = "800";
    const creditNumber = "200";
    const payNowAmount = await convertToCurrencyDecimals(
      dai.address,
      payNowNumber
    );
    const creditAmount = await convertToCurrencyDecimals(
      dai.address,
      creditNumber
    );
    const startAmount = payNowAmount.add(creditAmount);
    const nftId = 0;
    await waitForTx(
      await x2y2r1
        .connect(deployer.signer)
        .updateSigners([middleman.address], [])
    );

    // mint USDC to taker and middleman
    await mintAndValidate(dai, payNowNumber, taker);
    // middleman supplies USDC to pool to be borrowed by offer later
    await supplyAndValidate(dai, creditNumber, middleman, true);
    await mintAndValidate(doodles, "1", maker);
    // approve
    await waitForTx(
      await dai.connect(taker.signer).approve(pool.address, payNowAmount)
    );

    await executeX2Y2BuyWithCredit(
      doodles,
      dai,
      startAmount,
      creditAmount,
      nftId,
      maker,
      taker,
      deployer,
      middleman
    );

    expect(await doodles.balanceOf(taker.address)).to.be.equal(0);
    expect(await doodles.ownerOf(nftId)).to.be.equal(
      (await pool.getReserveData(doodles.address)).xTokenAddress
    );
    expect(await dai.balanceOf(maker.address)).to.be.equal(startAmount);
  });

  it("TC-erc721-buy-14: ERC721 <=> ERC20 via x2y2 - full borrow", async () => {
    const {
      doodles,
      dai,
      pool,
      deployer,
      users: [maker, taker, middleman],
    } = await loadFixture(testEnvFixture);
    const creditNumber = "1000";
    const creditAmount = await convertToCurrencyDecimals(
      dai.address,
      creditNumber
    );
    const startAmount = creditAmount;
    const nftId = 0;

    // mint DOODLE to maker
    await mintAndValidate(doodles, "1", maker);
    // middleman supplies DAI to the pool
    await supplyAndValidate(dai, creditNumber, middleman, true);

    await executeX2Y2BuyWithCredit(
      doodles,
      dai,
      startAmount,
      creditAmount,
      nftId,
      maker,
      taker,
      deployer,
      middleman
    );

    expect(await doodles.balanceOf(taker.address)).to.be.equal(0);
    expect(await doodles.ownerOf(nftId)).to.be.equal(
      (await pool.getReserveData(doodles.address)).xTokenAddress
    );
    expect(await dai.balanceOf(maker.address)).to.be.equal(startAmount);
  });

  it("TC-erc721-buy-15: ERC721 <=> ERC20 via Looksrare - no loan", async () => {
    const {
      doodles,
      nDOODLE,
      dai,
      transferManagerERC721,
      pool,
      users: [maker, taker],
    } = await loadFixture(testEnvFixture);
    const takerInitialBalance = "1000";
    const payNowAmount = await convertToCurrencyDecimals(
      dai.address,
      takerInitialBalance
    );
    const payLaterAmount = 0; // no loan!
    const startAmount = payNowAmount.add(payLaterAmount);
    const nftId = 0;

    // mint DAI to taker
    await mintAndValidate(dai, takerInitialBalance, taker);
    // mint DOODLE to maker
    await mintAndValidate(doodles, "1", maker);
    // approve
    await waitForTx(
      await doodles
        .connect(maker.signer)
        .approve(transferManagerERC721.address, nftId)
    );
    await waitForTx(
      await dai.connect(taker.signer).approve(pool.address, payNowAmount)
    );

    await executeLooksrareBuyWithCredit(
      doodles,
      dai,
      startAmount,
      payLaterAmount,
      nftId,
      maker,
      taker
    );

    expect(await doodles.balanceOf(maker.address)).to.be.eq(0);
    expect(await doodles.ownerOf(nftId)).to.be.eq(
      (await pool.getReserveData(doodles.address)).xTokenAddress
    );
    expect(await nDOODLE.balanceOf(taker.address)).to.be.eq(1);
    expect(await nDOODLE.ownerOf(nftId)).to.be.eq(taker.address);
    expect(await dai.balanceOf(maker.address)).to.be.eq(startAmount);
  });

  it("TC-erc721-buy-23: ERC721 <=> ERC20 via Blur - no loan", async () => {
    const {
      doodles,
      nDOODLE,
      weth,
      executionDelegate,
      pool,
      users: [maker, taker],
    } = await loadFixture(testEnvFixture);
    const takerInitialBalance = "1000";
    const payNowAmount = await convertToCurrencyDecimals(
      weth.address,
      takerInitialBalance
    );
    const payLaterAmount = 0; // no loan!
    const startAmount = payNowAmount.add(payLaterAmount);
    const nftId = 0;

    // mint WETH to taker
    await mintAndValidate(weth, takerInitialBalance, taker);
    // mint DOODLE to maker
    await mintAndValidate(doodles, "1", maker);
    // approve
    await waitForTx(
      await doodles
        .connect(maker.signer)
        .approve(executionDelegate.address, nftId)
    );
    await waitForTx(
      await weth.connect(taker.signer).approve(pool.address, payNowAmount)
    );

    await executeBlurBuyWithCredit(
      doodles,
      weth,
      startAmount,
      payLaterAmount,
      nftId,
      maker,
      taker
    );

    expect(await doodles.balanceOf(maker.address)).to.be.eq(0);
    expect(await doodles.ownerOf(nftId)).to.be.eq(
      (await pool.getReserveData(doodles.address)).xTokenAddress
    );
    expect(await nDOODLE.balanceOf(taker.address)).to.be.eq(1);
    expect(await nDOODLE.ownerOf(nftId)).to.be.eq(taker.address);
    expect(await weth.balanceOf(maker.address)).to.be.eq(startAmount);
  });
});

describe("Leveraged Buy - Negative tests", () => {
  const nftId = 0;
  let startAmount: BigNumber;
  let endAmount: BigNumber;
  let payLaterAmount: BigNumber;
  const {COLLATERAL_CANNOT_COVER_NEW_BORROW} = ProtocolErrors;
  let testEnv: TestEnv;
  const fixture = async () => {
    testEnv = await loadFixture(testEnvFixture);

    const {
      bayc,
      dai,
      conduit,
      pool,
      users: [maker, taker, middleman],
    } = testEnv;
    const takerInitialBalance = "800";
    const payNowAmount = await convertToCurrencyDecimals(
      dai.address,
      takerInitialBalance
    );
    const middlemanInitialBalance = "1200";
    payLaterAmount = await convertToCurrencyDecimals(dai.address, "230");
    startAmount = payNowAmount.add(payLaterAmount);
    endAmount = startAmount; // fixed price but taker cannot afford this

    // mint DAI to middleman (liquidity provider)
    await mintAndValidate(dai, middlemanInitialBalance, middleman);
    // mint DAI to taker
    await mintAndValidate(dai, takerInitialBalance, taker);

    // middleman supplies DAI to the pool
    await supplyAndValidate(dai, middlemanInitialBalance, middleman);

    // mint BAYC to maker
    await mintAndValidate(bayc, "1", maker);

    // approve
    await waitForTx(
      await bayc.connect(maker.signer).approve(conduit.address, nftId)
    );
    await waitForTx(
      await dai.connect(taker.signer).approve(pool.address, payNowAmount)
    );
    return testEnv;
  };

  it("TC-erc721-buy-16: Cannot purchase nToken in collateral covering an ongoing borrow position", async () => {
    const {
      bayc,
      nBAYC,
      dai,
      conduit,
      users: [maker, taker],
    } = await loadFixture(fixture);

    // maker supplies BAYC
    await supplyAndValidate(bayc, "1", maker);

    // approve
    await waitForTx(
      await nBAYC.connect(maker.signer).approve(conduit.address, nftId)
    );

    // maker borrows DAI
    await borrowAndValidate(dai, "800", maker);

    await expect(
      executeSeaportBuyWithCredit(
        nBAYC,
        dai,
        startAmount,
        endAmount,
        payLaterAmount,
        nftId,
        maker,
        taker
      )
    ).to.be.revertedWith(
      ProtocolErrors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
    );
  });

  it("TC-erc721-buy-17: Buy with credit is not possible without enough liquidity in the pool", async () => {
    const {
      bayc,
      dai,
      pool,
      mayc,
      users: [maker, taker],
    } = await loadFixture(fixture);

    // taker supplies MAYC and borrows 1100 DAI, so 100 are left in protocol liquidity
    await supplyAndValidate(mayc, "1", taker, true);
    await borrowAndValidate(dai, "1100", taker);

    await waitForTx(
      await dai.connect(taker.signer).approve(pool.address, startAmount)
    );

    // then maker tries to pay later another 200 DAI
    await expect(
      executeSeaportBuyWithCredit(
        bayc,
        dai,
        startAmount,
        endAmount,
        payLaterAmount,
        nftId,
        maker,
        taker
      )
    ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
  });

  it("TC-erc721-buy-18: Cannot purchase a non-matching NFT id", async () => {
    const {
      bayc,
      dai,
      users: [maker, taker],
    } = await loadFixture(fixture);

    // try to buy NFT id = 1, not listed
    await expect(
      executeSeaportBuyWithCredit(
        bayc,
        dai,
        startAmount,
        endAmount,
        payLaterAmount,
        1,
        maker,
        taker
      )
    ).to.be.revertedWith("ERC721: owner query for nonexistent token");
  });

  it("TC-erc721-buy-19: Cannot perform same purchase twice", async () => {
    const {
      bayc,
      dai,
      users: [maker, taker],
    } = await loadFixture(fixture);

    await executeSeaportBuyWithCredit(
      bayc,
      dai,
      startAmount,
      endAmount,
      payLaterAmount,
      nftId,
      maker,
      taker
    );
    // try same purchase again, and expect reverted
    await expect(
      executeSeaportBuyWithCredit(
        bayc,
        dai,
        startAmount,
        endAmount,
        payLaterAmount,
        nftId,
        maker,
        taker
      )
    ).to.be.revertedWith(
      "ERC721: approve caller is not owner nor approved for all"
    );
  });

  it("TC-erc721-buy-20: Cannot proceed with purchase using a unsupported currency", async () => {
    const {
      bayc,
      pDai,
      users: [maker, taker],
    } = await loadFixture(fixture);

    // use aDai contract as purchase currency
    await expect(
      executeSeaportBuyWithCredit(
        bayc,
        pDai as unknown as MintableERC20,
        startAmount,
        endAmount,
        payLaterAmount,
        nftId,
        maker,
        taker
      )
    ).to.be.revertedWith(ProtocolErrors.ASSET_NOT_LISTED);
  });

  it("TC-erc721-buy-21: Cannot pay later an amount above the NFT's LTV", async () => {
    const {
      bayc,
      dai,
      paraspaceOracle,
      users: [maker, taker],
      protocolDataProvider,
    } = await loadFixture(fixture);

    // drop NFT price enough so that the NFT cannot cover a paylater of 200 DAI
    await changePriceAndValidate(bayc, "0.5");

    const nftPrice = await paraspaceOracle.getAssetPrice(bayc.address);
    const ltvRatio = (
      await protocolDataProvider.getReserveConfigurationData(bayc.address)
    ).ltv;
    const availableToBorrowInBaseUnits = nftPrice.percentMul(ltvRatio);
    const daiPrice = await paraspaceOracle.getAssetPrice(dai.address);
    // this is how much DAI I can borrow by putting this NFT in collateral
    const availableToBorrowInDai = await convertToCurrencyDecimals(
      dai.address,
      availableToBorrowInBaseUnits.div(daiPrice).toString()
    );

    // ensure the LTV cannot cover the credit
    expect(availableToBorrowInDai).to.be.lt(payLaterAmount);

    await expect(
      executeSeaportBuyWithCredit(
        bayc,
        dai,
        startAmount,
        endAmount,
        payLaterAmount,
        nftId,
        maker,
        taker
      )
    ).to.be.revertedWith(COLLATERAL_CANNOT_COVER_NEW_BORROW);
  });

  it("TC-erc721-buy-22: Cannot purchase the NFT if the order price is greater than taker's balance + pay later amount", async () => {
    const {
      bayc,
      dai,
      users: [maker, taker],
    } = await loadFixture(fixture);

    payLaterAmount = await convertToCurrencyDecimals(dai.address, "50"); // credit amount that won't be enough for purchase
    await expect(
      executeSeaportBuyWithCredit(
        bayc,
        dai,
        startAmount,
        endAmount,
        payLaterAmount,
        nftId,
        maker,
        taker
      )
    ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
  });
});
