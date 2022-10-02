import {expect} from "chai";
import {evmRevert, evmSnapshot, waitForTx} from "../deploy/helpers/misc-utils";
import {
  convertToCurrencyDecimals,
  createSeaportOrder,
} from "../deploy/helpers/contracts-helpers";
import {makeSuite} from "./helpers/make-suite";
import creditType from "../deploy/helpers/eip-712-types/credit";
import {
  getMintableERC20,
  getMintableERC721,
  getParaSpaceOracle,
} from "../deploy/helpers/contracts-getters";
import {AdvancedOrder} from "../deploy/helpers/seaport-helpers/types";
import {
  convertSignatureToEIP2098,
  getItemETH,
  getOfferOrConsiderationItem,
  toBN,
  toFulfillment,
  toKey,
  buildResolver,
} from "../deploy/helpers/seaport-helpers/encoding";
import {ethers} from "hardhat";
import {
  generateMakerOrderTypedData,
  MakerOrder,
  MakerOrderWithSignature,
  MakerOrderWithVRS,
  TakerOrder,
} from "@looksrare/sdk";
import {createOrder, createRunput} from "../deploy/helpers/x2y2-helpers";
import {
  LOOKSRARE_ID,
  PARASPACE_SEAPORT_ID,
  X2Y2_ID,
} from "../deploy/helpers/constants";
import {parseEther} from "ethers/lib/utils";
import {BigNumber, constants} from "ethers";
import {merkleTree} from "../deploy/helpers/seaport-helpers/criteria";

makeSuite("Credit", (testEnv) => {
  let snapShot: string;
  beforeEach(async () => {
    snapShot = await evmSnapshot();
  });

  afterEach(async () => {
    await evmRevert(snapShot);
  });

  it("ERC721 <=> ERC20 via seaport", async () => {
    const {
      bayc,
      usdt,
      conduit,
      conduitKey,
      pausableZone,
      seaport,
      users: [offer, offerer],
    } = testEnv;
    const startAmount = await convertToCurrencyDecimals(usdt.address, "1000");
    const endAmount = startAmount; // fixed price, offerer can afford this
    const nftId = "0";

    // mint USDT to offerer
    const mintableUsdt = await getMintableERC20(usdt.address);
    await waitForTx(
      await mintableUsdt.connect(offerer.signer)["mint(uint256)"](startAmount)
    );
    expect(await usdt.balanceOf(offerer.address)).to.be.equal(startAmount);

    // mint BAYC to offer
    const mintableBayc = await getMintableERC721(bayc.address);
    await waitForTx(
      await mintableBayc.connect(offer.signer)["mint(address)"](offer.address)
    );
    expect(await bayc.balanceOf(offer.address)).to.be.equal(1);
    expect(await bayc.ownerOf(nftId)).to.be.equal(offer.address);

    // approve BAYC to be transferred by seaport
    // approve USDT to be transferred by seaport
    await waitForTx(
      await bayc.connect(offer.signer).approve(conduit.address, nftId)
    );
    await waitForTx(
      await usdt.connect(offerer.signer).approve(conduit.address, startAmount)
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

    // middleman call seaport to match offer, offerer orders
    const tx = seaport
      .connect(offerer.signer)
      .fulfillAdvancedOrder(
        await getSellOrder(),
        [],
        conduitKey,
        offerer.address
      );

    await (await tx).wait();

    expect(await bayc.balanceOf(offerer.address)).to.be.equal(1);
    expect(await bayc.ownerOf(nftId)).to.be.equal(offerer.address);
    expect(await usdt.balanceOf(offer.address)).to.be.equal(startAmount);
  });

  it("ERC721 <=> ERC20 via paraspace (1% platform fee)", async () => {
    const {
      mayc,
      nMAYC,
      usdc,
      conduit,
      conduitKey,
      pausableZone,
      seaport,
      pool,
      users: [offer, offerer, middleman, platform],
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
      await mintableUsdc.connect(offerer.signer)["mint(uint256)"](payNowAmount)
    );
    expect(await usdc.balanceOf(offerer.address)).to.be.equal(payNowAmount);
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
      await mintableMayc.connect(offer.signer)["mint(address)"](offer.address)
    );
    expect(await mayc.ownerOf(nftId)).to.be.equal(offer.address);

    // approve
    await waitForTx(
      await mayc.connect(offer.signer).approve(conduit.address, nftId)
    );
    await waitForTx(
      await usdc.connect(offerer.signer).approve(pool.address, payNowAmount)
    );

    //before buyWithCredit there is no collateral
    let totalCollateralBase = (await pool.getUserAccountData(offerer.address))
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
          offer.address
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
      [await getSellOrder(), [], toKey(0), pool.address]
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
      offerer.address,
      0,
      {
        gasLimit: 5000000,
      }
    );

    await (await tx).wait();

    expect(await mayc.balanceOf(offerer.address)).to.be.equal(0);
    expect(await mayc.ownerOf(nftId)).to.be.equal(
      (await pool.getReserveData(mayc.address)).xTokenAddress
    );
    expect(await usdc.balanceOf(offer.address)).to.be.equal(
      startAmount.sub(startAmount.div(100))
    );
    expect(await usdc.balanceOf(platform.address)).to.be.equal(
      startAmount.div(100)
    );

    //after buyWithCredit offerer will have ntoken as collateral
    const nMaycBalance = await nMAYC.balanceOf(offerer.address);
    expect(nMaycBalance).to.be.equal(1);
    totalCollateralBase = (await pool.getUserAccountData(offerer.address))
      .availableBorrowsBase;
    expect(totalCollateralBase).to.be.gt(0);
  });

  it("ERC721 <=> ERC20 via looksrare", async () => {
    const {
      doodles,
      dai,
      looksRareExchange,
      strategyStandardSaleForFixedPrice,
      transferManagerERC721,
      pool,
      users: [maker, taker, middleman],
    } = testEnv;
    const payNowAmount = await convertToCurrencyDecimals(dai.address, "800");
    const creditAmount = await convertToCurrencyDecimals(dai.address, "200");
    const startAmount = payNowAmount.add(creditAmount);
    const nftId = "0";

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
      await doodles
        .connect(maker.signer)
        .approve(transferManagerERC721.address, nftId)
    );
    await waitForTx(
      await dai.connect(taker.signer).approve(pool.address, payNowAmount)
    );

    const signer = ethers.provider.getSigner(maker.address);
    const chainId = await maker.signer.getChainId();
    const nonce = await maker.signer.getTransactionCount();

    const now = Math.floor(Date.now() / 1000);
    const paramsValue = [];
    const makerOrder: MakerOrder = {
      isOrderAsk: true,
      signer: maker.address,
      collection: doodles.address,
      price: startAmount,
      tokenId: nftId,
      amount: "1",
      strategy: strategyStandardSaleForFixedPrice.address,
      currency: dai.address,
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

    const vrs = ethers.utils.splitSignature(makerOrderWithSignature.signature);

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

    const encodedData = looksRareExchange.interface.encodeFunctionData(
      "matchAskWithTakerBid",
      [takerOrder, makerOrderWithVRS]
    );

    const tx = pool.connect(taker.signer).buyWithCredit(
      LOOKSRARE_ID,
      `0x${encodedData.slice(10)}`,
      {
        token: dai.address,
        amount: creditAmount,
        orderId: constants.HashZero,
        v: 0,
        r: constants.HashZero,
        s: constants.HashZero,
      },
      taker.address,
      0,
      {
        gasLimit: 5000000,
      }
    );

    await (await tx).wait();

    expect(await doodles.balanceOf(taker.address)).to.be.equal(0);
    expect(await doodles.ownerOf(nftId)).to.be.equal(
      (await pool.getReserveData(doodles.address)).xTokenAddress
    );
    expect(await dai.balanceOf(maker.address)).to.be.equal(startAmount);
  });

  it("ERC721 <=> ETH via paraspace (1% platform fee) [ @skip-on-coverage ]", async () => {
    const {
      mayc,
      conduit,
      conduitKey,
      pausableZone,
      seaport,
      pool,
      wETHGatewayProxy,
      weth,
      users: [offer, offerer, middleman, platform],
    } = testEnv;
    const masGasFeeLeft = parseEther("5");
    const payNowAmount = (await offerer.signer.getBalance()).sub(masGasFeeLeft);
    const creditAmount = parseEther("2");
    const startAmount = payNowAmount.add(creditAmount);
    const nftId = "0";

    // middleman supplies ETH to pool to be borrowed by offerer later
    await waitForTx(
      await wETHGatewayProxy
        .connect(middleman.signer)
        .depositETH(pool.address, middleman.address, 0, {
          value: creditAmount,
        })
    );

    expect(
      await weth.balanceOf(
        (
          await pool.getReserveData(weth.address)
        ).xTokenAddress
      )
    ).to.be.equal(creditAmount);

    const mintableMayc = await getMintableERC721(mayc.address);
    await waitForTx(
      await mintableMayc.connect(offer.signer)["mint(address)"](offer.address)
    );
    expect(await mayc.ownerOf(nftId)).to.be.equal(offer.address);

    // approve
    await waitForTx(
      await mayc.connect(offer.signer).approve(conduit.address, nftId)
    );
    const oldOfferBalance = await offer.signer.getBalance();
    const oldPlatformBalance = await platform.signer.getBalance();

    const getSellOrder = async (): Promise<AdvancedOrder> => {
      const offers = [
        getOfferOrConsiderationItem(2, mayc.address, nftId, toBN(1), toBN(1)),
      ];

      const considerations = [
        getItemETH(
          startAmount.sub(startAmount.div(100)),
          startAmount.sub(startAmount.div(100)),
          offer.address
        ),
        getItemETH(
          startAmount.div(100),
          startAmount.div(100),
          platform.address
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
        token: constants.AddressZero,
        amount: creditAmount,
        orderId: constants.HashZero,
        v: 0,
        r: constants.HashZero,
        s: constants.HashZero,
      },
      offerer.address,
      0,
      {
        gasLimit: 5000000,
        value: payNowAmount,
      }
    );

    await (await tx).wait();

    expect(await mayc.balanceOf(offerer.address)).to.be.equal(0);
    expect(await mayc.ownerOf(nftId)).to.be.equal(
      (await pool.getReserveData(mayc.address)).xTokenAddress
    );
    expect(await offer.signer.getBalance()).to.be.equal(
      startAmount.sub(startAmount.div(100)).add(oldOfferBalance)
    );
    expect(await platform.signer.getBalance()).to.be.equal(
      startAmount.div(100).add(oldPlatformBalance)
    );
  });

  it("NToken <=> ERC20 via paraspace", async () => {
    const {
      bayc,
      nBAYC,
      usdc,
      pausableZone,
      seaport,
      pool,
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
          [{tokenId: nftId, useAsCollateral: true}],
          offer.address,
          0
        )
    );

    expect(await nBAYC.ownerOf(nftId)).to.be.equal(offer.address);
    expect(await nBAYC.collaterizedBalanceOf(offer.address)).to.be.equal(1);

    await waitForTx(
      await nBAYC.connect(offer.signer).approve(seaport.address, nftId)
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
        pausableZone.address
      );
    };

    const encodedData = seaport.interface.encodeFunctionData(
      "fulfillAdvancedOrder",
      [await getSellOrder(), [], toKey(0), offerer.address]
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
      offerer.address,
      0,
      {
        gasLimit: 5000000,
      }
    );

    await (await tx).wait();

    expect(await nBAYC.ownerOf(nftId)).to.be.equal(offerer.address);
    expect(await nBAYC.collaterizedBalanceOf(offerer.address)).to.be.equal(1);
    expect(await usdc.balanceOf(offer.address)).to.be.equal(startAmount);
  });

  it("ERC20 <=> ERC721 via paraspace", async () => {
    const {
      mayc,
      usdc,
      conduitKey,
      conduit,
      pausableZone,
      seaport,
      pool,
      users: [offer, offerer, middleman],
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
      await mintableUsdc.connect(offer.signer)["mint(uint256)"](payNowAmount)
    );
    expect(await usdc.balanceOf(offer.address)).to.be.equal(payNowAmount);
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

    // mint MAYC
    const mintableMayc = await getMintableERC721(mayc.address);
    await waitForTx(
      await mintableMayc
        .connect(offerer.signer)
        ["mint(address)"](offerer.address)
    );
    expect(await mayc.ownerOf(nftId)).to.be.equal(offerer.address);

    // approve
    await waitForTx(
      await mayc.connect(offerer.signer).approve(conduit.address, nftId)
    );
    await waitForTx(
      await usdc.connect(offer.signer).approve(conduit.address, startAmount)
    );

    const getSellOrder = async (): Promise<AdvancedOrder> => {
      const offers = [
        getOfferOrConsiderationItem(
          1,
          usdc.address,
          toBN(0),
          startAmount,
          endAmount
        ),
      ];

      const considerations = [
        getOfferOrConsiderationItem(
          2,
          mayc.address,
          nftId,
          toBN(1),
          toBN(1),
          pool.address
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

    const getBuyOrder = async (): Promise<AdvancedOrder> => {
      const offers = [
        getOfferOrConsiderationItem(2, mayc.address, nftId, toBN(1), toBN(1)),
      ];

      const considerations = [
        getOfferOrConsiderationItem(
          1,
          usdc.address,
          toBN(0),
          startAmount,
          endAmount,
          offerer.address
        ),
      ];

      return createSeaportOrder(
        seaport,
        offerer,
        offers,
        considerations,
        2,
        pausableZone.address,
        conduitKey
      );
    };

    const fulfillment = [
      [[[0, 0]], [[1, 0]]],
      [[[1, 0]], [[0, 0]]],
    ].map(([offerArr, considerationArr]) =>
      toFulfillment(offerArr, considerationArr)
    );

    const sellOrder = await getSellOrder();
    const buyOrder = await getBuyOrder();

    const encodedData = seaport.interface.encodeFunctionData(
      "matchAdvancedOrders",
      [[sellOrder, buyOrder], [], fulfillment]
    );

    const domainData = {
      name: "ParaSpace",
      version: "1.1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: pool.address,
    };

    const credit = {
      token: usdc.address,
      amount: creditAmount,
      orderId: ethers.utils.arrayify(sellOrder.signature),
    };

    const signature = await ethers.provider
      .getSigner(offer.address)
      ._signTypedData(domainData, creditType, credit);

    const vrs = ethers.utils.splitSignature(
      convertSignatureToEIP2098(signature)
    );

    const tx = pool.connect(offerer.signer).acceptBidWithCredit(
      PARASPACE_SEAPORT_ID,
      `0x${encodedData.slice(10)}`,
      {
        ...credit,
        ...vrs,
      },
      offerer.address,
      0,
      {
        gasLimit: 5000000,
      }
    );

    await (await tx).wait();
    expect(await mayc.balanceOf(offerer.address)).to.be.equal(0);
    expect(await mayc.ownerOf(nftId)).to.be.equal(
      (await pool.getReserveData(mayc.address)).xTokenAddress
    );
    expect(await usdc.balanceOf(offerer.address)).to.be.equal(startAmount);
  });

  it("ERC20 <=> NToken via paraspace", async () => {
    const {
      bayc,
      nBAYC,
      usdc,
      conduitKey,
      conduit,
      pausableZone,
      seaport,
      pool,
      users: [offer, offerer, middleman],
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
      await mintableUsdc.connect(offer.signer)["mint(uint256)"](payNowAmount)
    );
    expect(await usdc.balanceOf(offer.address)).to.be.equal(payNowAmount);
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

    // mint BAYC
    const mintableBayc = await getMintableERC721(bayc.address);
    await waitForTx(
      await mintableBayc
        .connect(offerer.signer)
        ["mint(address)"](offerer.address)
    );
    expect(await bayc.ownerOf(nftId)).to.be.equal(offerer.address);

    await waitForTx(
      await bayc.connect(offerer.signer).approve(pool.address, nftId)
    );
    await waitForTx(
      await pool
        .connect(offerer.signer)
        .supplyERC721(
          bayc.address,
          [{tokenId: nftId, useAsCollateral: true}],
          offerer.address,
          0
        )
    );

    expect(await nBAYC.ownerOf(nftId)).to.be.equal(offerer.address);
    expect(await nBAYC.collaterizedBalanceOf(offerer.address)).to.be.equal(1);

    // approve
    await waitForTx(
      await nBAYC.connect(offerer.signer).approve(conduit.address, nftId)
    );
    await waitForTx(
      await usdc.connect(offer.signer).approve(conduit.address, startAmount)
    );

    // before acceptBidWithCredit totalCollateralBase for the offerer
    // is just the bayc
    const totalCollateralBaseBefore = (
      await pool.getUserAccountData(offerer.address)
    ).totalCollateralBase;
    const assetPrice = await (await getParaSpaceOracle())
      .connect(offerer.signer)
      .getAssetPrice(bayc.address);
    const depositedAmountInBaseUnits = BigNumber.from(1).mul(assetPrice);
    expect(totalCollateralBaseBefore).to.be.eq(depositedAmountInBaseUnits);
    // and there is no debt for offer
    const totalDebtBefore = (await pool.getUserAccountData(offer.address))
      .totalDebtBase;
    expect(totalDebtBefore).to.be.eq(0);

    const getSellOrder = async (): Promise<AdvancedOrder> => {
      const offers = [
        getOfferOrConsiderationItem(
          1,
          usdc.address,
          toBN(0),
          startAmount,
          endAmount
        ),
      ];

      const considerations = [
        getOfferOrConsiderationItem(
          2,
          nBAYC.address,
          nftId,
          toBN(1),
          toBN(1),
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

    const getBuyOrder = async (): Promise<AdvancedOrder> => {
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
          offerer.address
        ),
      ];

      return createSeaportOrder(
        seaport,
        offerer,
        offers,
        considerations,
        2,
        pausableZone.address,
        conduitKey
      );
    };

    const fulfillment = [
      [[[0, 0]], [[1, 0]]],
      [[[1, 0]], [[0, 0]]],
    ].map(([offerArr, considerationArr]) =>
      toFulfillment(offerArr, considerationArr)
    );

    const sellOrder = await getSellOrder();
    const buyOrder = await getBuyOrder();

    const encodedData = seaport.interface.encodeFunctionData(
      "matchAdvancedOrders",
      [[sellOrder, buyOrder], [], fulfillment]
    );

    const domainData = {
      name: "ParaSpace",
      version: "1.1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: pool.address,
    };

    const credit = {
      token: usdc.address,
      amount: creditAmount,
      orderId: ethers.utils.arrayify(sellOrder.signature),
    };

    const signature = await ethers.provider
      .getSigner(offer.address)
      ._signTypedData(domainData, creditType, credit);

    const vrs = ethers.utils.splitSignature(
      convertSignatureToEIP2098(signature)
    );

    const tx = pool.connect(offerer.signer).acceptBidWithCredit(
      PARASPACE_SEAPORT_ID,
      `0x${encodedData.slice(10)}`,
      {
        ...credit,
        ...vrs,
      },
      offerer.address,
      0,
      {
        gasLimit: 5000000,
      }
    );

    await (await tx).wait();
    expect(await nBAYC.balanceOf(offerer.address)).to.be.equal(0);
    expect(await nBAYC.ownerOf(nftId)).to.be.equal(offer.address);
    expect(await usdc.balanceOf(offerer.address)).to.be.equal(startAmount);

    // after the swap offer's totalCollateralBase should be same as offerer's before
    const totalCollateralBaseAfter = (
      await pool.getUserAccountData(offer.address)
    ).totalCollateralBase;
    expect(totalCollateralBaseAfter).to.be.eq(totalCollateralBaseBefore);
    // but has some debt now
    const totalDebtAfter = (await pool.getUserAccountData(offer.address))
      .totalDebtBase;
    expect(totalDebtAfter).to.be.gt(0);
  });

  it("ERC721 <=> ERC20 via x2y2", async () => {
    const {
      doodles,
      dai,
      x2y2r1,
      deployer,
      erc721Delegate,
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
    const nftId = "0";

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
      await doodles.connect(maker.signer).approve(erc721Delegate.address, nftId)
    );
    await waitForTx(
      await dai.connect(taker.signer).approve(pool.address, payNowAmount)
    );

    const now = Math.floor(Date.now() / 1000);

    const order = await createOrder({
      chainId: (await ethers.provider.getNetwork()).chainId,
      signer: maker.signer,
      tokenAddress: doodles.address,
      tokenId: +nftId,
      price: startAmount,
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

    const encodedData = x2y2r1.interface.encodeFunctionData("run", [input]);
    const tx = pool.connect(taker.signer).buyWithCredit(
      X2Y2_ID,
      `0x${encodedData.slice(10)}`,
      {
        token: dai.address,
        amount: creditAmount,
        orderId: constants.HashZero,
        v: 0,
        r: constants.HashZero,
        s: constants.HashZero,
      },
      taker.address,
      0,
      {
        gasLimit: 5000000,
      }
    );

    await (await tx).wait();

    expect(await doodles.balanceOf(taker.address)).to.be.equal(0);
    expect(await doodles.ownerOf(nftId)).to.be.equal(
      (await pool.getReserveData(doodles.address)).xTokenAddress
    );
    expect(await dai.balanceOf(maker.address)).to.be.equal(startAmount);
  });

  it("acceptBidWithCredit(collection bid)", async () => {
    const {
      mayc,
      usdc,
      conduitKey,
      conduit,
      pausableZone,
      seaport,
      pool,
      users: [buyer, seller, middleman],
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
      await mintableUsdc.connect(buyer.signer)["mint(uint256)"](payNowAmount)
    );
    expect(await usdc.balanceOf(buyer.address)).to.be.equal(payNowAmount);
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

    // mint MAYC
    const mintableMayc = await getMintableERC721(mayc.address);
    await waitForTx(
      await mintableMayc.connect(seller.signer)["mint(address)"](seller.address)
    );
    expect(await mayc.ownerOf(nftId)).to.be.equal(seller.address);

    // approve
    await waitForTx(
      await mayc.connect(seller.signer).approve(conduit.address, nftId)
    );
    await waitForTx(
      await usdc.connect(buyer.signer).approve(conduit.address, startAmount)
    );

    const getSellOrder = async (): Promise<AdvancedOrder> => {
      const offers = [
        getOfferOrConsiderationItem(2, mayc.address, nftId, toBN(1), toBN(1)),
      ];

      const considerations = [
        getOfferOrConsiderationItem(
          1,
          usdc.address,
          toBN(0),
          startAmount,
          endAmount,
          seller.address
        ),
      ];

      return createSeaportOrder(
        seaport,
        seller,
        offers,
        considerations,
        2,
        pausableZone.address,
        conduitKey
      );
    };

    const getBuyOrder = async (): Promise<AdvancedOrder> => {
      const offers = [
        getOfferOrConsiderationItem(1, usdc.address, 0, startAmount, endAmount),
      ];

      const considerations = [
        getOfferOrConsiderationItem(
          4,
          mayc.address,
          toBN(0),
          1,
          1,
          pool.address
        ),
      ];

      return createSeaportOrder(
        seaport,
        buyer,
        offers,
        considerations,
        2,
        pausableZone.address,
        conduitKey
      );
    };

    const fulfillment = [
      [[[0, 0]], [[1, 0]]],
      [[[1, 0]], [[0, 0]]],
    ].map(([offerArr, considerationArr]) =>
      toFulfillment(offerArr, considerationArr)
    );

    const sellOrder = await getSellOrder();
    const buyOrder = await getBuyOrder();

    const criteriaResolvers = [
      buildResolver(0, 1, 0, BigNumber.from(nftId), []),
    ];

    const encodedData = seaport.interface.encodeFunctionData(
      "matchAdvancedOrders",
      [[buyOrder, sellOrder], criteriaResolvers, fulfillment]
    );

    const domainData = {
      name: "ParaSpace",
      version: "1.1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: pool.address,
    };

    const credit = {
      token: usdc.address,
      amount: creditAmount,
      orderId: ethers.utils.arrayify(buyOrder.signature),
    };

    const signature = await ethers.provider
      .getSigner(buyer.address)
      ._signTypedData(domainData, creditType, credit);

    const vrs = ethers.utils.splitSignature(
      convertSignatureToEIP2098(signature)
    );

    const tx = pool.connect(seller.signer).acceptBidWithCredit(
      PARASPACE_SEAPORT_ID,
      `0x${encodedData.slice(10)}`,
      {
        ...credit,
        ...vrs,
      },
      seller.address,
      0,
      {
        gasLimit: 5000000,
      }
    );

    await (await tx).wait();
    expect(await mayc.balanceOf(seller.address)).to.be.equal(0);
    expect(await mayc.ownerOf(nftId)).to.be.equal(
      (await pool.getReserveData(mayc.address)).xTokenAddress
    );
    expect(await usdc.balanceOf(seller.address)).to.be.equal(startAmount);
  });

  it("acceptBidWithCredit(collection set bid)", async () => {
    const {
      mayc,
      usdc,
      conduitKey,
      conduit,
      pausableZone,
      seaport,
      pool,
      users: [buyer, seller, middleman],
    } = testEnv;
    const payNowAmount = await convertToCurrencyDecimals(usdc.address, "800");
    const creditAmount = await convertToCurrencyDecimals(usdc.address, "200");
    const startAmount = payNowAmount.add(creditAmount);
    const endAmount = startAmount; // fixed price but offerer cannot afford this
    const nftId1 = BigNumber.from(1);
    const nftId2 = BigNumber.from(2);
    const nftId3 = BigNumber.from(3);
    const tokenIds = [nftId1, nftId2, nftId3];
    const {root, proofs} = merkleTree(tokenIds);

    // mint USDC to offerer and middleman
    const mintableUsdc = await getMintableERC20(usdc.address);
    await waitForTx(
      await mintableUsdc
        .connect(middleman.signer)
        ["mint(uint256)"](creditAmount)
    );
    await waitForTx(
      await mintableUsdc.connect(buyer.signer)["mint(uint256)"](payNowAmount)
    );
    expect(await usdc.balanceOf(buyer.address)).to.be.equal(payNowAmount);
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

    // mint MAYC
    const mintableMayc = await getMintableERC721(mayc.address);
    for (let i = 0; i < 4; i++) {
      await waitForTx(
        await mintableMayc
          .connect(seller.signer)
          ["mint(address)"](seller.address)
      );
      expect(await mayc.ownerOf(i)).to.be.equal(seller.address);
    }
    expect(await mayc.balanceOf(seller.address)).to.be.equal(4);

    // approve
    await waitForTx(
      await mayc.connect(seller.signer).approve(conduit.address, nftId1)
    );
    await waitForTx(
      await usdc.connect(buyer.signer).approve(conduit.address, startAmount)
    );

    const getSellOrder = async (): Promise<AdvancedOrder> => {
      const offers = [
        getOfferOrConsiderationItem(2, mayc.address, nftId1, toBN(1), toBN(1)),
      ];

      const considerations = [
        getOfferOrConsiderationItem(
          1,
          usdc.address,
          toBN(0),
          startAmount,
          endAmount,
          seller.address
        ),
      ];

      return createSeaportOrder(
        seaport,
        seller,
        offers,
        considerations,
        2,
        pausableZone.address,
        conduitKey
      );
    };

    const getBuyOrder = async (): Promise<AdvancedOrder> => {
      const offers = [
        getOfferOrConsiderationItem(1, usdc.address, 0, startAmount, endAmount),
      ];

      const considerations = [
        getOfferOrConsiderationItem(4, mayc.address, root, 1, 1, pool.address),
      ];

      return createSeaportOrder(
        seaport,
        buyer,
        offers,
        considerations,
        2,
        pausableZone.address,
        conduitKey
      );
    };

    const fulfillment = [
      [[[0, 0]], [[1, 0]]],
      [[[1, 0]], [[0, 0]]],
    ].map(([offerArr, considerationArr]) =>
      toFulfillment(offerArr, considerationArr)
    );

    const sellOrder = await getSellOrder();
    const buyOrder = await getBuyOrder();

    const criteriaResolvers = [
      buildResolver(0, 1, 0, nftId1, proofs[nftId1.toString()]),
    ];

    const encodedData = seaport.interface.encodeFunctionData(
      "matchAdvancedOrders",
      [[buyOrder, sellOrder], criteriaResolvers, fulfillment]
    );

    const domainData = {
      name: "ParaSpace",
      version: "1.1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: pool.address,
    };

    const credit = {
      token: usdc.address,
      amount: creditAmount,
      orderId: ethers.utils.arrayify(buyOrder.signature),
    };

    const signature = await ethers.provider
      .getSigner(buyer.address)
      ._signTypedData(domainData, creditType, credit);

    const vrs = ethers.utils.splitSignature(
      convertSignatureToEIP2098(signature)
    );

    const tx = pool.connect(seller.signer).acceptBidWithCredit(
      PARASPACE_SEAPORT_ID,
      `0x${encodedData.slice(10)}`,
      {
        ...credit,
        ...vrs,
      },
      seller.address,
      0,
      {
        gasLimit: 5000000,
      }
    );

    await (await tx).wait();
    expect(await mayc.balanceOf(seller.address)).to.be.equal(3);
    expect(await mayc.ownerOf(nftId1)).to.be.equal(
      (await pool.getReserveData(mayc.address)).xTokenAddress
    );
    expect(await usdc.balanceOf(seller.address)).to.be.equal(startAmount);
  });

  it("acceptBidWithCredit(with 2 platform fee item)", async () => {
    const {
      mayc,
      usdc,
      conduitKey,
      conduit,
      pausableZone,
      seaport,
      pool,
      users: [buyer, seller, middleman, platform, platform1],
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
      await mintableUsdc.connect(buyer.signer)["mint(uint256)"](payNowAmount)
    );
    expect(await usdc.balanceOf(buyer.address)).to.be.equal(payNowAmount);
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

    // mint MAYC
    const mintableMayc = await getMintableERC721(mayc.address);
    await waitForTx(
      await mintableMayc.connect(seller.signer)["mint(address)"](seller.address)
    );
    expect(await mayc.ownerOf(nftId)).to.be.equal(seller.address);

    // approve
    await waitForTx(
      await mayc.connect(seller.signer).approve(conduit.address, nftId)
    );
    await waitForTx(
      await usdc.connect(buyer.signer).approve(conduit.address, startAmount)
    );

    const getSellOrder = async (): Promise<AdvancedOrder> => {
      const offers = [
        getOfferOrConsiderationItem(2, mayc.address, nftId, toBN(1), toBN(1)),
      ];

      const considerations = [
        getOfferOrConsiderationItem(
          1,
          usdc.address,
          toBN(0),
          startAmount.mul(98).div(100),
          endAmount.mul(98).div(100),
          seller.address
        ),
      ];

      return createSeaportOrder(
        seaport,
        seller,
        offers,
        considerations,
        2,
        pausableZone.address,
        conduitKey
      );
    };

    const getBuyOrder = async (): Promise<AdvancedOrder> => {
      const offers = [
        getOfferOrConsiderationItem(1, usdc.address, 0, startAmount, endAmount),
      ];

      const considerations = [
        getOfferOrConsiderationItem(
          4,
          mayc.address,
          toBN(0),
          1,
          1,
          pool.address
        ),
        getOfferOrConsiderationItem(
          1,
          usdc.address,
          toBN(0),
          startAmount.div(100),
          endAmount.div(100),
          platform.address
        ),
        getOfferOrConsiderationItem(
          1,
          usdc.address,
          toBN(0),
          startAmount.div(100),
          endAmount.div(100),
          platform1.address
        ),
      ];

      return createSeaportOrder(
        seaport,
        buyer,
        offers,
        considerations,
        2,
        pausableZone.address,
        conduitKey
      );
    };

    const fulfillment = [
      [[[0, 0]], [[1, 0]]],
      [[[0, 0]], [[0, 1]]],
      [[[0, 0]], [[0, 2]]],
      [[[1, 0]], [[0, 0]]],
    ].map(([offerArr, considerationArr]) =>
      toFulfillment(offerArr, considerationArr)
    );

    const sellOrder = await getSellOrder();
    const buyOrder = await getBuyOrder();

    const criteriaResolvers = [
      buildResolver(0, 1, 0, BigNumber.from(nftId), []),
    ];

    const encodedData = seaport.interface.encodeFunctionData(
      "matchAdvancedOrders",
      [[buyOrder, sellOrder], criteriaResolvers, fulfillment]
    );

    const domainData = {
      name: "ParaSpace",
      version: "1.1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: pool.address,
    };

    const credit = {
      token: usdc.address,
      amount: creditAmount,
      orderId: ethers.utils.arrayify(buyOrder.signature),
    };

    const signature = await ethers.provider
      .getSigner(buyer.address)
      ._signTypedData(domainData, creditType, credit);

    const vrs = ethers.utils.splitSignature(
      convertSignatureToEIP2098(signature)
    );

    const tx = pool.connect(seller.signer).acceptBidWithCredit(
      PARASPACE_SEAPORT_ID,
      `0x${encodedData.slice(10)}`,
      {
        ...credit,
        ...vrs,
      },
      seller.address,
      0,
      {
        gasLimit: 5000000,
      }
    );

    await (await tx).wait();
    expect(await mayc.balanceOf(seller.address)).to.be.equal(0);
    expect(await mayc.ownerOf(nftId)).to.be.equal(
      (await pool.getReserveData(mayc.address)).xTokenAddress
    );
    expect(await usdc.balanceOf(seller.address)).to.be.equal(
      startAmount.mul(98).div(100)
    );
  });
});
