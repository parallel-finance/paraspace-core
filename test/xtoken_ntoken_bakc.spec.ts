import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {MAX_UINT_AMOUNT, ONE_ADDRESS} from "../helpers/constants";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";
import {advanceTimeAndBlock, waitForTx} from "../helpers/misc-utils";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {
  changePriceAndValidate,
  changeSApePriceAndValidate,
  mintAndValidate,
  supplyAndValidate,
} from "./helpers/validated-steps";
import {parseEther} from "ethers/lib/utils";

describe("APE Coin Staking Test", () => {
  let testEnv: TestEnv;
  const sApeAddress = ONE_ADDRESS;

  const fixture = async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {
      ape,
      mayc,
      bayc,
      users: [user1, depositor],
      pool,
      apeCoinStaking,
      bakc,
    } = testEnv;

    await supplyAndValidate(ape, "20000", depositor, true);
    await changePriceAndValidate(ape, "0.001");
    await changeSApePriceAndValidate(sApeAddress, "0.001");

    await changePriceAndValidate(mayc, "50");
    await changePriceAndValidate(bayc, "50");

    await waitForTx(
      await ape.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await bakc.connect(user1.signer).setApprovalForAll(pool.address, true)
    );

    // send extra tokens to the apestaking contract for rewards
    await waitForTx(
      await ape
        .connect(user1.signer)
        ["mint(address,uint256)"](
          apeCoinStaking.address,
          parseEther("100000000000")
        )
    );

    return testEnv;
  };

  it("user can supply bakc first and stake paired nft", async () => {
    const {
      users: [user1],
      ape,
      mayc,
      pool,
      bakc,
      nMAYC,
      nBAKC,
    } = await loadFixture(fixture);
    await supplyAndValidate(bakc, "1", user1, true);
    await supplyAndValidate(mayc, "1", user1, true);
    await mintAndValidate(ape, "10000", user1);

    const amount = await convertToCurrencyDecimals(ape.address, "10000");
    const halfAmount = await convertToCurrencyDecimals(ape.address, "5000");

    await waitForTx(
      await pool.connect(user1.signer).borrowApeAndStake(
        {
          nftAsset: mayc.address,
          borrowAsset: ape.address,
          borrowAmount: 0,
          cashAmount: amount,
        },
        [],
        [{mainTokenId: 0, bakcTokenId: 0, amount: amount}]
      )
    );

    const totalStake = await nMAYC.getUserApeStakingAmount(user1.address);
    expect(totalStake).equal(amount);

    // advance in time
    await advanceTimeAndBlock(parseInt("3600"));
    await waitForTx(
      await pool
        .connect(user1.signer)
        .claimBAKC(mayc.address, [{mainTokenId: 0, bakcTokenId: 0}])
    );
    let apeBalance = await ape.balanceOf(user1.address);
    expect(apeBalance).to.be.equal(parseEther("3600"));

    await advanceTimeAndBlock(parseInt("3600"));
    await waitForTx(
      await pool
        .connect(user1.signer)
        .claimBAKC(mayc.address, [{mainTokenId: 0, bakcTokenId: 0}])
    );
    apeBalance = await ape.balanceOf(user1.address);
    expect(apeBalance).to.be.equal(parseEther("7200"));

    await waitForTx(
      await pool.connect(user1.signer).withdrawBAKC(mayc.address, [
        {
          mainTokenId: 0,
          bakcTokenId: 0,
          amount: halfAmount,
          isUncommit: false,
        },
      ])
    );

    apeBalance = await ape.balanceOf(user1.address);
    expect(apeBalance).to.be.equal(parseEther("12200"));

    await waitForTx(
      await pool.connect(user1.signer).withdrawBAKC(mayc.address, [
        {
          mainTokenId: 0,
          bakcTokenId: 0,
          amount: halfAmount,
          isUncommit: true,
        },
      ])
    );

    apeBalance = await ape.balanceOf(user1.address);
    expect(apeBalance).to.be.equal(parseEther("17200"));

    await waitForTx(
      await pool
        .connect(user1.signer)
        .withdrawERC721(bakc.address, [0], user1.address)
    );
    expect(await nBAKC.balanceOf(user1.address)).to.be.equal(0);
    expect(await bakc.balanceOf(user1.address)).to.be.equal(1);
  });

  it("unstakeApePositionAndRepay when bakc in user wallet: bakc reward should transfer to user wallet", async () => {
    const {
      users: [user1],
      ape,
      mayc,
      pool,
      bakc,
    } = await loadFixture(fixture);

    await waitForTx(await bakc["mint(uint256,address)"]("1", user1.address));
    await supplyAndValidate(mayc, "1", user1, true);
    await mintAndValidate(ape, "10000", user1);
    const amount = await convertToCurrencyDecimals(ape.address, "10000");

    expect(
      await pool.connect(user1.signer).borrowApeAndStake(
        {
          nftAsset: mayc.address,
          borrowAsset: ape.address,
          borrowAmount: 0,
          cashAmount: amount,
        },
        [],
        [{mainTokenId: 0, bakcTokenId: 0, amount: amount}]
      )
    );

    // advance in time
    await advanceTimeAndBlock(parseInt("86400"));

    expect(
      await pool
        .connect(user1.signer)
        .unstakeApePositionAndRepay(mayc.address, 0)
    );

    const userBalance = await ape.balanceOf(user1.address);
    expect(userBalance).to.be.eq(parseEther("86400"));
  });

  it("unstakeApePositionAndRepay when bakc has been supplied: bakc reward should transfer to user wallet", async () => {
    const {
      users: [user1],
      ape,
      mayc,
      pool,
      bakc,
    } = await loadFixture(fixture);

    await supplyAndValidate(bakc, "1", user1, true);
    await supplyAndValidate(mayc, "1", user1, true);
    await mintAndValidate(ape, "10000", user1);
    const amount = await convertToCurrencyDecimals(ape.address, "10000");

    expect(
      await pool.connect(user1.signer).borrowApeAndStake(
        {
          nftAsset: mayc.address,
          borrowAsset: ape.address,
          borrowAmount: 0,
          cashAmount: amount,
        },
        [],
        [{mainTokenId: 0, bakcTokenId: 0, amount: amount}]
      )
    );

    // advance in time
    await advanceTimeAndBlock(parseInt("86400"));

    expect(
      await pool
        .connect(user1.signer)
        .unstakeApePositionAndRepay(mayc.address, 0)
    );

    const userBalance = await ape.balanceOf(user1.address);
    expect(userBalance).to.be.eq(parseEther("86400"));
  });

  it("liquidate bakc will unstake user ape staking position", async () => {
    const {
      users: [user1, liquidator],
      ape,
      mayc,
      pool,
      weth,
      bakc,
      nMAYC,
    } = await loadFixture(fixture);
    await supplyAndValidate(ape, "20000", liquidator, true);
    await changePriceAndValidate(ape, "0.001");
    await changeSApePriceAndValidate(sApeAddress, "0.001");
    await changePriceAndValidate(mayc, "50");
    await changePriceAndValidate(bakc, "5");

    await supplyAndValidate(mayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user1, true);

    const amount = parseEther("10000");
    expect(
      await pool.connect(user1.signer).borrowApeAndStake(
        {
          nftAsset: mayc.address,
          borrowAsset: ape.address,
          borrowAmount: amount,
          cashAmount: 0,
        },
        [],
        [{mainTokenId: 0, bakcTokenId: 0, amount: amount}]
      )
    );
    let totalStake = await nMAYC.getUserApeStakingAmount(user1.address);
    expect(totalStake).equal(amount);

    await supplyAndValidate(weth, "91", liquidator, true, "200000");

    await advanceTimeAndBlock(parseInt("3600"));

    // drop HF and ERC-721_HF below 1
    await changePriceAndValidate(ape, "1");
    await changeSApePriceAndValidate(sApeAddress, "1");
    await changePriceAndValidate(mayc, "1");
    await changePriceAndValidate(bakc, "1");

    // start auction
    await waitForTx(
      await pool
        .connect(liquidator.signer)
        .startAuction(user1.address, bakc.address, 0)
    );

    expect(await ape.balanceOf(user1.address)).to.be.equal(0);
    // try to liquidate the NFT
    expect(
      await pool
        .connect(liquidator.signer)
        .liquidateERC721(
          bakc.address,
          user1.address,
          0,
          parseEther("10"),
          false,
          {gasLimit: 5000000}
        )
    );
    expect(await bakc.ownerOf("0")).to.be.eq(liquidator.address);
    totalStake = await nMAYC.getUserApeStakingAmount(user1.address);
    expect(totalStake).equal(0);
    expect(await ape.balanceOf(user1.address)).to.be.equal(parseEther("3600"));
  });

  it("transfer nbakc will unstake user ape staking position", async () => {
    const {
      users: [user1, user2],
      ape,
      mayc,
      pool,
      bakc,
      nBAKC,
      nMAYC,
    } = await loadFixture(fixture);
    await mintAndValidate(ape, "10000", user1);
    await supplyAndValidate(mayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user1, true);

    const amount = parseEther("10000");
    expect(
      await pool.connect(user1.signer).borrowApeAndStake(
        {
          nftAsset: mayc.address,
          borrowAsset: ape.address,
          borrowAmount: 0,
          cashAmount: amount,
        },
        [],
        [{mainTokenId: 0, bakcTokenId: 0, amount: amount}]
      )
    );
    let totalStake = await nMAYC.getUserApeStakingAmount(user1.address);
    expect(totalStake).equal(amount);

    await advanceTimeAndBlock(parseInt("3600"));

    expect(await nBAKC.ownerOf("0")).to.be.eq(user1.address);
    expect(await ape.balanceOf(user1.address)).to.be.equal(0);
    expect(
      await nBAKC
        .connect(user1.signer)
        ["safeTransferFrom(address,address,uint256)"](
          user1.address,
          user2.address,
          0,
          {gasLimit: 5000000}
        )
    );
    expect(await nBAKC.ownerOf("0")).to.be.eq(user2.address);
    expect(await ape.balanceOf(user1.address)).to.be.equal(parseEther("3600"));
    totalStake = await nMAYC.getUserApeStakingAmount(user1.address);
    expect(totalStake).equal(0);
  });

  it("withdraw bakc will not unstake user ape staking position", async () => {
    const {
      users: [user1, user2],
      ape,
      mayc,
      pool,
      bakc,
      nMAYC,
    } = await loadFixture(fixture);

    await supplyAndValidate(ape, "20000", user2, true);
    await supplyAndValidate(mayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user1, true);

    const amount = parseEther("10000");
    expect(
      await pool.connect(user1.signer).borrowApeAndStake(
        {
          nftAsset: mayc.address,
          borrowAsset: ape.address,
          borrowAmount: amount,
          cashAmount: 0,
        },
        [],
        [{mainTokenId: 0, bakcTokenId: 0, amount: amount}]
      )
    );
    let totalStake = await nMAYC.getUserApeStakingAmount(user1.address);
    expect(totalStake).equal(amount);

    // start auction
    await waitForTx(
      await pool
        .connect(user1.signer)
        .withdrawERC721(bakc.address, [0], user1.address)
    );

    expect(await bakc.ownerOf("0")).to.be.eq(user1.address);
    totalStake = await nMAYC.getUserApeStakingAmount(user1.address);
    expect(totalStake).equal(amount);
  });
});
