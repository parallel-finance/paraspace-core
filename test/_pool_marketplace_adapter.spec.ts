import {
  generateMakerOrderTypedData,
  MakerOrder,
  MakerOrderWithSignature,
  MakerOrderWithVRS,
  TakerOrder,
} from "@looksrare/sdk";
import {expect} from "chai";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {BigNumber, constants} from "ethers";
import {parseEther} from "ethers/lib/utils";
import {
  Side,
  Order as BlurOrder,
  SignatureVersion,
} from "../helpers/blur-helpers/types";
import {ZERO_ADDRESS} from "../helpers/constants";
import {
  getStandardPolicyERC721,
  getStrategyStandardSaleForFixedPrice,
} from "../helpers/contracts-getters";
import {
  createBlurOrder,
  createSeaportOrder,
} from "../helpers/contracts-helpers";
import {DRE} from "../helpers/misc-utils";
import {
  buildResolver,
  getOfferOrConsiderationItem,
  randomHex,
  toBN,
  toFulfillment,
} from "../helpers/seaport-helpers/encoding";
import {
  AdvancedOrder,
  ConsiderationItem,
} from "../helpers/seaport-helpers/types";
import {ProtocolErrors} from "../helpers/types";
import {createX2Y2Order, createRunput} from "../helpers/x2y2-helpers";
import {InputStruct} from "../types/dependencies/blur-exchange/BlurExchange";
import {testEnvFixture} from "./helpers/setup-env";

describe("Marketplace Adapters - Negative Tests", () => {
  const nftId = "0";
  const nftPrice = parseEther("50");

  it("TC-seaportAdapter-01: getAskOrderInfo will fail if fulfillAdvancedOrder dont specify pool as ERC721 recipient (revert expected)", async () => {
    const {
      seaportAdapter,
      bayc,
      usdt,
      users: [maker, taker],
      seaport,
      pausableZone,
      conduitKey,
    } = await loadFixture(testEnvFixture);
    const offers = [
      getOfferOrConsiderationItem(2, bayc.address, nftId, toBN(1), toBN(1)),
    ];
    const considerations = [
      getOfferOrConsiderationItem(
        1,
        usdt.address,
        toBN(0),
        nftPrice,
        nftPrice,
        maker.address
      ),
    ];
    const listing: AdvancedOrder = await createSeaportOrder(
      seaport,
      maker,
      offers,
      considerations,
      2,
      pausableZone.address,
      conduitKey
    );

    const encodedData = seaport.interface.encodeFunctionData(
      "fulfillAdvancedOrder",
      [listing, [], conduitKey, taker.address]
    );

    await expect(
      seaportAdapter.getAskOrderInfo(`0x${encodedData.slice(10)}`)
    ).to.be.revertedWith(ProtocolErrors.INVALID_ORDER_TAKER);
  });

  it("TC-seaportAdapter-02: getBidOrderInfo will fail if maker & taker are the same address (revert expected)", async () => {
    const {
      seaportAdapter,
      mayc,
      usdc,
      users: [, taker],
      seaport,
      pool,
      pausableZone,
      conduitKey,
    } = await loadFixture(testEnvFixture);
    const getSellOrder = async (): Promise<AdvancedOrder> => {
      const offers = [
        getOfferOrConsiderationItem(2, mayc.address, nftId, toBN(1), toBN(1)),
      ];

      const considerations = [
        getOfferOrConsiderationItem(
          1,
          usdc.address,
          toBN(0),
          nftPrice,
          nftPrice,
          taker.address
        ),
      ];

      return createSeaportOrder(
        seaport,
        taker,
        offers,
        considerations,
        2,
        pausableZone.address,
        conduitKey
      );
    };

    const getBuyOrder = async (): Promise<AdvancedOrder> => {
      const offers = [
        getOfferOrConsiderationItem(1, usdc.address, 0, nftPrice, nftPrice),
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
        taker,
        offers,
        considerations as ConsiderationItem[],
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
    await expect(
      seaportAdapter.getBidOrderInfo(`0x${encodedData.slice(10)}`)
    ).to.be.revertedWith(ProtocolErrors.MAKER_SAME_AS_TAKER);
  });

  it("TC-looksRareAdapter-01: getAskOrderInfo will fail if taker isn't pool (revert expected)", async () => {
    const {
      looksRareAdapter,
      looksRareExchange,
      users: [maker],
      bayc,
      usdt,
    } = await loadFixture(testEnvFixture);

    const now = Math.floor(Date.now() / 1000);
    const chainId = await maker.signer.getChainId();
    const paramsValue = [];
    const makerOrder: MakerOrder = {
      isOrderAsk: true,
      signer: maker.address,
      collection: bayc.address,
      price: nftPrice,
      tokenId: nftId,
      amount: "1",
      strategy: (await getStrategyStandardSaleForFixedPrice()).address,
      currency: usdt.address,
      nonce: await maker.signer.getTransactionCount(),
      startTime: now - 86400,
      endTime: now + 86400, // 2 days validity
      minPercentageToAsk: 7500,
      params: paramsValue,
    };

    const {domain, value, type} = generateMakerOrderTypedData(
      maker.address,
      chainId,
      makerOrder,
      looksRareExchange.address
    );

    const signatureHash = await DRE.ethers.provider
      .getSigner(maker.address)
      ._signTypedData(domain, type, value);

    const makerOrderWithSignature: MakerOrderWithSignature = {
      ...makerOrder,
      signature: signatureHash,
    };

    const vrs = DRE.ethers.utils.splitSignature(
      makerOrderWithSignature.signature
    );

    const makerOrderWithVRS: MakerOrderWithVRS = {
      ...makerOrderWithSignature,
      ...vrs,
    };

    const takerOrder: TakerOrder = {
      isOrderAsk: false,
      taker: maker.address,
      price: makerOrderWithSignature.price,
      tokenId: makerOrderWithSignature.tokenId,
      minPercentageToAsk: 7500,
      params: paramsValue,
    };

    const encodedData = looksRareExchange.interface.encodeFunctionData(
      "matchAskWithTakerBid",
      [takerOrder, makerOrderWithVRS]
    );

    await expect(
      looksRareAdapter.getAskOrderInfo(`0x${encodedData.slice(10)}`)
    ).to.be.revertedWith(ProtocolErrors.INVALID_ORDER_TAKER);
  });

  it("TC-looksRareAdapter-02: getAskOrderInfo will fail if matching strategy isn't StandardSaleForFixedPrice (revert expected)", async () => {
    const {
      looksRareAdapter,
      looksRareExchange,
      users: [maker],
      pool,
      bayc,
      usdt,
    } = await loadFixture(testEnvFixture);

    const now = Math.floor(Date.now() / 1000);
    const chainId = await maker.signer.getChainId();
    const paramsValue = [];
    const makerOrder: MakerOrder = {
      isOrderAsk: true,
      signer: maker.address,
      collection: bayc.address,
      price: nftPrice,
      tokenId: nftId,
      amount: "1",
      strategy: ZERO_ADDRESS,
      currency: usdt.address,
      nonce: await maker.signer.getTransactionCount(),
      startTime: now - 86400,
      endTime: now + 86400, // 2 days validity
      minPercentageToAsk: 7500,
      params: paramsValue,
    };

    const {domain, value, type} = generateMakerOrderTypedData(
      maker.address,
      chainId,
      makerOrder,
      looksRareExchange.address
    );

    const signatureHash = await DRE.ethers.provider
      .getSigner(maker.address)
      ._signTypedData(domain, type, value);

    const makerOrderWithSignature: MakerOrderWithSignature = {
      ...makerOrder,
      signature: signatureHash,
    };

    const vrs = DRE.ethers.utils.splitSignature(
      makerOrderWithSignature.signature
    );

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

    await expect(
      looksRareAdapter.getAskOrderInfo(`0x${encodedData.slice(10)}`)
    ).to.be.revertedWith(ProtocolErrors.INVALID_MARKETPLACE_ORDER);
  });

  it("TC-x2y2Adapter-01: getAskOrderInfo will fail if amountToWeth or amountToEth isn't 0 (revert expected)", async () => {
    const {
      x2y2Adapter,
      users: [maker, authorizedSigner],
      erc721Delegate,
      x2y2r1,
      pool,
      bayc,
      dai,
    } = await loadFixture(testEnvFixture);
    const now = Math.floor(Date.now() / 1000);
    const order = await createX2Y2Order({
      chainId: (await DRE.ethers.provider.getNetwork()).chainId,
      signer: maker.signer,
      tokenAddress: bayc.address,
      tokenId: +nftId,
      price: nftPrice,
      currency: dai.address,
      expirationTime: BigNumber.from(now).add(86400),
    });

    const input = await createRunput(
      authorizedSigner.address,
      erc721Delegate.address,
      order,
      pool.address,
      []
    );
    input.shared.amountToEth = nftPrice;
    input.shared.amountToWeth = 0;
    const encodedData1 = x2y2r1.interface.encodeFunctionData("run", [input]);
    await expect(
      x2y2Adapter.getAskOrderInfo(`0x${encodedData1.slice(10)}`)
    ).to.be.revertedWith(ProtocolErrors.INVALID_MARKETPLACE_ORDER);

    input.shared.amountToWeth = nftPrice;
    input.shared.amountToEth = 0;
    const encodedData2 = x2y2r1.interface.encodeFunctionData("run", [input]);
    await expect(
      x2y2Adapter.getAskOrderInfo(`0x${encodedData2.slice(10)}`)
    ).to.be.revertedWith(ProtocolErrors.INVALID_MARKETPLACE_ORDER);
  });

  it("TC-x2y2Adapter-02: getAskOrderInfo will fail if any order can fail (revert expected)", async () => {
    const {
      x2y2Adapter,
      users: [maker, authorizedSigner],
      erc721Delegate,
      x2y2r1,
      pool,
      bayc,
      dai,
    } = await loadFixture(testEnvFixture);
    const now = Math.floor(Date.now() / 1000);
    const order = await createX2Y2Order({
      chainId: (await DRE.ethers.provider.getNetwork()).chainId,
      signer: maker.signer,
      tokenAddress: bayc.address,
      tokenId: +nftId,
      price: nftPrice,
      currency: dai.address,
      expirationTime: BigNumber.from(now).add(86400),
    });

    const input = await createRunput(
      authorizedSigner.address,
      erc721Delegate.address,
      order,
      pool.address,
      []
    );
    input.shared.canFail = true;
    const encodedData = x2y2r1.interface.encodeFunctionData("run", [input]);

    await expect(
      x2y2Adapter.getAskOrderInfo(`0x${encodedData.slice(10)}`)
    ).to.be.revertedWith(ProtocolErrors.INVALID_MARKETPLACE_ORDER);
  });

  it("TC-blurAdapter-01: getAskOrderInfo will fail if matchingPolicy isn't StandardPolicyERC721 (revert expected)", async () => {
    const {
      blurAdapter,
      blurExchange,
      users: [maker],
      pool,
      bayc,
      usdt,
    } = await loadFixture(testEnvFixture);

    const now = Math.floor(Date.now() / 1000);
    const makerOrder: BlurOrder = {
      trader: maker.address,
      side: Side.Sell,
      matchingPolicy: ZERO_ADDRESS,
      collection: bayc.address,
      tokenId: nftId,
      amount: "1",
      paymentToken: usdt.address,
      price: nftPrice,
      listingTime: now - 86400,
      expirationTime: now + 86400,
      fees: [],
      salt: randomHex(),
      extraParams: "0x",
    };
    const takerOrder: BlurOrder = {
      trader: pool.address,
      side: Side.Buy,
      matchingPolicy: ZERO_ADDRESS,
      collection: bayc.address,
      tokenId: nftId,
      amount: "1",
      paymentToken: usdt.address,
      price: nftPrice,
      listingTime: now - 86400,
      expirationTime: now + 86400,
      fees: [],
      salt: randomHex(),
      extraParams: "0x",
    };

    const makerInput = await createBlurOrder(blurExchange, maker, makerOrder);
    const takerInput = {
      order: takerOrder,
      v: 0,
      r: constants.HashZero,
      s: constants.HashZero,
      extraSignature: "0x",
      signatureVersion: SignatureVersion.Single,
      blockNumber: 0,
    };

    const encodedData = blurExchange.interface.encodeFunctionData("execute", [
      makerInput as InputStruct,
      takerInput as InputStruct,
    ]);

    await expect(
      blurAdapter.getAskOrderInfo(`0x${encodedData.slice(10)}`)
    ).to.be.revertedWith(ProtocolErrors.INVALID_MARKETPLACE_ORDER);
  });

  it("TC-blurAdapter-02: getAskOrderInfo will fail if taker isn't pool (revert expected)", async () => {
    const {
      blurAdapter,
      blurExchange,
      users: [maker],
      bayc,
      usdt,
    } = await loadFixture(testEnvFixture);

    const now = Math.floor(Date.now() / 1000);
    const makerOrder: BlurOrder = {
      trader: maker.address,
      side: Side.Sell,
      matchingPolicy: (await getStandardPolicyERC721()).address,
      collection: bayc.address,
      tokenId: nftId,
      amount: "1",
      paymentToken: usdt.address,
      price: nftPrice,
      listingTime: now - 86400,
      expirationTime: now + 86400,
      fees: [],
      salt: randomHex(),
      extraParams: "0x",
    };
    const takerOrder: BlurOrder = {
      trader: maker.address,
      side: Side.Buy,
      matchingPolicy: (await getStandardPolicyERC721()).address,
      collection: bayc.address,
      tokenId: nftId,
      amount: "1",
      paymentToken: usdt.address,
      price: nftPrice,
      listingTime: now - 86400,
      expirationTime: now + 86400,
      fees: [],
      salt: randomHex(),
      extraParams: "0x",
    };

    const makerInput = await createBlurOrder(blurExchange, maker, makerOrder);
    const takerInput = {
      order: takerOrder,
      v: 0,
      r: constants.HashZero,
      s: constants.HashZero,
      extraSignature: "0x",
      signatureVersion: SignatureVersion.Single,
      blockNumber: 0,
    };

    const encodedData = blurExchange.interface.encodeFunctionData("execute", [
      makerInput as InputStruct,
      takerInput as InputStruct,
    ]);

    await expect(
      blurAdapter.getAskOrderInfo(`0x${encodedData.slice(10)}`)
    ).to.be.revertedWith(ProtocolErrors.INVALID_ORDER_TAKER);
  });
});
