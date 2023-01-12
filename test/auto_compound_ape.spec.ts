import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {AutoCompoundApe, PToken, PTokenSApe, VariableDebtToken} from "../types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {mintAndValidate} from "./helpers/validated-steps";
import {parseEther, solidityKeccak256} from "ethers/lib/utils";
import {almostEqual} from "./helpers/uniswapv3-helper";
import {
  getAutoCompoundApe,
  getPToken,
  getPTokenSApe,
  getVariableDebtToken,
} from "../helpers/contracts-getters";
import {MAX_UINT_AMOUNT, ONE_ADDRESS} from "../helpers/constants";
import {advanceTimeAndBlock, waitForTx} from "../helpers/misc-utils";
import {deployMockedDelegateRegistry} from "../helpers/contracts-deployments";
import {ETHERSCAN_VERIFICATION} from "../helpers/hardhat-constants";

describe("Auto Compound Ape Test", () => {
  let testEnv: TestEnv;
  let cApe: AutoCompoundApe;
  let pCApe: PToken;
  let variableDebtCAPE: VariableDebtToken;
  let pSApeCoin: PTokenSApe;
  const sApeAddress = ONE_ADDRESS;
  let user1Amount;
  let user2Amount;
  let user3Amount;
  let MINIMUM_LIQUIDITY;

  const fixture = async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {ape, users, apeCoinStaking, pool, protocolDataProvider, poolAdmin} =
      testEnv;
    const user1 = users[0];
    const user2 = users[1];
    const user3 = users[2];
    const user4 = users[5];

    cApe = await getAutoCompoundApe();
    MINIMUM_LIQUIDITY = await cApe.MINIMUM_LIQUIDITY();

    const {
      xTokenAddress: pCApeAddress,
      variableDebtTokenAddress: variableDebtPsApeAddress,
    } = await protocolDataProvider.getReserveTokensAddresses(cApe.address);
    pCApe = await getPToken(pCApeAddress);
    variableDebtCAPE = await getVariableDebtToken(variableDebtPsApeAddress);
    const {xTokenAddress: pSApeCoinAddress} =
      await protocolDataProvider.getReserveTokensAddresses(sApeAddress);
    pSApeCoin = await getPTokenSApe(pSApeCoinAddress);

    await mintAndValidate(ape, "1000", user1);
    await mintAndValidate(ape, "2000", user2);
    await mintAndValidate(ape, "4000", user3);
    await mintAndValidate(ape, "1", user4);

    user1Amount = parseEther("1000");
    user2Amount = parseEther("2000");
    user3Amount = parseEther("4000");

    await waitForTx(
      await ape
        .connect(user1.signer)
        .approve(apeCoinStaking.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await ape.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await ape.connect(user2.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await ape.connect(user3.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    await waitForTx(
      await ape.connect(user1.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await ape.connect(user2.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await ape.connect(user3.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await ape.connect(user4.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );

    await waitForTx(
      await pool
        .connect(poolAdmin.signer)
        .unlimitedApproveTo(ape.address, cApe.address)
    );

    await waitForTx(
      await pool.connect(poolAdmin.signer).setClaimApeForCompoundFee(30)
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

    await waitForTx(await apeCoinStaking.updatePool(0));

    // user4 deposit MINIMUM_LIQUIDITY to make test case easy
    await waitForTx(
      await cApe.connect(user4.signer).deposit(user4.address, MINIMUM_LIQUIDITY)
    );

    return testEnv;
  };

  it("user1 receive reward as expected", async () => {
    const {
      users: [user1],
      ape,
    } = await loadFixture(fixture);

    await waitForTx(
      await cApe.connect(user1.signer).deposit(user1.address, user1Amount)
    );
    let user1Balance = await cApe.balanceOf(user1.address);
    almostEqual(user1Balance, parseEther("1000"));
    let user1Share = await cApe.sharesOf(user1.address);
    almostEqual(user1Share, parseEther("1000"));

    await advanceTimeAndBlock(600);

    user1Balance = await cApe.balanceOf(user1.address);
    almostEqual(user1Balance, parseEther("1000"));

    await advanceTimeAndBlock(3000);
    user1Balance = await cApe.balanceOf(user1.address);
    // 1000 + 3600
    almostEqual(user1Balance, parseEther("4600"));

    user1Share = await cApe.sharesOf(user1.address);
    almostEqual(user1Share, parseEther("1000"));

    await waitForTx(await cApe.connect(user1.signer).withdraw(user1Balance));
    user1Share = await cApe.sharesOf(user1.address);
    expect(user1Share.lte(1)).to.be.true;
    user1Balance = await cApe.balanceOf(user1.address);
    expect(user1Balance.lte(4)).to.be.true;

    const apeBalance = await ape.balanceOf(user1.address);
    almostEqual(apeBalance, parseEther("4600"));

    // pool is empty
    almostEqual(
      await cApe.totalSupply(),
      await cApe.getPooledApeByShares(MINIMUM_LIQUIDITY)
    );
  });

  it("user receive reward as deposit portion 1", async () => {
    const {
      users: [user1, user2, user3],
      ape,
    } = await loadFixture(fixture);

    await waitForTx(
      await cApe.connect(user1.signer).deposit(user1.address, user1Amount)
    );
    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, user2Amount)
    );
    await waitForTx(
      await cApe.connect(user3.signer).deposit(user3.address, user3Amount)
    );

    await advanceTimeAndBlock(86400);

    const user1Balance = await cApe.balanceOf(user1.address);
    const user2Balance = await cApe.balanceOf(user2.address);
    const user3Balance = await cApe.balanceOf(user3.address);
    almostEqual(user2Balance, user1Balance.mul(2));
    almostEqual(user3Balance, user2Balance.mul(2));

    await waitForTx(await cApe.connect(user1.signer).withdraw(user1Balance));
    const user1ApeBalance = await ape.balanceOf(user1.address);
    almostEqual(user1ApeBalance, user1Balance);

    await waitForTx(await cApe.connect(user2.signer).withdraw(user2Balance));
    const user2ApeBalance = await ape.balanceOf(user2.address);
    almostEqual(user2ApeBalance, user2Balance);

    await waitForTx(await cApe.connect(user3.signer).withdraw(user3Balance));
    const user3ApeBalance = await ape.balanceOf(user3.address);
    almostEqual(user3ApeBalance, user3Balance);

    // ApeCoinStaking reward 1 ape/s. so user1 balance = 4000 + 86400 * 4 / 7 = 53371
    almostEqual(user3Balance, parseEther("53371"));

    // pool is empty
    almostEqual(
      await cApe.totalSupply(),
      await cApe.getPooledApeByShares(MINIMUM_LIQUIDITY)
    );
  });

  it("user receive reward as deposit portion 2", async () => {
    const {
      users: [user1, user2],
      ape,
    } = await loadFixture(fixture);

    await waitForTx(
      await cApe.connect(user1.signer).deposit(user1.address, user1Amount)
    );
    await advanceTimeAndBlock(3600);
    const user1Share = await cApe.sharesOf(user1.address);
    let user1Balance = await cApe.balanceOf(user1.address);
    //1000 + 3600 = 4600
    almostEqual(user1Balance, parseEther("4600"));

    //user2 balance is 4600 now
    await mintAndValidate(ape, "2600", user2);
    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, user1Balance)
    );
    const user2Share = await cApe.sharesOf(user2.address);
    almostEqual(user1Share, user2Share);

    await advanceTimeAndBlock(3600);
    user1Balance = await cApe.balanceOf(user1.address);
    //1000 + 3600 + 1800
    almostEqual(user1Balance, parseEther("6400"));

    const user2Balance = await cApe.balanceOf(user2.address);
    await waitForTx(await cApe.connect(user2.signer).withdraw(user2Balance));
    almostEqual(await ape.balanceOf(user2.address), user1Balance);

    await advanceTimeAndBlock(3600);
    user1Balance = await cApe.balanceOf(user1.address);
    //1000 + 3600 + 1800 + 3600
    almostEqual(user1Balance, parseEther("10000"));
    await waitForTx(await cApe.connect(user1.signer).withdraw(user1Balance));
    almostEqual(await ape.balanceOf(user1.address), user1Balance);

    // pool is empty
    almostEqual(
      await cApe.totalSupply(),
      await cApe.getPooledApeByShares(MINIMUM_LIQUIDITY)
    );
  });

  it("compound function work as expected", async () => {
    const {
      users: [user1, user2],
      ape,
      apeCoinStaking,
    } = await loadFixture(fixture);

    //user1 balance is 2000 now
    await mintAndValidate(ape, "1000", user1);
    await waitForTx(
      await apeCoinStaking
        .connect(user1.signer)
        .depositApeCoin(user2Amount, user1.address)
    );

    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, user2Amount)
    );

    await advanceTimeAndBlock(3600);

    let user2Balance = await cApe.balanceOf(user2.address);
    //2000 + 1800 = 3800
    almostEqual(user2Balance, parseEther("3800"));

    await waitForTx(await cApe.connect(user2.signer).harvestAndCompound());

    await advanceTimeAndBlock(3600);
    user2Balance = await cApe.balanceOf(user2.address);
    //3800 + 3600 * 3800 / (3800 + 2000) = 6158.6
    almostEqual(user2Balance, parseEther("6158.6"));

    await waitForTx(await cApe.connect(user2.signer).harvestAndCompound());

    await advanceTimeAndBlock(3600);
    user2Balance = await cApe.balanceOf(user2.address);
    //6158.6 + 3600 * 6158.6 / (6158.6 + 2000) = 8876
    almostEqual(user2Balance, parseEther("8876"));

    //use2 exit pool
    await waitForTx(await cApe.connect(user2.signer).withdraw(user2Balance));
    const user2ApeBalance = await ape.balanceOf(user2.address);
    almostEqual(user2ApeBalance, parseEther("8876"));

    //user1 exit pool
    await waitForTx(
      await apeCoinStaking
        .connect(user1.signer)
        .withdrawApeCoin(user2Amount, user1.address)
    );
    const user1ApeBalance = await ape.balanceOf(user1.address);
    //2000 + 3600 * 2000 / 4000 + 3600 * 2000 / 5800 + 3600 * 2000 / 8158.6 = 5923.8
    almostEqual(user1ApeBalance, parseEther("5923.8"));
  });

  it("claimApeAndCompound function work as expected 1", async () => {
    const {
      users: [user1, user2, user3],
      mayc,
      pool,
      ape,
    } = await loadFixture(fixture);

    await waitForTx(
      await mayc.connect(user1.signer)["mint(address)"](user1.address)
    );
    await waitForTx(
      await mayc.connect(user2.signer)["mint(address)"](user2.address)
    );
    await waitForTx(
      await mayc.connect(user3.signer)["mint(address)"](user3.address)
    );
    await waitForTx(
      await mayc.connect(user1.signer).setApprovalForAll(pool.address, true)
    );
    await waitForTx(
      await mayc.connect(user2.signer).setApprovalForAll(pool.address, true)
    );
    await waitForTx(
      await mayc.connect(user3.signer).setApprovalForAll(pool.address, true)
    );
    await waitForTx(
      await pool
        .connect(user1.signer)
        .supplyERC721(
          mayc.address,
          [{tokenId: 0, useAsCollateral: true}],
          user1.address,
          "0"
        )
    );
    await waitForTx(
      await pool
        .connect(user2.signer)
        .supplyERC721(
          mayc.address,
          [{tokenId: 1, useAsCollateral: true}],
          user2.address,
          "0"
        )
    );
    await waitForTx(
      await pool
        .connect(user3.signer)
        .supplyERC721(
          mayc.address,
          [{tokenId: 2, useAsCollateral: true}],
          user3.address,
          "0"
        )
    );

    await waitForTx(
      await pool.connect(user1.signer).borrowApeAndStake(
        {
          nftAsset: mayc.address,
          borrowAsset: ape.address,
          borrowAmount: 0,
          cashAmount: user1Amount,
        },
        [{tokenId: 0, amount: user1Amount}],
        []
      )
    );

    await waitForTx(
      await pool.connect(user2.signer).borrowApeAndStake(
        {
          nftAsset: mayc.address,
          borrowAsset: ape.address,
          borrowAmount: 0,
          cashAmount: user2Amount,
        },
        [{tokenId: 1, amount: user2Amount}],
        []
      )
    );

    await waitForTx(
      await pool.connect(user3.signer).borrowApeAndStake(
        {
          nftAsset: mayc.address,
          borrowAsset: ape.address,
          borrowAmount: 0,
          cashAmount: user3Amount,
        },
        [{tokenId: 2, amount: user3Amount}],
        []
      )
    );

    await advanceTimeAndBlock(3600);

    await waitForTx(
      await pool
        .connect(user2.signer)
        .claimApeAndCompound(
          mayc.address,
          [user1.address, user2.address, user3.address],
          [[0], [1], [2]]
        )
    );

    // 3600 / 7 * 99.7% = 512.74
    const user1Balance = await pCApe.balanceOf(user1.address);
    almostEqual(user1Balance, parseEther("512.7428"));

    // 3600 * 2 / 7 * 99.7% = 1025.48
    const user2Balance = await pCApe.balanceOf(user2.address);
    almostEqual(user2Balance, parseEther("1025.48"));

    // 3600 * 4 / 7 * 99.7% = 2050.97
    const user3Balance = await pCApe.balanceOf(user3.address);
    almostEqual(user3Balance, parseEther("2050.97"));

    // 3600 * 0.003
    const incentiveBalance = await cApe.balanceOf(user2.address);
    almostEqual(incentiveBalance, parseEther("10.8"));

    await advanceTimeAndBlock(3600);

    await waitForTx(
      await pool
        .connect(user2.signer)
        .claimApeAndCompound(
          mayc.address,
          [user1.address, user2.address, user3.address],
          [[0], [1], [2]]
        )
    );
  });

  it("claimApeAndCompound function work as expected 2", async () => {
    const {
      users: [user1, user2],
      mayc,
      pool,
      ape,
    } = await loadFixture(fixture);

    await waitForTx(
      await mayc.connect(user1.signer)["mint(address)"](user1.address)
    );
    await waitForTx(
      await mayc.connect(user1.signer)["mint(address)"](user1.address)
    );
    await waitForTx(
      await mayc.connect(user1.signer)["mint(address)"](user1.address)
    );
    await waitForTx(
      await mayc.connect(user1.signer).setApprovalForAll(pool.address, true)
    );
    await waitForTx(
      await pool.connect(user1.signer).supplyERC721(
        mayc.address,
        [
          {tokenId: 0, useAsCollateral: true},
          {tokenId: 1, useAsCollateral: true},
          {tokenId: 2, useAsCollateral: true},
        ],
        user1.address,
        "0"
      )
    );

    const totalAmount = parseEther("900");
    const userAmount = parseEther("300");
    await waitForTx(
      await pool.connect(user1.signer).borrowApeAndStake(
        {
          nftAsset: mayc.address,
          borrowAsset: ape.address,
          borrowAmount: 0,
          cashAmount: totalAmount,
        },
        [
          {tokenId: 0, amount: userAmount},
          {tokenId: 1, amount: userAmount},
          {tokenId: 2, amount: userAmount},
        ],
        []
      )
    );

    await advanceTimeAndBlock(3600);

    await waitForTx(
      await pool
        .connect(user2.signer)
        .claimApeAndCompound(mayc.address, [user1.address], [[0, 1, 2]])
    );

    //3600 * 0.997 = 3589.2
    const user1Balance = await pCApe.balanceOf(user1.address);
    almostEqual(user1Balance, parseEther("3589.2"));

    // 3600 * 0.003
    const incentiveBalance = await cApe.balanceOf(user2.address);
    almostEqual(incentiveBalance, parseEther("10.8"));

    await advanceTimeAndBlock(3600);

    await waitForTx(
      await pool
        .connect(user2.signer)
        .claimApeAndCompound(mayc.address, [user1.address], [[0, 1, 2]])
    );
  });

  it("claimPairedApeRewardAndCompound function work as expected", async () => {
    const {
      users: [user1, user2],
      mayc,
      pool,
      ape,
      bakc,
    } = await loadFixture(fixture);

    await waitForTx(
      await mayc.connect(user1.signer)["mint(address)"](user1.address)
    );
    await waitForTx(
      await mayc.connect(user1.signer)["mint(address)"](user1.address)
    );
    await waitForTx(
      await mayc.connect(user1.signer)["mint(address)"](user1.address)
    );
    await waitForTx(
      await bakc.connect(user1.signer)["mint(address)"](user1.address)
    );
    await waitForTx(
      await bakc.connect(user1.signer)["mint(address)"](user1.address)
    );
    await waitForTx(
      await bakc.connect(user1.signer)["mint(address)"](user1.address)
    );
    await waitForTx(
      await mayc.connect(user1.signer).setApprovalForAll(pool.address, true)
    );
    await waitForTx(
      await bakc.connect(user1.signer).setApprovalForAll(pool.address, true)
    );
    await waitForTx(
      await pool.connect(user1.signer).supplyERC721(
        mayc.address,
        [
          {tokenId: 0, useAsCollateral: true},
          {tokenId: 1, useAsCollateral: true},
          {tokenId: 2, useAsCollateral: true},
        ],
        user1.address,
        "0"
      )
    );
    await waitForTx(
      await pool.connect(user1.signer).supplyERC721(
        bakc.address,
        [
          {tokenId: 0, useAsCollateral: true},
          {tokenId: 1, useAsCollateral: true},
          {tokenId: 2, useAsCollateral: true},
        ],
        user1.address,
        "0"
      )
    );

    const totalAmount = parseEther("900");
    const userAmount = parseEther("300");
    await waitForTx(
      await pool.connect(user1.signer).borrowApeAndStake(
        {
          nftAsset: mayc.address,
          borrowAsset: ape.address,
          borrowAmount: 0,
          cashAmount: totalAmount,
        },
        [],
        [
          {mainTokenId: 0, bakcTokenId: 0, amount: userAmount},
          {mainTokenId: 1, bakcTokenId: 1, amount: userAmount},
          {mainTokenId: 2, bakcTokenId: 2, amount: userAmount},
        ]
      )
    );

    await advanceTimeAndBlock(3600);

    await waitForTx(
      await pool.connect(user2.signer).claimPairedApeAndCompound(
        mayc.address,
        [user1.address],
        [
          [
            {mainTokenId: 0, bakcTokenId: 0},
            {mainTokenId: 1, bakcTokenId: 1},
            {mainTokenId: 2, bakcTokenId: 2},
          ],
        ]
      )
    );

    //3600 * 0.997 = 3589.2
    const user1Balance = await pCApe.balanceOf(user1.address);
    almostEqual(user1Balance, parseEther("3589.2"));

    // 3600 * 0.003
    const incentiveBalance = await cApe.balanceOf(user2.address);
    almostEqual(incentiveBalance, parseEther("10.8"));

    await advanceTimeAndBlock(3600);

    await waitForTx(
      await pool.connect(user2.signer).claimPairedApeAndCompound(
        mayc.address,
        [user1.address],
        [
          [
            {mainTokenId: 0, bakcTokenId: 0},
            {mainTokenId: 1, bakcTokenId: 1},
            {mainTokenId: 2, bakcTokenId: 2},
          ],
        ]
      )
    );
  });

  it("bufferBalance work as expected", async () => {
    const {
      users: [user1, user2],
      ape,
    } = await loadFixture(fixture);

    await waitForTx(
      await cApe.connect(user1.signer).deposit(user1.address, user1Amount)
    );
    await waitForTx(
      await ape.connect(user2.signer).transfer(cApe.address, user2Amount)
    );
    let user1Balance = await cApe.balanceOf(user1.address);
    almostEqual(user1Balance, parseEther("1000"));
    let user1Share = await cApe.sharesOf(user1.address);
    almostEqual(user1Share, parseEther("1000"));

    await advanceTimeAndBlock(600);

    user1Balance = await cApe.balanceOf(user1.address);
    await waitForTx(await cApe.connect(user1.signer).withdraw(user1Balance));
    user1Share = await cApe.sharesOf(user1.address);
    expect(user1Share.lte(1)).to.be.true;
    user1Balance = await cApe.balanceOf(user1.address);
    expect(user1Balance.lte(5)).to.be.true;

    almostEqual(await ape.balanceOf(user1.address), user1Amount);
    almostEqual(await ape.balanceOf(cApe.address), user2Amount);
  });

  it("check rescueERC20", async () => {
    const {
      users: [user1, user2],
      ape,
      weth,
      gatewayAdmin,
    } = await loadFixture(fixture);

    await mintAndValidate(weth, "1", user2);

    await waitForTx(
      await weth.connect(user2.signer).transfer(cApe.address, parseEther("1"))
    );

    await expect(
      cApe
        .connect(user2.signer)
        .rescueERC20(weth.address, user2.address, parseEther("1"))
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await waitForTx(
      await ape.connect(user2.signer).transfer(cApe.address, parseEther("100"))
    );

    await waitForTx(
      await cApe.connect(user1.signer).deposit(user1.address, parseEther("50"))
    );

    almostEqual(await ape.balanceOf(cApe.address), parseEther("150"));

    await expect(
      cApe
        .connect(gatewayAdmin.signer)
        .rescueERC20(ape.address, user1.address, parseEther("150"))
    ).to.be.revertedWith("balance below backed balance");

    await waitForTx(
      await cApe
        .connect(gatewayAdmin.signer)
        .rescueERC20(ape.address, user2.address, parseEther("100"))
    );

    almostEqual(await ape.balanceOf(user2.address), user2Amount);
  });

  it("borrow cape and stake function work as expected: use 100% debt", async () => {
    const {
      users: [user1, user2],
      mayc,
      pool,
    } = await loadFixture(fixture);

    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, user2Amount)
    );

    await waitForTx(
      await cApe.connect(user2.signer).approve(pool.address, user2Amount)
    );

    await waitForTx(
      await pool
        .connect(user2.signer)
        .supply(cApe.address, user2Amount, user2.address, 0)
    );

    await waitForTx(
      await mayc.connect(user1.signer)["mint(address)"](user1.address)
    );

    await waitForTx(
      await mayc.connect(user1.signer).setApprovalForAll(pool.address, true)
    );
    await waitForTx(
      await pool
        .connect(user1.signer)
        .supplyERC721(
          mayc.address,
          [{tokenId: 0, useAsCollateral: true}],
          user1.address,
          "0"
        )
    );

    await waitForTx(
      await pool.connect(user1.signer).borrowApeAndStake(
        {
          nftAsset: mayc.address,
          borrowAsset: cApe.address,
          borrowAmount: user1Amount,
          cashAmount: 0,
        },
        [{tokenId: 0, amount: user1Amount}],
        []
      )
    );

    const user2pCApeBalance = await pCApe.balanceOf(user2.address);
    almostEqual(user2pCApeBalance, user2Amount);
    const user1CApeDebtBalance = await variableDebtCAPE.balanceOf(
      user1.address
    );
    almostEqual(user1CApeDebtBalance, user1Amount);
    almostEqual(await pSApeCoin.balanceOf(user1.address), user1Amount);
  });

  it("test vote delegation", async () => {
    const {
      users: [user1],
      gatewayAdmin,
    } = await loadFixture(fixture);

    const delegateRegistry = await deployMockedDelegateRegistry(
      ETHERSCAN_VERIFICATION
    );

    await cApe
      .connect(gatewayAdmin.signer)
      .setVotingDelegate(
        delegateRegistry.address,
        solidityKeccak256(["string"], ["test"]),
        user1.address
      );

    expect(
      await cApe.getDelegate(
        delegateRegistry.address,
        solidityKeccak256(["string"], ["test"])
      )
    ).to.be.eq(user1.address);
  });
});
