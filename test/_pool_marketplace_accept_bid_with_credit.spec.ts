import {expect} from "chai";
import {DRE, evmRevert, evmSnapshot, waitForTx} from "../helpers/misc-utils";
import {
  convertToCurrencyDecimals,
  createSeaportOrder,
  getEthersSigners,
} from "../helpers/contracts-helpers";
import {TestEnv} from "./helpers/make-suite";
import creditType from "../helpers/eip-712-types/credit";
import {
  AdvancedOrder,
  ConsiderationItem,
} from "../helpers/seaport-helpers/types";
import {
  buildResolver,
  convertSignatureToEIP2098,
  getOfferOrConsiderationItem,
  toBN,
  toFulfillment,
} from "../helpers/seaport-helpers/encoding";
import {PARASPACE_SEAPORT_ID} from "../helpers/constants";
import {arrayify, splitSignature} from "ethers/lib/utils";
import {BigNumber} from "ethers";
import {
  borrowAndValidate,
  changePriceAndValidate,
  mintAndValidate,
  supplyAndValidate,
} from "./helpers/validated-steps";
import {MintableERC20} from "../types";
import {
  getMintableERC20,
  getParaSpaceOracle,
} from "../helpers/contracts-getters";
import {ProtocolErrors} from "../helpers/types";
import {merkleTree} from "../helpers/seaport-helpers/criteria";
import {executeAcceptBidWithCredit} from "./helpers/marketplace-helper";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";

describe("Leveraged Bid - unit tests", () => {
  it("TC-erc721-bid-01 ERC20 <=> ERC721 accept buy in full no loan offer", async () => {
    const {
      doodles,
      usdc,
      pool,
      users: [maker, taker],
    } = await loadFixture(testEnvFixture);
    const makerInitialBalance = "100";
    const payNowAmount = await convertToCurrencyDecimals(
      usdc.address,
      makerInitialBalance
    );
    const payLaterAmount = 0; // no loan!
    const startAmount = payNowAmount.add(payLaterAmount);
    const endAmount = startAmount; // fixed price, taker can afford this
    const nftId = 0;

    // mint USDC to maker
    await mintAndValidate(usdc, makerInitialBalance, maker);
    // mint DOODLE to taker
    await mintAndValidate(doodles, "1", taker);

    const usdcTakerbalance = await usdc.balanceOf(taker.address);
    // const nDOODLESMakerbalance = await nDOODLES.balanceOf(maker.address);
    const totalCollateralBaseBefore = (
      await pool.getUserAccountData(taker.address)
    ).totalCollateralBase;
    const assetPrice = await (await getParaSpaceOracle())
      .connect(taker.signer)
      .getAssetPrice(doodles.address);

    expect(
      await executeAcceptBidWithCredit(
        doodles,
        usdc,
        startAmount,
        endAmount,
        payLaterAmount,
        nftId,
        maker,
        taker
      )
    );
    const usdcTakerbalanceAfter = await usdc.balanceOf(taker.address);

    // taker usdc should increase
    expect(usdcTakerbalanceAfter).to.be.equal(
      usdcTakerbalance.add(payNowAmount)
    );

    // taker doodles should reduce
    expect(await doodles.balanceOf(taker.address)).to.be.equal(0);

    expect(await doodles.ownerOf(nftId)).to.be.equal(
      (await pool.getReserveData(doodles.address)).xTokenAddress
    );

    // const nDOODLESMakerbalanceAfter = await nDOODLES.balanceOf(maker.address);

    // maker nDoodles should increase
    // FIXME(Allen)issue: maker nDoodles not increase
    // expect(nDOODLESMakerbalanceAfter).to.be.equal(
    //   nDOODLESMakerbalance.add("1")
    // );

    // totalCollateralBase should increase
    const totalCollateralBaseAfter = (
      await pool.getUserAccountData(maker.address)
    ).totalCollateralBase;
    expect(totalCollateralBaseAfter).to.be.eq(
      totalCollateralBaseBefore.add(assetPrice)
    );
  });

  it("TC-erc721-bid-02 ERC20 <=> ERC721 accept use credit borrow and cash  offer", async () => {
    const {
      mayc,
      nMAYC,
      dai,
      pool,
      oracle,
      users: [maker, taker, middleman],
    } = await loadFixture(testEnvFixture);
    const makerInitialBalance = "800";
    const middlemanInitialBalance = "200";
    const payNowAmount = await convertToCurrencyDecimals(dai.address, "800");
    const creditAmount = await convertToCurrencyDecimals(dai.address, "200");
    const startAmount = payNowAmount.add(creditAmount);
    const endAmount = startAmount; // fixed price but offerer cannot afford this
    const nftId = 0;
    const usdcPrice = await oracle.getAssetPrice(dai.address);
    const accrualTotalDebtBase = creditAmount
      .mul(usdcPrice)
      .toString()
      .substring(0, 18);

    // mint USDC to maker
    await mintAndValidate(dai, makerInitialBalance, maker);

    // middleman supplies USDC to pool to be borrowed by offerer later
    await supplyAndValidate(dai, middlemanInitialBalance, middleman, true);

    expect(
      await dai.balanceOf(
        (
          await pool.getReserveData(dai.address)
        ).xTokenAddress
      )
    ).to.be.equal(creditAmount);

    // mint MAYC to taker
    await mintAndValidate(mayc, "1", taker);
    expect(await mayc.ownerOf(nftId)).to.be.equal(taker.address);

    // there is no debt for maker
    const totalDebtBefore = (await pool.getUserAccountData(maker.address))
      .totalDebtBase;
    expect(totalDebtBefore).to.be.equal(0);

    const totalCollateralBaseBefore = (
      await pool.getUserAccountData(taker.address)
    ).totalCollateralBase;
    const assetPrice = await (await getParaSpaceOracle())
      .connect(taker.signer)
      .getAssetPrice(mayc.address);

    await executeAcceptBidWithCredit(
      mayc,
      dai,
      startAmount,
      endAmount,
      creditAmount,
      nftId,
      maker,
      taker
    );
    expect(await mayc.balanceOf(taker.address)).to.be.equal(0);
    expect(await mayc.ownerOf(nftId)).to.be.equal(
      (await pool.getReserveData(mayc.address)).xTokenAddress
    );

    // taker dai should increase
    expect(await dai.balanceOf(taker.address)).to.be.equal(startAmount);

    // taker bayc should reduce
    expect(await mayc.balanceOf(taker.address)).to.be.equal(0);

    // maker nMAYC should increase
    expect(await nMAYC.balanceOf(maker.address)).to.be.equal("1");

    // maker Debt should increase
    const totalDebtAfter = (await pool.getUserAccountData(maker.address))
      .totalDebtBase;
    expect(totalDebtAfter).to.be.equal(
      totalDebtBefore.add(accrualTotalDebtBase)
    );

    // totalCollateralBase should increase
    const totalCollateralBaseAfter = (
      await pool.getUserAccountData(maker.address)
    ).totalCollateralBase;

    expect(totalCollateralBaseAfter).to.be.equal(
      totalCollateralBaseBefore.add(assetPrice)
    );
  });

  it("TC-erc721-bid-03 ERC20 <=> ERC721 accept buy in full credit offer", async () => {
    const {
      bayc,
      nBAYC,
      usdc,
      pool,
      oracle,
      users: [maker, taker, middleman],
    } = await loadFixture(testEnvFixture);
    const middlemanInitialBalance = "1000";
    const payLaterAmount = await convertToCurrencyDecimals(
      usdc.address,
      "1000"
    );
    const usdcPrice = await oracle.getAssetPrice(usdc.address);
    const accrualTotalDebtBase = payLaterAmount
      .mul(usdcPrice)
      .toString()
      .substring(0, 18);
    const startAmount = payLaterAmount; // full borrow
    const endAmount = startAmount; // fixed price but taker cannot afford this
    const nftId = 0;

    // middleman supplies USDC to pool to be borrowed by maker later
    await supplyAndValidate(usdc, middlemanInitialBalance, middleman, true);

    // mint BAYC to taker
    await mintAndValidate(bayc, "1", taker);

    const totalCollateralBaseBefore = (
      await pool.getUserAccountData(taker.address)
    ).totalCollateralBase;
    const assetPrice = await (await getParaSpaceOracle())
      .connect(taker.signer)
      .getAssetPrice(bayc.address);

    await executeAcceptBidWithCredit(
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
    expect(await nBAYC.balanceOf(maker.address)).to.be.equal(1);
    expect(await bayc.ownerOf(nftId)).to.be.equal(
      (await pool.getReserveData(bayc.address)).xTokenAddress
    );
    // taker usdc should increase
    expect(await usdc.balanceOf(taker.address)).to.be.equal(startAmount);

    // taker bayc should reduce
    expect(await bayc.balanceOf(taker.address)).to.be.equal(0);

    // maker nWPunk should increase
    expect(await nBAYC.balanceOf(maker.address)).to.be.equal(1);

    // maker debt should increase
    const totalDebtAfter = (await pool.getUserAccountData(maker.address))
      .totalDebtBase;
    expect(totalDebtAfter).to.be.equal(accrualTotalDebtBase);

    // totalCollateralBase should increase
    const totalCollateralBaseAfter = (
      await pool.getUserAccountData(maker.address)
    ).totalCollateralBase;
    expect(totalCollateralBaseAfter).to.be.eq(
      totalCollateralBaseBefore.add(assetPrice)
    );
  });

  it("TC-erc721-bid-04 ERC20 <=> NToken accept use credit borrow and cash offer", async () => {
    const {
      bayc,
      nBAYC,
      usdc,
      pool,
      oracle,
      users: [maker, taker, middleman],
    } = await loadFixture(testEnvFixture);
    const makerInitialBalance = "800";
    const middlemanInitialBalance = "200";
    const payNowAmount = await convertToCurrencyDecimals(usdc.address, "800");
    const creditAmount = await convertToCurrencyDecimals(usdc.address, "200");
    const usdcPrice = await oracle.getAssetPrice(usdc.address);
    const accrualTotalDebtBase = creditAmount
      .mul(usdcPrice)
      .toString()
      .substring(0, 18);
    const startAmount = payNowAmount.add(creditAmount);
    const endAmount = startAmount; // fixed price but offerer cannot afford this
    const nftId = 0;

    // mint USDC to maker
    await mintAndValidate(usdc, makerInitialBalance, maker);

    // middleman supplies USDC to pool to be borrowed by maker later
    await supplyAndValidate(usdc, middlemanInitialBalance, middleman, true);

    expect(
      await usdc.balanceOf(
        (
          await pool.getReserveData(usdc.address)
        ).xTokenAddress
      )
    ).to.be.equal(creditAmount);

    await supplyAndValidate(bayc, "1", taker, true);

    // before acceptBidWithCredit totalCollateralBase for the taker
    // is just the bayc
    const totalCollateralBaseBefore = (
      await pool.getUserAccountData(taker.address)
    ).totalCollateralBase;
    const assetPrice = await (await getParaSpaceOracle())
      .connect(taker.signer)
      .getAssetPrice(bayc.address);
    expect(totalCollateralBaseBefore).to.be.eq(assetPrice);
    // and there is no debt for maker
    const totalDebtBefore = (await pool.getUserAccountData(maker.address))
      .totalDebtBase;
    expect(totalDebtBefore).to.be.equal(0);

    await executeAcceptBidWithCredit(
      nBAYC,
      usdc,
      startAmount,
      endAmount,
      creditAmount,
      nftId,
      maker,
      taker
    );
    // taker bayc should reduce
    expect(await nBAYC.balanceOf(taker.address)).to.be.equal(0);
    expect(await nBAYC.ownerOf(nftId)).to.be.equal(maker.address);
    expect(await usdc.balanceOf(taker.address)).to.be.equal(startAmount);

    // after the swap offer's totalCollateralBase should be same as taker's before
    const totalCollateralBaseAfter = (
      await pool.getUserAccountData(maker.address)
    ).totalCollateralBase;
    expect(totalCollateralBaseAfter).to.be.eq(totalCollateralBaseBefore);
    // maker debt should increase
    const totalDebtAfter = (await pool.getUserAccountData(maker.address))
      .totalDebtBase;
    expect(totalDebtAfter).to.be.equal(
      totalDebtBefore.add(accrualTotalDebtBase)
    );
  });

  it("TC-erc721-bid-05 ERC20 <=> (ERC-721 & NToken) accept in batch", async () => {
    const {
      nBAYC,
      bayc,
      usdc,
      pool,
      oracle,
      seaport,
      conduit,
      conduitKey,
      pausableZone,
      users: [maker, taker, middleman],
    } = await loadFixture(testEnvFixture);
    const makerInitialBalance = "800";
    const payNowAmount = await convertToCurrencyDecimals(
      usdc.address,
      makerInitialBalance
    );
    const middlemanInitialBalance = "1200";
    const payLaterAmount = await convertToCurrencyDecimals(usdc.address, "200");
    const startAmount = payNowAmount.add(payLaterAmount);
    const endAmount = startAmount; // fixed price but taker cannot afford this
    const nftId = 0;

    // mint USDC to maker and middleman
    await mintAndValidate(usdc, middlemanInitialBalance, middleman);
    await mintAndValidate(usdc, makerInitialBalance, maker);

    // middleman supplies USDC to pool to be borrowed by maker later
    await supplyAndValidate(usdc, middlemanInitialBalance, middleman);

    const payLaterAmount2 = await convertToCurrencyDecimals(
      usdc.address,
      "1000"
    );
    const startAmount2 = payLaterAmount2;
    const endAmount2 = startAmount2; // fixed price but taker cannot afford this
    const nftId2 = 1;

    const usdcPrice = await oracle.getAssetPrice(usdc.address);
    const accrualTotalDebtBase = payLaterAmount
      .add(payLaterAmount2)
      .mul(usdcPrice)
      .toString()
      .substring(0, 19);

    // mint BAYC to taker
    await mintAndValidate(bayc, "2", taker);
    // supply BAYC
    await supplyAndValidate(bayc, "1", taker);

    // there is no debt for maker
    const totalDebtBefore = (await pool.getUserAccountData(maker.address))
      .totalDebtBase;
    expect(totalDebtBefore).to.be.equal(0);

    // approve - on accept bid case, user must approve full pay+loan amount
    await waitForTx(
      await usdc
        .connect(maker.signer)
        .approve(conduit.address, startAmount.add(startAmount2))
    );
    await waitForTx(
      await nBAYC.connect(taker.signer).approve(conduit.address, nftId)
    );
    await waitForTx(
      await bayc.connect(taker.signer).approve(conduit.address, nftId2)
    );

    // prepare sell order 1
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
          pool.address
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

    // prepare sell order 2
    const getSellOrder2 = async (): Promise<AdvancedOrder> => {
      const offers = [
        getOfferOrConsiderationItem(
          1,
          usdc.address,
          toBN(0),
          startAmount2,
          endAmount2
        ),
      ];

      const considerations = [
        getOfferOrConsiderationItem(
          2,
          bayc.address,
          nftId2,
          toBN(1),
          toBN(1),
          pool.address
        ),
      ];

      return createSeaportOrder(
        seaport,
        maker,
        offers,
        considerations as ConsiderationItem[],
        2,
        pausableZone.address,
        conduitKey
      );
    };

    // prepare buy order 1
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

    // prepare buy order 2
    const getBuyOrder2 = async (): Promise<AdvancedOrder> => {
      const offers = [
        getOfferOrConsiderationItem(2, bayc.address, nftId2, toBN(1), toBN(1)),
      ];

      const considerations = [
        getOfferOrConsiderationItem(
          1,
          usdc.address,
          toBN(0),
          startAmount2,
          endAmount2,
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
    const sellOrder2 = await getSellOrder2();
    const buyOrder2 = await getBuyOrder2();

    // encode order 1
    const encodedData = seaport.interface.encodeFunctionData(
      "matchAdvancedOrders",
      [[sellOrder, buyOrder], [], fulfillment]
    );
    // encode order 2
    const encodedData2 = seaport.interface.encodeFunctionData(
      "matchAdvancedOrders",
      [[sellOrder2, buyOrder2], [], fulfillment]
    );

    const domainData = {
      name: "ParaSpace",
      version: "1.1",
      chainId: (await DRE.ethers.provider.getNetwork()).chainId,
      verifyingContract: pool.address,
    };

    const payLater = {
      token: usdc.address,
      amount: payLaterAmount,
      orderId: arrayify(sellOrder.signature),
    };
    const payLater2 = {
      token: usdc.address,
      amount: payLaterAmount2,
      orderId: arrayify(sellOrder2.signature),
    };

    const signature = await DRE.ethers.provider
      .getSigner(maker.address)
      ._signTypedData(domainData, creditType, payLater);
    const signature2 = await DRE.ethers.provider
      .getSigner(maker.address)
      ._signTypedData(domainData, creditType, payLater2);

    const vrs = splitSignature(convertSignatureToEIP2098(signature));
    const vrs2 = splitSignature(convertSignatureToEIP2098(signature2));

    await pool.connect(taker.signer).batchAcceptBidWithCredit(
      [PARASPACE_SEAPORT_ID, PARASPACE_SEAPORT_ID],
      [`0x${encodedData.slice(10)}`, `0x${encodedData2.slice(10)}`],
      [
        {
          ...payLater,
          ...vrs,
        },
        {
          ...payLater2,
          ...vrs2,
        },
      ],
      taker.address,
      0,
      {
        gasLimit: 5000000,
      }
    );

    expect(await nBAYC.ownerOf(nftId)).to.be.equal(maker.address);
    expect(await nBAYC.ownerOf(nftId2)).to.be.equal(maker.address);

    // taker usdc should increase
    expect(await usdc.balanceOf(taker.address)).to.be.equal(
      startAmount.add(startAmount2)
    );

    // taker bayc should reduce
    expect(await bayc.balanceOf(taker.address)).to.be.equal(0);

    // maker nWPunk should increase
    expect(await nBAYC.balanceOf(maker.address)).to.be.equal(2);

    // maker Debt should increase
    const totalDebtAfter = (await pool.getUserAccountData(maker.address))
      .totalDebtBase;
    expect(totalDebtAfter).to.be.equal(
      totalDebtBefore.add(accrualTotalDebtBase)
    );
  });

  it("TC-erc721-bid-06 accept collection bid", async () => {
    const {
      mayc,
      nMAYC,
      usdc,
      pool,
      oracle,
      conduitKey,
      conduit,
      pausableZone,
      seaport,
      users: [maker, taker, middleman],
    } = await loadFixture(testEnvFixture);
    const makerInitialBalance = "800";
    const middlemanInitialBalance = "200";
    const payNowAmount = await convertToCurrencyDecimals(usdc.address, "800");
    const creditAmount = await convertToCurrencyDecimals(usdc.address, "200");
    const startAmount = payNowAmount.add(creditAmount);
    const endAmount = startAmount; // fixed price but offerer cannot afford this
    const nftId = "0";
    const usdcPrice = await oracle.getAssetPrice(usdc.address);
    const accrualTotalDebtBase = creditAmount
      .mul(usdcPrice)
      .toString()
      .substring(0, 18);

    // mint USDC to maker
    await mintAndValidate(usdc, makerInitialBalance, maker);

    // middleman supplies USDC to pool to be borrowed by maker later
    await supplyAndValidate(usdc, middlemanInitialBalance, middleman, true);

    //there is no debt for maker
    const totalDebtBefore = (await pool.getUserAccountData(maker.address))
      .totalDebtBase;
    expect(totalDebtBefore).to.be.equal(0);

    expect(
      await usdc.balanceOf(
        (
          await pool.getReserveData(usdc.address)
        ).xTokenAddress
      )
    ).to.be.equal(creditAmount);

    // mint MAYC to taker
    await mintAndValidate(mayc, "1", taker);
    expect(await mayc.ownerOf(nftId)).to.be.equal(taker.address);

    // approve
    await waitForTx(
      await mayc.connect(taker.signer).approve(conduit.address, nftId)
    );
    await waitForTx(
      await usdc.connect(maker.signer).approve(conduit.address, startAmount)
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
        maker,
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

    const domainData = {
      name: "ParaSpace",
      version: "1.1",
      chainId: (await DRE.ethers.provider.getNetwork()).chainId,
      verifyingContract: pool.address,
    };

    const credit = {
      token: usdc.address,
      amount: creditAmount,
      orderId: arrayify(buyOrder.signature),
    };

    const signature = await DRE.ethers.provider
      .getSigner(maker.address)
      ._signTypedData(domainData, creditType, credit);

    const vrs = splitSignature(convertSignatureToEIP2098(signature));

    await pool.connect(taker.signer).acceptBidWithCredit(
      PARASPACE_SEAPORT_ID,
      `0x${encodedData.slice(10)}`,
      {
        ...credit,
        ...vrs,
      },
      taker.address,
      0,
      {
        gasLimit: 5000000,
      }
    );

    expect(await mayc.balanceOf(taker.address)).to.be.equal(0);
    expect(await mayc.ownerOf(nftId)).to.be.equal(
      (await pool.getReserveData(mayc.address)).xTokenAddress
    );
    // taker usdc should increase
    expect(await usdc.balanceOf(taker.address)).to.be.equal(startAmount);

    // maker nMayc should increase
    expect(await nMAYC.balanceOf(maker.address)).to.be.equal(1);

    // maker debt should increase
    const totalDebtAfter = (await pool.getUserAccountData(maker.address))
      .totalDebtBase;
    expect(totalDebtAfter).to.be.equal(
      totalDebtBefore.add(accrualTotalDebtBase)
    );
  });

  it("TC-erc721-bid-07 accept collection set bid", async () => {
    const {
      mayc,
      nMAYC,
      usdc,
      pool,
      oracle,
      conduitKey,
      conduit,
      pausableZone,
      seaport,
      users: [maker, taker, middleman],
    } = await loadFixture(testEnvFixture);
    const makerInitialBalance = "800";
    const middlemanInitialBalance = "200";
    const payNowAmount = await convertToCurrencyDecimals(usdc.address, "800");
    const creditAmount = await convertToCurrencyDecimals(usdc.address, "200");
    const startAmount = payNowAmount.add(creditAmount);
    const endAmount = startAmount; // fixed price but offerer cannot afford this
    const nftId1 = BigNumber.from(1);
    const nftId2 = BigNumber.from(2);
    const nftId3 = BigNumber.from(3);
    const tokenIds = [nftId1, nftId2, nftId3];
    const {root, proofs} = merkleTree(tokenIds);
    const usdcPrice = await oracle.getAssetPrice(usdc.address);
    const accrualTotalDebtBase = creditAmount
      .mul(usdcPrice)
      .toString()
      .substring(0, 18);

    const totalCollateralBaseBefore = (
      await pool.getUserAccountData(taker.address)
    ).totalCollateralBase;
    const assetPrice = await (await getParaSpaceOracle())
      .connect(taker.signer)
      .getAssetPrice(mayc.address);

    // mint USDC to maker
    await mintAndValidate(usdc, makerInitialBalance, maker);

    // middleman supplies USDC to pool to be borrowed by offerer later
    await supplyAndValidate(usdc, middlemanInitialBalance, middleman, true);

    expect(
      await usdc.balanceOf(
        (
          await pool.getReserveData(usdc.address)
        ).xTokenAddress
      )
    ).to.be.equal(creditAmount);

    // mint MAYCs
    await mintAndValidate(mayc, "4", taker);
    expect(await mayc.balanceOf(taker.address)).to.be.equal(4);

    // there is no debt for maker
    const totalDebtBefore = (await pool.getUserAccountData(maker.address))
      .totalDebtBase;
    expect(totalDebtBefore).to.be.equal(0);
    // approve
    await waitForTx(
      await mayc.connect(taker.signer).approve(conduit.address, nftId1)
    );
    await waitForTx(
      await usdc.connect(maker.signer).approve(conduit.address, startAmount)
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
        getOfferOrConsiderationItem(1, usdc.address, 0, startAmount, endAmount),
      ];

      const considerations = [
        getOfferOrConsiderationItem(4, mayc.address, root, 1, 1, pool.address),
      ];

      return createSeaportOrder(
        seaport,
        maker,
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
      buildResolver(0, 1, 0, nftId1, proofs[nftId1.toString()]),
    ];

    const encodedData = seaport.interface.encodeFunctionData(
      "matchAdvancedOrders",
      [[buyOrder, sellOrder], criteriaResolvers, fulfillment]
    );

    const domainData = {
      name: "ParaSpace",
      version: "1.1",
      chainId: (await DRE.ethers.provider.getNetwork()).chainId,
      verifyingContract: pool.address,
    };

    const credit = {
      token: usdc.address,
      amount: creditAmount,
      orderId: arrayify(buyOrder.signature),
    };

    const signature = await DRE.ethers.provider
      .getSigner(maker.address)
      ._signTypedData(domainData, creditType, credit);

    const vrs = splitSignature(convertSignatureToEIP2098(signature));

    await pool.connect(taker.signer).acceptBidWithCredit(
      PARASPACE_SEAPORT_ID,
      `0x${encodedData.slice(10)}`,
      {
        ...credit,
        ...vrs,
      },
      taker.address,
      0,
      {
        gasLimit: 5000000,
      }
    );

    // taker mayc should be reduced after the acceptance offer
    expect(await mayc.balanceOf(taker.address)).to.be.equal(3);
    expect(await mayc.ownerOf(nftId1)).to.be.equal(
      (await pool.getReserveData(mayc.address)).xTokenAddress
    );

    // taker usdc should increase
    expect(await usdc.balanceOf(taker.address)).to.be.equal(startAmount);

    // maker nMayc should increase
    expect(await nMAYC.balanceOf(maker.address)).to.be.equal(1);

    // maker debt should increase
    const totalDebtAfter = (await pool.getUserAccountData(maker.address))
      .totalDebtBase;
    expect(totalDebtAfter).to.be.equal(
      totalDebtBefore.add(accrualTotalDebtBase)
    );

    // totalCollateralBase should increase
    const totalCollateralBaseAfter = (
      await pool.getUserAccountData(maker.address)
    ).totalCollateralBase;
    expect(totalCollateralBaseAfter).to.be.eq(
      totalCollateralBaseBefore.add(assetPrice)
    );
  });

  it("TC-erc721-bid-08 accept with 2 platform fee item", async () => {
    const {
      mayc,
      nMAYC,
      usdc,
      pool,
      oracle,
      conduitKey,
      conduit,
      pausableZone,
      seaport,
      users: [maker, taker, middleman, platform, platform1],
    } = await loadFixture(testEnvFixture);
    const makerInitialBalance = "800";
    const middlemanInitialBalance = "200";
    const payNowAmount = await convertToCurrencyDecimals(usdc.address, "800");
    const creditAmount = await convertToCurrencyDecimals(usdc.address, "200");
    const startAmount = payNowAmount.add(creditAmount);
    const endAmount = startAmount; // fixed price but offerer cannot afford this
    const nftId = "0";
    const usdcPrice = await oracle.getAssetPrice(usdc.address);
    const accrualTotalDebtBase = creditAmount
      .mul(usdcPrice)
      .toString()
      .substring(0, 18);
    const totalCollateralBaseBefore = (
      await pool.getUserAccountData(taker.address)
    ).totalCollateralBase;
    const assetPrice = await (await getParaSpaceOracle())
      .connect(taker.signer)
      .getAssetPrice(mayc.address);

    // mint USDC to maker
    await mintAndValidate(usdc, makerInitialBalance, maker);

    // middleman supplies USDC to pool to be borrowed by offerer later
    await supplyAndValidate(usdc, middlemanInitialBalance, middleman, true);

    expect(
      await usdc.balanceOf(
        (
          await pool.getReserveData(usdc.address)
        ).xTokenAddress
      )
    ).to.be.equal(creditAmount);

    // mint MAYC
    await mintAndValidate(mayc, "1", taker);
    expect(await mayc.ownerOf(nftId)).to.be.equal(taker.address);

    // there is no debt for maker
    const totalDebtBefore = (await pool.getUserAccountData(maker.address))
      .totalDebtBase;
    expect(totalDebtBefore).to.be.equal(0);

    // approve
    await waitForTx(
      await mayc.connect(taker.signer).approve(conduit.address, nftId)
    );
    await waitForTx(
      await usdc.connect(maker.signer).approve(conduit.address, startAmount)
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
        maker,
        offers,
        considerations as ConsiderationItem[],
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
      chainId: (await DRE.ethers.provider.getNetwork()).chainId,
      verifyingContract: pool.address,
    };

    const credit = {
      token: usdc.address,
      amount: creditAmount,
      orderId: arrayify(buyOrder.signature),
    };

    const signature = await DRE.ethers.provider
      .getSigner(maker.address)
      ._signTypedData(domainData, creditType, credit);

    const vrs = splitSignature(convertSignatureToEIP2098(signature));

    await pool.connect(taker.signer).acceptBidWithCredit(
      PARASPACE_SEAPORT_ID,
      `0x${encodedData.slice(10)}`,
      {
        ...credit,
        ...vrs,
      },
      taker.address,
      0,
      {
        gasLimit: 5000000,
      }
    );

    expect(await nMAYC.ownerOf(nftId)).to.be.equal(maker.address);

    // taker bayc should reduce
    expect(await mayc.balanceOf(taker.address)).to.be.equal(0);

    // maker nWPunk should increase
    expect(await nMAYC.balanceOf(maker.address)).to.be.equal(1);

    expect(await mayc.ownerOf(nftId)).to.be.equal(
      (await pool.getReserveData(mayc.address)).xTokenAddress
    );

    // taker usdc should increase
    expect(await usdc.balanceOf(taker.address)).to.be.equal(
      startAmount.mul(98).div(100)
    );

    // platform usdc should increase
    expect(await usdc.balanceOf(platform.address)).to.be.equal(
      startAmount.div(100)
    );

    // platform1 usdc should increase
    expect(await usdc.balanceOf(platform1.address)).to.be.equal(
      startAmount.div(100)
    );

    // maker debt should increase
    const totalDebtAfter = (await pool.getUserAccountData(maker.address))
      .totalDebtBase;
    expect(totalDebtAfter).to.be.equal(
      totalDebtBefore.add(accrualTotalDebtBase)
    );

    // totalCollateralBase should increase
    const totalCollateralBaseAfter = (
      await pool.getUserAccountData(maker.address)
    ).totalCollateralBase;

    expect(totalCollateralBaseAfter).to.be.eq(
      totalCollateralBaseBefore.add(assetPrice)
    );
  });
});

describe("Leveraged Bid - Negative tests", () => {
  const nftId = 0;
  const payLaterAmount = "230";
  let startAmount: BigNumber;
  let endAmount: BigNumber;
  let testEnv: TestEnv;
  const {COLLATERAL_CANNOT_COVER_NEW_BORROW} = ProtocolErrors;

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {
      bayc,
      dai,
      conduit,
      pool,
      users: [maker, taker, middleman],
    } = testEnv;
    const makerInitialBalance = "800";
    const payNowAmount = await convertToCurrencyDecimals(
      dai.address,
      makerInitialBalance
    );
    const middlemanInitialBalance = "1200";
    startAmount = payNowAmount.add(
      await convertToCurrencyDecimals(dai.address, payLaterAmount)
    );
    endAmount = startAmount; // fixed price but taker cannot afford this

    // mint DAI to middleman
    await mintAndValidate(dai, middlemanInitialBalance, middleman);
    // mint DAI to maker
    await mintAndValidate(dai, makerInitialBalance, maker);

    // middleman supplies DAI to the pool
    await supplyAndValidate(dai, middlemanInitialBalance, middleman);

    // mint BAYC to taker
    await mintAndValidate(bayc, "1", taker);

    // approve
    await waitForTx(
      await bayc.connect(taker.signer).approve(conduit.address, nftId)
    );
    await waitForTx(
      await dai.connect(maker.signer).approve(pool.address, payNowAmount)
    );
  });

  let snapShot: string;
  beforeEach(async () => {
    snapShot = await evmSnapshot();
  });

  afterEach(async () => {
    await evmRevert(snapShot);
  });

  it("TC-erc721-bid-09 collateral unable overwrite loand after accept offer (should fail)", async () => {
    const {
      nBAYC,
      dai,
      bayc,
      conduit,
      users: [maker, taker],
    } = testEnv;
    const creditAmount = await convertToCurrencyDecimals(
      dai.address,
      payLaterAmount
    );
    // taker supplies BAYC
    await supplyAndValidate(bayc, "1", taker);

    // approve
    await waitForTx(
      await nBAYC.connect(taker.signer).approve(conduit.address, nftId)
    );

    // taker borrows DAI
    await borrowAndValidate(dai, "800", taker);

    await expect(
      executeAcceptBidWithCredit(
        nBAYC, // using nToken
        dai,
        startAmount,
        endAmount,
        creditAmount,
        nftId,
        maker,
        taker
      )
    ).to.be.revertedWith(
      ProtocolErrors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
    );
  });

  it("TC-erc721-bid-10 offer cannot be accept when liquidity is insufficient (should fail)", async () => {
    const {
      bayc,
      dai,
      pool,
      mayc,
      users: [maker, taker],
    } = testEnv;
    const creditAmount = await convertToCurrencyDecimals(
      dai.address,
      payLaterAmount
    );
    // user1 supplies MAYC and borrows 1100 DAI, so 100 are left in protocol liquidity
    await supplyAndValidate(mayc, "1", maker, true);
    await borrowAndValidate(dai, "1100", maker);

    await waitForTx(
      await dai.connect(maker.signer).approve(pool.address, startAmount)
    );

    // then taker tries to pay later another 200 DAI
    await expect(
      executeAcceptBidWithCredit(
        bayc,
        dai,
        startAmount,
        endAmount,
        creditAmount,
        nftId,
        maker,
        taker
      )
    ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
  });

  it("TC-erc721-bid-11 cannot purchase a non-matching NFT id (should fail)", async () => {
    const {
      bayc,
      dai,
      users: [maker, taker],
    } = testEnv;
    const creditAmount = await convertToCurrencyDecimals(
      dai.address,
      payLaterAmount
    );
    await expect(
      executeAcceptBidWithCredit(
        bayc,
        dai,
        startAmount,
        endAmount,
        creditAmount,
        1, // nft id 1 is not listed
        maker,
        taker
      )
    ).to.be.revertedWith("ERC721: owner query for nonexistent token");
  });

  it("TC-erc721-bid-12 cannot perform same purchase twice (should fail)", async () => {
    const {
      bayc,
      dai,
      users: [maker, taker],
    } = testEnv;
    const creditAmount = await convertToCurrencyDecimals(
      dai.address,
      payLaterAmount
    );

    await executeAcceptBidWithCredit(
      bayc,
      dai,
      startAmount,
      endAmount,
      creditAmount,
      nftId,
      maker,
      taker
    );

    // try same purchase again, should revert
    await expect(
      executeAcceptBidWithCredit(
        bayc,
        dai,
        startAmount,
        endAmount,
        creditAmount,
        nftId,
        maker,
        taker
      )
    ).to.be.revertedWith(
      "ERC721: approve caller is not owner nor approved for all"
    );
  });

  it("TC-erc721-bid-13 cannot with accept a not wrapped erc20 currency (should fail)", async () => {
    const {
      bayc,
      pDai,
      users: [maker, taker],
    } = testEnv;
    const creditAmount = await convertToCurrencyDecimals(
      pDai.address,
      payLaterAmount
    );

    await expect(
      executeAcceptBidWithCredit(
        bayc,
        pDai as unknown as MintableERC20, // using aDai contract as payment currency
        startAmount,
        endAmount,
        creditAmount,
        nftId,
        maker,
        taker
      )
    ).to.be.revertedWith(ProtocolErrors.ASSET_NOT_LISTED);
  });

  it("TC-erc721-bid-14 cannot credit amount above the NFT's LTV (should fail)", async () => {
    const {
      bayc,
      dai,
      users: [maker, taker],
      paraspaceOracle,
      protocolDataProvider,
    } = testEnv;
    const [deployer] = await getEthersSigners();
    const creditAmount = await convertToCurrencyDecimals(
      dai.address,
      payLaterAmount
    );

    // drop NFT price enough so that the NFT cannot cover a paylater of 200 DAI
    await changePriceAndValidate(bayc, "0.5");

    const nftPrice = await paraspaceOracle
      .connect(deployer)
      .getAssetPrice(bayc.address);
    const ltvRatio = (
      await protocolDataProvider.getReserveConfigurationData(bayc.address)
    ).ltv;
    const availableToBorrowInBaseUnits = nftPrice.percentMul(ltvRatio);
    const daiPrice = await paraspaceOracle
      .connect(deployer)
      .getAssetPrice(dai.address);
    // this is how much DAI I can borrow by putting this NFT in collateral
    const availableToBorrowInDai = await convertToCurrencyDecimals(
      dai.address,
      availableToBorrowInBaseUnits.div(daiPrice).toString()
    );

    // maker cannot get the needed credit
    expect(availableToBorrowInDai).to.be.lt(creditAmount);

    await expect(
      executeAcceptBidWithCredit(
        bayc,
        dai,
        startAmount,
        endAmount,
        creditAmount,
        nftId,
        maker,
        taker
      )
    ).to.be.revertedWith(COLLATERAL_CANNOT_COVER_NEW_BORROW);
  });

  it("TC-erc721-bid-15 cannot purchase the NFT if the order price is greater than taker's balance + credit amount (should fail)", async () => {
    const {
      bayc,
      dai,
      users: [maker, taker],
    } = testEnv;
    // credit amount not enough to reach purchase price
    const creditAmount = await convertToCurrencyDecimals(dai.address, "50");
    await expect(
      executeAcceptBidWithCredit(
        bayc,
        dai,
        startAmount,
        endAmount,
        creditAmount,
        nftId,
        maker,
        taker
      )
    ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
  });

  it("TC-erc721-bid-16 cannot accept offer because punk not actually for sale (should fail)", async () => {
    const {
      usdc,
      wPunk,
      conduitKey,
      conduit,
      pausableZone,
      seaport,
      pool,
      users: [maker, taker, middleman],
      wPunkGateway,
      punks,
    } = testEnv;
    const payNowAmount = await convertToCurrencyDecimals(usdc.address, "800");
    const creditAmount = await convertToCurrencyDecimals(usdc.address, "200");
    const startAmount = payNowAmount.add(creditAmount);
    const endAmount = startAmount; // fixed price but offerer cannot afford this

    await waitForTx(
      await wPunk
        .connect(taker.signer)
        .setApprovalForAll(wPunkGateway.address, true)
    );

    // mint WPUNK
    await waitForTx(await punks.connect(taker.signer)["getPunk(uint256)"](2));
    await punks.connect(taker.signer).balanceOf(taker.address);

    await waitForTx(await punks.connect(taker.signer).offerPunkForSale(2, 0));
    await waitForTx(await wPunk.connect(taker.signer).registerProxy());

    const proxy = await wPunk.proxyInfo(taker.address);

    await waitForTx(await punks.connect(taker.signer).transferPunk(proxy, 2));
    await waitForTx(await wPunk.connect(taker.signer).mint(2));

    // mint USDC to maker and middleman
    const mintableUsdc = await getMintableERC20(usdc.address);
    await waitForTx(
      await mintableUsdc
        .connect(middleman.signer)
        ["mint(uint256)"](creditAmount)
    );
    await waitForTx(
      await mintableUsdc.connect(maker.signer)["mint(uint256)"](payNowAmount)
    );
    expect(await usdc.balanceOf(maker.address)).to.be.equal(payNowAmount);
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

    expect(await wPunk.ownerOf(2)).to.be.equal(taker.address);

    await waitForTx(
      await wPunk.connect(taker.signer).setApprovalForAll(conduit.address, true)
    );
    await waitForTx(
      await usdc.connect(maker.signer).approve(conduit.address, startAmount)
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
          wPunk.address,
          nftId,
          toBN(1),
          toBN(1),
          pool.address
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
        getOfferOrConsiderationItem(2, wPunk.address, nftId, toBN(1), toBN(1)),
      ];

      const considerations = [
        getOfferOrConsiderationItem(
          1,
          usdc.address,
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
      chainId: (await DRE.ethers.provider.getNetwork()).chainId,
      verifyingContract: pool.address,
    };

    const credit = {
      token: usdc.address,
      amount: creditAmount,
      orderId: arrayify(sellOrder.signature),
    };

    const signature = await DRE.ethers.provider
      .getSigner(maker.address)
      ._signTypedData(domainData, creditType, credit);

    const vrs = splitSignature(convertSignatureToEIP2098(signature));

    await expect(
      wPunkGateway.connect(taker.signer).acceptBidWithCredit(
        PARASPACE_SEAPORT_ID,
        `0x${encodedData.slice(10)}`,
        {
          ...credit,
          ...vrs,
        },
        [nftId],
        0,
        {
          gasLimit: 5000000,
        }
      )
    ).to.be.revertedWith("WPunkGateway: Not owner of Punk");
  });
});
