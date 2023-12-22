import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {MAX_UINT_AMOUNT} from "../helpers/constants";
import {getAutoCompoundApe, getVault} from "../helpers/contracts-getters";
import {advanceTimeAndBlock, waitForTx} from "../helpers/misc-utils";
import {AutoCompoundApe, IVault} from "../types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";

import {mintAndValidate} from "./helpers/validated-steps";
import {ProtocolErrors} from "../helpers/types";
import {parseEther} from "ethers/lib/utils";
import {deployVault} from "../helpers/contracts-deployments";

describe("Vault Ape staking Test", () => {
  let testEnv: TestEnv;
  let vaultProxy: IVault;
  let cApe: AutoCompoundApe;
  let MINIMUM_LIQUIDITY;

  const fixture = async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {
      ape,
      users: [user1, , , user4, , user6],
      apeCoinStaking,
      poolAdmin,
    } = testEnv;

    await deployVault();
    vaultProxy = await getVault();

    await waitForTx(
      await vaultProxy.connect(poolAdmin.signer).setApeStakingBot(user4.address)
    );

    cApe = await getAutoCompoundApe();
    MINIMUM_LIQUIDITY = await cApe.MINIMUM_LIQUIDITY();

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
    await mintAndValidate(ape, "10000000000", user4);
    await waitForTx(
      await ape.connect(user4.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await cApe
        .connect(user4.signer)
        .deposit(user4.address, parseEther("10000000000"))
    );

    return testEnv;
  };

  it("test basic logic", async () => {
    const {
      users: [user1, user2, user3, user4],
      bayc,
      mayc,
      bakc,
      apeCoinStaking,
      poolAdmin,
    } = await loadFixture(fixture);

    await waitForTx(
      await vaultProxy.connect(poolAdmin.signer).setCompoundFeeRate(1000)
    );
    await waitForTx(
      await vaultProxy
        .connect(poolAdmin.signer)
        .setCApeIncomeRate(bayc.address, 5000)
    );
    await waitForTx(
      await vaultProxy
        .connect(poolAdmin.signer)
        .setCApeIncomeRate(mayc.address, 5000)
    );
    await waitForTx(
      await vaultProxy
        .connect(poolAdmin.signer)
        .setCApeIncomeRate(bakc.address, 5000)
    );

    await mintAndValidate(bayc, "3", user1);
    await mintAndValidate(mayc, "3", user2);
    await mintAndValidate(bakc, "3", user3);

    const cApeTotalSupplyBefore = await cApe.totalSupply();

    await waitForTx(
      await bayc
        .connect(user1.signer)
        .setApprovalForAll(vaultProxy.address, true)
    );
    await waitForTx(
      await mayc
        .connect(user2.signer)
        .setApprovalForAll(vaultProxy.address, true)
    );
    await waitForTx(
      await bakc
        .connect(user3.signer)
        .setApprovalForAll(vaultProxy.address, true)
    );

    await waitForTx(
      await vaultProxy
        .connect(user1.signer)
        .onboardNFTs(bayc.address, [0, 1, 2])
    );
    await waitForTx(
      await vaultProxy
        .connect(user2.signer)
        .onboardNFTs(mayc.address, [0, 1, 2])
    );
    await waitForTx(
      await vaultProxy
        .connect(user3.signer)
        .onboardNFTs(bakc.address, [0, 1, 2])
    );
    await waitForTx(
      await vaultProxy.connect(user4.signer).stakingApe(true, [0, 1, 2])
    );
    await waitForTx(
      await vaultProxy.connect(user4.signer).stakingApe(false, [0, 1, 2])
    );
    await waitForTx(
      await vaultProxy.connect(user4.signer).stakingBAKC({
        baycTokenIds: [0, 1],
        bakcPairBaycTokenIds: [0, 1],
        maycTokenIds: [2],
        bakcPairMaycTokenIds: [2],
      })
    );
    expect((await apeCoinStaking.nftPosition(1, 0)).stakedAmount).to.be.eq(
      parseEther("200000")
    );
    expect((await apeCoinStaking.nftPosition(1, 1)).stakedAmount).to.be.eq(
      parseEther("200000")
    );
    expect((await apeCoinStaking.nftPosition(1, 2)).stakedAmount).to.be.eq(
      parseEther("200000")
    );
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

    expect(await cApe.nftStakingBalance()).to.be.closeTo(
      parseEther("1050000"),
      parseEther("10")
    );

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await vaultProxy.connect(user4.signer).compoundApe(true, [0, 1, 2])
    );
    await waitForTx(
      await vaultProxy.connect(user4.signer).compoundApe(false, [0, 1, 2])
    );
    await waitForTx(
      await vaultProxy.connect(user4.signer).compoundBAKC({
        baycTokenIds: [0, 1],
        bakcPairBaycTokenIds: [0, 1],
        maycTokenIds: [2],
        bakcPairMaycTokenIds: [2],
      })
    );
    let compoundFee = await vaultProxy.compoundFee();
    expect(compoundFee).to.be.closeTo(parseEther("1080"), parseEther("10"));

    const user1PendingReward = await vaultProxy.getPendingReward(
      bayc.address,
      [0, 1, 2]
    );
    const user2PendingReward = await vaultProxy.getPendingReward(
      mayc.address,
      [0, 1, 2]
    );
    const user3PendingReward = await vaultProxy.getPendingReward(
      bakc.address,
      [0, 1, 2]
    );
    expect(user1PendingReward).to.be.closeTo(
      parseEther("1620"),
      parseEther("100")
    );
    expect(user2PendingReward).to.be.closeTo(
      parseEther("1620"),
      parseEther("100")
    );
    expect(user3PendingReward).to.be.closeTo(
      parseEther("1620"),
      parseEther("100")
    );

    await waitForTx(
      await vaultProxy
        .connect(user1.signer)
        .claimPendingReward(bayc.address, [0, 1, 2])
    );
    await waitForTx(
      await vaultProxy
        .connect(user2.signer)
        .claimPendingReward(mayc.address, [0, 1, 2])
    );
    await waitForTx(
      await vaultProxy
        .connect(user3.signer)
        .claimPendingReward(bakc.address, [0, 1, 2])
    );
    let user1Balance = await cApe.balanceOf(user1.address);
    let user2Balance = await cApe.balanceOf(user2.address);
    let user3Balance = await cApe.balanceOf(user3.address);
    expect(user1Balance).to.be.closeTo(user1PendingReward, parseEther("100"));
    expect(user2Balance).to.be.closeTo(user2PendingReward, parseEther("100"));
    expect(user3Balance).to.be.closeTo(user3PendingReward, parseEther("100"));

    const newUser1PendingReward = await vaultProxy.getPendingReward(
      bayc.address,
      [0, 1, 2]
    );
    const newUser2PendingReward = await vaultProxy.getPendingReward(
      mayc.address,
      [0, 1, 2]
    );
    const newUser3PendingReward = await vaultProxy.getPendingReward(
      bakc.address,
      [0, 1, 2]
    );
    expect(newUser1PendingReward).to.be.equal(0);
    expect(newUser2PendingReward).to.be.equal(0);
    expect(newUser3PendingReward).to.be.equal(0);

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await vaultProxy
        .connect(user1.signer)
        .offboardNFTs(bayc.address, [0, 1, 2])
    );
    await waitForTx(
      await vaultProxy
        .connect(user2.signer)
        .offboardNFTs(mayc.address, [0, 1, 2])
    );
    await waitForTx(
      await vaultProxy
        .connect(user3.signer)
        .offboardNFTs(bakc.address, [0, 1, 2])
    );
    expect(await bayc.ownerOf(0)).to.be.equal(user1.address);
    expect(await bayc.ownerOf(1)).to.be.equal(user1.address);
    expect(await bayc.ownerOf(2)).to.be.equal(user1.address);
    expect(await mayc.ownerOf(0)).to.be.equal(user2.address);
    expect(await mayc.ownerOf(1)).to.be.equal(user2.address);
    expect(await mayc.ownerOf(2)).to.be.equal(user2.address);
    expect(await bakc.ownerOf(0)).to.be.equal(user3.address);
    expect(await bakc.ownerOf(1)).to.be.equal(user3.address);
    expect(await bakc.ownerOf(2)).to.be.equal(user3.address);

    //1080 + 1080
    compoundFee = await vaultProxy.compoundFee();
    expect(compoundFee).to.be.closeTo(parseEther("2160"), parseEther("100"));

    const compoundFeeBalanceBefore = await cApe.balanceOf(user4.address);
    await waitForTx(
      await vaultProxy.connect(user4.signer).claimCompoundFee(user4.address)
    );
    const compoundFeeBalanceAfter = await cApe.balanceOf(user4.address);
    expect(compoundFeeBalanceAfter.sub(compoundFeeBalanceBefore)).to.be.closeTo(
      compoundFee,
      parseEther("1")
    );

    //withdraw cannot claim pending reward
    user1Balance = await cApe.balanceOf(user1.address);
    user2Balance = await cApe.balanceOf(user2.address);
    user3Balance = await cApe.balanceOf(user3.address);
    expect(user1Balance).to.be.closeTo(
      user1PendingReward.mul(2),
      parseEther("1")
    );
    expect(user2Balance).to.be.closeTo(
      user2PendingReward.mul(2),
      parseEther("1")
    );
    expect(user3Balance).to.be.closeTo(
      user3PendingReward.mul(2),
      parseEther("10")
    );

    expect(await cApe.nftStakingBalance()).to.be.closeTo(
      parseEther("0"),
      parseEther("10")
    );

    expect(await cApe.balanceOf(vaultProxy.address)).to.be.closeTo(
      "0",
      parseEther("10")
    );

    const cApeTotalSupplyAfter = await cApe.totalSupply();
    //3600 * 4 * 2 = 28800
    expect(cApeTotalSupplyAfter.sub(cApeTotalSupplyBefore)).to.be.closeTo(
      parseEther("28800"),
      parseEther("100")
    );
  });

  it("onboard revert test", async () => {
    const {
      users: [user1],
      ape,
      bayc,
      bakc,
      apeCoinStaking,
    } = await loadFixture(fixture);

    await expect(
      vaultProxy
        .connect(user1.signer)
        .onboardCheckApeStakingPosition(bayc.address, [0], user1.address)
    ).to.be.revertedWith(ProtocolErrors.INVALID_CALLER);

    await mintAndValidate(bayc, "3", user1);
    await mintAndValidate(bakc, "3", user1);
    await mintAndValidate(ape, "10000", user1);
    await waitForTx(
      await ape
        .connect(user1.signer)
        .approve(apeCoinStaking.address, MAX_UINT_AMOUNT)
    );
    await apeCoinStaking
      .connect(user1.signer)
      .depositBAYC([{tokenId: 0, amount: parseEther("100")}]);
    await waitForTx(
      await bayc
        .connect(user1.signer)
        .setApprovalForAll(vaultProxy.address, true)
    );
    await expect(
      vaultProxy.connect(user1.signer).onboardNFTs(bayc.address, [0])
    ).to.be.revertedWith(ProtocolErrors.ALREADY_STAKING);

    await apeCoinStaking.connect(user1.signer).depositBAKC(
      [
        {
          mainTokenId: 1,
          bakcTokenId: 1,
          amount: parseEther("100"),
        },
      ],
      []
    );
    await expect(
      vaultProxy.connect(user1.signer).onboardNFTs(bayc.address, [1])
    ).to.be.revertedWith(ProtocolErrors.ALREADY_STAKING);
  });

  it("stakingApe revert test", async () => {
    const {
      users: [user1, , , user4],
      bayc,
    } = await loadFixture(fixture);

    await mintAndValidate(bayc, "1", user1);
    await waitForTx(
      await bayc
        .connect(user1.signer)
        .setApprovalForAll(vaultProxy.address, true)
    );

    await expect(
      vaultProxy.connect(user4.signer).stakingApe(true, [0])
    ).to.be.revertedWith(ProtocolErrors.NFT_NOT_IN_POOL);

    await waitForTx(
      await vaultProxy.connect(user1.signer).onboardNFTs(bayc.address, [0])
    );

    await waitForTx(
      await vaultProxy.connect(user4.signer).stakingApe(true, [0])
    );
  });

  it("stakingBAKC revert test", async () => {
    const {
      users: [user1, , , user4],
      bayc,
      mayc,
      bakc,
    } = await loadFixture(fixture);

    await mintAndValidate(bayc, "1", user1);
    await mintAndValidate(mayc, "1", user1);
    await mintAndValidate(bakc, "2", user1);

    await waitForTx(
      await bayc
        .connect(user1.signer)
        .setApprovalForAll(vaultProxy.address, true)
    );
    await waitForTx(
      await mayc
        .connect(user1.signer)
        .setApprovalForAll(vaultProxy.address, true)
    );
    await waitForTx(
      await bakc
        .connect(user1.signer)
        .setApprovalForAll(vaultProxy.address, true)
    );

    await expect(
      vaultProxy.connect(user4.signer).stakingBAKC({
        baycTokenIds: [0],
        bakcPairBaycTokenIds: [0],
        maycTokenIds: [],
        bakcPairMaycTokenIds: [],
      })
    ).to.be.revertedWith(ProtocolErrors.NFT_NOT_IN_POOL);

    await expect(
      vaultProxy.connect(user4.signer).stakingBAKC({
        baycTokenIds: [],
        bakcPairBaycTokenIds: [],
        maycTokenIds: [0],
        bakcPairMaycTokenIds: [0],
      })
    ).to.be.revertedWith(ProtocolErrors.NFT_NOT_IN_POOL);

    await waitForTx(
      await vaultProxy.connect(user1.signer).onboardNFTs(bayc.address, [0])
    );

    await waitForTx(
      await vaultProxy.connect(user1.signer).onboardNFTs(mayc.address, [0])
    );

    await waitForTx(
      await vaultProxy.connect(user1.signer).onboardNFTs(bakc.address, [0, 1])
    );

    await waitForTx(
      await vaultProxy.connect(user4.signer).stakingBAKC({
        baycTokenIds: [0],
        bakcPairBaycTokenIds: [0],
        maycTokenIds: [0],
        bakcPairMaycTokenIds: [1],
      })
    );

    await expect(
      vaultProxy.connect(user4.signer).stakingBAKC({
        baycTokenIds: [0],
        bakcPairBaycTokenIds: [0],
        maycTokenIds: [],
        bakcPairMaycTokenIds: [],
      })
    ).to.be.revertedWith(ProtocolErrors.ALREADY_STAKING);

    await expect(
      vaultProxy.connect(user4.signer).stakingBAKC({
        baycTokenIds: [],
        bakcPairBaycTokenIds: [],
        maycTokenIds: [0],
        bakcPairMaycTokenIds: [0],
      })
    ).to.be.revertedWith(ProtocolErrors.ALREADY_STAKING);
  });

  it("compoundApe revert test", async () => {
    const {
      users: [user1, , , user4],
      bayc,
    } = await loadFixture(fixture);

    await mintAndValidate(bayc, "3", user1);

    await waitForTx(
      await bayc
        .connect(user1.signer)
        .setApprovalForAll(vaultProxy.address, true)
    );

    await waitForTx(
      await vaultProxy.connect(user1.signer).onboardNFTs(bayc.address, [0, 1])
    );

    await waitForTx(
      await vaultProxy.connect(user4.signer).stakingApe(true, [0, 1])
    );

    await advanceTimeAndBlock(parseInt("3600"));

    await expect(vaultProxy.connect(user4.signer).compoundApe(true, [2])).to.be
      .reverted;

    await waitForTx(
      await vaultProxy.connect(user4.signer).compoundApe(true, [0, 1])
    );
  });

  it("compoundBAKC revert test", async () => {
    const {
      users: [user1, , , user4],
      bayc,
      bakc,
    } = await loadFixture(fixture);

    await mintAndValidate(bayc, "3", user1);
    await mintAndValidate(bakc, "3", user1);

    await waitForTx(
      await bayc
        .connect(user1.signer)
        .setApprovalForAll(vaultProxy.address, true)
    );
    await waitForTx(
      await bakc
        .connect(user1.signer)
        .setApprovalForAll(vaultProxy.address, true)
    );

    await waitForTx(
      await vaultProxy
        .connect(user1.signer)
        .onboardNFTs(bayc.address, [0, 1, 2])
    );
    await waitForTx(
      await vaultProxy
        .connect(user1.signer)
        .onboardNFTs(bakc.address, [0, 1, 2])
    );

    await waitForTx(
      await vaultProxy.connect(user4.signer).stakingBAKC({
        baycTokenIds: [0, 1],
        bakcPairBaycTokenIds: [0, 1],
        maycTokenIds: [],
        bakcPairMaycTokenIds: [],
      })
    );

    await advanceTimeAndBlock(parseInt("3600"));

    await expect(
      vaultProxy.connect(user4.signer).compoundBAKC({
        baycTokenIds: [2],
        bakcPairBaycTokenIds: [1],
        maycTokenIds: [],
        bakcPairMaycTokenIds: [],
      })
    ).to.be.reverted;

    await expect(
      vaultProxy.connect(user4.signer).compoundBAKC({
        baycTokenIds: [1],
        bakcPairBaycTokenIds: [2],
        maycTokenIds: [],
        bakcPairMaycTokenIds: [],
      })
    ).to.be.reverted;

    await waitForTx(
      await vaultProxy.connect(user4.signer).compoundBAKC({
        baycTokenIds: [0, 1],
        bakcPairBaycTokenIds: [0, 1],
        maycTokenIds: [],
        bakcPairMaycTokenIds: [],
      })
    );
  });

  it("claimNFT revert test", async () => {
    const {
      users: [user1, user2, , user4],
      bayc,
      bakc,
    } = await loadFixture(fixture);

    await mintAndValidate(bayc, "3", user1);
    await mintAndValidate(bakc, "3", user1);
    await waitForTx(
      await bayc
        .connect(user1.signer)
        .setApprovalForAll(vaultProxy.address, true)
    );
    await waitForTx(
      await bakc
        .connect(user1.signer)
        .setApprovalForAll(vaultProxy.address, true)
    );

    await waitForTx(
      await vaultProxy.connect(user1.signer).onboardNFTs(bayc.address, [0, 1])
    );
    await waitForTx(
      await vaultProxy.connect(user1.signer).onboardNFTs(bakc.address, [0, 1])
    );

    await waitForTx(
      await vaultProxy.connect(user4.signer).stakingApe(true, [0, 1])
    );
    await waitForTx(
      await vaultProxy.connect(user4.signer).stakingBAKC({
        baycTokenIds: [0, 1],
        bakcPairBaycTokenIds: [0, 1],
        maycTokenIds: [],
        bakcPairMaycTokenIds: [],
      })
    );

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await vaultProxy.connect(user4.signer).compoundApe(true, [0, 1])
    );

    await waitForTx(
      await vaultProxy.connect(user4.signer).compoundBAKC({
        baycTokenIds: [0, 1],
        bakcPairBaycTokenIds: [0, 1],
        maycTokenIds: [],
        bakcPairMaycTokenIds: [],
      })
    );

    await expect(
      vaultProxy.connect(user2.signer).claimPendingReward(bayc.address, [0, 1])
    ).to.be.revertedWith(ProtocolErrors.INVALID_CALLER);

    await expect(
      vaultProxy.connect(user1.signer).claimPendingReward(bayc.address, [2])
    ).to.be.revertedWith(ProtocolErrors.INVALID_CALLER);

    await expect(
      vaultProxy.connect(user2.signer).claimPendingReward(bakc.address, [0, 1])
    ).to.be.revertedWith(ProtocolErrors.INVALID_CALLER);

    await expect(
      vaultProxy.connect(user1.signer).claimPendingReward(bakc.address, [2])
    ).to.be.revertedWith(ProtocolErrors.INVALID_CALLER);

    const pendingReward = await vaultProxy.getPendingReward(
      bayc.address,
      [0, 1]
    );

    //check repeated token id
    const balanceBefore = await cApe.balanceOf(user1.address);
    await waitForTx(
      await vaultProxy
        .connect(user1.signer)
        .claimPendingReward(bayc.address, [0, 1, 0, 1])
    );
    const balanceAfter = await cApe.balanceOf(user1.address);
    expect(balanceAfter.sub(balanceBefore)).to.be.closeTo(
      pendingReward,
      parseEther("10")
    );

    await waitForTx(
      await vaultProxy
        .connect(user1.signer)
        .claimPendingReward(bakc.address, [0, 1])
    );
  });

  it("multicall test", async () => {
    const {
      users: [user1, , , user4],
      bayc,
      mayc,
      bakc,
    } = await loadFixture(fixture);

    await mintAndValidate(bayc, "4", user1);
    await mintAndValidate(mayc, "4", user1);
    await mintAndValidate(bakc, "4", user1);
    await waitForTx(
      await bayc
        .connect(user1.signer)
        .setApprovalForAll(vaultProxy.address, true)
    );
    await waitForTx(
      await mayc
        .connect(user1.signer)
        .setApprovalForAll(vaultProxy.address, true)
    );
    await waitForTx(
      await bakc
        .connect(user1.signer)
        .setApprovalForAll(vaultProxy.address, true)
    );

    let tx0 = vaultProxy.interface.encodeFunctionData("onboardNFTs", [
      bayc.address,
      [0, 1, 2],
    ]);
    let tx1 = vaultProxy.interface.encodeFunctionData("onboardNFTs", [
      mayc.address,
      [0, 1, 2],
    ]);
    let tx2 = vaultProxy.interface.encodeFunctionData("onboardNFTs", [
      bakc.address,
      [0, 1, 2],
    ]);

    await waitForTx(
      await vaultProxy.connect(user1.signer).multicall([tx0, tx1, tx2])
    );

    tx0 = vaultProxy.interface.encodeFunctionData("stakingApe", [
      true,
      [0, 1, 2],
    ]);
    tx1 = vaultProxy.interface.encodeFunctionData("stakingApe", [
      false,
      [0, 1, 2],
    ]);
    tx2 = vaultProxy.interface.encodeFunctionData("stakingBAKC", [
      {
        baycTokenIds: [0, 1],
        bakcPairBaycTokenIds: [0, 1],
        maycTokenIds: [2],
        bakcPairMaycTokenIds: [2],
      },
    ]);

    await waitForTx(
      await vaultProxy.connect(user4.signer).multicall([tx0, tx1, tx2])
    );

    await advanceTimeAndBlock(parseInt("3600"));

    tx0 = vaultProxy.interface.encodeFunctionData("compoundApe", [
      true,
      [0, 1, 2],
    ]);
    tx1 = vaultProxy.interface.encodeFunctionData("compoundApe", [
      false,
      [0, 1, 2],
    ]);
    tx2 = vaultProxy.interface.encodeFunctionData("compoundBAKC", [
      {
        baycTokenIds: [0, 1],
        bakcPairBaycTokenIds: [0, 1],
        maycTokenIds: [2],
        bakcPairMaycTokenIds: [2],
      },
    ]);

    await waitForTx(
      await vaultProxy.connect(user4.signer).multicall([tx0, tx1, tx2])
    );

    tx0 = vaultProxy.interface.encodeFunctionData("claimPendingReward", [
      bayc.address,
      [0, 1, 2],
    ]);
    tx1 = vaultProxy.interface.encodeFunctionData("claimPendingReward", [
      mayc.address,
      [0, 1, 2],
    ]);
    tx2 = vaultProxy.interface.encodeFunctionData("claimPendingReward", [
      bakc.address,
      [0, 1, 2],
    ]);

    await waitForTx(
      await vaultProxy.connect(user1.signer).multicall([tx0, tx1, tx2])
    );

    const user1Balance = await cApe.balanceOf(user1.address);
    expect(user1Balance).to.be.closeTo(parseEther("10800"), parseEther("100"));
  });
});
