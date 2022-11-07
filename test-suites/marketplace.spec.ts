import {expect} from "chai";
import {
  DRE,
  evmRevert,
  evmSnapshot,
  waitForTx,
} from "../deploy/helpers/misc-utils";
import {
  convertToCurrencyDecimals,
  createSeaportOrder,
  getEthersSigners,
} from "../deploy/helpers/contracts-helpers";
import {TestEnv} from "./helpers/make-suite";
import {AdvancedOrder} from "../deploy/helpers/seaport-helpers/types";
import {
  getItemETH,
  getOfferOrConsiderationItem,
  toBN,
} from "../deploy/helpers/seaport-helpers/encoding";
import {createOrder, createRunput} from "../deploy/helpers/x2y2-helpers";
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
} from "../deploy/helpers/constants";
import {formatEther, parseEther, splitSignature} from "ethers/lib/utils";
import {BigNumber, BigNumberish, constants} from "ethers";
import {
  borrowAndValidate,
  changePriceAndValidate,
  mintAndValidate,
  supplyAndValidate,
  switchCollateralAndValidate,
} from "./helpers/validated-steps";
import {MintableERC20} from "../types";
import {
  getMintableERC20,
  getMintableERC721,
} from "../deploy/helpers/contracts-getters";
import {ProtocolErrors} from "../deploy/helpers/types";
import {
  executeLooksrareBuyWithCredit,
  executeSeaportBuyWithCredit,
  executeX2Y2BuyWithCredit,
} from "./helpers/marketplace-helper";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {AdvancedOrderStruct} from "../types/dependencies/seaport/contracts/Seaport";

describe("Leveraged Buy - Positive tests", () => {
  let snapShot: string;
  let testEnv: TestEnv;

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
  });
  beforeEach(async () => {
    snapShot = await evmSnapshot();
  });

  afterEach(async () => {
    await evmRevert(snapShot);
  });

  it("ERC721 <=> ERC20 via seaport - no loan", async () => {
    const {
      bayc,
      usdt,
      conduit,
      seaport,
      pausableZone,
      conduitKey,
      users: [maker, taker],
    } = testEnv;
    const startAmount = await convertToCurrencyDecimals(usdt.address, "1000");
    const endAmount = startAmount; // fixed price, offerer can afford this
    const nftId = 0;

    // mint USDT to offerer
    const mintableUsdt = await getMintableERC20(usdt.address);
    await waitForTx(
      await mintableUsdt.connect(taker.signer)["mint(uint256)"](startAmount)
    );
    expect(await usdt.balanceOf(taker.address)).to.be.equal(startAmount);

    // mint BAYC to offer
    const mintableBayc = await getMintableERC721(bayc.address);
    await waitForTx(
      await mintableBayc.connect(maker.signer)["mint(address)"](maker.address)
    );
    expect(await bayc.balanceOf(maker.address)).to.be.equal(1);
    expect(await bayc.ownerOf(nftId)).to.be.equal(maker.address);

    // approve BAYC to be transferred by seaport
    // approve USDT to be transferred by seaport
    await waitForTx(
      await bayc.connect(maker.signer).approve(conduit.address, nftId)
    );
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

    // middleman call seaport to match offer, offerer orders
    const tx = seaport
      .connect(taker.signer)
      .fulfillAdvancedOrder(
        await getSellOrder(),
        [],
        conduitKey,
        taker.address
      );

    await (await tx).wait();

    expect(await bayc.balanceOf(taker.address)).to.be.equal(1);
    expect(await bayc.ownerOf(nftId)).to.be.equal(taker.address);
    expect(await usdt.balanceOf(maker.address)).to.be.equal(startAmount);
  });

  it("ERC721 <=> ERC20 via paraspace (1% platform fee) - partial borrow", async () => {
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
    } = testEnv;
    const payNowAmount = await convertToCurrencyDecimals(usdc.address, "800");
    const creditAmount = await convertToCurrencyDecimals(usdc.address, "200");
    const startAmount = payNowAmount.add(creditAmount);
    const endAmount = startAmount; // fixed price but offerer cannot afford this
    const nftId = "0";

    // mint USDC to offerer and middleman
    const mintableUsdc = await getMintableERC20(usdc.address);
    await waitForTx(
      await mintableUsdc
        .connect(middleman.signer)
        ["mint(uint256)"](creditAmount)
    );
    await waitForTx(
      await mintableUsdc.connect(taker.signer)["mint(uint256)"](payNowAmount)
    );
    expect(await usdc.balanceOf(taker.address)).to.be.equal(payNowAmount);
    expect(await usdc.balanceOf(middleman.address)).to.be.equal(creditAmount);

    // middleman supplies USDC to pool to be borrowed by offerer later
    await waitForTx(
      await usdc.connect(middleman.signer).approve(pool.address, creditAmount)
    );
    await waitForTx(
      await pool
        .connect(middleman.signer)
        .supply(usdc.address, creditAmount, middleman.address, 0)
    );

    expect(
      await usdc.balanceOf(
        (
          await pool.getReserveData(usdc.address)
        ).xTokenAddress
      )
    ).to.be.equal(creditAmount);

    const mintableMayc = await getMintableERC721(mayc.address);
    await waitForTx(
      await mintableMayc.connect(maker.signer)["mint(address)"](maker.address)
    );
    expect(await mayc.ownerOf(nftId)).to.be.equal(maker.address);

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

    const tx = pool.connect(taker.signer).buyWithCredit(
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
    );

    await (await tx).wait();

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

  it("ERC721 <=> ERC20 via paraspace - full borrow", async () => {
    const {
      bayc,
      nBAYC,
      usdc,
      pool,
      users: [maker, taker, middleman],
    } = testEnv;
    const middlemanInitialBalance = "1000";
    const payLaterAmount = await convertToCurrencyDecimals(
      usdc.address,
      "1000"
    );
    const startAmount = payLaterAmount;
    const endAmount = startAmount; // fixed price but taker cannot afford this
    const nftId = 0;

    // mint USDC to middleman (liquidity provider)
    await mintAndValidate(usdc, middlemanInitialBalance, middleman);

    // middleman supplies USDC to pool to be borrowed by taker later
    await supplyAndValidate(usdc, middlemanInitialBalance, middleman);

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

  it("ERC721 <=> ERC20 via looksrare - partial borrow", async () => {
    const {
      doodles,
      dai,
      pool,
      users: [maker, taker, middleman],
    } = testEnv;
    const payNowAmount = await convertToCurrencyDecimals(dai.address, "800");
    const creditAmount = await convertToCurrencyDecimals(dai.address, "200");
    const startAmount = payNowAmount.add(creditAmount);
    const nftId = 0;

    const mintableDai = await getMintableERC20(dai.address);
    await waitForTx(
      await mintableDai.connect(middleman.signer)["mint(uint256)"](creditAmount)
    );
    await waitForTx(
      await mintableDai.connect(taker.signer)["mint(uint256)"](payNowAmount)
    );
    expect(await dai.balanceOf(taker.address)).to.be.equal(payNowAmount);
    expect(await dai.balanceOf(middleman.address)).to.be.equal(creditAmount);

    await waitForTx(
      await dai.connect(middleman.signer).approve(pool.address, creditAmount)
    );
    await waitForTx(
      await pool
        .connect(middleman.signer)
        .supply(dai.address, creditAmount, middleman.address, 0)
    );

    expect(
      await dai.balanceOf(
        (
          await pool.getReserveData(dai.address)
        ).xTokenAddress
      )
    ).to.be.equal(creditAmount);

    const mintableDoodles = await getMintableERC721(doodles.address);
    await waitForTx(
      await mintableDoodles
        .connect(maker.signer)
        ["mint(address)"](maker.address)
    );

    expect(await doodles.ownerOf(nftId)).to.be.equal(maker.address);

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

  it("ERC721 can be sold for ERC20 via Looksrare using PayLater (full borrow)", async () => {
    const {
      doodles,
      dai,
      pool,
      users: [maker, taker, middleman],
    } = testEnv;
    const middlemanInitialBalance = "200";
    const payLaterAmount = await convertToCurrencyDecimals(
      dai.address,
      middlemanInitialBalance
    );
    const startAmount = payLaterAmount;
    const nftId = 0;

    // mint DAI to middleman (liquidity provider)
    await mintAndValidate(dai, middlemanInitialBalance, middleman);
    // middleman supplies DAI to the pool
    await supplyAndValidate(dai, middlemanInitialBalance, middleman);

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

  it("ERC721 <=> ETH via paraspace (1% platform fee) - partial borrow [ @skip-on-coverage ]", async () => {
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
    } = testEnv;
    const masGasFeeLeft = parseEther("5");
    const payNowAmount = (await taker.signer.getBalance()).sub(masGasFeeLeft);
    const creditAmount = parseEther("2");
    const startAmount = payNowAmount.add(creditAmount);
    const refundAmount = parseEther("1");
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
    const mintableMayc = await getMintableERC721(mayc.address);
    await waitForTx(
      await mintableMayc.connect(maker.signer)["mint(address)"](maker.address)
    );
    expect(await mayc.ownerOf(nftId)).to.be.equal(maker.address);

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
    const tx = pool.connect(taker.signer).buyWithCredit(
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
    );

    const txReceipt = await (await tx).wait();
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

  it("ERC721 <=> WETH via paraspace (1% platform fee) - partial borrow [ @skip-on-coverage ]", async () => {
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
    } = testEnv;
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
    const mintableMayc = await getMintableERC721(mayc.address);
    await waitForTx(
      await mintableMayc.connect(maker.signer)["mint(address)"](maker.address)
    );
    expect(await mayc.ownerOf(nftId)).to.be.equal(maker.address);

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
    const tx = pool.connect(taker.signer).buyWithCredit(
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
    );

    const txReceipt = await (await tx).wait();
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

  it("ERC721 <=> ETH batch buy via paraspace [ @skip-on-coverage ]", async () => {
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
    } = testEnv;
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

    const tx = pool
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
      );

    const txReceipt = await (await tx).wait();
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

  it("ERC721 <=> WETH/ETH batch buy via paraspace [ @skip-on-coverage ]", async () => {
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
    } = testEnv;
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

    const tx = pool
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
      );

    const txReceipt = await (await tx).wait();
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

  it("NToken(collateralized) <=> ERC20 via paraspace - partial borrow", async () => {
    const {
      bayc,
      nBAYC,
      usdc,
      pool,
      users: [maker, taker, middleman],
    } = testEnv;
    const payNowAmount = await convertToCurrencyDecimals(usdc.address, "800");
    const creditAmount = await convertToCurrencyDecimals(usdc.address, "200");
    const startAmount = payNowAmount.add(creditAmount);
    const endAmount = startAmount; // fixed price but offerer cannot afford this
    const nftId = 0;

    // mint USDT to taker and middleman
    const mintableUsdc = await getMintableERC20(usdc.address);
    await waitForTx(
      await mintableUsdc
        .connect(middleman.signer)
        ["mint(uint256)"](creditAmount)
    );
    await waitForTx(
      await mintableUsdc.connect(taker.signer)["mint(uint256)"](payNowAmount)
    );
    expect(await usdc.balanceOf(taker.address)).to.be.equal(payNowAmount);
    expect(await usdc.balanceOf(middleman.address)).to.be.equal(creditAmount);

    // middleman supplies USDC to pool to be borrowed by offerer later
    await waitForTx(
      await usdc.connect(middleman.signer).approve(pool.address, creditAmount)
    );
    await waitForTx(
      await pool
        .connect(middleman.signer)
        .supply(usdc.address, creditAmount, middleman.address, 0)
    );

    expect(
      await usdc.balanceOf(
        (
          await pool.getReserveData(usdc.address)
        ).xTokenAddress
      )
    ).to.be.equal(creditAmount);

    const mintableBayc = await getMintableERC721(bayc.address);
    await waitForTx(
      await mintableBayc.connect(maker.signer)["mint(address)"](maker.address)
    );
    expect(await bayc.ownerOf(nftId)).to.be.equal(maker.address);

    await waitForTx(
      await bayc.connect(maker.signer).approve(pool.address, nftId)
    );
    await waitForTx(
      await pool
        .connect(maker.signer)
        .supplyERC721(
          bayc.address,
          [{tokenId: nftId, useAsCollateral: true}],
          maker.address,
          0
        )
    );

    expect(await nBAYC.ownerOf(nftId)).to.be.equal(maker.address);
    expect(await nBAYC.collateralizedBalanceOf(maker.address)).to.be.equal(1);

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

  it("NToken(uncollateralized) <=> ERC20 via paraspace", async () => {
    const {
      bayc,
      nBAYC,
      usdc,
      pausableZone,
      seaport,
      pool,
      conduit,
      conduitKey,
      users: [offer, offerer, middleman],
    } = testEnv;
    const payNowAmount = await convertToCurrencyDecimals(usdc.address, "800");
    const creditAmount = await convertToCurrencyDecimals(usdc.address, "200");
    const startAmount = payNowAmount.add(creditAmount);
    const endAmount = startAmount; // fixed price but offerer cannot afford this
    const nftId = "0";

    // mint USDT to offerer and middleman
    const mintableUsdt = await getMintableERC20(usdc.address);
    await waitForTx(
      await mintableUsdt
        .connect(middleman.signer)
        ["mint(uint256)"](creditAmount)
    );
    await waitForTx(
      await mintableUsdt.connect(offerer.signer)["mint(uint256)"](payNowAmount)
    );
    expect(await usdc.balanceOf(offerer.address)).to.be.equal(payNowAmount);
    expect(await usdc.balanceOf(middleman.address)).to.be.equal(creditAmount);

    // middleman supplies USDT to pool to be borrowed by offerer later
    await waitForTx(
      await usdc.connect(middleman.signer).approve(pool.address, creditAmount)
    );
    await waitForTx(
      await pool
        .connect(middleman.signer)
        .supply(usdc.address, creditAmount, middleman.address, 0)
    );

    expect(
      await usdc.balanceOf(
        (
          await pool.getReserveData(usdc.address)
        ).xTokenAddress
      )
    ).to.be.equal(creditAmount);

    const mintableBayc = await getMintableERC721(bayc.address);
    await waitForTx(
      await mintableBayc.connect(offer.signer)["mint(address)"](offer.address)
    );
    expect(await bayc.ownerOf(nftId)).to.be.equal(offer.address);

    await waitForTx(
      await bayc.connect(offer.signer).approve(pool.address, nftId)
    );
    await waitForTx(
      await pool
        .connect(offer.signer)
        .supplyERC721(
          bayc.address,
          [{tokenId: nftId, useAsCollateral: false}],
          offer.address,
          0
        )
    );

    expect(await nBAYC.ownerOf(nftId)).to.be.equal(offer.address);
    expect(await nBAYC.collateralizedBalanceOf(offer.address)).to.be.equal(0);

    await waitForTx(
      await nBAYC.connect(offer.signer).approve(conduit.address, nftId)
    );

    await waitForTx(
      await usdc.connect(offerer.signer).approve(pool.address, startAmount)
    );

    const getSellOrder = async (): Promise<AdvancedOrder> => {
      const offers = [
        getOfferOrConsiderationItem(2, nBAYC.address, nftId, toBN(1), toBN(1)),
      ];

      const considerations = [
        getOfferOrConsiderationItem(
          1,
          usdc.address,
          toBN(0),
          startAmount,
          endAmount,
          offer.address
        ),
      ];

      return createSeaportOrder(
        seaport,
        offer,
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

    const tx = pool.connect(offerer.signer).buyWithCredit(
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
    );

    await (await tx).wait();

    expect(await nBAYC.ownerOf(nftId)).to.be.equal(offerer.address);
    expect(await nBAYC.collateralizedBalanceOf(offerer.address)).to.be.equal(1);
    expect(await usdc.balanceOf(offer.address)).to.be.equal(startAmount);
  });

  it("(ERC721 & ERC721) <=> ERC20 via looksrare and x2y2 - partial borrow", async () => {
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
    } = testEnv;

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

    const credit = "1000";
    const creditAmount = await convertToCurrencyDecimals(dai.address, credit);
    const startAmountX2Y2 = creditAmount;
    const nftIdX2Y2 = 1;

    // mint DOODLE to maker
    await mintAndValidate(doodles, "2", maker);
    // middleman supplies DAI
    await supplyAndValidate(dai, credit, middleman, true);

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

    const order = await createOrder({
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

    const tx = pool.connect(taker.signer).batchBuyWithCredit(
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
    );

    await (await tx).wait();

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

  it("ERC721 <=> ERC20 via x2y2 - partial borrow", async () => {
    const {
      doodles,
      dai,
      x2y2r1,
      deployer,
      pool,
      users: [maker, taker, middleman],
    } = testEnv;
    waitForTx(
      await x2y2r1
        .connect(deployer.signer)
        .updateSigners([middleman.address], [])
    );
    const payNowAmount = await convertToCurrencyDecimals(dai.address, "800");
    const creditAmount = await convertToCurrencyDecimals(dai.address, "200");
    const startAmount = payNowAmount.add(creditAmount);
    const nftId = 0;

    const mintableDai = await getMintableERC20(dai.address);
    await waitForTx(
      await mintableDai.connect(middleman.signer)["mint(uint256)"](creditAmount)
    );
    await waitForTx(
      await mintableDai.connect(taker.signer)["mint(uint256)"](payNowAmount)
    );
    expect(await dai.balanceOf(taker.address)).to.be.equal(payNowAmount);
    expect(await dai.balanceOf(middleman.address)).to.be.equal(creditAmount);

    await waitForTx(
      await dai.connect(middleman.signer).approve(pool.address, creditAmount)
    );
    await waitForTx(
      await pool
        .connect(middleman.signer)
        .supply(dai.address, creditAmount, middleman.address, 0)
    );

    expect(
      await dai.balanceOf(
        (
          await pool.getReserveData(dai.address)
        ).xTokenAddress
      )
    ).to.be.equal(creditAmount);

    const mintableDoodles = await getMintableERC721(doodles.address);
    await waitForTx(
      await mintableDoodles
        .connect(maker.signer)
        ["mint(address)"](maker.address)
    );

    expect(await doodles.ownerOf(nftId)).to.be.equal(maker.address);

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

  it("ERC721 <=> ERC20 via x2y2 - full borrow", async () => {
    const {
      doodles,
      dai,
      pool,
      deployer,
      users: [maker, taker, middleman],
    } = testEnv;
    const credit = "1000";
    const creditAmount = await convertToCurrencyDecimals(dai.address, credit);
    const startAmount = creditAmount;
    const nftId = 0;

    // mint DOODLE to maker
    await mintAndValidate(doodles, "1", maker);
    // middleman supplies DAI to the pool
    await supplyAndValidate(dai, credit, middleman, true);

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

  it("ERC721 <=> ERC20 via Looksrare - no loan", async () => {
    const {
      doodles,
      dai,
      transferManagerERC721,
      pool,
      users: [maker, taker],
    } = testEnv;
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

    expect(
      await executeLooksrareBuyWithCredit(
        doodles,
        dai,
        startAmount,
        payLaterAmount,
        nftId,
        maker,
        taker
      )
    );
  });
});

describe("Leveraged Buy - Negative tests", () => {
  const nftId = 0;
  let startAmount: BigNumber;
  let endAmount: BigNumber;
  let payLaterAmount: BigNumber;
  const {COLLATERAL_CANNOT_COVER_NEW_BORROW} = ProtocolErrors;
  let testEnv: TestEnv;
  before(async () => {
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
    payLaterAmount = await convertToCurrencyDecimals(dai.address, "200");
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
  });

  let snapShot: string;
  beforeEach(async () => {
    snapShot = await evmSnapshot();
  });

  afterEach(async () => {
    await evmRevert(snapShot);
  });

  it("Cannot purchase nToken in collateral covering an ongoing borrow position", async () => {
    const {
      bayc,
      nBAYC,
      dai,
      conduit,
      users: [maker, taker],
    } = testEnv;

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

  it("Buy with credit is not possible without enough liquidity in the pool", async () => {
    const {
      bayc,
      dai,
      pool,
      mayc,
      users: [maker, taker],
    } = testEnv;

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

  it("Cannot purchase a non-matching NFT id", async () => {
    const {
      bayc,
      dai,
      users: [maker, taker],
    } = testEnv;

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

  it("Cannot perform same purchase twice", async () => {
    const {
      bayc,
      dai,
      users: [maker, taker],
    } = testEnv;

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

  it("Cannot proceed with purchase using a unsupported currency", async () => {
    const {
      bayc,
      pDai,
      users: [maker, taker],
    } = testEnv;

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

  it("Cannot pay later an amount above the NFT's LTV", async () => {
    const {
      bayc,
      dai,
      users: [maker, taker],
      paraspaceOracle,
      protocolDataProvider,
    } = testEnv;
    const [deployer] = await getEthersSigners();

    // drop NFT price enough so that the NFT cannot cover a paylater of 200 DAI
    await changePriceAndValidate(bayc, "0.5");

    const nftPrice = await paraspaceOracle
      .connect(deployer)
      .getAssetPrice(bayc.address);
    const ltvRatio = (
      await protocolDataProvider.getReserveConfigurationData(bayc.address)
    ).ltv;
    const availableToBorrowInBaseUnits = nftPrice.mul(ltvRatio).div(10000);
    const daiPrice = await paraspaceOracle
      .connect(deployer)
      .getAssetPrice(dai.address);
    // this is how much DAI I can borrow by putting this NFT in collateral
    const availableToBorrowInDai =
      +formatEther(availableToBorrowInBaseUnits.toString()) /
      +formatEther(daiPrice.toString());

    // ensure the LTV cannot cover the credit
    expect(Math.floor(availableToBorrowInDai)).to.be.lt(payLaterAmount);

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

  it("Cannot purchase the NFT if the order price is greater than taker's balance + pay later amount", async () => {
    const {
      bayc,
      dai,
      users: [maker, taker],
    } = testEnv;
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
