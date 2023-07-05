import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {
  AutoCompoundApe,
  P2PPairStaking,
  ParaApeStaking,
  VariableDebtToken,
} from "../types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {mintAndValidate, supplyAndValidate} from "./helpers/validated-steps";
import {
  getAutoCompoundApe,
  getInitializableAdminUpgradeabilityProxy,
  getP2PPairStaking,
  getParaApeStaking,
  getVariableDebtToken,
} from "../helpers/contracts-getters";
import {MAX_UINT_AMOUNT} from "../helpers/constants";
import {advanceTimeAndBlock, waitForTx} from "../helpers/misc-utils";
import {getSignedListingOrder} from "./helpers/p2ppairstaking-helper";
import {parseEther} from "ethers/lib/utils";
import {almostEqual} from "./helpers/uniswapv3-helper";
import {
  deployP2PPairStakingImpl,
  deployParaApeStakingImpl,
} from "../helpers/contracts-deployments";
import {GLOBAL_OVERRIDES} from "../helpers/hardhat-constants";
import {ProtocolErrors} from "../helpers/types";

describe("Para Ape Staking Test", () => {
  let testEnv: TestEnv;
  let variableDebtCApeCoin: VariableDebtToken;
  let paraApeStaking: ParaApeStaking;
  let cApe: AutoCompoundApe;
  let MINIMUM_LIQUIDITY;

  const fixture = async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {
      ape,
      users: [user1, , , user4, user5, user6],
      apeCoinStaking,
      pool,
      protocolDataProvider,
    } = testEnv;

    //upgrade to non-fake implementation
    const paraApeStakingImpl = await deployParaApeStakingImpl(0);
    paraApeStaking = await getParaApeStaking();
    const paraApeStakingProxy = await getInitializableAdminUpgradeabilityProxy(
      paraApeStaking.address
    );
    await waitForTx(
      await paraApeStakingProxy
        .connect(user5.signer)
        .upgradeTo(paraApeStakingImpl.address, GLOBAL_OVERRIDES)
    );

    cApe = await getAutoCompoundApe();
    MINIMUM_LIQUIDITY = await cApe.MINIMUM_LIQUIDITY();

    const {variableDebtTokenAddress: variableDebtCApeCoinAddress} =
      await protocolDataProvider.getReserveTokensAddresses(cApe.address);
    variableDebtCApeCoin = await getVariableDebtToken(
      variableDebtCApeCoinAddress
    );
    console.log("paraApeStaking address:", paraApeStaking.address);
    console.log("variableDebtCApeCoinAddress:", variableDebtCApeCoinAddress);

    // send extra tokens to the apestaking contract for rewards
    await waitForTx(
      await ape
        .connect(user1.signer)
        ["mint(address,uint256)"](
          apeCoinStaking.address,
          parseEther("100000000000")
        )
    );

    // user4 deposit MINIMUM_LIQUIDITY to make test case easy
    await mintAndValidate(ape, "1", user6);
    await waitForTx(
      await ape.connect(user6.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await cApe.connect(user6.signer).deposit(user6.address, MINIMUM_LIQUIDITY)
    );

    // user3 deposit and supply cApe to MM
    await mintAndValidate(ape, "10000000", user4);
    await waitForTx(
      await ape.connect(user4.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await cApe
        .connect(user4.signer)
        .deposit(user4.address, parseEther("10000000"))
    );
    await waitForTx(
      await cApe.connect(user4.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await pool
        .connect(user4.signer)
        .supply(cApe.address, parseEther("10000000"), user4.address, 0)
    );

    return testEnv;
  };

  it("test BAYC + BAKC pool logic", async () => {
    const {
      users: [user1, user2, user3],
      bayc,
      bakc,
      nBAYC,
      nBAKC,
      apeCoinStaking,
    } = await loadFixture(fixture);

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
      await paraApeStaking
        .connect(user1.signer)
        .depositPairNFT(true, [0, 1], [0, 1])
    );
    await waitForTx(
      await paraApeStaking.connect(user2.signer).depositPairNFT(true, [2], [2])
    );
    expect (await bayc.ownerOf(0)).to.be.equal(paraApeStaking.address);
    expect (await bayc.ownerOf(1)).to.be.equal(paraApeStaking.address);
    expect (await bayc.ownerOf(2)).to.be.equal(paraApeStaking.address);
    expect (await bakc.ownerOf(0)).to.be.equal(paraApeStaking.address);
    expect (await bakc.ownerOf(1)).to.be.equal(paraApeStaking.address);
    expect (await bakc.ownerOf(2)).to.be.equal(paraApeStaking.address);

    await waitForTx(
      await paraApeStaking
        .connect(user3.signer)
        .stakingPairNFT(true, [0, 1, 2], [0, 1, 2])
    );
    expect((await apeCoinStaking.nftPosition(1, 0)).stakedAmount).to.be.eq(parseEther("200000"));
    expect((await apeCoinStaking.nftPosition(1, 1)).stakedAmount).to.be.eq(parseEther("200000"));
    expect((await apeCoinStaking.nftPosition(1, 2)).stakedAmount).to.be.eq(parseEther("200000"));
    expect((await apeCoinStaking.nftPosition(3, 0)).stakedAmount).to.be.eq(parseEther("50000"));
    expect((await apeCoinStaking.nftPosition(3, 1)).stakedAmount).to.be.eq(parseEther("50000"));
    expect((await apeCoinStaking.nftPosition(3, 2)).stakedAmount).to.be.eq(parseEther("50000"));
    expect(
        await variableDebtCApeCoin.balanceOf(paraApeStaking.address)
    ).to.be.closeTo(parseEther("750000"), parseEther("10"));

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
        await paraApeStaking
            .connect(user3.signer)
            .compoundPairNFT(true, [0, 1, 2], [0, 1, 2])
    );

    await waitForTx(
        await paraApeStaking
            .connect(user1.signer)
            .claimPairNFT(true, [0, 1], [0, 1])
    );
    await waitForTx(
        await paraApeStaking
            .connect(user2.signer)
            .claimPairNFT(true, [2], [2])
    );
    const user1Balance = await cApe.balanceOf(user1.address);
    const user2Balance = await cApe.balanceOf(user2.address);
    expect(user1Balance).to.be.closeTo(user2Balance.mul(2), parseEther("10"));

    await waitForTx(
        await paraApeStaking
            .connect(user1.signer)
            .withdrawPairNFT(true, [0, 1], [0, 1])
    );
    await waitForTx(
        await paraApeStaking
            .connect(user2.signer)
            .withdrawPairNFT(true, [2], [2])
    );
    expect (await bayc.ownerOf(0)).to.be.equal(nBAYC.address);
    expect (await bayc.ownerOf(1)).to.be.equal(nBAYC.address);
    expect (await bayc.ownerOf(2)).to.be.equal(nBAYC.address);
    expect (await bakc.ownerOf(0)).to.be.equal(nBAKC.address);
    expect (await bakc.ownerOf(1)).to.be.equal(nBAKC.address);
    expect (await bakc.ownerOf(2)).to.be.equal(nBAKC.address);
  });

  it("test MAYC + BAKC pool logic", async () => {
    const {
      users: [user1, user2, user3],
      mayc,
      bakc,
      nMAYC,
      nBAKC,
      apeCoinStaking,
    } = await loadFixture(fixture);

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
      await paraApeStaking
        .connect(user1.signer)
        .depositPairNFT(false, [0, 1], [0, 1])
    );
    await waitForTx(
      await paraApeStaking.connect(user2.signer).depositPairNFT(false, [2], [2])
    );
    expect (await mayc.ownerOf(0)).to.be.equal(paraApeStaking.address);
    expect (await mayc.ownerOf(1)).to.be.equal(paraApeStaking.address);
    expect (await mayc.ownerOf(2)).to.be.equal(paraApeStaking.address);
    expect (await bakc.ownerOf(0)).to.be.equal(paraApeStaking.address);
    expect (await bakc.ownerOf(1)).to.be.equal(paraApeStaking.address);
    expect (await bakc.ownerOf(2)).to.be.equal(paraApeStaking.address);

    await waitForTx(
      await paraApeStaking
        .connect(user3.signer)
        .stakingPairNFT(false, [0, 1, 2], [0, 1, 2])
    );
    expect((await apeCoinStaking.nftPosition(2, 0)).stakedAmount).to.be.eq(parseEther("100000"));
    expect((await apeCoinStaking.nftPosition(2, 1)).stakedAmount).to.be.eq(parseEther("100000"));
    expect((await apeCoinStaking.nftPosition(2, 2)).stakedAmount).to.be.eq(parseEther("100000"));
    expect((await apeCoinStaking.nftPosition(3, 0)).stakedAmount).to.be.eq(parseEther("50000"));
    expect((await apeCoinStaking.nftPosition(3, 1)).stakedAmount).to.be.eq(parseEther("50000"));
    expect((await apeCoinStaking.nftPosition(3, 2)).stakedAmount).to.be.eq(parseEther("50000"));
    expect(
        await variableDebtCApeCoin.balanceOf(paraApeStaking.address)
    ).to.be.closeTo(parseEther("450000"), parseEther("10"));

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
        await paraApeStaking
            .connect(user3.signer)
            .compoundPairNFT(false, [0, 1, 2], [0, 1, 2])
    );

    await waitForTx(
        await paraApeStaking
            .connect(user1.signer)
            .claimPairNFT(false, [0, 1], [0, 1])
    );
    await waitForTx(
        await paraApeStaking
            .connect(user2.signer)
            .claimPairNFT(false, [2], [2])
    );
    const user1Balance = await cApe.balanceOf(user1.address);
    const user2Balance = await cApe.balanceOf(user2.address);
    expect(user1Balance).to.be.closeTo(user2Balance.mul(2), parseEther("10"));

    await waitForTx(
        await paraApeStaking
            .connect(user1.signer)
            .withdrawPairNFT(false, [0, 1], [0, 1])
    );
    await waitForTx(
        await paraApeStaking
            .connect(user2.signer)
            .withdrawPairNFT(false, [2], [2])
    );
    expect (await mayc.ownerOf(0)).to.be.equal(nMAYC.address);
    expect (await mayc.ownerOf(1)).to.be.equal(nMAYC.address);
    expect (await mayc.ownerOf(2)).to.be.equal(nMAYC.address);
    expect (await bakc.ownerOf(0)).to.be.equal(nBAKC.address);
    expect (await bakc.ownerOf(1)).to.be.equal(nBAKC.address);
    expect (await bakc.ownerOf(2)).to.be.equal(nBAKC.address);
  });
});
