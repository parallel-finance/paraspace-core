import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {MAX_UINT_AMOUNT, ONE_ADDRESS} from "../helpers/constants";
import {
  getAutoCompoundApe,
  getParaApeStaking,
  getPTokenSApe,
} from "../helpers/contracts-getters";
import {
  advanceBlock,
  advanceTimeAndBlock,
  waitForTx,
} from "../helpers/misc-utils";
import {PTokenSApe, AutoCompoundApe, ParaApeStaking} from "../types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";

import {
  changePriceAndValidate,
  changeSApePriceAndValidate,
  mintAndValidate,
  supplyAndValidate,
} from "./helpers/validated-steps";
import {ProtocolErrors} from "../helpers/types";
import {parseEther} from "ethers/lib/utils";
import {BigNumber} from "ethers";

describe("Para Ape staking ape coin pool test", () => {
  let testEnv: TestEnv;
  let paraApeStaking: ParaApeStaking;
  let cApe: AutoCompoundApe;
  let MINIMUM_LIQUIDITY;
  let pSApeCoin: PTokenSApe;
  const sApeAddress = ONE_ADDRESS;

  const fixture = async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {
      ape,
      users: [user1, user2, user3, user4, , user6],
      apeCoinStaking,
      pool,
      protocolDataProvider,
      configurator,
      poolAdmin,
    } = testEnv;

    paraApeStaking = await getParaApeStaking();

    await waitForTx(
      await paraApeStaking
        .connect(poolAdmin.signer)
        .setApeStakingBot(user4.address)
    );

    cApe = await getAutoCompoundApe();
    MINIMUM_LIQUIDITY = await cApe.MINIMUM_LIQUIDITY();

    const {xTokenAddress: pSApeCoinAddress} =
      await protocolDataProvider.getReserveTokensAddresses(sApeAddress);
    pSApeCoin = await getPTokenSApe(pSApeCoinAddress);

    // send extra tokens to the apestaking contract for rewards
    await waitForTx(
      await ape
        .connect(user1.signer)
        ["mint(address,uint256)"](
          apeCoinStaking.address,
          parseEther("100000000000")
        )
    );

    // user6 deposit MINIMUM_LIQUIDITY to make test case easy
    await mintAndValidate(ape, "1", user6);
    await waitForTx(
      await ape.connect(user6.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await cApe.connect(user6.signer).deposit(user6.address, MINIMUM_LIQUIDITY)
    );

    // user4 deposit and supply cApe to MM
    expect(
      await configurator
        .connect(poolAdmin.signer)
        .setSupplyCap(cApe.address, "20000000000")
    );
    await mintAndValidate(ape, "10000000000", user4);
    await waitForTx(
      await ape.connect(user4.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await cApe
        .connect(user4.signer)
        .deposit(user4.address, parseEther("10000000000"))
    );
    await waitForTx(
      await cApe.connect(user4.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await pool
        .connect(user4.signer)
        .supply(cApe.address, parseEther("10000000000"), user4.address, 0)
    );

    // user approve ape coin to Para ape staking
    await waitForTx(
      await ape
        .connect(user1.signer)
        .approve(paraApeStaking.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await ape
        .connect(user2.signer)
        .approve(paraApeStaking.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await ape
        .connect(user3.signer)
        .approve(paraApeStaking.address, MAX_UINT_AMOUNT)
    );

    return testEnv;
  };

  it("test BAYC + ApeCoin pool logic", async () => {
    const {
      users: [user1, user2, , user4],
      ape,
      bayc,
      bakc,
      nBAYC,
      nBAKC,
      poolAdmin,
      apeCoinStaking,
    } = await loadFixture(fixture);

    //mint ape
    await mintAndValidate(ape, "1000000", user1);
    await mintAndValidate(ape, "1000000", user2);

    await waitForTx(
      await paraApeStaking.connect(poolAdmin.signer).setCompoundFee(1000)
    );

    await supplyAndValidate(bayc, "3", user1, true);
    await supplyAndValidate(bakc, "3", user1, true);

    await waitForTx(
      await nBAYC
        .connect(user1.signer)
        .transferFrom(user1.address, user2.address, 2)
    );
    await waitForTx(
      await nBAKC
        .connect(user1.signer)
        .transferFrom(user1.address, user2.address, 2)
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).depositApeCoinPool({
        cashToken: ape.address,
        cashAmount: parseEther("400000"),
        isBAYC: true,
        tokenIds: [0, 1],
      })
    );
    await waitForTx(
      await paraApeStaking.connect(user2.signer).depositApeCoinPool({
        cashToken: ape.address,
        cashAmount: parseEther("200000"),
        isBAYC: true,
        tokenIds: [2],
      })
    );
    expect(await bayc.ownerOf(0)).to.be.equal(paraApeStaking.address);
    expect(await bayc.ownerOf(1)).to.be.equal(paraApeStaking.address);
    expect(await bayc.ownerOf(2)).to.be.equal(paraApeStaking.address);

    await waitForTx(
      await paraApeStaking.connect(user1.signer).depositApeCoinPairPool({
        cashToken: ape.address,
        cashAmount: parseEther("100000"),
        isBAYC: true,
        apeTokenIds: [0, 1],
        bakcTokenIds: [0, 1],
      })
    );
    await waitForTx(
      await paraApeStaking.connect(user2.signer).depositApeCoinPairPool({
        cashToken: ape.address,
        cashAmount: parseEther("50000"),
        isBAYC: true,
        apeTokenIds: [2],
        bakcTokenIds: [2],
      })
    );
    expect(await bakc.ownerOf(0)).to.be.equal(paraApeStaking.address);
    expect(await bakc.ownerOf(1)).to.be.equal(paraApeStaking.address);
    expect(await bakc.ownerOf(2)).to.be.equal(paraApeStaking.address);

    expect((await apeCoinStaking.nftPosition(1, 0)).stakedAmount).to.be.eq(
      parseEther("200000")
    );
    expect((await apeCoinStaking.nftPosition(1, 1)).stakedAmount).to.be.eq(
      parseEther("200000")
    );
    expect((await apeCoinStaking.nftPosition(1, 2)).stakedAmount).to.be.eq(
      parseEther("200000")
    );
    expect((await apeCoinStaking.nftPosition(3, 0)).stakedAmount).to.be.eq(
      parseEther("50000")
    );
    expect((await apeCoinStaking.nftPosition(3, 1)).stakedAmount).to.be.eq(
      parseEther("50000")
    );
    expect((await apeCoinStaking.nftPosition(3, 2)).stakedAmount).to.be.eq(
      parseEther("50000")
    );

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await paraApeStaking
        .connect(user4.signer)
        .compoundApeCoinPool(true, [0, 1, 2])
    );
    let compoundFee = await paraApeStaking.pendingCApeReward(
      paraApeStaking.address
    );
    expect(compoundFee).to.be.closeTo(parseEther("360"), parseEther("1"));

    let user1PendingReward = await paraApeStaking.apeCoinPoolPendingReward(
      true,
      [0, 1]
    );
    let user2PendingReward = await paraApeStaking.apeCoinPoolPendingReward(
      true,
      [2]
    );
    expect(user1PendingReward).to.be.closeTo(
      parseEther("2160"),
      parseEther("1")
    );
    expect(user2PendingReward).to.be.closeTo(
      parseEther("1080"),
      parseEther("1")
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).claimApeCoinPool(true, [0, 1])
    );
    await waitForTx(
      await paraApeStaking.connect(user2.signer).claimApeCoinPool(true, [2])
    );
    let user1Balance = await cApe.balanceOf(user1.address);
    let user2Balance = await cApe.balanceOf(user2.address);
    expect(user1Balance).to.be.closeTo(user1PendingReward, parseEther("1"));
    expect(user2Balance).to.be.closeTo(user2PendingReward, parseEther("1"));

    await waitForTx(
      await paraApeStaking
        .connect(user4.signer)
        .compoundApeCoinPairPool(true, [0, 1, 2], [0, 1, 2])
    );
    compoundFee = await paraApeStaking.pendingCApeReward(
      paraApeStaking.address
    );
    expect(compoundFee).to.be.closeTo(parseEther("720"), parseEther("1"));

    user1PendingReward = await paraApeStaking.apeCoinPairPoolPendingReward(
      true,
      [0, 1]
    );
    user2PendingReward = await paraApeStaking.apeCoinPairPoolPendingReward(
      true,
      [2]
    );
    expect(user1PendingReward).to.be.closeTo(
      parseEther("2160"),
      parseEther("1")
    );
    expect(user2PendingReward).to.be.closeTo(
      parseEther("1080"),
      parseEther("1")
    );

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .claimApeCoinPairPool(true, [0, 1])
    );
    await waitForTx(
      await paraApeStaking.connect(user2.signer).claimApeCoinPairPool(true, [2])
    );
    user1Balance = await cApe.balanceOf(user1.address);
    user2Balance = await cApe.balanceOf(user2.address);
    expect(user1Balance).to.be.closeTo(
      user1PendingReward.mul(2),
      parseEther("1")
    );
    expect(user2Balance).to.be.closeTo(
      user2PendingReward.mul(2),
      parseEther("1")
    );

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await paraApeStaking.connect(user1.signer).withdrawApeCoinPool({
        cashToken: ape.address,
        cashAmount: parseEther("400000"),
        isBAYC: true,
        tokenIds: [0, 1],
      })
    );
    await waitForTx(
      await paraApeStaking.connect(user2.signer).withdrawApeCoinPool({
        cashToken: ape.address,
        cashAmount: parseEther("200000"),
        isBAYC: true,
        tokenIds: [2],
      })
    );
    expect(await bayc.ownerOf(0)).to.be.equal(paraApeStaking.address);
    expect(await bayc.ownerOf(1)).to.be.equal(paraApeStaking.address);
    expect(await bayc.ownerOf(2)).to.be.equal(paraApeStaking.address);
    await waitForTx(
      await paraApeStaking.connect(user1.signer).withdrawApeCoinPairPool({
        cashToken: ape.address,
        cashAmount: parseEther("100000"),
        isBAYC: true,
        apeTokenIds: [0, 1],
        bakcTokenIds: [0, 1],
      })
    );
    await waitForTx(
      await paraApeStaking.connect(user2.signer).withdrawApeCoinPairPool({
        cashToken: ape.address,
        cashAmount: parseEther("50000"),
        isBAYC: true,
        apeTokenIds: [2],
        bakcTokenIds: [2],
      })
    );
    expect(await bayc.ownerOf(0)).to.be.equal(nBAYC.address);
    expect(await bayc.ownerOf(1)).to.be.equal(nBAYC.address);
    expect(await bayc.ownerOf(2)).to.be.equal(nBAYC.address);
    expect(await bakc.ownerOf(0)).to.be.equal(nBAKC.address);
    expect(await bakc.ownerOf(1)).to.be.equal(nBAKC.address);
    expect(await bakc.ownerOf(2)).to.be.equal(nBAKC.address);

    compoundFee = await paraApeStaking.pendingCApeReward(
      paraApeStaking.address
    );
    //720 + 720 + 3600 * 0.9 / 3 * 2
    expect(compoundFee).to.be.closeTo(parseEther("3600"), parseEther("1"));
    await waitForTx(
      await paraApeStaking.connect(user4.signer).claimCompoundFee(user4.address)
    );
    const compoundFeeBalance = await cApe.balanceOf(user4.address);
    expect(compoundFeeBalance).to.be.closeTo(compoundFee, parseEther("1"));

    user1Balance = await cApe.balanceOf(user1.address);
    user2Balance = await cApe.balanceOf(user2.address);
    //2160 * 2 + 0
    expect(user1Balance).to.be.closeTo(parseEther("4320"), parseEther("1"));
    //1080 * 2 + 2160 * 2
    expect(user2Balance).to.be.closeTo(parseEther("6480"), parseEther("1"));

    expect(await ape.balanceOf(user1.address)).to.be.equal(
      parseEther("1000000")
    );
    expect(await ape.balanceOf(user2.address)).to.be.equal(
      parseEther("1000000")
    );
  });

  it("test MAYC + ApeCoin pool logic", async () => {
    const {
      users: [user1, user2, , user4],
      ape,
      mayc,
      bakc,
      nMAYC,
      nBAKC,
      poolAdmin,
      apeCoinStaking,
    } = await loadFixture(fixture);

    //mint ape
    await mintAndValidate(ape, "1000000", user1);
    await mintAndValidate(ape, "1000000", user2);

    await waitForTx(
      await paraApeStaking.connect(poolAdmin.signer).setCompoundFee(1000)
    );

    await supplyAndValidate(mayc, "3", user1, true);
    await supplyAndValidate(bakc, "3", user1, true);

    await waitForTx(
      await nMAYC
        .connect(user1.signer)
        .transferFrom(user1.address, user2.address, 2)
    );
    await waitForTx(
      await nBAKC
        .connect(user1.signer)
        .transferFrom(user1.address, user2.address, 2)
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).depositApeCoinPool({
        cashToken: ape.address,
        cashAmount: parseEther("200000"),
        isBAYC: false,
        tokenIds: [0, 1],
      })
    );
    await waitForTx(
      await paraApeStaking.connect(user2.signer).depositApeCoinPool({
        cashToken: ape.address,
        cashAmount: parseEther("100000"),
        isBAYC: false,
        tokenIds: [2],
      })
    );
    expect(await mayc.ownerOf(0)).to.be.equal(paraApeStaking.address);
    expect(await mayc.ownerOf(1)).to.be.equal(paraApeStaking.address);
    expect(await mayc.ownerOf(2)).to.be.equal(paraApeStaking.address);

    await waitForTx(
      await paraApeStaking.connect(user1.signer).depositApeCoinPairPool({
        cashToken: ape.address,
        cashAmount: parseEther("100000"),
        isBAYC: false,
        apeTokenIds: [0, 1],
        bakcTokenIds: [0, 1],
      })
    );
    await waitForTx(
      await paraApeStaking.connect(user2.signer).depositApeCoinPairPool({
        cashToken: ape.address,
        cashAmount: parseEther("50000"),
        isBAYC: false,
        apeTokenIds: [2],
        bakcTokenIds: [2],
      })
    );
    expect(await bakc.ownerOf(0)).to.be.equal(paraApeStaking.address);
    expect(await bakc.ownerOf(1)).to.be.equal(paraApeStaking.address);
    expect(await bakc.ownerOf(2)).to.be.equal(paraApeStaking.address);

    expect((await apeCoinStaking.nftPosition(2, 0)).stakedAmount).to.be.eq(
      parseEther("100000")
    );
    expect((await apeCoinStaking.nftPosition(2, 1)).stakedAmount).to.be.eq(
      parseEther("100000")
    );
    expect((await apeCoinStaking.nftPosition(2, 2)).stakedAmount).to.be.eq(
      parseEther("100000")
    );
    expect((await apeCoinStaking.nftPosition(3, 0)).stakedAmount).to.be.eq(
      parseEther("50000")
    );
    expect((await apeCoinStaking.nftPosition(3, 1)).stakedAmount).to.be.eq(
      parseEther("50000")
    );
    expect((await apeCoinStaking.nftPosition(3, 2)).stakedAmount).to.be.eq(
      parseEther("50000")
    );

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await paraApeStaking
        .connect(user4.signer)
        .compoundApeCoinPool(false, [0, 1, 2])
    );
    let compoundFee = await paraApeStaking.pendingCApeReward(
      paraApeStaking.address
    );
    expect(compoundFee).to.be.closeTo(parseEther("360"), parseEther("1"));

    let user1PendingReward = await paraApeStaking.apeCoinPoolPendingReward(
      false,
      [0, 1]
    );
    let user2PendingReward = await paraApeStaking.apeCoinPoolPendingReward(
      false,
      [2]
    );
    expect(user1PendingReward).to.be.closeTo(
      parseEther("2160"),
      parseEther("1")
    );
    expect(user2PendingReward).to.be.closeTo(
      parseEther("1080"),
      parseEther("1")
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).claimApeCoinPool(false, [0, 1])
    );
    await waitForTx(
      await paraApeStaking.connect(user2.signer).claimApeCoinPool(false, [2])
    );
    let user1Balance = await cApe.balanceOf(user1.address);
    let user2Balance = await cApe.balanceOf(user2.address);
    expect(user1Balance).to.be.closeTo(user1PendingReward, parseEther("1"));
    expect(user2Balance).to.be.closeTo(user2PendingReward, parseEther("1"));

    await waitForTx(
      await paraApeStaking
        .connect(user4.signer)
        .compoundApeCoinPairPool(false, [0, 1, 2], [0, 1, 2])
    );
    compoundFee = await paraApeStaking.pendingCApeReward(
      paraApeStaking.address
    );
    expect(compoundFee).to.be.closeTo(parseEther("720"), parseEther("1"));

    user1PendingReward = await paraApeStaking.apeCoinPairPoolPendingReward(
      false,
      [0, 1]
    );
    user2PendingReward = await paraApeStaking.apeCoinPairPoolPendingReward(
      false,
      [2]
    );
    expect(user1PendingReward).to.be.closeTo(
      parseEther("2160"),
      parseEther("1")
    );
    expect(user2PendingReward).to.be.closeTo(
      parseEther("1080"),
      parseEther("1")
    );

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .claimApeCoinPairPool(false, [0, 1])
    );
    await waitForTx(
      await paraApeStaking
        .connect(user2.signer)
        .claimApeCoinPairPool(false, [2])
    );
    user1Balance = await cApe.balanceOf(user1.address);
    user2Balance = await cApe.balanceOf(user2.address);
    expect(user1Balance).to.be.closeTo(
      user1PendingReward.mul(2),
      parseEther("1")
    );
    expect(user2Balance).to.be.closeTo(
      user2PendingReward.mul(2),
      parseEther("1")
    );

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await paraApeStaking.connect(user1.signer).withdrawApeCoinPool({
        cashToken: ape.address,
        cashAmount: parseEther("200000"),
        isBAYC: false,
        tokenIds: [0, 1],
      })
    );
    await waitForTx(
      await paraApeStaking.connect(user2.signer).withdrawApeCoinPool({
        cashToken: ape.address,
        cashAmount: parseEther("100000"),
        isBAYC: false,
        tokenIds: [2],
      })
    );
    expect(await mayc.ownerOf(0)).to.be.equal(paraApeStaking.address);
    expect(await mayc.ownerOf(1)).to.be.equal(paraApeStaking.address);
    expect(await mayc.ownerOf(2)).to.be.equal(paraApeStaking.address);
    await waitForTx(
      await paraApeStaking.connect(user1.signer).withdrawApeCoinPairPool({
        cashToken: ape.address,
        cashAmount: parseEther("100000"),
        isBAYC: false,
        apeTokenIds: [0, 1],
        bakcTokenIds: [0, 1],
      })
    );
    await waitForTx(
      await paraApeStaking.connect(user2.signer).withdrawApeCoinPairPool({
        cashToken: ape.address,
        cashAmount: parseEther("50000"),
        isBAYC: false,
        apeTokenIds: [2],
        bakcTokenIds: [2],
      })
    );
    expect(await mayc.ownerOf(0)).to.be.equal(nMAYC.address);
    expect(await mayc.ownerOf(1)).to.be.equal(nMAYC.address);
    expect(await mayc.ownerOf(2)).to.be.equal(nMAYC.address);
    expect(await bakc.ownerOf(0)).to.be.equal(nBAKC.address);
    expect(await bakc.ownerOf(1)).to.be.equal(nBAKC.address);
    expect(await bakc.ownerOf(2)).to.be.equal(nBAKC.address);

    compoundFee = await paraApeStaking.pendingCApeReward(
      paraApeStaking.address
    );
    //720 + 720 + 3600 * 0.9 / 3 * 2
    expect(compoundFee).to.be.closeTo(parseEther("3600"), parseEther("1"));
    await waitForTx(
      await paraApeStaking.connect(user4.signer).claimCompoundFee(user4.address)
    );
    const compoundFeeBalance = await cApe.balanceOf(user4.address);
    expect(compoundFeeBalance).to.be.closeTo(compoundFee, parseEther("1"));

    user1Balance = await cApe.balanceOf(user1.address);
    user2Balance = await cApe.balanceOf(user2.address);
    //2160 * 2 + 0
    expect(user1Balance).to.be.closeTo(parseEther("4320"), parseEther("1"));
    //1080 * 2 + 2160 * 2
    expect(user2Balance).to.be.closeTo(parseEther("6480"), parseEther("1"));

    expect(await ape.balanceOf(user1.address)).to.be.equal(
      parseEther("1000000")
    );
    expect(await ape.balanceOf(user2.address)).to.be.equal(
      parseEther("1000000")
    );
  });

  it("sApe test", async () => {
    const {
      users: [user1, user2, liquidator],
      ape,
      weth,
      bayc,
      mayc,
      bakc,
      pool,
      nBAYC,
      nMAYC,
    } = await loadFixture(fixture);

    await changePriceAndValidate(bayc, "100");
    await changePriceAndValidate(mayc, "50");
    await changePriceAndValidate(bakc, "25");
    await changePriceAndValidate(ape, "0.00001");

    //user1 collateral 200eth
    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(mayc, "1", user1, true);
    await supplyAndValidate(bakc, "2", user1, true);

    await supplyAndValidate(ape, "2000000", user2, true);

    //user1 borrow value 0.00001 * 1000000 = 10eth
    await waitForTx(
      await pool
        .connect(user1.signer)
        .borrow(ape.address, parseEther("1000000"), 0, user1.address)
    );
    expect(await ape.balanceOf(user1.address)).to.be.equal(
      parseEther("1000000")
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).depositApeCoinPool({
        cashToken: ape.address,
        cashAmount: parseEther("200000"),
        isBAYC: true,
        tokenIds: [0],
      })
    );
    await waitForTx(
      await paraApeStaking.connect(user1.signer).depositApeCoinPairPool({
        cashToken: ape.address,
        cashAmount: parseEther("50000"),
        isBAYC: true,
        apeTokenIds: [0],
        bakcTokenIds: [0],
      })
    );
    await waitForTx(
      await paraApeStaking.connect(user1.signer).depositApeCoinPool({
        cashToken: ape.address,
        cashAmount: parseEther("100000"),
        isBAYC: false,
        tokenIds: [0],
      })
    );
    await waitForTx(
      await paraApeStaking.connect(user1.signer).depositApeCoinPairPool({
        cashToken: ape.address,
        cashAmount: parseEther("50000"),
        isBAYC: false,
        apeTokenIds: [0],
        bakcTokenIds: [1],
      })
    );
    expect(await ape.balanceOf(user1.address)).to.be.equal(
      parseEther("600000")
    );
    expect(await pSApeCoin.balanceOf(user1.address)).to.be.equal(
      parseEther("400000")
    );
    expect(await paraApeStaking.stakedSApeBalance(user1.address)).to.be.equal(
      parseEther("400000")
    );
    expect(await paraApeStaking.freeSApeBalance(user1.address)).to.be.equal(
      parseEther("0")
    );

    //user1 borrow value = 200 eth
    await changePriceAndValidate(ape, "0.0002");
    await changeSApePriceAndValidate(sApeAddress, "0.0002");

    await mintAndValidate(weth, "200", liquidator);
    await waitForTx(
      await weth
        .connect(liquidator.signer)
        .approve(pool.address, MAX_UINT_AMOUNT)
    );

    // start auction
    await waitForTx(
      await pool
        .connect(liquidator.signer)
        .startAuction(user1.address, bayc.address, 0)
    );
    let auctionData = await pool.getAuctionData(nBAYC.address, 0);
    await advanceBlock(
      auctionData.startTime
        .add(auctionData.tickLength.mul(BigNumber.from(40)))
        .toNumber()
    );

    // try to liquidate the NFT
    expect(
      await pool
        .connect(liquidator.signer)
        .liquidateERC721(
          bayc.address,
          user1.address,
          0,
          parseEther("100"),
          false,
          {gasLimit: 5000000}
        )
    );
    expect(await pSApeCoin.balanceOf(user1.address)).to.be.closeTo(
      parseEther("400000"),
      parseEther("1")
    );
    expect(await paraApeStaking.stakedSApeBalance(user1.address)).to.be.closeTo(
      parseEther("150000"),
      parseEther("1")
    );
    expect(await paraApeStaking.freeSApeBalance(user1.address)).to.be.closeTo(
      parseEther("250000"),
      parseEther("1")
    );

    await waitForTx(
      await pool
        .connect(liquidator.signer)
        .startAuction(user1.address, mayc.address, 0)
    );
    auctionData = await pool.getAuctionData(nMAYC.address, 0);
    await advanceBlock(
      auctionData.startTime
        .add(auctionData.tickLength.mul(BigNumber.from(40)))
        .toNumber()
    );

    expect(
      await pool
        .connect(liquidator.signer)
        .liquidateERC721(
          mayc.address,
          user1.address,
          0,
          parseEther("50"),
          false,
          {gasLimit: 5000000}
        )
    );
    expect(await pSApeCoin.balanceOf(user1.address)).to.be.closeTo(
      parseEther("400000"),
      parseEther("1")
    );
    expect(await paraApeStaking.stakedSApeBalance(user1.address)).to.be.closeTo(
      parseEther("0"),
      parseEther("1")
    );
    expect(await paraApeStaking.freeSApeBalance(user1.address)).to.be.closeTo(
      parseEther("400000"),
      parseEther("1")
    );

    const accountData0 = await pool.getUserAccountData(user1.address);
    await waitForTx(
      await pool
        .connect(user1.signer)
        .setUserUseERC20AsCollateral(sApeAddress, true)
    );
    const accountData1 = await pool.getUserAccountData(user1.address);
    //400000 * 0.0002 = 80
    expect(
      accountData1.totalCollateralBase.sub(accountData0.totalCollateralBase)
    ).to.be.closeTo(parseEther("80"), parseEther("1"));

    await changePriceAndValidate(ape, "0.0004");
    await changeSApePriceAndValidate(sApeAddress, "0.0004");

    //liquidate sApe
    await mintAndValidate(ape, "1000000", liquidator);
    await waitForTx(
      await ape
        .connect(liquidator.signer)
        .approve(pool.address, MAX_UINT_AMOUNT)
    );

    await waitForTx(
      await pool
        .connect(liquidator.signer)
        .liquidateERC20(
          sApeAddress,
          ape.address,
          user1.address,
          parseEther("400000"),
          true
        )
    );
    const user1Balance = await pSApeCoin.balanceOf(user1.address);
    const liquidatorBalance = await pSApeCoin.balanceOf(liquidator.address);
    expect(user1Balance).to.be.closeTo("0", parseEther("1"));
    expect(liquidatorBalance).to.be.closeTo(
      parseEther("400000"),
      parseEther("1")
    );
  });

  it("depositApeCoinPool revert test", async () => {
    const {
      users: [user1, user2],
      ape,
      bayc,
    } = await loadFixture(fixture);

    await mintAndValidate(ape, "2000000", user1);
    await supplyAndValidate(bayc, "1", user1, true);

    await expect(
      paraApeStaking.connect(user2.signer).depositApeCoinPool({
        cashToken: ape.address,
        cashAmount: parseEther("200000"),
        isBAYC: true,
        tokenIds: [0],
      })
    ).to.be.revertedWith(ProtocolErrors.NOT_THE_OWNER);

    await expect(
      paraApeStaking.connect(user1.signer).depositApeCoinPool({
        cashToken: ape.address,
        cashAmount: parseEther("100000"),
        isBAYC: true,
        tokenIds: [0],
      })
    ).to.be.revertedWith(ProtocolErrors.SAPE_FREE_BALANCE_NOT_ENOUGH);
  });

  it("compoundApeCoinPool revert test", async () => {
    const {
      users: [user1, , , user4],
      ape,
      bayc,
      bakc,
    } = await loadFixture(fixture);

    await mintAndValidate(ape, "2000000", user1);
    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user1, true);

    await waitForTx(
      await paraApeStaking.connect(user1.signer).depositApeCoinPairPool({
        cashToken: ape.address,
        cashAmount: parseEther("50000"),
        isBAYC: true,
        apeTokenIds: [0],
        bakcTokenIds: [0],
      })
    );

    await expect(
      paraApeStaking.connect(user4.signer).compoundApeCoinPool(true, [0])
    ).to.be.revertedWith(ProtocolErrors.NFT_NOT_IN_POOL);
  });

  it("claimApeCoinPool revert test", async () => {
    const {
      users: [user1, user2, , user4],
      ape,
      bayc,
      bakc,
      nBAYC,
    } = await loadFixture(fixture);

    await mintAndValidate(ape, "2000000", user1);
    await mintAndValidate(ape, "2000000", user2);
    await supplyAndValidate(bayc, "3", user1, true);
    await supplyAndValidate(bakc, "1", user1, true);

    await waitForTx(
      await nBAYC
        .connect(user1.signer)
        .transferFrom(user1.address, user2.address, 1)
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).depositApeCoinPool({
        cashToken: ape.address,
        cashAmount: parseEther("200000"),
        isBAYC: true,
        tokenIds: [0],
      })
    );
    await waitForTx(
      await paraApeStaking.connect(user2.signer).depositApeCoinPool({
        cashToken: ape.address,
        cashAmount: parseEther("200000"),
        isBAYC: true,
        tokenIds: [1],
      })
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).depositApeCoinPairPool({
        cashToken: ape.address,
        cashAmount: parseEther("50000"),
        isBAYC: true,
        apeTokenIds: [2],
        bakcTokenIds: [0],
      })
    );

    await advanceTimeAndBlock(parseInt("3600"));
    await waitForTx(
      await paraApeStaking
        .connect(user4.signer)
        .compoundApeCoinPool(true, [0, 1])
    );

    await expect(
      paraApeStaking.connect(user1.signer).claimApeCoinPool(true, [0, 1])
    ).to.be.revertedWith(ProtocolErrors.NOT_THE_SAME_OWNER);

    await expect(
      paraApeStaking.connect(user1.signer).claimApeCoinPool(true, [2])
    ).to.be.revertedWith(ProtocolErrors.NFT_NOT_IN_POOL);
  });

  it("withdrawApeCoinPool revert test", async () => {
    const {
      users: [user1, user2],
      ape,
      bayc,
      bakc,
      nBAYC,
    } = await loadFixture(fixture);

    await mintAndValidate(ape, "2000000", user1);
    await mintAndValidate(ape, "2000000", user2);
    await supplyAndValidate(bayc, "2", user1, true);
    await supplyAndValidate(bakc, "1", user1, true);

    await waitForTx(
      await nBAYC
        .connect(user1.signer)
        .transferFrom(user1.address, user2.address, 1)
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).depositApeCoinPool({
        cashToken: ape.address,
        cashAmount: parseEther("200000"),
        isBAYC: true,
        tokenIds: [0],
      })
    );
    await waitForTx(
      await paraApeStaking.connect(user2.signer).depositApeCoinPool({
        cashToken: ape.address,
        cashAmount: parseEther("200000"),
        isBAYC: true,
        tokenIds: [1],
      })
    );

    await expect(
      paraApeStaking.connect(user1.signer).withdrawApeCoinPool({
        cashToken: ape.address,
        cashAmount: parseEther("200000"),
        isBAYC: true,
        tokenIds: [1],
      })
    ).to.be.revertedWith(ProtocolErrors.NOT_THE_OWNER);

    await expect(
      paraApeStaking.connect(user1.signer).withdrawApeCoinPool({
        cashToken: ape.address,
        cashAmount: parseEther("300000"),
        isBAYC: true,
        tokenIds: [0],
      })
    ).to.be.revertedWith(ProtocolErrors.INVALID_CASH_AMOUNT);
  });

  it("depositApeCoinPairPool revert test", async () => {
    const {
      users: [user1, user2],
      ape,
      bayc,
      bakc,
    } = await loadFixture(fixture);

    await mintAndValidate(ape, "2000000", user1);
    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user1, true);

    await expect(
      paraApeStaking.connect(user2.signer).depositApeCoinPairPool({
        cashToken: ape.address,
        cashAmount: parseEther("50000"),
        isBAYC: true,
        apeTokenIds: [0],
        bakcTokenIds: [0],
      })
    ).to.be.revertedWith(ProtocolErrors.NOT_THE_OWNER);

    await expect(
      paraApeStaking.connect(user1.signer).depositApeCoinPairPool({
        cashToken: ape.address,
        cashAmount: parseEther("1"),
        isBAYC: true,
        apeTokenIds: [0],
        bakcTokenIds: [0],
      })
    ).to.be.revertedWith(ProtocolErrors.SAPE_FREE_BALANCE_NOT_ENOUGH);
  });

  it("compoundApeCoinPairPool revert test", async () => {
    const {
      users: [user1, , , user4],
      ape,
      bayc,
      bakc,
    } = await loadFixture(fixture);

    await mintAndValidate(ape, "2000000", user1);
    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user1, true);

    await waitForTx(
      await paraApeStaking.connect(user1.signer).depositApeCoinPool({
        cashToken: ape.address,
        cashAmount: parseEther("200000"),
        isBAYC: true,
        tokenIds: [0],
      })
    );

    await expect(
      paraApeStaking
        .connect(user4.signer)
        .compoundApeCoinPairPool(true, [0], [0])
    ).to.be.revertedWith(ProtocolErrors.NFT_NOT_IN_POOL);
  });

  it("claimApeCoinPairPool revert test", async () => {
    const {
      users: [user1, user2, , user4],
      ape,
      bayc,
      bakc,
      nBAYC,
      nBAKC,
    } = await loadFixture(fixture);

    await mintAndValidate(ape, "2000000", user1);
    await mintAndValidate(ape, "2000000", user2);
    await supplyAndValidate(bayc, "3", user1, true);
    await supplyAndValidate(bakc, "2", user1, true);

    await waitForTx(
      await nBAYC
        .connect(user1.signer)
        .transferFrom(user1.address, user2.address, 1)
    );
    await waitForTx(
      await nBAKC
        .connect(user1.signer)
        .transferFrom(user1.address, user2.address, 1)
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).depositApeCoinPairPool({
        cashToken: ape.address,
        cashAmount: parseEther("50000"),
        isBAYC: true,
        apeTokenIds: [0],
        bakcTokenIds: [0],
      })
    );
    await waitForTx(
      await paraApeStaking.connect(user2.signer).depositApeCoinPairPool({
        cashToken: ape.address,
        cashAmount: parseEther("50000"),
        isBAYC: true,
        apeTokenIds: [1],
        bakcTokenIds: [1],
      })
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).depositApeCoinPool({
        cashToken: ape.address,
        cashAmount: parseEther("200000"),
        isBAYC: true,
        tokenIds: [2],
      })
    );

    await advanceTimeAndBlock(parseInt("3600"));
    await waitForTx(
      await paraApeStaking
        .connect(user4.signer)
        .compoundApeCoinPairPool(true, [0, 1], [0, 1])
    );

    await expect(
      paraApeStaking.connect(user1.signer).claimApeCoinPairPool(true, [0, 1])
    ).to.be.revertedWith(ProtocolErrors.NOT_THE_SAME_OWNER);

    await expect(
      paraApeStaking.connect(user1.signer).claimApeCoinPairPool(true, [2])
    ).to.be.revertedWith(ProtocolErrors.NFT_NOT_IN_POOL);
  });

  it("withdrawApeCoinPairPool revert test", async () => {
    const {
      users: [user1, user2],
      ape,
      bayc,
      bakc,
      nBAYC,
      nBAKC,
    } = await loadFixture(fixture);

    await mintAndValidate(ape, "2000000", user1);
    await mintAndValidate(ape, "2000000", user2);
    await supplyAndValidate(bayc, "2", user1, true);
    await supplyAndValidate(bakc, "2", user1, true);

    await waitForTx(
      await nBAYC
        .connect(user1.signer)
        .transferFrom(user1.address, user2.address, 1)
    );
    await waitForTx(
      await nBAKC
        .connect(user1.signer)
        .transferFrom(user1.address, user2.address, 1)
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).depositApeCoinPairPool({
        cashToken: ape.address,
        cashAmount: parseEther("50000"),
        isBAYC: true,
        apeTokenIds: [0],
        bakcTokenIds: [0],
      })
    );
    await waitForTx(
      await paraApeStaking.connect(user2.signer).depositApeCoinPairPool({
        cashToken: ape.address,
        cashAmount: parseEther("50000"),
        isBAYC: true,
        apeTokenIds: [1],
        bakcTokenIds: [1],
      })
    );

    await expect(
      paraApeStaking.connect(user1.signer).withdrawApeCoinPairPool({
        cashToken: ape.address,
        cashAmount: parseEther("50000"),
        isBAYC: true,
        apeTokenIds: [1],
        bakcTokenIds: [1],
      })
    ).to.be.revertedWith(ProtocolErrors.NOT_THE_OWNER);

    await expect(
      paraApeStaking.connect(user1.signer).withdrawApeCoinPairPool({
        cashToken: ape.address,
        cashAmount: parseEther("300000"),
        isBAYC: true,
        apeTokenIds: [0],
        bakcTokenIds: [0],
      })
    ).to.be.revertedWith(ProtocolErrors.INVALID_CASH_AMOUNT);
  });
});
