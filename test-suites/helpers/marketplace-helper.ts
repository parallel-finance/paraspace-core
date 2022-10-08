import {waitForTx} from "../../deploy/helpers/misc-utils";
import {createSeaportOrder} from "../../deploy/helpers/contracts-helpers";
import {SignerWithAddress} from "./../helpers/make-suite";
import creditType from "../../deploy/helpers/eip-712-types/credit";
import {AdvancedOrder} from "../../deploy/helpers/seaport-helpers/types";
import {
  convertSignatureToEIP2098,
  getOfferOrConsiderationItem,
  toBN,
  toFulfillment,
} from "../../deploy/helpers/seaport-helpers/encoding";
import {createOrder, createRunput} from "../../deploy/helpers/x2y2-helpers";
import {ethers} from "hardhat";
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
} from "../../deploy/helpers/constants";
import {BigNumber, BigNumberish, constants} from "ethers";
import {MintableERC20, MintableERC721, NToken} from "../../types";
import {
  getConduit,
  getConduitKey,
  getERC721Delegate,
  getLooksRareExchange,
  getPausableZone,
  getPool,
  getSeaport,
  getStrategyStandardSaleForFixedPrice,
  getTransferManagerERC721,
  getX2Y2R1,
} from "../../deploy/helpers/contracts-getters";

export async function executeLooksrareBuyWithCredit(
  tokenToBuy: MintableERC721 | NToken,
  tokenToPayWith: MintableERC20,
  startAmount: BigNumber,
  payLaterAmount: BigNumberish,
  nftId: number,
  maker: SignerWithAddress,
  taker: SignerWithAddress
) {
  const signer = ethers.provider.getSigner(maker.address);
  const chainId = await maker.signer.getChainId();
  const nonce = await maker.signer.getTransactionCount();

  // approve
  await waitForTx(
    await tokenToBuy
      .connect(maker.signer)
      .approve((await getTransferManagerERC721()).address, nftId)
  );

  const now = Math.floor(Date.now() / 1000);
  const paramsValue = [];
  const makerOrder: MakerOrder = {
    isOrderAsk: true,
    signer: maker.address,
    collection: tokenToBuy.address,
    price: startAmount,
    tokenId: nftId,
    amount: "1",
    strategy: (await getStrategyStandardSaleForFixedPrice()).address,
    currency: tokenToPayWith.address,
    nonce: nonce,
    startTime: now - 86400,
    endTime: now + 86400, // 2 days validity
    minPercentageToAsk: 7500,
    params: paramsValue,
  };

  const looksRareExchange = await getLooksRareExchange();

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
  const pool = await getPool();
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
      token: tokenToPayWith.address,
      amount: payLaterAmount,
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
}

export async function executeX2Y2BuyWithCredit(
  tokenToBuy: MintableERC721 | NToken,
  tokenToPayWith: MintableERC20,
  startAmount: BigNumber,
  payLaterAmount: BigNumberish,
  nftId: number,
  maker: SignerWithAddress,
  taker: SignerWithAddress,
  deployer: SignerWithAddress,
  middleman: SignerWithAddress
) {
  const erc721Delegate = await getERC721Delegate();
  await waitForTx(
    await tokenToBuy
      .connect(maker.signer)
      .approve(erc721Delegate.address, nftId)
  );

  const x2y2r1 = await getX2Y2R1();
  waitForTx(
    await x2y2r1.connect(deployer.signer).updateSigners([middleman.address], [])
  );
  const now = Math.floor(Date.now() / 1000);
  const pool = await getPool();

  const order = await createOrder({
    chainId: (await ethers.provider.getNetwork()).chainId,
    signer: maker.signer,
    tokenAddress: tokenToBuy.address,
    tokenId: nftId,
    price: startAmount,
    currency: tokenToPayWith.address,
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
      token: tokenToPayWith.address,
      amount: payLaterAmount,
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
}

export async function executeSeaportBuyWithCredit(
  tokenToBuy: MintableERC721 | NToken,
  tokenToPayWith: MintableERC20,
  startAmount: BigNumberish,
  endAmount: BigNumberish,
  payLaterAmount: BigNumberish,
  nftId: number,
  maker: SignerWithAddress,
  taker: SignerWithAddress,
  _sellOrderStartAmount = 1
) {
  // approve
  await waitForTx(
    await tokenToBuy
      .connect(maker.signer)
      .approve((await getConduit()).address, nftId)
  );

  const seaport = await getSeaport();
  const getSellOrder = async (): Promise<AdvancedOrder> => {
    const offers = [
      getOfferOrConsiderationItem(
        2,
        tokenToBuy.address,
        nftId,
        _sellOrderStartAmount,
        _sellOrderStartAmount
      ),
    ];

    const considerations = [
      getOfferOrConsiderationItem(
        1,
        tokenToPayWith.address,
        nftId,
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
      (await getPausableZone()).address,
      await getConduitKey()
    );
  };

  const pool = await getPool();
  const isNToken = !(await pool.getReservesList()).includes(tokenToBuy.address);

  const encodedData = seaport.interface.encodeFunctionData(
    "fulfillAdvancedOrder",
    [
      await getSellOrder(),
      [],
      await getConduitKey(),
      (isNToken ? taker : pool).address,
    ]
  );

  const tx = (await getPool()).connect(taker.signer).buyWithCredit(
    PARASPACE_SEAPORT_ID,
    `0x${encodedData.slice(10)}`,
    {
      token: tokenToPayWith.address,
      amount: payLaterAmount,
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
}

export async function executeAcceptBidWithCredit(
  tokenToBuy: MintableERC721 | NToken,
  tokenToPayWith: MintableERC20,
  startAmount: BigNumberish,
  endAmount: BigNumberish,
  payLaterAmount: BigNumberish,
  nftId: number,
  maker: SignerWithAddress,
  taker: SignerWithAddress,
  _isNtoken = false
) {
  const pool = await getPool();
  const seaport = await getSeaport();
  const pausableZone = await getPausableZone();
  const conduit = await getConduit();
  const conduitKey = await getConduitKey();

  // approve - on accept bid case, user must approve full pay+loan amount
  await waitForTx(
    await tokenToPayWith
      .connect(maker.signer)
      .approve(conduit.address, startAmount)
  );
  await waitForTx(
    await tokenToBuy.connect(taker.signer).approve(conduit.address, nftId)
  );

  const getSellOrder = async (): Promise<AdvancedOrder> => {
    const offers = [
      getOfferOrConsiderationItem(
        1,
        tokenToPayWith.address,
        toBN(0),
        startAmount,
        endAmount
      ),
    ];

    const considerations = [
      getOfferOrConsiderationItem(
        2,
        tokenToBuy.address,
        nftId,
        toBN(1),
        toBN(1),
        _isNtoken ? maker.address : pool.address
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

  const getBuyOrder = async (): Promise<AdvancedOrder> => {
    const offers = [
      getOfferOrConsiderationItem(
        2,
        tokenToBuy.address,
        nftId,
        toBN(1),
        toBN(1)
      ),
    ];

    const considerations = [
      getOfferOrConsiderationItem(
        1,
        tokenToPayWith.address,
        toBN(0),
        startAmount,
        endAmount,
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

  const fulfillment = [
    [[[0, 0]], [[1, 0]]],
    [[[1, 0]], [[0, 0]]],
  ].map(([makerArr, considerationArr]) =>
    toFulfillment(makerArr, considerationArr)
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

  const payLater = {
    token: tokenToPayWith.address,
    amount: payLaterAmount,
    orderId: ethers.utils.arrayify(sellOrder.signature),
  };

  const signature = await ethers.provider
    .getSigner(maker.address)
    ._signTypedData(domainData, creditType, payLater);

  const vrs = ethers.utils.splitSignature(convertSignatureToEIP2098(signature));

  const tx = pool.connect(taker.signer).acceptBidWithCredit(
    PARASPACE_SEAPORT_ID,
    `0x${encodedData.slice(10)}`,
    {
      ...payLater,
      ...vrs,
    },
    taker.address,
    0,
    {
      gasLimit: 5000000,
    }
  );
  await (await tx).wait();
}
